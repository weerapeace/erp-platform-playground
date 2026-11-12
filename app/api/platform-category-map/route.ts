/**
 * Platform Category Mapping — /api/platform-category-map
 * จับคู่ "หมวดกลาง (platform_central_categories)" → หมวดของแต่ละร้าน (เลือกจาก platform_category_options)
 *   GET  → { categories(หมวดกลาง), platforms, mappings, webShops }  (products.platforms.view)
 *   POST { central_category_id, entries:[{platform_id, path}], web?:[{shop_id, key}] } (products.platforms.manage_accounts)
 *         path = "{external_id} · {ชื่อหมวด}" ที่เลือกจาก dropdown · ว่าง = ลบการจับคู่
 *   🌐 เว็บไซต์ = แยกรายร้าน (Louis / Pixiedustie หมวดไม่เหมือนกัน) — webShops = ร้านที่ตั้งหมวดของตัวเองแล้ว + กฎเดิม
 *         web[].key = รหัสหมวดเว็บของร้านนั้น (หมวดหลักหรือหมวดย่อย · "" = ไม่จับคู่) → shops.field_map.category.centralRules
 *         ใช้เติมหมวดให้สินค้าที่ยังไม่ได้จัดหมวดเว็บเอง (lib/website-field-map autoCategory: หมวดกลาง → หมวด ERP → ค่าตั้งต้น)
 *         อ่าน-แก้-เขียนเฉพาะ category.centralRules (ช่องอื่นของร้านคงเดิม) + audit + ล้างแคชเว็บร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { categoryPathLabel } from "@/lib/website-category-tree";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";

type ShopRow = { id: string; name: string; slug: string; field_map: unknown };

/** ร้านเว็บที่ตั้งหมวดของตัวเองแล้ว (ร้านที่ยังใช้หมวดตั้งต้นของระบบ = ไม่โชว์) */
function webShopsOf(rows: ShopRow[]) {
  return rows
    .filter((s) => {
      const raw = (s.field_map ?? {}) as { categories?: unknown };
      return Array.isArray(raw.categories) && raw.categories.length > 0;
    })
    .map((s) => {
      const fm = normalizeFieldMap(s.field_map);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        categories: fm.categories.map((c) => ({ key: c.key, label: c.label, path: categoryPathLabel(fm.categories, c.key), parent: c.parent ?? null })),
        centralRules: fm.category.centralRules,
      };
    });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data: categories }, { data: platforms }, { data: mappings }, { data: shops }] = await Promise.all([
    admin.from("platform_central_categories").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    admin.from("erp_platforms").select("id, code, name_th, icon_key, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("platform_category_mappings").select("central_category_id, platform_id, platform_category_path"),
    admin.from("shops").select("id, name, slug, field_map").order("is_default", { ascending: false }).order("name"),
  ]);
  return NextResponse.json({ categories: categories ?? [], platforms: platforms ?? [], mappings: mappings ?? [], webShops: webShopsOf((shops ?? []) as ShopRow[]), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.id ?? null;

  let body: { central_category_id?: string; entries?: { platform_id?: string; path?: string }[]; web?: { shop_id?: string; key?: string }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const catId = String(body.central_category_id ?? "").trim();
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!catId) return NextResponse.json({ error: "ต้องระบุ central_category_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  for (const e of entries) {
    const pid = String(e.platform_id ?? "").trim();
    if (!pid) continue;
    const path = String(e.path ?? "").trim();
    if (!path) {
      const { error } = await admin.from("platform_category_mappings").delete().eq("central_category_id", catId).eq("platform_id", pid);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin.from("platform_category_mappings").upsert({
        central_category_id: catId, platform_id: pid, platform_category_path: path,
        is_active: true, updated_by: actor, updated_at: now, created_by: actor,
      }, { onConflict: "central_category_id,platform_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 🌐 เว็บไซต์รายร้าน → shops.field_map.category.centralRules (เปลี่ยนเฉพาะร้านที่ค่าเปลี่ยน)
  const web = Array.isArray(body.web) ? body.web.slice(0, 20) : [];
  const webChanged: { shopId: string; before: string | null; after: string | null }[] = [];
  for (const w of web) {
    const shopId = String(w.shop_id ?? "").trim();
    if (!shopId) continue;
    const key = String(w.key ?? "").trim();
    const { data: shop } = await admin.from("shops").select("id, field_map").eq("id", shopId).maybeSingle();
    if (!shop) return NextResponse.json({ error: "ไม่พบร้านเว็บ" }, { status: 404 });
    const raw = ((shop as { field_map: unknown }).field_map ?? {}) as Record<string, unknown>;
    const fm = normalizeFieldMap(raw);
    if (key && !fm.categories.some((c) => c.key === key)) return NextResponse.json({ error: "ไม่พบหมวดนี้ในร้าน (อาจถูกลบไปแล้ว) ลองโหลดหน้าใหม่" }, { status: 400 });
    const before = fm.category.centralRules[catId] ?? null;
    if ((before ?? "") === key) continue;
    const rules = { ...fm.category.centralRules };
    if (key) rules[catId] = key;
    else delete rules[catId];
    const rawCat = (raw.category && typeof raw.category === "object" ? raw.category : {}) as Record<string, unknown>;
    const { error } = await admin.from("shops").update({ field_map: { ...raw, category: { ...rawCat, centralRules: rules } } }).eq("id", shopId);
    if (error) return NextResponse.json({ error: "บันทึกหมวดเว็บไม่สำเร็จ" }, { status: 500 });
    webChanged.push({ shopId, before, after: key || null });
  }

  await writeAudit(admin, {
    action: "update",
    entityType: "platform_category_mapping",
    entityId: catId,
    actorId: actor,
    actorName: user?.email ?? null,
    metadata: { entries: entries.map((e) => ({ platform_id: e.platform_id ?? null, path: e.path ?? "" })), web: webChanged },
  });
  // หมวดที่เว็บใส่ให้เปลี่ยน → สั่งเว็บร้านล้างแคช (ล้มเหลว = เว็บอัปเดตเองใน ≤60 วิ)
  await Promise.all(webChanged.map((w) => purgeStorefrontCache(admin, w.shopId)));
  return NextResponse.json({ ok: true, error: null });
}

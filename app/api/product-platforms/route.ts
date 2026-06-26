/**
 * Product Platform Listing Manager — /api/product-platforms (เฟส 1a, MVP ในบ้าน)
 * GET   ?parent_sku_id=  (products.platforms.view) → แพลตฟอร์มที่เปิด + ร่างต่อแพลตฟอร์ม + SKU variants จริง + ข้อมูล parent
 * PATCH { parent_sku_id, platform_id, title?, description?, category_path?, status? } (products.platforms.edit) → upsert ร่าง
 * ตาราง: erp_platforms (registry) + platform_listing_drafts (ร่างต่อสินค้า×แพลตฟอร์ม) + skus_v2 (variant ดึงสด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const admin = supabaseAdmin();

  const [{ data: parent }, { data: pf }, { data: drafts }, { data: skus }, { data: slots }] = await Promise.all([
    admin.from("parent_skus_v2").select("id, code, name_th, name_en, name_platform, introduction, description, english_description, cover_image_r2_key, category_id").eq("id", parentId).maybeSingle(),
    admin.from("erp_platforms").select("id, code, name_th, name_en, icon_key, theme_color, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("platform_listing_drafts").select("platform_id, title, description, category_path, status, image_keys, validation").eq("parent_sku_id", parentId),
    admin.from("skus_v2").select("id, code, name_th, color, color_th, list_price, cover_image_r2_key, is_active").eq("parent_sku_id", parentId).order("code", { ascending: true }),
    admin.from("product_image_slots").select("r2_key").eq("owner_id", parentId),
  ]);
  const pRow = (parent ?? {}) as Record<string, unknown>;
  const categoryId = (pRow.category_id as string) ?? null;

  // หมวดหมู่กลาง + mapping ต่อแพลตฟอร์ม (จากหมวดเดียวกัน — ใช้ซ้ำได้)
  let categoryName: string | null = null;
  const mappings: Record<string, string> = {};
  if (categoryId) {
    const [{ data: cat }, { data: maps }] = await Promise.all([
      admin.from("product_categories").select("display_name, name").eq("id", categoryId).maybeSingle(),
      admin.from("platform_category_mappings").select("platform_id, platform_category_path").eq("central_category_id", categoryId),
    ]);
    categoryName = ((cat as { display_name?: string; name?: string } | null)?.display_name) ?? ((cat as { name?: string } | null)?.name) ?? null;
    for (const m of ((maps ?? []) as Record<string, unknown>[])) mappings[String(m.platform_id)] = (m.platform_category_path as string) ?? "";
  }

  const platforms = ((pf ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""),
    icon_key: (p.icon_key as string) ?? null, theme_color: (p.theme_color as string) ?? null,
  }));
  const draftMap: Record<string, unknown> = {};
  for (const d of ((drafts ?? []) as Record<string, unknown>[])) draftMap[String(d.platform_id)] = d;
  const variants = ((skus ?? []) as Record<string, unknown>[]).map((s) => {
    const price = s.list_price == null ? null : Number(s.list_price);
    const image_key = (s.cover_image_r2_key as string) ?? null;
    return {
      id: String(s.id), code: String(s.code ?? ""), name: (s.name_th as string) ?? "",
      color: (s.color_th as string) ?? (s.color as string) ?? null, price, image_key,
      is_active: s.is_active !== false,
      has_price: price != null && price > 0, has_image: !!image_key,
    };
  });

  // รวมรูปที่เลือกส่งได้: ปก parent + แกลเลอรี parent + รูปประจำ SKU (dedup)
  const seen = new Set<string>();
  const images: { key: string; source: string }[] = [];
  const addImg = (key: string | null | undefined, source: string) => { const k = (key ?? "").trim(); if (k && !seen.has(k)) { seen.add(k); images.push({ key: k, source }); } };
  addImg(pRow.cover_image_r2_key as string, "ปก");
  for (const s of ((slots ?? []) as Record<string, unknown>[])) addImg(s.r2_key as string, "แกลเลอรี");
  for (const v of variants) addImg(v.image_key, `SKU ${v.code}`);

  return NextResponse.json({
    parent: parent ? { id: String(pRow.id), code: pRow.code ?? "", name_th: pRow.name_th ?? "", description: pRow.description ?? "", category_id: categoryId, category_name: categoryName } : null,
    platforms, drafts: draftMap, variants, mappings, images, error: null,
  });
}

const FIELDS = ["title", "description", "category_path", "status", "image_keys"] as const;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = String(body.platform_id ?? "").trim();

  // บันทึกหมวดหมู่กลาง→แพลตฟอร์ม เป็น "ค่ามาตรฐาน" (ใช้ซ้ำทุกสินค้าในหมวดเดียวกัน)
  if (body.save_mapping) {
    const central = String(body.central_category_id ?? "").trim();
    if (!central || !platform_id) return NextResponse.json({ error: "ต้องมี central_category_id + platform_id" }, { status: 400 });
    const admin0 = supabaseAdmin();
    const { error } = await admin0.from("platform_category_mappings")
      .upsert({ central_category_id: central, platform_id, platform_category_path: String(body.platform_category_path ?? "").trim() || null, updated_by: user?.id ?? null, updated_at: new Date().toISOString(), created_by: user?.id ?? null }, { onConflict: "central_category_id,platform_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin0, { action: "update", entityType: "platform_category_mapping", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { central_category_id: central, platform_id } });
    return NextResponse.json({ ok: true, error: null });
  }

  const parent_sku_id = String(body.parent_sku_id ?? "").trim();
  if (!parent_sku_id || !platform_id) return NextResponse.json({ error: "ต้องมี parent_sku_id + platform_id" }, { status: 400 });

  const row: Record<string, unknown> = { parent_sku_id, platform_id, updated_by: user?.id ?? null, updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) row[f] = body[f] === "" ? null : body[f];

  const admin = supabaseAdmin();
  const { error } = await admin.from("platform_listing_drafts")
    .upsert({ ...row, created_by: user?.id ?? null }, { onConflict: "parent_sku_id,platform_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "update", entityType: "platform_listing_draft", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { parent_sku_id, platform_id, fields: FIELDS.filter((f) => f in body) } });
  return NextResponse.json({ ok: true, error: null });
}

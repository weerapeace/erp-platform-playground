/**
 * ปุ่ม "ใส่ให้เอง (ไม่เสียเงิน)" ในหน้าจับคู่หมวดหมู่แพลตฟอร์ม — /api/platform-category-map/autofill
 *   GET  (products.platforms.view) → เดาหมวดให้ "ช่องที่ยังว่าง" ทุกหมวดกลาง × ทุกร้าน (ไม่ใช้ AI · lib/platform-category-autofill)
 *        { items:[{ central_id, central_name, target:{kind,id,name}, suggestion|null }], stats, noOptions:[ชื่อร้านที่ยังไม่มีรายการหมวด] }
 *   POST (products.platforms.manage_accounts) { mode:"apply"|"undo", items:[{ central_category_id, platform_id? | shop_id?, value }] }
 *        apply = บันทึกเฉพาะช่องที่ยังว่างจริงตอนกด (ใครตั้งไว้ระหว่างนั้น = ข้าม ไม่ทับ) + ค่าต้องอยู่ในรายการหมวดของร้าน
 *        undo  = ล้างเฉพาะช่องที่ยังเป็นค่าที่ปุ่มนี้ใส่ (ถ้ามีคนแก้ต่อแล้ว = ไม่แตะ)
 *        audit ทุกครั้ง (changes: auditDiff) · ร้านเว็บที่เปลี่ยน → ล้างแคชเว็บร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditDiff } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { webShopsOf, type WebShopRow } from "@/lib/platform-category-web-shops";
import { prepareOptions, suggestFor, type AutofillSuggestion } from "@/lib/platform-category-autofill";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Target = { kind: "platform" | "web"; id: string; name: string };
type Mapping = { central_category_id: string; platform_id: string; platform_category_path: string | null };
type OptRow = { platform_id: string; external_id: string; name_th: string | null; name_en: string | null };

const optValue = (o: OptRow) => `${o.external_id} · ${o.name_th || o.name_en || ""}`;
const optLabel = (o: OptRow) => o.name_th || o.name_en || "";

async function loadAll(admin: Admin) {
  const [{ data: cats }, { data: platforms }, { data: mappings }, { data: shops }] = await Promise.all([
    admin.from("platform_central_categories").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    admin.from("erp_platforms").select("id, code, name_th").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("platform_category_mappings").select("central_category_id, platform_id, platform_category_path"),
    admin.from("shops").select("id, name, slug, field_map").order("is_default", { ascending: false }).order("name"),
  ]);
  const webShops = webShopsOf((shops ?? []) as WebShopRow[]);
  // แถว Website แยกรายร้าน (เหมือนหน้าจับคู่) — มีร้านเว็บที่ตั้งหมวดเองแล้ว = ไม่ใช้แถว website รวม
  const pfs = ((platforms ?? []) as { id: string; code: string; name_th: string }[]).filter((p) => !(p.code === "website" && webShops.length > 0));
  // ⚠️ ร้านหนึ่งมีหมวดถึง 3,000+ → ไล่ดึงทีละหน้า (ฐานข้อมูลตัดที่ 1,000 เงียบ ๆ)
  const opts = pfs.length
    ? await fetchAllPages<OptRow>((from, to) =>
        admin.from("platform_category_options").select("platform_id, external_id, name_th, name_en")
          .in("platform_id", pfs.map((p) => p.id)).order("platform_id").order("external_id").range(from, to), { strict: true })
    : [];
  return { cats: (cats ?? []) as { id: string; name: string }[], pfs, mappings: (mappings ?? []) as Mapping[], webShops, opts };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  let data: Awaited<ReturnType<typeof loadAll>>;
  try { data = await loadAll(admin); }
  catch { return NextResponse.json({ error: "โหลดรายการหมวดไม่ครบ ลองกดใหม่อีกครั้ง", retryable: true }, { status: 503 }); }
  const { cats, pfs, mappings, webShops, opts } = data;

  const mapped = new Map(mappings.filter((m) => m.platform_category_path).map((m) => [`${m.central_category_id}:${m.platform_id}`, m.platform_category_path as string]));
  const targets: (Target & { prepared: ReturnType<typeof prepareOptions> })[] = [
    ...pfs.map((p) => ({ kind: "platform" as const, id: p.id, name: p.name_th, prepared: prepareOptions(opts.filter((o) => o.platform_id === p.id).map((o) => ({ value: optValue(o), label: optLabel(o) }))) })),
    ...webShops.map((s) => ({ kind: "web" as const, id: s.id, name: s.name, prepared: prepareOptions(s.categories.map((c) => ({ value: c.key, label: c.path }))) })),
  ];
  const noOptions = targets.filter((t) => t.prepared.length === 0).map((t) => t.name);

  const items: { central_id: string; central_name: string; target: Target; suggestion: AutofillSuggestion | null }[] = [];
  for (const c of cats) {
    // ข้อ 1: หมวดที่ร้านอื่นจับไว้แล้วของหมวดกลางนี้ (ทั้งแพลตฟอร์มและร้านเว็บ)
    const otherPaths = [
      ...pfs.map((p) => mapped.get(`${c.id}:${p.id}`)).filter((x): x is string => !!x),
      ...webShops.map((s) => { const k = s.centralRules[c.id]; return k ? s.categories.find((x) => x.key === k)?.path : undefined; }).filter((x): x is string => !!x),
    ];
    for (const t of targets) {
      if (t.prepared.length === 0) continue;   // ร้านที่ยังไม่มีรายการหมวด — บอกใน noOptions แทน
      const current = t.kind === "platform" ? mapped.get(`${c.id}:${t.id}`) : webShops.find((s) => s.id === t.id)?.centralRules[c.id];
      if (current) continue;                   // ตั้งไว้แล้ว = ไม่แตะ
      items.push({ central_id: c.id, central_name: c.name, target: { kind: t.kind, id: t.id, name: t.name }, suggestion: suggestFor(c.name, otherPaths, t.prepared) });
    }
  }
  const stats = {
    empty: items.length,
    high: items.filter((i) => i.suggestion?.confidence === "high").length,
    check: items.filter((i) => i.suggestion?.confidence === "check").length,
    none: items.filter((i) => !i.suggestion).length,
  };
  return NextResponse.json({ items, stats, noOptions, error: null });
}

type InItem = { central_category_id?: string; platform_id?: string; shop_id?: string; value?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.id ?? null;
  let body: { mode?: string; items?: InItem[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const mode = body.mode === "undo" ? "undo" : "apply";
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 500)
    .map((i) => ({ cat: String(i.central_category_id ?? "").trim(), pf: String(i.platform_id ?? "").trim(), shop: String(i.shop_id ?? "").trim(), value: String(i.value ?? "").trim() }))
    .filter((i) => i.cat && i.value && (i.pf || i.shop));
  if (items.length === 0) return NextResponse.json({ error: "ไม่มีรายการให้บันทึก" }, { status: 400 });

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const [{ data: cats }, { data: pfRows }, { data: mappings }] = await Promise.all([
    admin.from("platform_central_categories").select("id, name"),
    admin.from("erp_platforms").select("id, name_th"),
    admin.from("platform_category_mappings").select("central_category_id, platform_id, platform_category_path").in("central_category_id", [...new Set(items.map((i) => i.cat))]),
  ]);
  const catName = new Map(((cats ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const pfName = new Map(((pfRows ?? []) as { id: string; name_th: string }[]).map((p) => [p.id, p.name_th]));
  const current = new Map(((mappings ?? []) as Mapping[]).map((m) => [`${m.central_category_id}:${m.platform_id}`, m.platform_category_path ?? ""]));

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const done: { central_category_id: string; platform_id?: string; shop_id?: string; value: string }[] = [];
  let skipped = 0;

  // ── แพลตฟอร์ม ──
  const pfItems = items.filter((i) => i.pf);
  // ค่าที่จะบันทึกต้องอยู่ในรายการหมวดของร้านนั้นจริง (กันส่งค่ามั่ว)
  const validIds = new Set<string>();
  if (mode === "apply" && pfItems.length) {
    const ids = [...new Set(pfItems.map((i) => i.value.split(" · ")[0]))];
    for (let k = 0; k < ids.length; k += 200) {
      const { data } = await admin.from("platform_category_options").select("platform_id, external_id").in("external_id", ids.slice(k, k + 200));
      for (const r of (data ?? []) as { platform_id: string; external_id: string }[]) validIds.add(`${r.platform_id}:${r.external_id}`);
    }
  }
  for (const i of pfItems) {
    const k = `${i.cat}:${i.pf}`;
    const cur = current.get(k) ?? "";
    const label = `${catName.get(i.cat) ?? i.cat} · ${pfName.get(i.pf) ?? i.pf}`;
    if (mode === "apply") {
      if (cur || !validIds.has(`${i.pf}:${i.value.split(" · ")[0]}`)) { skipped++; continue; }
      const { error } = await admin.from("platform_category_mappings").insert({ central_category_id: i.cat, platform_id: i.pf, platform_category_path: i.value, is_active: true, created_by: actor, updated_by: actor, updated_at: now });
      if (error) { skipped++; continue; }   // ชนกับคนอื่นที่เพิ่งตั้ง (unique) = ข้าม ไม่ทับ
    } else {
      if (cur !== i.value) { skipped++; continue; }
      const { error } = await admin.from("platform_category_mappings").delete().eq("central_category_id", i.cat).eq("platform_id", i.pf).eq("platform_category_path", i.value);
      if (error) { skipped++; continue; }
    }
    before[label] = mode === "apply" ? null : i.value;
    after[label] = mode === "apply" ? i.value : null;
    done.push({ central_category_id: i.cat, platform_id: i.pf, value: i.value });
  }

  // ── ร้านเว็บ (shops.field_map.category.centralRules) — อ่าน-แก้-เขียนทีละร้าน ──
  const webChanged: string[] = [];
  for (const shopId of [...new Set(items.filter((i) => i.shop).map((i) => i.shop))]) {
    const { data: shop } = await admin.from("shops").select("id, name, field_map").eq("id", shopId).maybeSingle();
    if (!shop) { skipped += items.filter((i) => i.shop === shopId).length; continue; }
    const raw = ((shop as { field_map: unknown }).field_map ?? {}) as Record<string, unknown>;
    const fm = normalizeFieldMap(raw);
    const rules = { ...fm.category.centralRules };
    let changed = false;
    for (const i of items.filter((x) => x.shop === shopId)) {
      const cur = rules[i.cat] ?? "";
      const label = `${catName.get(i.cat) ?? i.cat} · ${(shop as { name: string }).name}`;
      if (mode === "apply") {
        if (cur || !fm.categories.some((c) => c.key === i.value)) { skipped++; continue; }
        rules[i.cat] = i.value;
      } else {
        if (cur !== i.value) { skipped++; continue; }
        delete rules[i.cat];
      }
      before[label] = mode === "apply" ? null : i.value;
      after[label] = mode === "apply" ? i.value : null;
      done.push({ central_category_id: i.cat, shop_id: shopId, value: i.value });
      changed = true;
    }
    if (!changed) continue;
    const rawCat = (raw.category && typeof raw.category === "object" ? raw.category : {}) as Record<string, unknown>;
    const { error } = await admin.from("shops").update({ field_map: { ...raw, category: { ...rawCat, centralRules: rules } } }).eq("id", shopId);
    if (error) return NextResponse.json({ error: "บันทึกหมวดเว็บไม่สำเร็จ" }, { status: 500 });
    webChanged.push(shopId);
  }

  if (done.length) {
    await writeAudit(admin, {
      action: mode === "apply" ? "bulk_update" : "bulk_delete",   // ย้อนกลับ = ล้างช่องที่ใส่ไป (ป้ายไทยมีในหน้าประวัติ)
      entityType: "platform_category_mapping",
      entityId: null,
      actorId: actor,
      actorName: user?.email ?? null,
      metadata: { from: "category_autofill", mode, count: done.length, skipped, changes: auditDiff(before, after) },
    });
    await Promise.all(webChanged.map((id) => purgeStorefrontCache(admin, id)));
  }
  return NextResponse.json({ ok: true, done, skipped, error: null });
}

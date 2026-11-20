/**
 * /api/sku-bundles — Bundle = กลุ่ม SKU ที่จับรวมกัน (แท็บ 📦 Bundle ในหน้า /master/skus)
 *
 *   GET    ?search=&limit=&offset=&trash=1 → รายการ bundle + รายการ SKU ข้างใน (รูป/รหัส/ชื่อ/ราคา/ลิงก์ Taobao/ร้าน/หน่วย)
 *                                          trash=1 = ดูถังขยะ (bundle ที่ลบแล้ว is_active=false)
 *   POST   { name?, note?, sku_ids[] }  → สร้าง bundle ใหม่ (ชื่อไม่ใส่ก็ได้ → หน้าจอโชว์ "Bundle #n")
 *   PATCH  { id, name?, note?, add_sku_ids?, remove_sku_ids?, qty?: {sku_id: qty}, restore?: true } → แก้ชื่อ/เพิ่ม-ลด SKU/จำนวน/กู้คืนจากถังขยะ
 *   DELETE ?id=                          → ย้ายไปถังขยะ (is_active=false — กู้คืนได้)
 *   DELETE ?id=&permanent=1              → ลบถาวร (ได้เฉพาะ bundle ที่อยู่ในถังขยะแล้ว — items ลบตาม cascade; SKU ไม่กระทบ)
 *
 * ลิงก์ Taobao ของแต่ละ SKU = skus_v2.purchase_link (ของกลาง) — แก้ผ่าน PATCH /api/master-v2/skus/<id> จากหน้าจอ
 * สิทธิ์: products.view (อ่าน) / products.edit (เขียน) + audit log ของกลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit, auditDiff } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BundleItem = {
  id: string; sku_id: string; qty: number; sort_order: number; note: string | null;
  code: string; name: string; image: string | null;
  list_price: number | null; standard_price: number | null; rmb_cost: number | null;
  purchase_link: string | null; is_active: boolean;
  seller: string | null; uom: string | null;   // ชื่อร้าน + หน่วยนับ (ใช้ตอน "ขอซื้อทั้งชุด" ใส่ตะกร้า)
};
export type Bundle = {
  id: string; name: string | null; note: string | null; seq: number;
  created_at: string; updated_at: string; items: BundleItem[];
};

const SKU_COLS = "id, code, name_th, cover_image_r2_key, list_price, standard_price, rmb_cost, purchase_link, is_active, seller_partner_id, uom_id";
type SkuRow = { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; list_price: number | null; standard_price: number | null; rmb_cost: number | null; purchase_link: string | null; is_active: boolean | null; seller_partner_id: string | null; uom_id: string | null };
type ItemRow = { id: string; bundle_id: string; sku_id: string; qty: number | string; sort_order: number; note: string | null };
type BundleRow = { id: string; name: string | null; note: string | null; created_at: string; updated_at: string; is_active: boolean | null };

async function actorOf(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

/** ประกอบ bundle + items + ข้อมูล SKU (ยิง 2 query รวม ไม่ยิงต่อ bundle) */
async function loadBundles(admin: ReturnType<typeof supabaseAdmin>, bundleRows: BundleRow[], seqBase: Map<string, number>): Promise<Bundle[]> {
  const ids = bundleRows.map((b) => b.id);
  if (ids.length === 0) return [];
  const { data: items } = await admin.from("sku_bundle_items").select("id, bundle_id, sku_id, qty, sort_order, note").in("bundle_id", ids).order("sort_order").order("created_at");
  const itemRows = (items ?? []) as ItemRow[];
  const skuIds = [...new Set(itemRows.map((i) => i.sku_id))];
  const skuMap = new Map<string, SkuRow>();
  if (skuIds.length) {
    const { data: skus } = await admin.from("skus_v2").select(SKU_COLS).in("id", skuIds);
    for (const s of (skus ?? []) as SkuRow[]) skuMap.set(s.id, s);
  }
  // ชื่อร้าน + หน่วยนับ (ยิงรวมทีเดียว)
  const sellerIds = [...new Set([...skuMap.values()].map((s) => s.seller_partner_id).filter((x): x is string => !!x))];
  const uomIds = [...new Set([...skuMap.values()].map((s) => s.uom_id).filter((x): x is string => !!x))];
  const sellerMap = new Map<string, string>(); const uomMap = new Map<string, string>();
  const [sellersRes, uomsRes] = await Promise.all([
    sellerIds.length ? admin.from("partners_v2").select("id, display_name, name_th, name_en").in("id", sellerIds) : Promise.resolve({ data: [] }),
    uomIds.length ? admin.from("uoms").select("id, name, display_name").in("id", uomIds) : Promise.resolve({ data: [] }),
  ]);
  for (const p of (sellersRes.data ?? []) as { id: string; display_name: string | null; name_th: string | null; name_en: string | null }[]) sellerMap.set(p.id, p.display_name || p.name_th || p.name_en || "");
  for (const u of (uomsRes.data ?? []) as { id: string; name: string | null; display_name: string | null }[]) uomMap.set(u.id, u.name || u.display_name || "");
  const byBundle = new Map<string, BundleItem[]>();
  for (const it of itemRows) {
    const s = skuMap.get(it.sku_id);
    if (!s) continue;   // SKU ถูกลบจริง → ข้าม
    const arr = byBundle.get(it.bundle_id) ?? [];
    arr.push({
      id: it.id, sku_id: it.sku_id, qty: Number(it.qty ?? 1), sort_order: it.sort_order, note: it.note,
      code: s.code, name: s.name_th ?? "", image: s.cover_image_r2_key ? `/api/r2-image?key=${encodeURIComponent(s.cover_image_r2_key)}` : null,
      list_price: s.list_price, standard_price: s.standard_price, rmb_cost: s.rmb_cost, purchase_link: s.purchase_link, is_active: s.is_active !== false,
      seller: s.seller_partner_id ? (sellerMap.get(s.seller_partner_id) || null) : null,
      uom: s.uom_id ? (uomMap.get(s.uom_id) || null) : null,
    });
    byBundle.set(it.bundle_id, arr);
  }
  return bundleRows.map((b) => ({ id: b.id, name: b.name, note: b.note, created_at: b.created_at, updated_at: b.updated_at, seq: seqBase.get(b.id) ?? 0, items: byBundle.get(b.id) ?? [] }));
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const search = (sp.get("search") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 60)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const trash = sp.get("trash") === "1";
  const admin = supabaseAdmin();

  // ลำดับ "Bundle #n" = ลำดับที่สร้าง (เก่าสุด = #1) — นับรวมตัวที่อยู่ในถังขยะด้วย (ลบ/กู้คืนแล้วเลขไม่เลื่อน)
  const { data: all, error: allErr } = await admin.from("sku_bundles").select("id, name, note, created_at, updated_at, is_active").order("created_at", { ascending: true });
  if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });
  const allRows = (all ?? []) as BundleRow[];
  const seq = new Map<string, number>(); allRows.forEach((b, i) => seq.set(b.id, i + 1));
  const trashCount = allRows.filter((b) => b.is_active === false).length;

  // ถังขยะ = ลบล่าสุดก่อน (updated_at = เวลาที่ย้ายเข้าถัง) · ปกติ = ใหม่สุดก่อน
  let rows = trash
    ? allRows.filter((b) => b.is_active === false).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    : allRows.filter((b) => b.is_active !== false).reverse();
  if (search) {
    // ค้นจากชื่อ bundle หรือ รหัส/ชื่อ SKU ที่อยู่ข้างใน
    const s = search.toLowerCase();
    const { data: skus } = await admin.from("skus_v2").select("id").or(`code.ilike.%${search.replace(/[%,]/g, "")}%,name_th.ilike.%${search.replace(/[%,]/g, "")}%`).limit(500);
    const skuIds = ((skus ?? []) as { id: string }[]).map((x) => x.id);
    const hit = new Set<string>();
    if (skuIds.length) {
      const { data: its } = await admin.from("sku_bundle_items").select("bundle_id").in("sku_id", skuIds);
      for (const it of (its ?? []) as { bundle_id: string }[]) hit.add(it.bundle_id);
    }
    rows = rows.filter((b) => hit.has(b.id) || (b.name ?? "").toLowerCase().includes(s) || `bundle #${seq.get(b.id)}`.includes(s));
  }
  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  const bundles = await loadBundles(admin, page, seq);
  return NextResponse.json({ bundles, total, trash_count: trashCount, error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let body: { name?: string | null; note?: string | null; sku_ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const skuIds = [...new Set((body.sku_ids ?? []).filter((x) => typeof x === "string" && x))];
  if (skuIds.length === 0) return NextResponse.json({ error: "เลือก SKU อย่างน้อย 1 ตัว" }, { status: 400 });
  const admin = supabaseAdmin();
  const name = (body.name ?? "").trim() || null;
  const { data: b, error } = await admin.from("sku_bundles").insert({ name, note: (body.note ?? "").trim() || null, created_by: actor.id }).select("id").single();
  if (error || !b) return NextResponse.json({ error: error?.message ?? "สร้างไม่สำเร็จ" }, { status: 400 });
  const { error: iErr } = await admin.from("sku_bundle_items").insert(skuIds.map((sku_id, i) => ({ bundle_id: b.id, sku_id, sort_order: i })));
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "sku_bundles", entityId: b.id, actorId: actor.id, actorName: actor.name, metadata: { name, sku_ids: skuIds } });
  return NextResponse.json({ id: b.id, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  let body: { id?: string; name?: string | null; note?: string | null; add_sku_ids?: string[]; remove_sku_ids?: string[]; qty?: Record<string, number>; restore?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  // กู้คืนจากถังขยะ
  if (body.restore) {
    const { error } = await admin.from("sku_bundles").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "restore", entityType: "sku_bundles", entityId: body.id, actorId: actor.id, actorName: actor.name, metadata: { changes: auditDiff({ is_active: false }, { is_active: true }) } });
    return NextResponse.json({ ok: true, error: null });
  }
  const changes: Record<string, unknown> = {};
  if (body.name !== undefined) changes.name = (body.name ?? "").trim() || null;
  if (body.note !== undefined) changes.note = (body.note ?? "").trim() || null;
  if (Object.keys(changes).length) {
    const { error } = await admin.from("sku_bundles").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const add = [...new Set((body.add_sku_ids ?? []).filter(Boolean))];
  if (add.length) {
    const { data: cur } = await admin.from("sku_bundle_items").select("sku_id, sort_order").eq("bundle_id", body.id);
    const have = new Set(((cur ?? []) as { sku_id: string }[]).map((x) => x.sku_id));
    let next = Math.max(-1, ...((cur ?? []) as { sort_order: number }[]).map((x) => x.sort_order)) + 1;
    const fresh = add.filter((s) => !have.has(s)).map((sku_id) => ({ bundle_id: body.id, sku_id, sort_order: next++ }));
    if (fresh.length) { const { error } = await admin.from("sku_bundle_items").insert(fresh); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); }
  }
  const remove = (body.remove_sku_ids ?? []).filter(Boolean);
  if (remove.length) {
    const { error } = await admin.from("sku_bundle_items").delete().eq("bundle_id", body.id).in("sku_id", remove);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  for (const [skuId, q] of Object.entries(body.qty ?? {})) {
    const n = Number(q); if (!Number.isFinite(n) || n <= 0) continue;
    await admin.from("sku_bundle_items").update({ qty: n }).eq("bundle_id", body.id).eq("sku_id", skuId);
  }
  if (add.length || remove.length) await admin.from("sku_bundles").update({ updated_at: new Date().toISOString() }).eq("id", body.id);
  await writeAudit(admin, { action: "update", entityType: "sku_bundles", entityId: body.id, actorId: actor.id, actorName: actor.name, metadata: { ...changes, add_sku_ids: add, remove_sku_ids: remove, qty: body.qty ?? null } });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const id = request.nextUrl.searchParams.get("id");
  const permanent = request.nextUrl.searchParams.get("permanent") === "1";
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: b } = await admin.from("sku_bundles").select("name, is_active").eq("id", id).maybeSingle();
  if (!b) return NextResponse.json({ error: "ไม่พบ bundle นี้" }, { status: 404 });
  if (!permanent) {
    // ค่าเริ่มต้น = ย้ายไปถังขยะ (กู้คืนได้)
    const { error } = await admin.from("sku_bundles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "archive", entityType: "sku_bundles", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { name: b.name ?? null, changes: auditDiff({ is_active: true }, { is_active: false }) } });
    return NextResponse.json({ ok: true, error: null });
  }
  // ลบถาวร — ต้องอยู่ในถังขยะก่อน กันกดพลาดลบของที่ใช้อยู่
  if (b.is_active !== false) return NextResponse.json({ error: "ย้าย bundle ไปถังขยะก่อน แล้วค่อยลบถาวร" }, { status: 400 });
  const { data: snap } = await admin.from("sku_bundle_items").select("sku_id, qty").eq("bundle_id", id);
  const { error } = await admin.from("sku_bundles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "sku_bundles", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { name: b.name ?? null, items: snap ?? [], permanent: true } });
  return NextResponse.json({ ok: true, error: null });
}

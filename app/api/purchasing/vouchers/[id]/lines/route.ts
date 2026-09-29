/**
 * รายการที่ "เพิ่มเอง" ในใบสำคัญรับ (ไม่ได้มาจากใบรับ GR) — ใช้กับใบที่สร้างเปล่า หรือของแถม/ค่าใช้จ่ายที่ไม่มีในใบรับ
 *   POST   /api/purchasing/vouchers/<id>/lines  { item_sku_id?, item_name, qty, uom?, unit_price? }  → เพิ่มรายการ
 *   DELETE /api/purchasing/vouchers/<id>/lines?line_id=                                              → ลบรายการที่เพิ่มเอง
 * แก้จำนวน/ชื่อ/ราคา ใช้ PATCH /api/purchasing/vouchers/<id> (lines[]) เหมือนรายการอื่น
 * รายการที่มาจากใบรับ ลบ/แก้จำนวนที่นี่ไม่ได้ — ต้องแก้ที่ใบรับ (จำนวนต้องตรงกับของที่รับจริง/สต๊อก)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recomputeVoucher, fetchVoucher } from "@/lib/purchase-voucher-server";
import { loadPartnerMatcher } from "@/lib/po-line-price";
import { cbmFromCm, isCNY } from "@/lib/landed-cost";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();

async function loadDraft(id: string) {
  const admin = supabaseAdmin();
  const { data: v } = await admin.from("purchase_vouchers_v2").select("id, status, seller_name, currency").eq("id", id).maybeSingle();
  return { admin, v: (v as Row | null) };
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  let body: { item_sku_id?: string | null; item_name?: string; qty?: unknown; uom?: string | null; unit_price?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { admin, v } = await loadDraft(id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if (v.status !== "draft") return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว เพิ่มรายการไม่ได้" }, { status: 400 });

  const skuId = str(body.item_sku_id) || null;
  let name = str(body.item_name);
  let uom = str(body.uom) || null;
  const qty = num(body.qty);
  if (qty <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });

  // ดึงชื่อ/หน่วย/ขนาด-น้ำหนัก (ตัวแม่) + ราคาต่อร้าน จากสินค้า ถ้าเลือกจากคลัง
  let cbm: number | null = null, kg: number | null = null;
  let price: number | null = num(body.unit_price) > 0 ? num(body.unit_price) : null;
  let source = price != null ? "manual" : "none";
  if (skuId) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, name_th, uom_id, parent_skus_v2 ( size_length_cm, size_height_cm, size_thickness_cm, weight_g )").eq("id", skuId).maybeSingle();
    const s = sk as unknown as Row | null;
    if (!s) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    if (!name) name = `[${str(s.code)}] ${str(s.name_th)}`;
    if (!uom && s.uom_id) { const { data: u } = await admin.from("uoms").select("name").eq("id", String(s.uom_id)).maybeSingle(); uom = str((u as Row | null)?.name) || null; }
    const raw = s.parent_skus_v2; const p = (Array.isArray(raw) ? raw[0] : raw) as Row | null | undefined;
    if (p) { cbm = cbmFromCm(p.size_length_cm, p.size_height_cm, p.size_thickness_cm); const g = num(p.weight_g); kg = g > 0 ? Math.round((g / 1000) * 1000) / 1000 : null; }
    if (price == null) {
      const matcher = await loadPartnerMatcher(admin);
      const partner = v.seller_name ? (matcher.match(String(v.seller_name)) as Row | undefined) : undefined;
      const { data: si } = await admin.from("supplier_items").select("supplier_partner_id, price, currency, is_default").eq("item_sku_id", skuId).not("is_active", "is", false);
      const same = (c: unknown) => isCNY(String(c ?? "THB")) === isCNY(String(v.currency ?? "THB"));
      const rows = ((si ?? []) as Row[]).filter((r) => num(r.price) > 0 && same(r.currency));
      const hit = rows.find((r) => partner && String(r.supplier_partner_id) === String(partner.id)) ?? rows.find((r) => r.is_default);
      if (hit) { price = num(hit.price); source = "price_list"; }
    }
  }
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อสินค้า หรือเลือกจากคลังสินค้า" }, { status: 400 });

  const { data: mx } = await admin.from("purchase_voucher_lines_v2").select("sort_order").eq("voucher_id", id).order("sort_order", { ascending: false }).limit(1);
  const sort = num(((mx ?? [])[0] as Row | undefined)?.sort_order) + 1;
  const { data: ins, error } = await admin.from("purchase_voucher_lines_v2").insert({
    voucher_id: id, item_sku_id: skuId, item_name: name, uom, qty, unit_price: price, cbm_per_unit: cbm, kg_per_unit: kg, price_source: source, sort_order: sort,
  }).select("id").single();
  if (error || !ins) return NextResponse.json({ error: "เพิ่มรายการไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
  await recomputeVoucher(admin, id);
  await writeAudit(admin, { action: "create", entityType: "purchase_voucher_lines_v2", entityId: String((ins as Row).id), actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { voucher_id: id, item_name: name, qty, unit_price: price } });
  return NextResponse.json({ ok: true, data: await fetchVoucher(admin, id), error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  const lineId = str(request.nextUrl.searchParams.get("line_id"));
  if (!lineId) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });
  const { admin, v } = await loadDraft(id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if (v.status !== "draft") return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว ลบรายการไม่ได้" }, { status: 400 });
  const { data: l } = await admin.from("purchase_voucher_lines_v2").select("id, gr_line_id, gr_no, item_name, qty, unit_price").eq("id", lineId).eq("voucher_id", id).maybeSingle();
  const line = l as Row | null;
  if (!line) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  if (line.gr_line_id) return NextResponse.json({ error: `รายการนี้มาจากใบรับ ${line.gr_no ?? ""} — ลบที่นี่ไม่ได้ (จำนวนต้องตรงกับของที่รับจริง) ให้แก้/ลบที่ใบรับแทน` }, { status: 400 });
  const { error } = await admin.from("purchase_voucher_lines_v2").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", lineId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recomputeVoucher(admin, id);
  await writeAudit(admin, { action: "delete", entityType: "purchase_voucher_lines_v2", entityId: lineId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { voucher_id: id, snapshot: line } });
  return NextResponse.json({ ok: true, data: await fetchVoucher(admin, id), error: null });
}

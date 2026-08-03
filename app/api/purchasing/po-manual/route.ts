/**
 * POST /api/purchasing/po-manual — "เปิด PO เอง" (ไม่ต้องผ่านใบขอซื้อ)
 *
 * ใช้เมื่อ: ซัพพลายเออร์ขอใบ PO / ของที่ไม่ได้ผ่านตะกร้าขอซื้อ / สั่งด่วน
 * ต่างจาก /api/purchasing/create-po ตรงที่ตัวนั้นสร้างจาก PR ที่อนุมัติแล้วเท่านั้น
 *
 * body: {
 *   seller_name: string, seller_partner_id?: string|null, currency?: string,
 *   order_date?: string, expected_date?: string|null, note?: string,
 *   lines: [{ item_sku_id?: string|null, item_name: string, qty: number, uom?: string|null, price?: number, note?: string }]
 * }
 *
 * ใช้ของกลางเดิมทั้งหมด: erp_next_number('po') ออกเลข · buildPartnerMatcher จับคู่ร้าน · writeAudit
 * ตารางเดียวกับ PO ปกติ (purchase_orders_v2 + purchase_order_lines_v2) → ไหลเข้าหน้ารับของ/ปฏิทิน/แดชบอร์ดได้เลย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();

type InLine = {
  item_sku_id?: string | null; item_name?: string; qty?: number;
  uom?: string | null; price?: number; note?: string | null;
};
type Body = {
  seller_name?: string; seller_partner_id?: string | null; currency?: string;
  order_date?: string; expected_date?: string | null; note?: string;
  lines?: InLine[]; actor?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const seller = str(body.seller_name);
  if (!seller) return NextResponse.json({ error: "ยังไม่ได้เลือกร้าน/ผู้จำหน่าย" }, { status: 400 });

  const inLines = Array.isArray(body.lines) ? body.lines : [];
  const lines = inLines.filter((l) => str(l.item_name) && num(l.qty) > 0);
  if (lines.length === 0) {
    return NextResponse.json({ error: "ต้องมีสินค้าอย่างน้อย 1 รายการ (ใส่ชื่อและจำนวนให้ครบ)" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const currency = str(body.currency) || "THB";
  const orderDate = str(body.order_date) || new Date().toISOString().slice(0, 10);
  const actor = str(body.actor) || user.email || "system";

  // ผูก id ร้านให้ตั้งแต่แรก — ถ้าไม่ได้ส่งมา ลองจับคู่จากชื่อด้วยของกลาง lib/partner-match
  let partnerId = str(body.seller_partner_id) || null;
  if (!partnerId) {
    const { data: partners } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
    partnerId = buildPartnerMatcher((partners ?? []) as unknown as PartnerLike[]).match(seller)?.id ?? null;
  }

  // เลขที่ PO — ระบบเลขเอกสารกลาง (atomic กันเลขซ้ำ) ตั้งรูปแบบได้ที่ /admin/numbering
  const { data: poNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "po" });
  if (numErr || !poNo) return NextResponse.json({ error: "ออกเลข PO ไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });

  const grandTotal = lines.reduce((a, l) => a + num(l.qty) * num(l.price), 0);

  const { data: po, error: poErr } = await admin.from("purchase_orders_v2").insert({
    po_no: poNo,
    seller_name: seller,
    seller_partner_id: partnerId,
    currency,
    order_date: orderDate,
    expected_date: str(body.expected_date) || null,
    status: "draft",
    grand_total: grandTotal,
    requester: actor,
    note: str(body.note) || null,
  }).select("id, po_no").single();
  if (poErr || !po) return NextResponse.json({ error: "สร้างใบสั่งซื้อไม่สำเร็จ: " + (poErr?.message ?? "") }, { status: 500 });

  const lineRows = lines.map((l, i) => ({
    po_id: po.id,
    item_sku_id: l.item_sku_id || null,
    item_name: str(l.item_name),
    qty: num(l.qty),
    uom: str(l.uom) || null,
    price_est: num(l.price),
    line_total: num(l.qty) * num(l.price),
    currency,
    note: str(l.note) || null,
    sort_order: i,
  }));
  const { error: lineErr } = await admin.from("purchase_order_lines_v2").insert(lineRows);
  if (lineErr) {
    // ใบเปล่าไม่มีประโยชน์ และจะไปโผล่ในรายการ/ปฏิทิน → ลบทิ้งให้สะอาด
    await admin.from("purchase_orders_v2").delete().eq("id", po.id);
    return NextResponse.json({ error: "บันทึกรายการสินค้าไม่สำเร็จ: " + lineErr.message }, { status: 500 });
  }

  await writeAudit(admin, {
    action: "create",
    entityType: "purchase_orders_v2",
    entityId: String(po.id),
    actorId: user.id,
    actorName: actor,
    metadata: { po_no: po.po_no, seller, currency, lines: lineRows.length, grand_total: grandTotal, source: "manual" },
  });

  return NextResponse.json({ id: po.id, po_no: po.po_no, line_count: lineRows.length, grand_total: grandTotal, error: null });
}

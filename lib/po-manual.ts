/**
 * ของกลาง — "เปิด PO เอง" (ไม่ต้องผ่านใบขอซื้อ)
 *
 * ย้ายออกมาจาก /api/purchasing/po-manual เพราะมีที่เรียกใช้ 2 ที่แล้ว:
 *   - ป๊อป "เปิด PO ใหม่" หน้ารายการ PO (ผ่าน route po-manual)
 *   - ยืนยัน "คำสั่งซื้อจากไลน์" แบบเปิด PO ใหม่ (lib/order-capture)
 *
 * ใช้ของกลางเดิมทั้งหมด: erp_next_number('po') ออกเลข · buildPartnerMatcher จับคู่ร้าน · writeAudit
 * ตารางเดียวกับ PO ปกติ (purchase_orders_v2 + purchase_order_lines_v2) → ไหลเข้าหน้ารับของ/ปฏิทิน/แดชบอร์ดได้เลย
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { checkCompanyId } from "@/lib/company-check";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";

type Admin = ReturnType<typeof supabaseAdmin>;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();

export type ManualPoLine = {
  item_sku_id?: string | null; item_name?: string; qty?: number;
  uom?: string | null; price?: number; note?: string | null;
};
export type ManualPoInput = {
  seller_name?: string; seller_partner_id?: string | null; currency?: string;
  order_date?: string; expected_date?: string | null; note?: string;
  lines?: ManualPoLine[];
  /** ใบซื้อของบริษัทไหน — ว่าง = บริษัทตั้งต้น (DB เติมให้) */
  company_id?: string | null;
};
export type ManualPoResult =
  | { ok: true; id: string; po_no: string; line_count: number; grand_total: number }
  | { ok: false; status: number; error: string };

export async function createManualPo(
  admin: Admin,
  input: ManualPoInput,
  actor: { id: string; name: string },
  /** ข้อมูลเสริมลง audit (เช่น source: "line_capture") */
  auditExtra?: Record<string, unknown>,
): Promise<ManualPoResult> {
  const seller = str(input.seller_name);
  if (!seller) return { ok: false, status: 400, error: "ยังไม่ได้เลือกร้าน/ผู้จำหน่าย" };

  const inLines = Array.isArray(input.lines) ? input.lines : [];
  const lines = inLines.filter((l) => str(l.item_name) && num(l.qty) > 0);
  if (lines.length === 0) {
    return { ok: false, status: 400, error: "ต้องมีสินค้าอย่างน้อย 1 รายการ (ใส่ชื่อและจำนวนให้ครบ)" };
  }

  const currency = str(input.currency) || "THB";
  const orderDate = str(input.order_date) || new Date().toISOString().slice(0, 10);

  // ผูก id ร้านให้ตั้งแต่แรก — ถ้าไม่ได้ส่งมา ลองจับคู่จากชื่อด้วยของกลาง lib/partner-match
  let partnerId = str(input.seller_partner_id) || null;
  if (!partnerId) {
    const { data: partners } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
    partnerId = buildPartnerMatcher((partners ?? []) as unknown as PartnerLike[]).match(seller)?.id ?? null;
  }

  // เลขที่ PO — ระบบเลขเอกสารกลาง (atomic กันเลขซ้ำ) ตั้งรูปแบบได้ที่ /admin/numbering
  const { data: poNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "po" });
  if (numErr || !poNo) return { ok: false, status: 500, error: "ออกเลข PO ไม่สำเร็จ: " + (numErr?.message ?? "") };

  const grandTotal = lines.reduce((a, l) => a + num(l.qty) * num(l.price), 0);
  const company = await checkCompanyId(admin, input.company_id);
  if ("error" in company) return { ok: false, status: 400, error: company.error };

  const { data: po, error: poErr } = await admin.from("purchase_orders_v2").insert({
    po_no: poNo,
    seller_name: seller,
    seller_partner_id: partnerId,
    currency,
    order_date: orderDate,
    expected_date: str(input.expected_date) || null,
    status: "draft",
    grand_total: grandTotal,
    requester: actor.name,
    note: str(input.note) || null,
    company_id: company.companyId,
  }).select("id, po_no").single();
  if (poErr || !po) return { ok: false, status: 500, error: "สร้างใบสั่งซื้อไม่สำเร็จ: " + (poErr?.message ?? "") };

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
    return { ok: false, status: 500, error: "บันทึกรายการสินค้าไม่สำเร็จ: " + lineErr.message };
  }

  await writeAudit(admin, {
    action: "create",
    entityType: "purchase_orders_v2",
    entityId: String(po.id),
    actorId: actor.id,
    actorName: actor.name,
    metadata: { po_no: po.po_no, seller, currency, lines: lineRows.length, grand_total: grandTotal, source: "manual", ...(auditExtra ?? {}) },
  });

  return { ok: true, id: String(po.id), po_no: String(po.po_no), line_count: lineRows.length, grand_total: grandTotal };
}

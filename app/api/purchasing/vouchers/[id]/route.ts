/**
 * ใบสำคัญรับ 1 ใบ
 *   GET    /api/purchasing/vouchers/<id>   → หัวใบ + รายการ (พร้อมรหัส/รูป/ค่าจากตัวแม่) — หน้าเว็บ + หน้าพิมพ์ใช้
 *   PATCH  /api/purchasing/vouchers/<id>   → บันทึกร่าง { header?: {...}, lines?: [{ id, unit_price?, cbm_per_unit?, kg_per_unit? }] } แล้วคิดใหม่ทั้งใบ
 *   DELETE /api/purchasing/vouchers/<id>   → ยกเลิกใบร่าง (ปล่อยใบรับ GR กลับไปคิว)
 * แก้ได้เฉพาะสถานะ draft — ยืนยันแล้วให้ดูอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchVoucher, recomputeVoucher, assignVoucherNumber, SHIP_METHODS } from "@/lib/purchase-voucher-server";
import type { ShipMethod } from "@/lib/landed-cost";
import { voucherEditable } from "@/lib/voucher-revision";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const optNum = (v: unknown): number | null => (v === null || v === "" || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const v = await fetchVoucher(supabaseAdmin(), id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  return NextResponse.json({ data: v, error: null });
}

type PatchBody = {
  header?: {
    voucher_date?: string; currency?: string; fx_rate?: unknown; ship_method?: string; ship_rate?: unknown; ship_rate_cube?: unknown; ship_rate_kg?: unknown; ship_manual_total?: unknown; note?: string | null; seller_name?: string;
    carrier_id?: string | null; carrier_name?: string | null; tracking_no?: string | null;
    shipping_bill_id?: string | null; shipping_payment_status?: string; shipping_paid_date?: string | null;
    /** ★ 2026-11-15 ค่าส่งในจีน (สกุลใบ) · ค่าธรรมเนียมจ่ายเงิน (฿) · ยอดจ่ายจริงตามบิล (฿) */
    seller_ship_foreign?: unknown; pay_fee_thb?: unknown; paid_total_thb?: unknown;
  };
  /** qty / item_name / uom แก้ได้เฉพาะรายการที่ "เพิ่มเอง" (ไม่มี gr_line_id) — รายการจากใบรับต้องแก้ที่ใบรับ */
  lines?: { id: string; unit_price?: unknown; cbm_per_unit?: unknown; kg_per_unit?: unknown; ship_method?: string | null; qty?: unknown; item_name?: string; uom?: string | null; discount?: unknown; discount_pct?: unknown }[];
};

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("purchase_vouchers_v2").select("id, status, pv_no, editing_at").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  const draftStatus = (cur as { status: string }).status === "draft";
  // ★ 2026-11-15 ใบที่ยืนยันแล้วแต่ "เปิดแก้" อยู่ (lib/voucher-revision) = แก้ได้เหมือนร่าง
  const isDraft = voucherEditable(cur as { status: string; editing_at?: string | null });
  const hadNumber = !!(cur as { pv_no?: string | null }).pv_no;

  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // ใบที่ยืนยันแล้ว: แก้ได้เฉพาะ "การจ่ายค่าส่ง" + หมายเหตุ (ราคาถูกเขียนกลับระบบไปแล้ว)
  const PAY_KEYS = new Set(["shipping_payment_status", "shipping_paid_date", "shipping_bill_id", "note", "tracking_no"]);
  if (!isDraft) {
    const keys = Object.keys(body.header ?? {});
    if (Array.isArray(body.lines) && body.lines.length) return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว แก้รายการไม่ได้" }, { status: 400 });
    if (keys.some((k) => !PAY_KEYS.has(k))) return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว แก้ได้เฉพาะสถานะจ่ายค่าส่ง/หมายเหตุ" }, { status: 400 });
  }

  if (body.header) {
    const h = body.header; const patch: Record<string, unknown> = {};
    if (h.carrier_id !== undefined) patch.carrier_id = h.carrier_id ? String(h.carrier_id) : null;
    if (h.carrier_name !== undefined) patch.carrier_name = h.carrier_name ? String(h.carrier_name) : null;
    if (h.tracking_no !== undefined) patch.tracking_no = h.tracking_no ? String(h.tracking_no).trim().toUpperCase() : null;
    if (h.shipping_bill_id !== undefined) patch.shipping_bill_id = h.shipping_bill_id ? String(h.shipping_bill_id) : null;
    if (h.shipping_payment_status !== undefined) patch.shipping_payment_status = h.shipping_payment_status === "paid" ? "paid" : "unpaid";
    if (h.shipping_paid_date !== undefined) patch.shipping_paid_date = h.shipping_paid_date ? String(h.shipping_paid_date) : null;
    if (h.voucher_date !== undefined && h.voucher_date) patch.voucher_date = h.voucher_date;
    if (h.currency !== undefined && h.currency) patch.currency = String(h.currency).toUpperCase();
    if (h.fx_rate !== undefined) patch.fx_rate = optNum(h.fx_rate);
    if (h.ship_method !== undefined) {
      if (!SHIP_METHODS.includes(h.ship_method as ShipMethod)) return NextResponse.json({ error: "วิธีคิดค่าส่งไม่ถูกต้อง" }, { status: 400 });
      patch.ship_method = h.ship_method;
    }
    if (h.ship_rate !== undefined) patch.ship_rate = optNum(h.ship_rate);
    if (h.ship_rate_cube !== undefined) patch.ship_rate_cube = optNum(h.ship_rate_cube);
    if (h.ship_rate_kg !== undefined) patch.ship_rate_kg = optNum(h.ship_rate_kg);
    if (h.ship_manual_total !== undefined) patch.ship_manual_total = optNum(h.ship_manual_total);
    for (const k of ["seller_ship_foreign", "pay_fee_thb", "paid_total_thb"] as const) {
      if (h[k] === undefined) continue;
      const x = optNum(h[k]);
      if (x != null && x < 0) return NextResponse.json({ error: "ค่าส่งในจีน / ค่าธรรมเนียม / ยอดจ่ายจริง ติดลบไม่ได้" }, { status: 400 });
      patch[k] = x != null && x > 0 ? x : null;
    }
    if (h.note !== undefined) patch.note = h.note ? String(h.note) : null;
    if (h.seller_name !== undefined) patch.seller_name = String(h.seller_name ?? "").trim() || null;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("purchase_vouchers_v2").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: "บันทึกหัวใบไม่สำเร็จ: " + error.message }, { status: 400 });
    }
  }
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) {
      if (!l?.id) continue;
      const patch: Record<string, unknown> = {};
      if (l.unit_price !== undefined) {
        const p = optNum(l.unit_price);
        if (p != null && p < 0) return NextResponse.json({ error: "ราคาติดลบไม่ได้" }, { status: 400 });
        patch.unit_price = p != null && p > 0 ? p : null;
        // ราคาไม่เปลี่ยน (แค่กดบันทึกร่าง) = คงที่มาของราคาเดิม (จาก PO / ราคาต่อร้าน / บิลร้าน) ไม่ให้กลายเป็น "กรอกเอง"
        const { data: cur } = await admin.from("purchase_voucher_lines_v2").select("unit_price, price_source").eq("id", String(l.id)).eq("voucher_id", id).maybeSingle();
        const before = cur as { unit_price?: number | string | null; price_source?: string | null } | null;
        const same = before != null && (before.unit_price == null ? patch.unit_price == null : patch.unit_price != null && Math.abs(Number(before.unit_price) - Number(patch.unit_price)) < 1e-9);
        patch.price_source = same && before?.price_source ? before.price_source : p != null && p > 0 ? "manual" : "none";
      }
      // ★ 2026-11-14 ส่วนลดบรรทัด — ยอดเงิน (สกุลใบ) หรือ % (มี % = คิดจาก %) · 0/ว่าง = ไม่มีส่วนลด
      if (l.discount !== undefined) { const d = optNum(l.discount); if (d != null && d < 0) return NextResponse.json({ error: "ส่วนลดติดลบไม่ได้" }, { status: 400 }); patch.discount = d != null && d > 0 ? d : null; }
      if (l.discount_pct !== undefined) { const p = optNum(l.discount_pct); if (p != null && (p < 0 || p > 100)) return NextResponse.json({ error: "ส่วนลด % ต้องอยู่ระหว่าง 0-100" }, { status: 400 }); patch.discount_pct = p != null && p > 0 ? p : null; }
      if (l.cbm_per_unit !== undefined) patch.cbm_per_unit = optNum(l.cbm_per_unit);
      if (l.kg_per_unit !== undefined) patch.kg_per_unit = optNum(l.kg_per_unit);
      if (l.ship_method !== undefined) patch.ship_method = l.ship_method === "cube" || l.ship_method === "weight" ? l.ship_method : null;
      if (l.qty !== undefined || l.item_name !== undefined || l.uom !== undefined) {
        const { data: row } = await admin.from("purchase_voucher_lines_v2").select("gr_line_id").eq("id", String(l.id)).eq("voucher_id", id).maybeSingle();
        if (row && !(row as { gr_line_id?: string | null }).gr_line_id) {   // เฉพาะรายการที่เพิ่มเอง
          if (l.qty !== undefined) { const q = optNum(l.qty); if (q == null || q <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 }); patch.qty = q; }
          if (l.item_name !== undefined && String(l.item_name).trim()) patch.item_name = String(l.item_name).trim();
          if (l.uom !== undefined) patch.uom = l.uom ? String(l.uom) : null;
        }
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from("purchase_voucher_lines_v2").update(patch).eq("id", String(l.id)).eq("voucher_id", id);
        if (error) return NextResponse.json({ error: "บันทึกรายการไม่สำเร็จ: " + error.message }, { status: 400 });
      }
    }
  }
  if (isDraft) {
    await recomputeVoucher(admin, id);   // ยืนยันแล้วยอดล็อก ไม่คิดใหม่
    // ★ 2026-11-14 เลขใบตามวันที่ใบ — แก้วันที่ใบร่าง = เลขย้ายไปวันใหม่ · วันเดิม = คงเลขเดิม
    //   ใบร่างเก่าที่ยังไม่มีเลข = ไม่ออกตอนบันทึก (เจ้าของเลือก "ได้เลขตอนยืนยัน")
    if (draftStatus && hadNumber && body.header?.voucher_date !== undefined) await assignVoucherNumber(admin, id);   // เปิดแก้หลังยืนยัน = คงเลขเดิม
  } else {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "update", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shipping_payment: body.header ?? null } });
  }
  const v = await fetchVoucher(admin, id);
  return NextResponse.json({ ok: true, data: v, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("purchase_vouchers_v2").select("id, status, pv_no").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if ((cur as { status: string }).status !== "draft") return NextResponse.json({ error: "ยกเลิกได้เฉพาะใบร่าง (ใบที่ยืนยันแล้วเขียนราคากลับระบบไปแล้ว)" }, { status: 400 });
  // ปล่อยใบรับกลับคิว + ปิดใบร่าง
  // ★ 2026-11-14 เจ้าของเลือก "ยกเลิกใบร่าง = คืนเลข" → ล้างเลขออก (ใบถัดไปของวันนั้นใช้เลขนี้ได้) · เลขเดิมจดไว้ในประวัติ
  const releasedNo = (cur as { pv_no?: string | null }).pv_no ?? null;
  await admin.from("goods_receipts_v2").update({ voucher_id: null }).eq("voucher_id", id);
  const { error } = await admin.from("purchase_vouchers_v2").update({ status: "cancelled", is_active: false, pv_no: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "cancel", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { note: "ยกเลิกใบร่าง ปล่อย GR กลับคิว", released_pv_no: releasedNo } });
  return NextResponse.json({ ok: true, error: null });
}

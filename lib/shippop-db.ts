/**
 * 🚚 Shippop — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · ตัวเรียก API + กฎอยู่ lib/shippop.ts
 * ใช้ที่: /api/website/orders/shippop (ERP จอง/ยกเลิก/จำลอง) · /api/public/shippop/webhook (Shippop แจ้งสถานะ)
 */
import { writeAudit } from "@/lib/audit";
import type { SiteInfo } from "@/lib/website-site-info";
import { orderStatusFromShippop, parseBox, telOf, type BookItem, type ShippopAddress, type ShippopInfo } from "@/lib/shippop";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export const SHIPPOP_ORDER_SELECT =
  "id, shop_id, order_no, status, payment_method, payment_status, grand_total, deposit_amount, customer_name, customer_phone, ship_address_line, ship_subdistrict, ship_district, ship_province, ship_postal, shipping_method, tracking_no, tracking_carrier, shippop";

export interface ShippopOrderRow {
  id: string;
  shop_id: string;
  order_no: string;
  status: string;
  payment_method: string;
  payment_status: string;
  grand_total: number | string;
  deposit_amount: number | string | null;
  customer_name: string;
  customer_phone: string;
  ship_address_line: string | null;
  ship_subdistrict: string | null;
  ship_district: string | null;
  ship_province: string | null;
  ship_postal: string | null;
  tracking_no: string | null;
  tracking_carrier: string | null;
  shippop: ShippopInfo | null;
}

/** ที่อยู่ผู้ส่งจากข้อมูลร้าน › 🚚 · ไม่ครบ = ข้อความบอกช่องที่ขาด */
export function senderOf(info: SiteInfo): { ok: true; from: ShippopAddress } | { ok: false; error: string } {
  const from: ShippopAddress = {
    name: info.shippop_from_name.trim(),
    address: info.shippop_from_address.trim(),
    district: info.shippop_from_district.trim(),
    state: info.shippop_from_state.trim(),
    province: info.shippop_from_province.trim(),
    postcode: info.shippop_from_postcode.replace(/\D/g, "").slice(0, 5),
    tel: telOf(info.shippop_from_tel),
  };
  const missing = [!from.name && "ชื่อ", !from.tel && "เบอร์", !from.address && "ที่อยู่", !from.district && "ตำบล", !from.state && "อำเภอ", !from.province && "จังหวัด", from.postcode.length !== 5 && "รหัสไปรษณีย์"].filter(Boolean);
  return missing.length ? { ok: false, error: `ตั้งที่อยู่ผู้ส่งให้ครบก่อน (ขาด: ${missing.join(", ")}) — 🏪 ข้อมูลร้าน › 🚚 Shippop` } : { ok: true, from };
}

/** ออเดอร์ → รายการจอง (น้ำหนัก = ต่อชิ้น × จำนวนชิ้น · เก็บปลายทางที่ยังไม่จ่าย = cod_amount ยอดที่ต้องเก็บ) */
export function bookItemOf(o: ShippopOrderRow, from: ShippopAddress, info: SiteInfo, opts: { courierCode: string; qty: number; weight?: number; box?: string }): { ok: true; item: BookItem } | { ok: false; error: string } {
  const to: ShippopAddress = {
    name: o.customer_name,
    address: String(o.ship_address_line ?? "").trim(),
    district: String(o.ship_subdistrict ?? "").trim(),
    state: String(o.ship_district ?? "").trim(),
    province: String(o.ship_province ?? "").trim(),
    postcode: String(o.ship_postal ?? "").replace(/\D/g, "").slice(0, 5),
    tel: telOf(o.customer_phone),
  };
  if (!to.address || !to.province || to.postcode.length !== 5) return { ok: false, error: `${o.order_no}: ที่อยู่ผู้รับไม่ครบ (ต้องมีที่อยู่ จังหวัด รหัสไปรษณีย์)` };
  if (to.tel.length < 9) return { ok: false, error: `${o.order_no}: เบอร์ผู้รับไม่ถูกต้อง` };
  const box = parseBox(opts.box ?? info.shippop_box);
  const perPiece = Math.max(50, Math.round(Number(opts.weight ?? info.shippop_weight) || 500));
  const cod = o.payment_method === "cod" && o.payment_status !== "paid" ? Math.round(Number(o.grand_total) || 0) : 0;
  return {
    ok: true,
    item: { key: o.id, from, to, parcel: { name: `ออเดอร์ ${o.order_no}`, weight: perPiece * Math.max(1, opts.qty), ...box }, courierCode: opts.courierCode, codAmount: cod, ref: o.order_no },
  };
}

/**
 * อัปเดตสถานะจาก Shippop (webhook/จำลอง): จดลงประวัติ · ส่งแล้ว/ส่งถึง = เลื่อนสถานะออเดอร์ให้เอง (เดินหน้าอย่างเดียว · ยกเลิกแล้วไม่แตะ)
 * ถึงแล้ว = ตั้ง completed_at (นับวันขอคืน/เปลี่ยน) · audit ผู้ทำ = ระบบ Shippop
 */
export async function applyShippopStatus(sb: Admin, o: ShippopOrderRow, status: string, at: string, note: string | undefined, actor: string): Promise<{ orderStatus: string | null }> {
  const sp = o.shippop;
  if (!sp) return { orderStatus: null };
  const history = [...(sp.history ?? []), { status, at, ...(note ? { note } : {}) }].slice(-30);
  const patch: Record<string, unknown> = { shippop: { ...sp, status, history } };
  const target = orderStatusFromShippop(status);
  let moved: string | null = null;
  if (target === "shipped" && (o.status === "pending" || o.status === "preparing")) moved = "shipped";
  if (target === "completed" && o.status !== "completed" && o.status !== "cancelled") moved = "completed";
  if (moved) {
    patch.status = moved;
    if (moved === "completed") patch.completed_at = new Date().toISOString();
  }
  await sb.from("store_orders").update(patch).eq("id", o.id);
  await writeAudit(sb, { action: "update", entityType: "store_orders", entityId: o.id, actorId: null, actorName: actor, metadata: { kind: "shippop_status", orderNo: o.order_no, shippopStatus: status, ...(moved ? { before: o.status, after: moved } : {}) } });
  return { orderStatus: moved };
}

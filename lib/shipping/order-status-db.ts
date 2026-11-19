/**
 * 📬 สถานะพัสดุ → ออเดอร์ในศูนย์ออเดอร์ (platform_orders.shipping) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * ใช้ที่: /api/public/shippop/webhook (SHIPPOP แจ้งสถานะ) · /api/platform-orders/ship (ปุ่มจำลองสถานะ)
 * กติกา: จดประวัติทุกครั้ง · เลื่อนสถานะออเดอร์เดินหน้าอย่างเดียว (lib/order-shipping orderStatusFromShipping + checkTransition)
 *        "cancel" ที่มาจาก webhook ไม่ปลดการจอง (statusFromWebhook — กันจองซ้ำ)
 * คืน ok=false เมื่อบันทึกไม่สำเร็จ → webhook ตอบ 5xx ให้ SHIPPOP ส่งซ้ำ (คู่มือ: ส่งซ้ำเฉพาะ 5xx)
 */
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { statusFromWebhook } from "@/lib/shippop";
import { orderStatusFromShipping, type OrderShipping } from "@/lib/order-shipping";
import { checkTransition } from "@/lib/platform-order-status";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export const ORDER_SHIPPING_SELECT = "id, order_no, external_order_id, status, source, shipping, tracking_no";
export type OrderShippingRow = { id: string; order_no: string | null; external_order_id: string | null; status: string; source: string | null; shipping: OrderShipping | null; tracking_no: string | null };

/** สร้างข้อมูลที่จะบันทึก (pure · เทสต์ได้) */
export function shippingStatusPatch(o: Pick<OrderShippingRow, "status" | "source" | "shipping">, incoming: string, at: string, note: string | undefined, opts: { fromWebhook: boolean }):
  { patch: Record<string, unknown>; stored: string; orderStatus: string | null } | null {
  const sh = o.shipping;
  if (!sh) return null;
  const eff = opts.fromWebhook ? statusFromWebhook(sh.status, incoming) : { status: incoming };
  const n = [note, eff.note].filter(Boolean).join(" · ") || undefined;
  const history = [...(sh.history ?? []), { status: incoming, at, ...(n ? { note: n } : {}) }].slice(-30);
  const patch: Record<string, unknown> = { shipping: { ...sh, status: eff.status, history }, updated_at: new Date().toISOString() };
  const to = orderStatusFromShipping(eff.status);
  let moved: string | null = null;
  if (to && to !== o.status && checkTransition(o, to).ok) { patch.status = to; moved = to; }
  return { patch, stored: eff.status, orderStatus: moved };
}

export async function applyOrderShippingStatus(sb: Admin, o: OrderShippingRow, incoming: string, at: string, note: string | undefined, actor: string, opts: { fromWebhook: boolean; simulated?: boolean }):
  Promise<{ ok: boolean; orderStatus: string | null }> {
  const p = shippingStatusPatch(o, incoming, at, note, opts);
  if (!p) return { ok: true, orderStatus: null };
  const { error } = await sb.from("platform_orders").update(p.patch).eq("id", o.id);
  if (error) return { ok: false, orderStatus: null };
  await writeAudit(sb, {
    action: "ship_status", entityType: "platform_order", entityId: o.id, actorId: null, actorName: actor,
    metadata: { order_no: o.order_no || o.external_order_id || o.id, shipping_status: incoming, stored_status: p.stored, ...(opts.simulated ? { simulated: true } : {}), ...auditChangeMeta(o, { status: p.patch.status ?? o.status }) },
  });
  return { ok: true, orderStatus: p.orderStatus };
}

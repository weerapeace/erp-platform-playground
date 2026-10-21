/**
 * 🔁 เส้นทางสถานะออเดอร์เว็บร้าน — ของกลาง ใช้ทั้ง API (app/api/website/orders) และหน้าจอ (website-orders-panel) · audit 2026-10-21
 *
 * กันพนักงานเลือกสถานะข้ามขั้น/ย้อนผิด เช่น "สำเร็จ" → "รอดำเนินการ" (แต้มสมาชิก + อีเมลลูกค้าจะเพี้ยน)
 * - เลือกสถานะเดิมซ้ำ = ผ่านเสมอ (ไม่มีอะไรเปลี่ยน)
 * - สำเร็จ / ยกเลิก / คืนเงินแล้ว = จบแล้ว เปลี่ยนต่อไม่ได้
 * - ระบบตรวจสลิปอัตโนมัติ (lib/website-payments-server) เปลี่ยนสถานะจ่ายเองได้ ไม่ผ่านกฎนี้
 * ไฟล์นี้ไม่ import อะไร → ใช้ในหน้าเบราว์เซอร์ได้โดยไม่ลากโค้ดฝั่งเซิร์ฟเวอร์มาด้วย
 */

export const ORDER_FLOW: Record<string, readonly string[]> = {
  pending: ["preparing", "cancelled"],
  preparing: ["shipped", "pending", "cancelled"],
  shipped: ["completed", "preparing", "cancelled"],
  completed: [],
  cancelled: [],
};

export const PAYMENT_FLOW: Record<string, readonly string[]> = {
  unpaid: ["verifying", "paid"],
  verifying: ["paid", "unpaid"],
  paid: ["refunded", "unpaid"],
  refunded: [],
};

export type StatusKind = "status" | "payment";

const flowOf = (kind: StatusKind) => (kind === "status" ? ORDER_FLOW : PAYMENT_FLOW);

/** เปลี่ยนจาก from → to ได้ไหม (สถานะเดิมที่ไม่รู้จัก = ให้ย้ายไปสถานะที่ถูกต้องได้ เพื่อแก้ข้อมูลเก่า) */
export function canMove(kind: StatusKind, from: string, to: string): boolean {
  if (from === to) return true;
  const flow = flowOf(kind);
  if (!(to in flow)) return false;
  if (!(from in flow)) return true;
  return flow[from].includes(to);
}

/** ข้อความเตือนภาษาคน ถ้าเปลี่ยนไม่ได้ · null = เปลี่ยนได้ */
export function moveError(kind: StatusKind, from: string, to: string, labelOf: (k: string) => string): string | null {
  if (canMove(kind, from, to)) return null;
  const what = kind === "status" ? "สถานะออเดอร์" : "สถานะชำระเงิน";
  const done = flowOf(kind)[from]?.length === 0;
  return done
    ? `${what} “${labelOf(from)}” จบแล้ว เปลี่ยนต่อไม่ได้`
    : `เปลี่ยน${what}จาก “${labelOf(from)}” เป็น “${labelOf(to)}” ไม่ได้ — เลือกได้: ${flowOf(kind)[from].map(labelOf).join(" / ")}`;
}

/** การเปลี่ยนที่ต้องถามยืนยันก่อน (ส่งอีเมลแจ้งลูกค้า / จบออเดอร์ / ย้อนกลับไม่ได้) */
export function needsConfirm(kind: StatusKind, from: string, to: string): boolean {
  if (from === to) return false;
  return kind === "status" ? to === "shipped" || to === "cancelled" || to === "completed" : to === "paid" || to === "refunded";
}

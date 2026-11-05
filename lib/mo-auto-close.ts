/**
 * ปิดงานใบสั่งผลิตอัตโนมัติเมื่อ "ขายครบ + ช่างส่งคืนครบ" (เจ้าของสั่ง 2026-11-05) — ตรรกะล้วน ไม่แตะ DB
 *
 * ปิด  : ใบยังเปิดอยู่ + ผูกใบขาย (mo_sales_links) ครบจำนวน + ผ่านกฎปิดงานกลาง (lib/mo-workflow: ส่งคืนครบ · ไม่มีใบจ่ายงานค้าง)
 * เปิดคืน: ใบที่ "ระบบปิดเอง" (audit close ล่าสุดมี auto) แล้วเงื่อนไขไม่ครบอีก เช่น ถอดผูกใบขาย / ย้อนรับคืน → กลับสถานะเดิม
 *          ใบที่คนกดปิดเองไม่แตะ (คนตัดสินแล้ว)
 * ฝั่งเซิร์ฟเวอร์: app/api/mo/auto-close.ts (syncAutoClose) เรียกหลัง ผูก/ถอดใบขาย · รับคืนงาน · ส่งงาน/ตรวจ
 */
import { MO_CLOSED_STATUSES, checkMoTransition } from "@/lib/mo-workflow";
import { MO_QTY_EPS } from "@/lib/mo-status";

export type AutoCloseFacts = {
  status: string | null;
  qty: number;
  /** ผูกใบขายแล้วรวม (ไม่นับที่ถอดผูก) */
  sold: number;
  dispatched: number;
  received: number;
  openWorkOrders: number;
  receiveSkipped?: boolean;
  /** การปิดครั้งล่าสุดเป็นการปิดอัตโนมัติ (ไม่ใช่คนกด) */
  lastCloseAuto?: boolean;
};

export const AUTO_CLOSE_REASON = "ปิดงานอัตโนมัติ — ขายครบ + ช่างส่งคืนครบ";
export const AUTO_REOPEN_REASON = "เปิดงานคืนอัตโนมัติ — ขาย/รับคืนไม่ครบแล้ว";

/** ขายครบจำนวนสั่งผลิตไหม */
export const soldAll = (f: Pick<AutoCloseFacts, "qty" | "sold">) => f.qty > 0 && f.sold >= f.qty - MO_QTY_EPS;

/** เงื่อนไขปิดครบไหม (ไม่สนสถานะปัจจุบัน) */
function closeOk(f: AutoCloseFacts): boolean {
  return soldAll(f) && checkMoTransition("close", {
    status: "confirmed", qty: f.qty, dispatched: f.dispatched, received: f.received,
    openWorkOrders: f.openWorkOrders, receiveSkipped: f.receiveSkipped,
  }) === null;
}

/** ระบบควรทำอะไรกับใบนี้: ปิด / เปิดคืน / ไม่ทำ */
export function autoCloseAction(f: AutoCloseFacts): "close" | "reopen" | null {
  const st = String(f.status ?? "");
  const closed = (MO_CLOSED_STATUSES as readonly string[]).includes(st);
  if (!closed) return closeOk(f) ? "close" : null;
  if (st === "done" && f.lastCloseAuto && !closeOk(f)) return "reopen";
  return null;
}

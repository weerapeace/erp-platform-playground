/**
 * ของกลาง: กฎ "เปลี่ยนสถานะใบสั่งผลิต" (MO workflow) — ที่เดียว ใช้ทั้งหน้าจอและ API
 *
 * ตาม CLAUDE.md §25 — ห้ามเปลี่ยน status ตรง ๆ แบบไม่มีกฎ:
 *   - ปิดงาน (→ done)       ได้เฉพาะใบที่ "ช่างส่งคืนครบทุกชิ้น" (หรือแอดมินข้ามขั้นรับคืน) และไม่มีใบจ่ายงานค้าง
 *   - ยกเลิก (→ cancelled)  ได้เฉพาะใบที่ "ยังไม่จ่ายงานเลย" + ต้องใส่เหตุผล
 *   - ใบที่ปิด/ยกเลิกไปแล้ว เปลี่ยนซ้ำไม่ได้
 * ใบที่ไม่ผ่านกฎ → ข้าม (ไม่ล้มทั้งชุด) พร้อมเหตุผลภาษาคนให้รายงานผล
 *
 * ค่า status ใน DB: draft (ทุกใบที่เปิดอยู่) · confirmed · in_progress · done · cancelled
 * ⚠️ แถวเก่าที่ถูกลบแล้วบางแถวเก็บ "in_production"/"ready" — ไม่อยู่ในกฎนี้ (ถือเป็นใบที่ยังเปิด)
 */

export const MO_CLOSED_STATUSES = ["done", "cancelled"] as const;

export type MoBulkStatusAction = "close" | "cancel";

/** ข้อเท็จจริงของใบที่ใช้ตัดสินกฎ (คำนวณจาก DB ฝั่ง server เสมอ — ไม่เชื่อค่าจากหน้าจอ) */
export type MoTransitionFacts = {
  status: string | null;
  qty: number;
  dispatched: number;      // ยอดจ่ายงานรวม (ไม่นับใบจ่ายงานที่ยกเลิก)
  received: number;        // ยอดที่ช่างส่งคืนแล้วรวม
  openWorkOrders: number;  // ใบจ่ายงานที่ยังไม่เสร็จ (status = dispatched)
  /** แอดมินข้ามขั้น "รับคืน" (lib/mo-skip) → ปิดได้โดยไม่ต้องรับคืนครบ (ยังต้องไม่มีใบจ่ายงานค้าง) */
  receiveSkipped?: boolean;
};

export const MO_ACTION_META: Record<MoBulkStatusAction, { to: string; label: string; needReason: boolean; auditAction: string }> = {
  close:  { to: "done",      label: "ปิดงาน",   needReason: false, auditAction: "close" },
  cancel: { to: "cancelled", label: "ยกเลิกใบ", needReason: true,  auditAction: "cancel" },
};

/** คืน null = ทำได้ · คืนข้อความ = เหตุผลที่ข้ามใบนี้ */
export function checkMoTransition(action: MoBulkStatusAction, f: MoTransitionFacts): string | null {
  if (MO_CLOSED_STATUSES.includes(String(f.status) as (typeof MO_CLOSED_STATUSES)[number])) {
    return f.status === "done" ? "ใบนี้ปิดงานไปแล้ว" : "ใบนี้ถูกยกเลิกไปแล้ว";
  }
  if (action === "close") {
    if (!(f.qty > 0)) return "จำนวนสั่งผลิตเป็น 0";
    if (f.received < f.qty && !f.receiveSkipped) return `ช่างยังส่งคืนไม่ครบ (คืน ${fmt(f.received)}/${fmt(f.qty)})`;
    if (f.openWorkOrders > 0) return `ยังมีใบจ่ายงานค้าง ${f.openWorkOrders} ใบ`;
    return null;
  }
  // cancel
  if (f.dispatched > 0 || f.openWorkOrders > 0) return `จ่ายงานไปแล้ว ${fmt(f.dispatched)} ชิ้น — ยกเลิกไม่ได้`;
  return null;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

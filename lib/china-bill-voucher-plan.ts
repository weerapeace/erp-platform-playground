/**
 * 🧾 ออกใบสำคัญรับจากบิลโอนเงินจีน — "บิลนี้จะได้อะไร" (pure · ใช้ในหน้า "ตรวจก่อนสร้าง" ของป๊อป ＋ ออกใบสำคัญรับ)
 * กติกาต้องตรงกับ createVoucherFromChinaBill (lib/china-bill-voucher): มีรูป → AI อ่าน · ไม่มีรูปแต่มี PO ผูก → ใส่บรรทัด PO
 *   ไม่มีทั้งคู่ → ใบเปล่า (ถ้าเลือก) ไม่งั้นข้าม · ออกแล้ว/บิลค่าส่ง/ยังไม่ผูกร้าน = สร้างไม่ได้
 * เจ้าของขอ 2026-11-04: "ตอนกดสร้างใบสำคัญ อยากให้มีสรุปให้ดูก่อนยืนยัน"
 * ทดสอบ: lib/__tests__/china-bill-voucher-plan.test.ts
 */

export type PlanBill = {
  files: number; po_links: { po_id: string }[]; is_shipping: boolean; supplier_id: string | null;
  voucher: unknown | null; amount_rmb: number; open_pos?: number;
  similar?: { name: string; open_pos: number } | null;
};
export type PlanKind = "ai" | "po" | "blank" | "skip" | "blocked";
export type BillPlanResult = { kind: PlanKind; label: string; warn: string | null };

/** ประมาณเวลา AI อ่านบิลละกี่วินาที (รูปหลายหน้าใช้นานขึ้นนิดหน่อย) */
export const AI_SEC_PER_BILL = 30;

export function billPlan(b: PlanBill, blank: boolean): BillPlanResult {
  if (b.voucher) return { kind: "blocked", label: "ออกใบสำคัญไปแล้ว", warn: null };
  if (b.is_shipping) return { kind: "blocked", label: "บิลค่าส่ง — ผูกที่การ์ดค่าส่งในหน้าใบ", warn: null };
  if (!b.supplier_id) return { kind: "blocked", label: "ยังไม่ผูกร้าน — ไปเลือกร้านในแอปโอนเงินจีนก่อน", warn: null };
  if (b.files > 0) {
    const noPo = b.open_pos === 0;
    const sim = noPo && b.similar ? ` · ร้านชื่อคล้าย “${b.similar.name}” มีใบค้าง ${b.similar.open_pos} ใบ — จับคู่เองได้ในหน้าใบ (แท็บ PO ร้านอื่น)` : "";
    return {
      kind: "ai", label: `AI อ่าน ${b.files} รูป → จับคู่ใบสั่งซื้อร้านนี้`,
      warn: noPo ? `ร้านนี้ไม่มีใบสั่งซื้อค้าง — AI อ่านรายการได้ แต่จับคู่อัตโนมัติไม่ได้${sim}` : null,
    };
  }
  if (b.po_links.length > 0) return { kind: "po", label: `ใส่บรรทัดจาก ${b.po_links.length} ใบสั่งซื้อที่ผูกกับบิล`, warn: null };
  if (blank) return { kind: "blank", label: "ใบเปล่าของร้านนี้ (อัปบิลทีหลังในหน้าใบ)", warn: null };
  return { kind: "skip", label: "ข้าม — ไม่มีรูปบิลและไม่มีใบสั่งซื้อผูก", warn: null };
}

export type PlanSummary = { ai: number; po: number; blank: number; skip: number; blocked: number; make: number; files: number; amount_make: number; amount_all: number; seconds: number };

/** สรุปทั้งชุด · blankFor(id) = บิลนี้ให้สร้างใบเปล่าไหม (ติ๊กรวม หรือกด "สร้างเป็นใบเปล่าแทน" รายบิล) */
export function planSummary<T extends PlanBill & { id: string }>(bills: T[], blankFor: (id: string) => boolean): PlanSummary {
  const s: PlanSummary = { ai: 0, po: 0, blank: 0, skip: 0, blocked: 0, make: 0, files: 0, amount_make: 0, amount_all: 0, seconds: 0 };
  for (const b of bills) {
    const p = billPlan(b, blankFor(b.id));
    s[p.kind] += 1;
    s.amount_all += b.amount_rmb;
    if (p.kind === "ai" || p.kind === "po" || p.kind === "blank") { s.make += 1; s.amount_make += b.amount_rmb; }
    if (p.kind === "ai") { s.files += b.files; s.seconds += AI_SEC_PER_BILL; }
    else if (p.kind !== "skip" && p.kind !== "blocked") s.seconds += 3;
  }
  s.amount_make = Math.round(s.amount_make * 100) / 100;
  s.amount_all = Math.round(s.amount_all * 100) / 100;
  return s;
}

/** "ประมาณ 1 นาที" / "ไม่ถึงครึ่งนาที" */
export function durationLabel(sec: number): string {
  if (sec <= 0) return "";
  if (sec < 30) return "ไม่ถึงครึ่งนาที";
  if (sec < 60) return "ประมาณครึ่งนาที";
  return `ประมาณ ${Math.round(sec / 60)} นาที`;
}

/**
 * กติกาบัตรเครดิต / หนี้อื่น (ตาราง debt_cards) — ของกลาง ใช้ทั้ง API และหน้าจอ (ไม่มี import ฝั่งเซิร์ฟเวอร์)
 *
 * ยอดค้างของบัตร = ยอดตามใบแจ้งยอด (statement_balance) − จ่ายแล้ว (paid_amount)
 * สถานะ: unpaid (ยังไม่จ่าย) · partial (จ่ายบางส่วน) · paid (จ่ายครบ)
 *
 * ใช้ที่: POST /api/debt-cards/[id]/pay · POST /api/debt-cards/[id]/statement · ป๊อปในแท็บต้องจ่าย (/cashflow)
 */

export type DebtCardStatus = "unpaid" | "partial" | "paid";

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ยอดค้างของใบแจ้งยอดปัจจุบัน */
export const cardRemaining = (row: { statement_balance?: unknown; paid_amount?: unknown }): number =>
  Math.max(0, round2(num(row.statement_balance) - num(row.paid_amount)));

/** สถานะจากยอดจ่ายสะสม */
export function cardStatusFor(statementBalance: number, paidAmount: number): DebtCardStatus {
  if (paidAmount >= statementBalance - 0.005) return "paid";
  return paidAmount > 0 ? "partial" : "unpaid";
}

/**
 * บันทึกจ่ายเพิ่ม → ค่าใหม่ที่ต้องเขียน (จ่ายสะสม + วันที่จ่าย + สถานะ) หรือข้อความ error ภาษาคน
 * จ่ายเกินยอดค้างไม่ได้ (กันพิมพ์เลขผิด) — ยอดใหม่ต้องลง "ใบแจ้งยอดใหม่"
 */
export function applyCardPayment(
  row: { statement_balance?: unknown; paid_amount?: unknown },
  amount: number,
  paidDate: string,
): { ok: true; patch: { paid_amount: number; paid_date: string; status: DebtCardStatus } } | { ok: false; error: string } {
  const amt = round2(num(amount));
  if (!(amt > 0)) return { ok: false, error: "ใส่ยอดที่จ่ายมากกว่า 0" };
  if (!DATE_RE.test(paidDate)) return { ok: false, error: "เลือกวันที่จ่าย" };
  const remaining = cardRemaining(row);
  if (remaining <= 0) return { ok: false, error: "บัตรนี้จ่ายครบแล้ว — ถ้ามียอดใหม่ให้ลงใบแจ้งยอดใหม่" };
  if (amt > remaining + 0.005) return { ok: false, error: `ยอดที่จ่ายเกินยอดค้าง (${remaining.toLocaleString("th-TH")} บาท)` };
  const paid = round2(num(row.paid_amount) + amt);
  return { ok: true, patch: { paid_amount: paid, paid_date: paidDate, status: cardStatusFor(num(row.statement_balance), paid) } };
}

export type CardStatementInput = { statement_date: string; statement_balance: number; minimum_due: number; due_date: string };

/**
 * ใบแจ้งยอดใหม่ → ค่าที่ต้องเขียน (เริ่มนับจ่ายใหม่จาก 0) หรือข้อความ error
 * ใบเดิมไม่หาย — API เก็บไว้ในประวัติ (audit metadata.previous)
 */
export function newStatementPatch(input: CardStatementInput):
  { ok: true; patch: CardStatementInput & { paid_amount: 0; paid_date: null; status: DebtCardStatus } } | { ok: false; error: string } {
  const bal = round2(num(input.statement_balance));
  const min = round2(num(input.minimum_due));
  if (!DATE_RE.test(input.statement_date)) return { ok: false, error: "เลือกวันที่ใบแจ้งยอด" };
  if (!DATE_RE.test(input.due_date)) return { ok: false, error: "เลือกวันครบกำหนดชำระ" };
  if (input.due_date < input.statement_date) return { ok: false, error: "วันครบกำหนดต้องไม่ก่อนวันที่ใบแจ้งยอด" };
  if (bal < 0) return { ok: false, error: "ยอดตามใบแจ้งยอดติดลบไม่ได้" };
  if (min < 0) return { ok: false, error: "ยอดขั้นต่ำติดลบไม่ได้" };
  if (min > bal + 0.005) return { ok: false, error: "ยอดขั้นต่ำมากกว่ายอดตามใบแจ้งยอดไม่ได้" };
  return {
    ok: true,
    patch: {
      statement_date: input.statement_date, statement_balance: bal, minimum_due: min, due_date: input.due_date,
      paid_amount: 0, paid_date: null, status: bal > 0 ? "unpaid" : "paid",
    },
  };
}

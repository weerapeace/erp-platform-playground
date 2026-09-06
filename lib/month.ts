/**
 * ของกลาง — จัดการ "เดือน" ในรูป YYYY-MM (ใช้ได้ทั้งหน้าจอและ API เพราะไม่มี "use client")
 *
 * ทำไมต้องมี: หน้ารายงานรายเดือนทุกหน้า (สรุปยอดขาย / รายงานภาษีขาย / จัดซื้อ ...) เคยเขียน helper ชุดนี้ซ้ำกันเอง
 * และเคยพลาดเรื่อง timezone มาแล้ว — `new Date(y, m, 1).toISOString()` ในเวลาไทย (UTC+7) ร่นไป 1 วัน
 * ทำให้ใบวันสุดท้ายของเดือนหายจากรายงาน → ที่นี่ใช้ Date.UTC เสมอ แก้ที่เดียวทุกหน้าได้ผล
 */
export const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** เดือนปัจจุบันตามเวลาเครื่อง — ไม่ใช้ toISOString() เพราะตี 0-7 ของวันที่ 1 จะยังนับเป็นเดือนก่อน (UTC) */
export function thisMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** เลื่อนเดือน: shiftMonth("2026-01", -1) → "2025-12" */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** ช่วงวันที่ของเดือน — from = วันแรก · to = วันแรกของเดือนถัดไป (ใช้กับ .gte(from).lt(to)) */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) };
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "สิงหาคม 2569" (พ.ศ. เป็นค่าเริ่มต้น) · era "ce" = ค.ศ. */
export function monthLabelTh(ym: string, opts: { era?: "be" | "ce" } = {}): string {
  const [y, m] = ym.split("-").map(Number);
  const year = opts.era === "ce" ? y : y + 543;
  return `${TH_MONTHS[(m || 1) - 1]} ${year || ""}`.trim();
}

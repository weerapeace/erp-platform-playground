/**
 * ของกลาง — ปรับโครงสร้างหนี้ (Loan Restructuring)
 *
 * ไฟล์นี้ไม่มี "use client" → ใช้ได้ทั้งหน้าจอ (ดูตัวอย่างตารางผ่อนใหม่ก่อนบันทึก)
 * และ API route (ตรวจ/สรุปก่อนส่งเข้า DB)
 *
 * หน้าที่:
 *   • ป้ายชนิดการปรับ (ลดดอก / ยืดเวลา / พักเงินต้น ...)
 *   • สร้าง "งวดใหม่หลังวันมีผล" จากเงื่อนไขใหม่ — รองรับพักชำระเงินต้น N งวด
 *     (จ่ายดอกอย่างเดียว) แล้วค่อยผ่อนตามวิธีที่เลือก
 *   • สรุปยอดรวมของตาราง (เงินต้น/ดอกเบี้ย/รวม/งวดสุดท้าย) ไว้เทียบเก่า-ใหม่
 *
 * สูตรตรงกับ loan_schedule_generate ใน DB (ดอกเบี้ยต่องวด = เงินต้นคงเหลือ × อัตราต่อปี × เดือนต่องวด ÷ 12)
 * ต่างกันแค่ "เริ่มจากเงินต้นคงเหลือ ณ วันมีผล" ไม่ใช่เงินต้นตามสัญญา
 */

export type RestructureKind =
  | "rate_cut" | "extend" | "holiday" | "lower_installment" | "capitalize" | "consolidate" | "other";

export const RESTRUCTURE_KINDS: { key: RestructureKind; label: string; hint: string }[] = [
  { key: "rate_cut",          label: "ลดดอกเบี้ย",                hint: "ธนาคารลดอัตราดอกเบี้ยให้" },
  { key: "extend",            label: "ยืดระยะเวลา",               hint: "ผ่อนนานขึ้น ค่างวดเบาลง" },
  { key: "holiday",           label: "พักชำระเงินต้น",            hint: "ช่วงหนึ่งจ่ายแต่ดอกเบี้ย" },
  { key: "lower_installment", label: "ลดค่างวด",                  hint: "กำหนดค่างวดใหม่ต่ำกว่าเดิม" },
  { key: "capitalize",        label: "ทบดอกเบี้ยค้างเข้าเงินต้น", hint: "ดอกที่ค้างจ่ายถูกบวกเข้าเงินต้น" },
  { key: "consolidate",       label: "รวมหนี้หลายสัญญา",          hint: "ยุบหลายก้อนเป็นก้อนเดียว" },
  { key: "other",             label: "อื่น ๆ",                    hint: "ระบุในช่องเหตุผล" },
];

export const kindLabel = (k: string): string =>
  RESTRUCTURE_KINDS.find((x) => x.key === k)?.label ?? k;

export type RepaymentMethod = "equal_installment" | "equal_principal" | "interest_only";

export type ScheduleRow = {
  due_date: string;        // YYYY-MM-DD
  principal_due: number;
  interest_due: number;
  fee_due: number;
  /** งวดพักชำระเงินต้น (จ่ายดอกอย่างเดียว) — ใช้แค่แสดงป้าย */
  holiday?: boolean;
};

export type BuildInput = {
  /** เงินต้นตั้งต้น ณ วันมีผล (รวมดอกทบแล้ว) */
  openingPrincipal: number;
  /** อัตราดอกเบี้ยต่อปี (%) */
  annualRate: number;
  /** เดือนต่องวด: รายเดือน=1 · ราย 3 เดือน=3 · ราย 6 เดือน=6 · รายปี=12 */
  monthsPerPeriod: number;
  method: RepaymentMethod;
  /** จำนวนงวดพักเงินต้น (จ่ายดอกอย่างเดียว) ก่อนเริ่มผ่อนจริง */
  holidayPeriods: number;
  /** จำนวนงวดผ่อนจริง (หลังพัก) */
  periods: number;
  /** วันครบกำหนดงวดแรกหลังวันมีผล */
  firstDueDate: string;
  /** วันที่ของเดือนที่ต้องจ่าย (1-31) — ไม่ใส่ = เลื่อนตามวันแรก */
  dueDay?: number | null;
  /** ค่างวดที่ธนาคารกำหนดเอง (ผ่อนเท่ากันทุกงวด) — ไม่ใส่ = ระบบคิดให้ */
  installmentOverride?: number | null;
};

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** วันสุดท้ายของเดือน (UTC — กัน timezone ไทยร่นวัน) */
const daysInMonth = (y: number, m0: number): number => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** บวกเดือนจากวันที่ ISO แล้วยึดวันที่ dueDay (ถ้าเดือนนั้นไม่มี ใช้วันสุดท้าย) */
export function addMonthsISO(iso: string, months: number, dueDay?: number | null): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm0 = ((total % 12) + 12) % 12;
  const want = dueDay && dueDay >= 1 && dueDay <= 31 ? dueDay : d;
  const nd = Math.min(want, daysInMonth(ny, nm0));
  return `${ny}-${String(nm0 + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** ค่างวดผ่อนเท่ากันทุกงวด (annuity) */
export function equalInstallment(principal: number, ratePerPeriod: number, periods: number): number {
  if (periods <= 0) return 0;
  if (ratePerPeriod <= 0) return r2(principal / periods);
  return r2(principal * ratePerPeriod / (1 - Math.pow(1 + ratePerPeriod, -periods)));
}

/** สร้างงวดใหม่ทั้งหมดหลังวันมีผล (พักเงินต้นก่อน แล้วผ่อนตามวิธี) */
export function buildRestructureSchedule(input: BuildInput): ScheduleRow[] {
  const P = r2(Math.max(0, input.openingPrincipal));
  const mpp = Math.max(1, Math.floor(input.monthsPerPeriod || 1));
  const rate = Math.max(0, input.annualRate) / 100 * mpp / 12;
  const holiday = Math.max(0, Math.floor(input.holidayPeriods || 0));
  const periods = Math.max(0, Math.floor(input.periods || 0));
  if (P <= 0 || (holiday + periods) <= 0 || !input.firstDueDate) return [];

  const rows: ScheduleRow[] = [];
  let open = P;
  let idx = 0;
  const dueAt = (i: number) => (i === 0 ? addMonthsISO(input.firstDueDate, 0, input.dueDay) : addMonthsISO(input.firstDueDate, i * mpp, input.dueDay));

  // ช่วงพักเงินต้น — จ่ายดอกอย่างเดียว
  for (let i = 0; i < holiday; i++, idx++) {
    rows.push({ due_date: dueAt(idx), principal_due: 0, interest_due: r2(open * rate), fee_due: 0, holiday: true });
  }

  const pay = input.installmentOverride && input.installmentOverride > 0
    ? r2(input.installmentOverride)
    : equalInstallment(P, rate, periods);
  const priEach = periods > 0 ? r2(P / periods) : 0;

  for (let i = 0; i < periods; i++, idx++) {
    const last = i === periods - 1;
    const interest = r2(open * rate);
    let principal: number;
    if (input.method === "interest_only")       principal = last ? open : 0;
    else if (input.method === "equal_principal") principal = last ? open : priEach;
    else                                          principal = last ? open : r2(pay - interest);
    if (principal > open) principal = open;
    if (principal < 0) principal = 0;
    rows.push({ due_date: dueAt(idx), principal_due: principal, interest_due: interest, fee_due: 0 });
    open = r2(open - principal);
    if (open <= 0 && !last) {
      // ค่างวดที่กำหนดเองสูงจนปิดหนี้ก่อนครบงวด — หยุดที่งวดนี้
      break;
    }
  }
  return rows;
}

export type ScheduleTotals = {
  count: number; principal: number; interest: number; fee: number; total: number;
  lastDue: string | null; firstInstallment: number; maxInstallment: number;
};

export function scheduleTotals(rows: ScheduleRow[]): ScheduleTotals {
  let principal = 0, interest = 0, fee = 0, max = 0;
  for (const r of rows) { principal += r.principal_due; interest += r.interest_due; fee += r.fee_due; max = Math.max(max, r.principal_due + r.interest_due + r.fee_due); }
  const first = rows.find((r) => !r.holiday) ?? rows[0];
  return {
    count: rows.length, principal: r2(principal), interest: r2(interest), fee: r2(fee),
    total: r2(principal + interest + fee),
    lastDue: rows.length ? rows[rows.length - 1].due_date : null,
    firstInstallment: first ? r2(first.principal_due + first.interest_due + first.fee_due) : 0,
    maxInstallment: r2(max),
  };
}

/** เดือนต่องวดจากความถี่ในสัญญา */
export function monthsPerPeriodOf(frequency: string | null | undefined): number {
  switch (frequency) {
    case "quarterly":  return 3;
    case "semiannual": return 6;
    case "yearly":     return 12;
    default:           return 1;
  }
}

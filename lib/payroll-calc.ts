/**
 * Payroll module — เครื่องคำนวณเงินเดือน (Phase 3) — พอร์ต "เหมือนเดิม" จากแอปเก่า (worker.js)
 *
 * pure functions ไม่มี DB → ทดสอบได้ (lib/__tests__/payroll-calc.test.ts)
 * สูตรตรงกับ buildPayrollLine / attendanceHourlyRate / salaryDayDivisor / roundMoney เดิมเป๊ะ
 *
 * ⚠️ ห้ามแก้สูตรให้ "ดีกว่า" ในไฟล์นี้ (เจ้าของตกลง "เหมือนเดิมก่อน") — ปรับทีหลังเป็น flag แยก
 */

export const money = (v: unknown): number => Number(v) || 0;

/** ปัดเงิน 2 ตำแหน่ง (เหมือน roundMoney เดิม) */
export const roundMoney = (v: unknown): number =>
  Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** คอลัมน์รายได้ (รวมเป็น gross) — ลำดับ/ชุดตรงกับ buildPayrollLine */
export const EARNING_FIELDS = [
  "base_salary", "daily_wage_amount", "hourly_wage_amount", "piece_rate_amount",
  "overtime_amount", "allowance_amount", "bonus_amount", "commission_amount",
] as const;

/** คอลัมน์หักก่อนภาษี (preTaxDeduction) */
export const PRE_TAX_DEDUCTION_FIELDS = [
  "late_deduction", "absence_deduction", "unpaid_leave_deduction", "advance_deduction",
  "damage_deduction", "social_security_employee", "other_deduction", "mid_month_paid",
] as const;

export type LineComponents = Record<string, unknown>;

/** รวมรายได้ทั้งหมด (gross ดิบ ยังไม่ปัด) */
export function sumEarnings(line: LineComponents): number {
  return EARNING_FIELDS.reduce((s, f) => s + money(line[f]), 0);
}
/** รวมหักก่อนภาษี (ดิบ) */
export function sumPreTaxDeductions(line: LineComponents): number {
  return PRE_TAX_DEDUCTION_FIELDS.reduce((s, f) => s + money(line[f]), 0);
}

/**
 * ภาษีหัก ณ ที่จ่าย แบบ gross-up (เหมือนแอปเก่า)
 *   ฐาน = max(round(gross - preTax), 0)
 *   tax = round(round(ฐาน / (1 - rate)) - ฐาน)   เมื่อ 0 < rate < 1
 */
export function computeWithholdingTax(grossPay: number, preTaxDeduction: number, ratePercent: number): number {
  const withholdingBase = Math.max(roundMoney(grossPay - preTaxDeduction), 0);
  const taxRate = Math.max(money(ratePercent), 0) / 100;
  if (taxRate <= 0 || taxRate >= 1) return 0;
  return roundMoney(roundMoney(withholdingBase / (1 - taxRate)) - withholdingBase);
}

/**
 * คำนวณยอดสรุปของบรรทัด (gross / total_deduction / net) จาก "ส่วนประกอบ" ที่มีอยู่
 * ใช้ withholding_tax ที่ให้มา (หรือ 0) — ตรงกับ buildPayrollLine:
 *   gross = round(sum earnings)
 *   total_deduction = round(preTax + withholding_tax)
 *   net = round(gross_raw - total_deduction_raw)
 */
export function computeLineTotals(line: LineComponents, withholdingTax?: number, opts: { withholdingTaxCompanyPaid?: boolean } = {}): {
  gross_pay: number; total_deduction: number; net_pay: number; withholding_tax: number;
} {
  const grossRaw = sumEarnings(line);
  const preTax = sumPreTaxDeductions(line);
  const tax = withholdingTax !== undefined ? money(withholdingTax) : money(line.withholding_tax);
  const totalRaw = preTax + (opts.withholdingTaxCompanyPaid ? 0 : tax);
  return {
    gross_pay: roundMoney(grossRaw),
    total_deduction: roundMoney(totalRaw),
    net_pay: roundMoney(grossRaw - totalRaw),
    withholding_tax: tax,
  };
}

// ---- อัตรารายชั่วโมง + ตัวหารวัน (สำหรับคำนวณจาก raw input — ใช้เฟสถัดไป) ----

/** ตัวหารวัน: office=30, อื่นๆ = วันทำงานจริง หรือ default หรือ 26 (เหมือน salaryDayDivisor) */
export function salaryDayDivisor(isOffice: boolean, scheduledWorkDays?: number, defaultWorkDays?: number): number {
  if (isOffice) return 30;
  return money(scheduledWorkDays) || money(defaultWorkDays) || 26;
}

/** อัตรารายชั่วโมง (เหมือน attendanceHourlyRate) */
export function attendanceHourlyRate(
  contract: { wage_type?: string; hourly_wage?: number; daily_wage?: number; base_salary?: number },
  opts: { divisor: number; hoursPerDay?: number },
): number {
  const hoursPerDay = money(opts.hoursPerDay) || 8;
  if (contract.wage_type === "hourly" && money(contract.hourly_wage)) return money(contract.hourly_wage);
  if (contract.wage_type === "daily" && money(contract.daily_wage)) return hoursPerDay ? money(contract.daily_wage) / hoursPerDay : 0;
  if (money(contract.hourly_wage)) return money(contract.hourly_wage);
  if (money(contract.daily_wage)) return hoursPerDay ? money(contract.daily_wage) / hoursPerDay : 0;
  return opts.divisor && hoursPerDay ? money(contract.base_salary) / opts.divisor / hoursPerDay : 0;
}

/** หักมาสาย = (นาที/60) × อัตรา/ชม. */
export const lateDeduction = (lateMinutes: number, hourlyRate: number): number =>
  roundMoney((money(lateMinutes) / 60) * money(hourlyRate));
/** หักขาด = ชั่วโมงขาด × อัตรา/ชม. */
export const absenceDeduction = (absenceHours: number, hourlyRate: number): number =>
  roundMoney(money(absenceHours) * money(hourlyRate));
/** OT = ชั่วโมง × อัตรา/ชม. × ตัวคูณ (default 1.5) */
export const overtimeAmount = (otHours: number, hourlyRate: number, multiplier = 1.5): number =>
  roundMoney(money(otHours) * money(hourlyRate) * money(multiplier));

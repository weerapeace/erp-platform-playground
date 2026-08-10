export type PayrollRegisterPaper = "a4-landscape" | "a3-landscape";

const money = (value: unknown): number => Number(value) || 0;
const roundMoney = (value: unknown): number => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function normalizePayrollRegisterPaper(value: unknown): PayrollRegisterPaper {
  return value === "a3-landscape" ? "a3-landscape" : "a4-landscape";
}

export function buildPayrollRegisterPrintHref(input: {
  periodId: string;
  paper?: PayrollRegisterPaper | string | null;
  basePath?: string;
  embedded?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("period_id", input.periodId);
  params.set("paper", normalizePayrollRegisterPaper(input.paper));
  if (input.embedded) params.set("embedded", "1");
  return `${input.basePath ?? "/print/payroll-register"}?${params.toString()}`;
}

export function formatThaiNationalId(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw;
  return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits.slice(12)}`;
}

export function computePayrollRegisterAmounts(line: Record<string, unknown>): {
  base_salary: number;
  mid_month_paid: number;
  month_end_pay: number;
  transfer_net_pay: number;
  overtime_amount: number;
  cash_pay: number;
  social_security: number;
  balance: number;
} {
  const baseSalary = roundMoney(money(line.base_salary));
  const midMonthPaid = roundMoney(money(line.mid_month_paid));
  const socialSecurity = roundMoney(money(line.social_security_employee));
  const plannedMonthEndPay = roundMoney(baseSalary - midMonthPaid - socialSecurity);
  const payableMonthEndPay = Math.max(plannedMonthEndPay, 0);
  // ทะเบียนเงินเดือนใช้ "จำนวนเต็มบาท" เหมือนหน้าอื่นในระบบ (ไม่มีทศนิยม)
  // ตัดเศษสตางค์ของยอดโอนลง แล้วให้เศษไหลเข้าช่อง "เงินสด" อัตโนมัติ
  //   (cash_pay คำนวณจาก payable − monthEndPay อยู่แล้ว → แถวยังบวกได้ลงตัว ไม่มีใครเสียเงิน)
  // ตัวอย่าง: ฐาน 11,160 − ปกส 558 = 10,602 · หัก 16 (2,000) = 8,602
  //   สุทธิจริง 8,024.50 → เงินเดือน 31 = 8,024 · เงินสด = 578 · รวม 8,602 เท่าเดิม
  const netPayRaw = Math.max(roundMoney(money(line.net_pay)), 0);
  const transferNetPay = Math.floor(netPayRaw);
  const monthEndPay = Math.floor(Math.min(netPayRaw, payableMonthEndPay));
  const diff = roundMoney(netPayRaw - plannedMonthEndPay);

  return {
    base_salary: baseSalary,
    mid_month_paid: midMonthPaid,
    month_end_pay: monthEndPay,
    transfer_net_pay: transferNetPay,
    // เกินแผน (มี OT/เงินเพิ่ม) → ส่วนเกินเป็นจำนวนเต็มเช่นกัน
    overtime_amount: diff > 0 ? Math.round(diff) : 0,
    // ขาดจากแผน หรือมีเศษสตางค์จากการตัดยอดโอน → ไปรวมที่เงินสด
    cash_pay: Math.max(payableMonthEndPay - monthEndPay, 0),
    social_security: socialSecurity,
    balance: roundMoney(baseSalary - socialSecurity),
  };
}

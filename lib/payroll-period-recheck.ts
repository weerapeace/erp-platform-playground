/**
 * ตรวจทั้งงวด (recheck) — อธิบาย "ที่มาที่ไป" ของเงินทุกบาทในงวด
 *
 * รับข้อมูลดิบของงวด (ผลคำนวณที่บันทึก + รายการต้นทาง + ผลคำนวณสด) แล้วสร้าง:
 *   - สะพานเงินทั้งงวด (ค่าจ้าง + ... − ... = สุทธิ)
 *   - รายการตรวจอัตโนมัติ (ยอดเปลี่ยนหลังคำนวณ, รอบจ่ายไม่ตรง, ฿0, ติดลบ ฯลฯ)
 *   - ที่มาของเงินรายคน: ทุกบรรทัดมีสูตร + รายการต้นทาง (วันที่/ชั่วโมง/เลขรอบ)
 *
 * ไม่มีสูตรของตัวเอง — ใช้กฎกลางเดียวกับเครื่องคำนวณ (lib/payroll-calc-engine, lib/payroll-calc)
 * ถ้าแก้สูตรเงินเดือน หน้านี้อธิบายตามเอง · ไฟล์นี้ไม่แตะ DB (ตัวโหลดอยู่ที่ payroll-period-recheck-db)
 */
import { money, roundMoney, payrollHourlyRate, lateDeduction, absenceDeduction, overtimeAmount } from "@/lib/payroll-calc";
import { aggregateMidMonth, aggregateRecurring, isManualStatus, isPayableWorkDate, payableWorkDays, scheduledWorkDays, effectiveRange } from "@/lib/payroll-calc-engine";
import { isPayrollContractor, isPayrollDailyLike } from "@/lib/payroll-attendance-rules";

type Row = Record<string, unknown>;

export type RecheckSource = {
  label: string;           // เช่น "11 ก.ย. สาย 3 นาที"
  amount?: number;
  counted?: boolean;       // false = มีรายการแต่เครื่องคำนวณไม่นับ (ยังไม่อนุมัติ/วันหยุด/นอกสัญญา)
  note?: string;           // เหตุผลที่ไม่นับ หรือรายละเอียดเพิ่ม
  warn?: string;           // ราคาไม่ตรงสูตรตอนนี้ ฯลฯ
  expected?: number;       // ราคาตามสูตรตอนนี้ (มีเมื่อไม่ตรงกับที่บันทึก)
  href?: string;           // ไปแก้รายการต้นทาง
  ref?: RecheckRef;        // แถวต้นทางใน DB (ใช้ตอนคิดราคาใหม่)
};
/** ชี้แถว + ช่องราคาของรายการต้นทาง — ปุ่ม "คิดราคาใหม่" เขียนกลับที่ช่องนี้ */
export type RecheckRef = {
  table: "attendance_entries" | "overtime_entries" | "leave_entries";
  id: string;
  field: "late_deduction" | "absence_deduction" | "overtime_amount" | "unpaid_leave_deduction";
};
export type RecheckItem = {
  key: string;
  label: string;
  sign: 1 | -1 | 0;        // 0 = แสดงให้รู้ ไม่กระทบยอด (เช่น ลาได้เงิน, ภาษีที่บริษัทออกให้)
  amount: number;
  formula?: string;
  sources: RecheckSource[];
  warn?: string;
};
export type RecheckPerson = {
  employee_id: string;
  code: string;
  name: string;
  wage_label: string;
  contract_label: string;
  work_days: { scheduled: number; payable: number; range: string } | null;
  items: RecheckItem[];
  gross: number;
  total_deduction: number;
  net: number;
  net_rounded: number;
  live_net: number | null;            // ผลคำนวณสดตอนนี้ (null = ไม่มีในผลสด)
  flags: RecheckFlag[];
};
export type RecheckFlag = "changed" | "source_mismatch" | "old_price" | "zero_gross" | "negative" | "not_in_saved" | "not_in_live";
export type RecheckBridgeRow = { key: string; label: string; sign: 1 | -1; amount: number; source: string; people: number; fields: string[] };
export type RecheckCheck = {
  level: "ok" | "info" | "warning" | "error";
  code: string;
  title: string;
  detail?: string;
  employee_ids?: string[];
  fix?: { label: string; href: string };
};
export type PeriodRecheck = {
  period: { id: string; name: string; status: string; start_date: string; end_date: string; work_days: number; hours_per_day: number };
  basis: "saved" | "live";             // saved = ผลคำนวณที่บันทึก · live = ยังไม่เคยบันทึก ใช้ผลสด
  run: { id: string; run_no: number; calculated_at: string | null } | null;
  totals: { people: number; gross: number; total_deduction: number; net: number; net_rounded: number; tax_company_paid: number; tax_company_paid_people: number };
  bridge: RecheckBridgeRow[];
  checks: RecheckCheck[];
  people: RecheckPerson[];
  reprice: RepriceItem[];              // รายการที่ราคาไม่ตรงสูตรตอนนี้ + ราคาใหม่ (ปุ่ม "คิดราคาใหม่")
};

export type RecheckInput = {
  period: Row;                         // payroll_periods + payroll_period_holidays
  run: Row | null;
  savedLines: Row[];                   // payroll_lines ของรอบคำนวณล่าสุด
  liveLines: Row[] | null;             // computePeriodPreview().lines (null = คำนวณสดไม่ได้)
  employees: Map<string, Row>;
  contracts: Map<string, Row>;         // สัญญาที่ใช้ในงวด (ตัดช่วงตามงวดแล้ว)
  settings: Map<string, Row>;
  attendance: Row[];
  leave: Row[];
  overtime: Row[];
  advances: Row[];
  adjustments: Row[];
  recurring: Row[];
  batches: Row[];                      // payment_batches + lines (ทุกประเภท)
  validationIssues?: { level: "error" | "warning"; code: string; title: string; detail: string; count?: number; fix?: { label: string; href: string } }[];
};

const EPS = 0.011;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
export const fmtBaht = (n: number) => money(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number) => money(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function fmtDay(iso: unknown): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]}` : String(iso ?? "");
}
const byEmp = (rows: Row[]) => {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const id = String(r.employee_id); m.set(id, [...(m.get(id) ?? []), r]); }
  return m;
};
const sortByDate = (key: string) => (a: Row, b: Row) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
const sumCounted = (sources: RecheckSource[]) => roundMoney(sources.filter((s) => s.counted !== false).reduce((t, s) => t + money(s.amount), 0));
const WAGE_LABEL: Record<string, string> = { monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง" };

/** ราคาที่บันทึกไว้ในรายการ เทียบกับสูตรตอนนี้ — ต่าง = ตั้งวันทำงานงวด/เงินเดือนเปลี่ยนหลังลงรายการ
 *  perHour = ราคาต่อชั่วโมงของรายการ (ชั่วโมงเก็บทศนิยม 2 ตำแหน่ง เช่น 3 ชม. 40 นาที = 3.67 → ยอมต่างได้ครึ่ง 0.01 ชม.) */
const refOf = (table: RecheckRef["table"], field: RecheckRef["field"], r: Row): RecheckRef | undefined =>
  r.id ? { table, field, id: String(r.id) } : undefined;

function priceCheck(counted: boolean, expected: number, stored: number, perHour: number): Pick<RecheckSource, "warn" | "expected"> {
  if (!counted || Math.abs(expected - stored) <= perHour * 0.005 + EPS) return {};
  return { warn: `สูตรตอนนี้ได้ ฿${fmtBaht(expected)}`, expected };
}

/** เทียบยอดรวมของรายการต้นทางกับยอดในผลคำนวณ — ไม่ตรง = ข้อมูลเปลี่ยนหลังคำนวณ */
function sourceWarn(sources: RecheckSource[], lineAmount: number): string | undefined {
  const total = sumCounted(sources);
  return near(total, lineAmount) ? undefined : `รายการต้นทางตอนนี้รวม ฿${fmtBaht(total)} ไม่ตรงกับผลคำนวณ ฿${fmtBaht(lineAmount)} — ข้อมูลอาจเปลี่ยนหลังคำนวณ`;
}

function buildPerson(L: Row, ctx: {
  period: Row; employee: Row; contract: Row; setting: Row;
  attendance: Row[]; leave: Row[]; overtime: Row[]; advances: Row[]; adjustments: Row[];
  recurringApplied: Row[]; batches: Row[]; periodId: string;
}): Omit<RecheckPerson, "live_net" | "flags"> & { mismatch: boolean } {
  const { period, employee, contract, setting } = ctx;
  const empId = String(L.employee_id);
  const editHref = `/payroll/manual-input?period_id=${ctx.periodId}`;
  const hoursPerDay = money(period.default_hours_per_day) || 8;
  const rate = payrollHourlyRate(contract, period, setting);
  const rateText = `฿${fmtBaht(roundMoney(rate))}/ชม.`;
  const contractor = isPayrollContractor(contract);
  const dailyLike = isPayrollDailyLike(contract);
  const items: RecheckItem[] = [];
  const push = (it: RecheckItem) => { if (it.amount !== 0 || it.sources.length || it.sign === 0) items.push(it); };

  // ---------- รายได้ ----------
  const base = money(L.base_salary);
  if (base) {
    const contractBase = money(contract.base_salary);
    const cap = money(period.default_work_days);
    const schedRaw = scheduledWorkDays(period, contract);
    const fullRaw = scheduledWorkDays(period, { work_schedule_id: contract.work_schedule_id });
    const sched = cap > 0 ? Math.min(schedRaw, cap) : schedRaw;
    const full = cap > 0 ? Math.min(fullRaw, cap) : fullRaw;
    let formula = "ตามที่กรอกเองในข้อมูลคำนวณ";
    if (near(base, contractBase)) formula = `ตามสัญญา ฿${fmtBaht(contractBase)} · ทำครบงวด`;
    else if (full > 0 && sched < full && near(base, roundMoney(contractBase * (sched / full)))) {
      const r = effectiveRange(period, contract);
      formula = `฿${fmtBaht(contractBase)} × ${sched}/${full} วัน (อยู่ในสัญญา ${fmtDay(r.start)}–${fmtDay(r.end)})`;
    }
    push({ key: "base_salary", label: "เงินเดือน", sign: 1, amount: base, formula, sources: [] });
  }
  const dailyAmt = money(L.daily_wage_amount);
  if (dailyAmt) {
    const days = money(L.attendance_days), wage = money(contract.daily_wage);
    const payable = payableWorkDays(period, contract);
    const absent = roundMoney(payable - days);
    push({
      key: "daily_wage_amount", label: "ค่าแรงรายวัน", sign: 1, amount: dailyAmt,
      formula: `${fmtNum(days)} วัน × ฿${fmtBaht(wage)}${absent > 0 ? ` (วันทำงานในงวด ${fmtNum(payable)} − ขาด ${fmtNum(absent)} วัน)` : ""}`,
      sources: [], warn: near(dailyAmt, roundMoney(days * wage)) ? undefined : "ยอดไม่เท่ากับ วัน × ค่าแรง — อาจกรอกยอดเอง",
    });
  }
  const hourlyAmt = money(L.hourly_wage_amount);
  if (hourlyAmt) push({ key: "hourly_wage_amount", label: "ค่าแรงรายชั่วโมง", sign: 1, amount: hourlyAmt, formula: `${fmtNum(money(L.attendance_hours))} ชม. × ฿${fmtBaht(money(contract.hourly_wage))}`, sources: [] });

  const approvedAdj = ctx.adjustments.filter((a) => a.status === "approved");
  const isPiece = (a: Row) => a.source_type === "piecework" || a.category === "piecework" || a.item_code === "PIECEWORK";
  const piece = money(L.piece_rate_amount);
  const pieceSources = ctx.adjustments.filter((a) => a.adjustment_type !== "deduction" && isPiece(a)).map((a) => ({
    label: String(a.item_name || "งานเหมา"), amount: money(a.amount), counted: a.status === "approved",
    note: a.status === "approved" ? undefined : `สถานะ ${String(a.status)} — ยังไม่นับ`, href: editHref,
  }));
  push({ key: "piece_rate_amount", label: "งานเหมา", sign: 1, amount: piece, formula: "รวมยอดงานเหมาที่อนุมัติ", sources: pieceSources, warn: sourceWarn(pieceSources, piece) });

  const allowance = money(L.allowance_amount);
  const allowanceSources: RecheckSource[] = [
    ...ctx.recurringApplied.filter((r) => r.item_type === "earning").map((r) => ({ label: `เงินประจำ "${String(r.item_name ?? "")}"`, amount: money(r.applied_amount), href: "/payroll/recurring" })),
    ...ctx.adjustments.filter((a) => a.adjustment_type !== "deduction" && !isPiece(a)).map((a) => ({
      label: `เพิ่มครั้งเดียว "${String(a.item_name ?? "")}"`, amount: money(a.amount), counted: a.status === "approved",
      note: a.status === "approved" ? undefined : `สถานะ ${String(a.status)} — ยังไม่นับ`, href: editHref,
    })),
  ];
  push({ key: "allowance_amount", label: "เงินเพิ่ม", sign: 1, amount: allowance, formula: "เงินประจำของงวด + รายการเพิ่มที่อนุมัติ", sources: allowanceSources, warn: sourceWarn(allowanceSources, allowance) });
  for (const [key, label] of [["bonus_amount", "โบนัส"], ["commission_amount", "คอมมิชชั่น"]] as const) {
    if (money(L[key])) push({ key, label, sign: 1, amount: money(L[key]), formula: "จากข้อมูลที่กรอกในงวด", sources: [] });
  }

  const ot = money(L.overtime_amount);
  const otSources = ctx.overtime.slice().sort(sortByDate("work_date")).map((o) => {
    const mult = money(o.rate_multiplier) || 1.5;
    const expected = overtimeAmount(money(o.hours), rate, mult);
    const counted = !contractor && isManualStatus(o.status);
    return {
      label: `${fmtDay(o.work_date)} ${fmtNum(money(o.hours))} ชม. ×${fmtNum(mult)}`, amount: money(o.overtime_amount), counted,
      note: counted ? undefined : `สถานะ ${String(o.status)} — ไม่นับ`,
      ...priceCheck(counted, expected, money(o.overtime_amount), rate * mult),
      href: editHref, ref: refOf("overtime_entries", "overtime_amount", o),
    };
  });
  push({ key: "overtime_amount", label: "OT", sign: 1, amount: ot, formula: `ชั่วโมง × ${rateText} × ตัวคูณ OT`, sources: otSources, warn: sourceWarn(otSources, ot) });

  // ---------- หัก ----------
  const att = ctx.attendance.slice().sort(sortByDate("work_date"));
  const attCounted = (r: Row) => !contractor && isManualStatus(r.status) && isPayableWorkDate(String(r.work_date), contract, period);
  const attNote = (r: Row) => !isManualStatus(r.status) ? `สถานะ ${String(r.status)} — ไม่นับ` : "วันหยุด/นอกช่วงสัญญา — ไม่นับ";

  const absence = money(L.absence_deduction);
  const absSources = att.filter((r) => money(r.absence_hours) > 0 || money(r.absence_deduction) > 0).map((r) => {
    const counted = attCounted(r);
    const expected = absenceDeduction(money(r.absence_hours), rate);
    return {
      label: `${fmtDay(r.work_date)} ขาด ${fmtNum(money(r.absence_hours))} ชม.`, amount: money(r.absence_deduction), counted,
      note: counted ? undefined : attNote(r),
      ...priceCheck(counted, expected, money(r.absence_deduction), rate),
      href: editHref, ref: refOf("attendance_entries", "absence_deduction", r),
    };
  });
  // รายวัน: ขาดงานไม่หักเป็นเงิน แต่ลดจำนวนวันที่ได้ค่าแรงแทน (เครื่องคำนวณตั้ง absence_deduction = 0)
  const dailyPay = !contractor && dailyLike && contract.wage_type !== "hourly" && money(contract.daily_wage) > 0;
  if (dailyPay && absence === 0 && absSources.length) {
    push({ key: "absence_info", label: "ขาดงาน (รายวัน)", sign: 0, amount: 0, formula: "รายวันไม่หักเป็นเงิน — นับเป็นวันที่ไม่ได้ค่าแรงแทน", sources: absSources.map((s) => ({ ...s, amount: undefined, warn: undefined, expected: undefined })) });
  } else {
    push({
      key: "absence_deduction", label: "หักขาดงาน", sign: -1, amount: absence,
      formula: `${rateText} × ชั่วโมงที่ขาด${hoursPerDay ? ` (1 วัน = ${fmtNum(hoursPerDay)} ชม. = ฿${fmtBaht(roundMoney(rate * hoursPerDay))})` : ""}`,
      sources: absSources, warn: sourceWarn(absSources, absence),
    });
  }

  const late = money(L.late_deduction);
  const lateSources = att.filter((r) => money(r.late_minutes) > 0 || money(r.late_deduction) > 0).map((r) => {
    const counted = attCounted(r);
    const expected = lateDeduction(money(r.late_minutes), rate);
    return {
      label: `${fmtDay(r.work_date)} สาย ${fmtNum(money(r.late_minutes))} นาที`, amount: money(r.late_deduction), counted,
      note: counted ? undefined : attNote(r),
      ...priceCheck(counted, expected, money(r.late_deduction), 0),
      href: editHref, ref: refOf("attendance_entries", "late_deduction", r),
    };
  });
  const lateMinutes = att.filter(attCounted).reduce((t, r) => t + money(r.late_minutes), 0);
  push({
    key: "late_deduction", label: lateMinutes ? `หักสาย ${fmtNum(lateMinutes)} นาที` : "หักสาย", sign: -1, amount: late,
    formula: `${rateText} ÷ 60 = ฿${(rate / 60).toLocaleString("th-TH", { maximumFractionDigits: 3 })} ต่อนาที × นาทีที่สาย`,
    sources: lateSources, warn: sourceWarn(lateSources, late),
  });

  const lv = ctx.leave.slice().sort(sortByDate("leave_date"));
  const lvCounted = (r: Row) => !contractor && isManualStatus(r.status) && isPayableWorkDate(String(r.leave_date), contract, period);
  const unpaidLeave = money(L.unpaid_leave_deduction);
  const unpaidSources = lv.filter((r) => money(r.unpaid_leave_deduction) > 0).map((r) => {
    const counted = lvCounted(r);
    const expected = absenceDeduction(money(r.hours) || roundMoney(money(r.days) * hoursPerDay), rate);
    return {
      label: `${fmtDay(r.leave_date)} ลาไม่รับเงิน ${fmtNum(money(r.days))} วัน`, amount: money(r.unpaid_leave_deduction), counted,
      note: counted ? undefined : "วันหยุด/นอกช่วงสัญญา/ไม่อนุมัติ — ไม่นับ",
      ...priceCheck(counted, expected, money(r.unpaid_leave_deduction), rate),
      href: editHref, ref: refOf("leave_entries", "unpaid_leave_deduction", r),
    };
  });
  push({ key: "unpaid_leave_deduction", label: "หักลาไม่รับเงิน", sign: -1, amount: unpaidLeave, formula: `ค่าแรงต่อวัน × วันที่ลา`, sources: unpaidSources, warn: sourceWarn(unpaidSources, unpaidLeave) });
  const paidLeave = lv.filter((r) => money(r.unpaid_leave_deduction) <= 0);
  if (paidLeave.length) {
    const days = paidLeave.reduce((t, r) => t + (money(r.days) || 1), 0);
    const sick = paidLeave.some((r) => String(r.leave_type ?? "").startsWith("sick"));
    push({
      key: "paid_leave_info", label: `${sick ? "ลาป่วยได้เงิน" : "ลาได้เงิน"} ${fmtNum(days)} วัน`, sign: 0, amount: 0,
      formula: sick ? "ไม่หัก — ลาป่วยที่ได้รับเงิน" : "ไม่หัก — ลาที่ได้รับเงิน",
      sources: paidLeave.map((r) => ({ label: fmtDay(r.leave_date), note: r.medical_certificate ? "มีใบรับรองแพทย์" : undefined, href: editHref })),
    });
  }

  const ss = money(L.social_security_employee);
  if (ss || setting.social_security_enabled !== false) {
    push({
      key: "social_security_employee", label: "ประกันสังคม", sign: -1, amount: ss,
      formula: setting.social_security_enabled === false ? "ปิดหักในตั้งค่าเงินเดือนรายคน" : `ตั้งค่าเงินเดือนรายคน · ฿${fmtBaht(money(setting.social_security_employer_amount) || money(setting.social_security_employee_amount))}`,
      sources: [{ label: "ตั้งค่าเงินเดือนรายคน", href: "/payroll/employee-settings" }],
    });
  }

  const midDue = aggregateMidMonth(ctx.batches.map((b) => ({ ...b, lines: (b.payment_batch_lines as Row[] | null) ?? [] }))).get(empId) ?? 0;
  const mid = money(L.mid_month_paid);
  const midSources: RecheckSource[] = [];
  for (const b of ctx.batches) {
    if (!["mid_month", "special"].includes(String(b.batch_type)) || String(b.status) === "cancelled") continue;
    for (const line of ((b.payment_batch_lines as Row[] | null) ?? [])) {
      if (String(line.employee_id) !== empId || money(line.paid_amount) <= 0 || String(line.status) === "cancelled") continue;
      const counted = ["approved", "paid"].includes(String(b.status)) && ["approved", "paid"].includes(String(line.status));
      midSources.push({
        label: `${String(b.batch_no ?? "รอบจ่าย")} · ${b.status === "paid" ? "จ่ายแล้ว" : b.status === "approved" ? "อนุมัติแล้ว" : "ยังไม่อนุมัติ"}${b.payment_date ? ` ${fmtDay(b.payment_date)}` : ""}`,
        amount: money(line.paid_amount), counted, note: counted ? undefined : "ยังไม่อนุมัติ — เครื่องคำนวณยังไม่หัก",
        href: `/payroll/payments?period_id=${ctx.periodId}&batch_id=${String(b.id)}`,
      });
    }
  }
  push({
    key: "mid_month_paid", label: "เบิกกลางเดือน", sign: -1, amount: mid, formula: "รวมรอบจ่ายกลางเดือน/พิเศษที่อนุมัติหรือจ่ายแล้ว",
    sources: midSources, warn: mid + EPS < midDue ? `ควรหัก ฿${fmtBaht(midDue)} แต่ผลคำนวณหัก ฿${fmtBaht(mid)} — คำนวณใหม่` : sourceWarn(midSources, mid),
  });

  const advance = money(L.advance_deduction);
  const advSources = ctx.advances.map((r) => {
    const counted = ["approved", "paid", "deducted"].includes(String(r.status));
    return { label: `เบิกล่วงหน้า ${fmtDay(r.payment_date ?? r.request_date)}`, amount: money(r.deduction_amount), counted, note: counted ? undefined : `สถานะ ${String(r.status)} — ไม่นับ` };
  });
  push({ key: "advance_deduction", label: "หักเบิกล่วงหน้า", sign: -1, amount: advance, formula: "ยอดหักคืนของรายการเบิกล่วงหน้า", sources: advSources, warn: sourceWarn(advSources, advance) });
  if (money(L.damage_deduction)) push({ key: "damage_deduction", label: "หักค่าเสียหาย", sign: -1, amount: money(L.damage_deduction), formula: "จากข้อมูลที่กรอกในงวด", sources: [] });

  const other = money(L.other_deduction);
  const otherSources: RecheckSource[] = [
    ...ctx.recurringApplied.filter((r) => r.item_type === "deduction").map((r) => ({ label: `เงินประจำหัก "${String(r.item_name ?? "")}"`, amount: money(r.applied_amount), href: "/payroll/recurring" })),
    ...ctx.adjustments.filter((a) => a.adjustment_type === "deduction").map((a) => ({
      label: `หักครั้งเดียว "${String(a.item_name ?? "")}"`, amount: money(a.amount), counted: a.status === "approved",
      note: a.status === "approved" ? undefined : `สถานะ ${String(a.status)} — ยังไม่นับ`, href: editHref,
    })),
  ];
  push({ key: "other_deduction", label: "หักอื่น ๆ", sign: -1, amount: other, formula: "เงินประจำที่หัก + รายการหักที่อนุมัติ", sources: otherSources, warn: sourceWarn(otherSources, other) });

  const tax = money(L.withholding_tax);
  if (tax) {
    const gross = money(L.gross_pay);
    const preTax = ["late_deduction", "absence_deduction", "unpaid_leave_deduction", "advance_deduction", "damage_deduction", "social_security_employee", "other_deduction", "mid_month_paid"]
      .reduce((t, k) => t + money(L[k]), 0);
    const taxBase = Math.max(roundMoney(gross - preTax), 0);
    const ratePct = money(setting.withholding_tax_rate) || 3;
    const companyPaid = setting.withholding_tax_company_paid === true;
    push({
      key: "withholding_tax", label: companyPaid ? "ภาษีหัก ณ ที่จ่าย (บริษัทออกให้)" : "ภาษีหัก ณ ที่จ่าย", sign: companyPaid ? 0 : -1, amount: tax,
      formula: `ฐาน ฿${fmtBaht(taxBase)} ÷ (1 − ${fmtNum(ratePct)}%) − ฐาน${companyPaid ? " · บริษัทจ่ายแทน ไม่หักจากพนักงาน" : ""}`,
      sources: [{ label: "ตั้งค่าเงินเดือนรายคน", href: "/payroll/employee-settings" }],
    });
  }

  const gross = money(L.gross_pay), totalDeduction = money(L.total_deduction), net = money(L.net_pay);
  const r = effectiveRange(period, contract);
  const name = [employee.nickname, employee.first_name && employee.nickname !== employee.first_name ? employee.first_name : null].filter(Boolean).join(" · ")
    || String(L.employee_nickname ?? "");
  return {
    employee_id: empId,
    code: String(employee.employee_code ?? L.employee_code ?? ""),
    name,
    wage_label: contractor ? "ช่างเหมา" : WAGE_LABEL[String(contract.wage_type ?? L.wage_type ?? "")] ?? String(contract.wage_type ?? ""),
    contract_label: String(contract.contract_type ?? L.contract_type ?? ""),
    work_days: contractor ? null : { scheduled: scheduledWorkDays(period, contract), payable: payableWorkDays(period, contract), range: `${fmtDay(r.start)}–${fmtDay(r.end)}` },
    items,
    gross, total_deduction: totalDeduction, net, net_rounded: Math.round(net),
    mismatch: items.some((it) => it.warn),
  };
}

const BRIDGE: { key: string; label: string; sign: 1 | -1; fields: string[]; source: string }[] = [
  { key: "wages", label: "ค่าจ้าง (เงินเดือน + ค่าแรงรายวัน/ชม.)", sign: 1, fields: ["base_salary", "daily_wage_amount", "hourly_wage_amount"], source: "สัญญาของแต่ละคน · รายวันคิดจากวันทำงานจริง (หักวันหยุดงวด)" },
  { key: "piece", label: "งานเหมา", sign: 1, fields: ["piece_rate_amount"], source: "ยอดงานเหมาที่อนุมัติแล้ว" },
  { key: "allowance", label: "เงินเพิ่ม (เงินประจำ + เพิ่มครั้งเดียว)", sign: 1, fields: ["allowance_amount", "bonus_amount", "commission_amount"], source: "เงินประจำที่ใช้งานในงวด + รายการเพิ่มที่อนุมัติ" },
  { key: "ot", label: "OT", sign: 1, fields: ["overtime_amount"], source: "รายการ OT · ชั่วโมง × ค่าแรงต่อชั่วโมง × ตัวคูณ" },
  { key: "ss", label: "ประกันสังคม", sign: -1, fields: ["social_security_employee"], source: "ตั้งค่าเงินเดือนรายคน" },
  { key: "mid", label: "เบิกกลางเดือน", sign: -1, fields: ["mid_month_paid"], source: "รอบจ่ายกลางเดือน/พิเศษที่อนุมัติหรือจ่ายแล้ว" },
  { key: "absence", label: "ขาด / ลาไม่รับเงิน", sign: -1, fields: ["absence_deduction", "unpaid_leave_deduction"], source: "รายการลงเวลา · ค่าแรงต่อชั่วโมง × ชั่วโมงที่ขาด" },
  { key: "late", label: "สาย", sign: -1, fields: ["late_deduction"], source: "รายการลงเวลา · ค่าแรงต่อนาที × นาทีที่สาย" },
  { key: "other", label: "หักอื่น ๆ (เงินประจำหัก + หักครั้งเดียว + เบิกล่วงหน้า + ค่าเสียหาย)", sign: -1, fields: ["other_deduction", "advance_deduction", "damage_deduction"], source: "เงินประจำที่หัก + รายการหักที่อนุมัติ" },
];

export function buildPeriodRecheck(input: RecheckInput): PeriodRecheck {
  const { period } = input;
  const periodId = String(period.id);
  const basis: PeriodRecheck["basis"] = input.run && input.savedLines.length ? "saved" : "live";
  const lines = basis === "saved" ? input.savedLines : (input.liveLines ?? []);
  const liveBy = new Map((input.liveLines ?? []).map((l) => [String(l.employee_id), l]));
  const savedIds = new Set(input.savedLines.map((l) => String(l.employee_id)));

  const att = byEmp(input.attendance), lv = byEmp(input.leave), ot = byEmp(input.overtime), adv = byEmp(input.advances), adj = byEmp(input.adjustments);
  const recurringApplied = aggregateRecurring(input.recurring, period);
  const companyPaid = (id: string) => input.settings.get(id)?.withholding_tax_company_paid === true;

  const people: RecheckPerson[] = lines.map((L) => {
    const id = String(L.employee_id);
    const p = buildPerson(L, {
      period, periodId,
      employee: input.employees.get(id) ?? {},
      contract: input.contracts.get(id) ?? { wage_type: L.wage_type, contract_type: L.contract_type },
      setting: input.settings.get(id) ?? {},
      attendance: att.get(id) ?? [], leave: lv.get(id) ?? [], overtime: ot.get(id) ?? [], advances: adv.get(id) ?? [], adjustments: adj.get(id) ?? [],
      recurringApplied: recurringApplied.get(id) ?? [], batches: input.batches,
    });
    const live = liveBy.get(id);
    const flags: RecheckFlag[] = [];
    const liveNet = live ? money(live.net_pay) : null;
    if (basis === "saved" && input.liveLines) {
      if (liveNet === null) flags.push("not_in_live");
      else if (!near(liveNet, p.net)) flags.push("changed");
    }
    if (p.mismatch) flags.push("source_mismatch");
    if (p.items.some((it) => it.sources.some((s) => s.expected !== undefined))) flags.push("old_price");
    if (p.gross === 0) flags.push("zero_gross");
    if (p.net < 0) flags.push("negative");
    const { mismatch: _mismatch, ...person } = p;
    void _mismatch;
    return { ...person, live_net: liveNet, flags };
  }).sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));

  // คนที่ผลสดมีแต่ผลที่บันทึกไม่มี (เพิ่งเพิ่มสัญญา/เพิ่งเข้างวด)
  const notInSaved = basis === "saved" ? (input.liveLines ?? []).filter((l) => !savedIds.has(String(l.employee_id))) : [];

  const sum = (fields: string[]) => roundMoney(lines.reduce((t, l) => t + fields.reduce((s, f) => s + money(l[f]), 0), 0));
  const bridge: RecheckBridgeRow[] = BRIDGE.map((b) => ({
    ...b, amount: sum(b.fields),
    people: lines.filter((l) => b.fields.some((f) => money(l[f]) !== 0)).length,
  })).filter((b) => b.amount !== 0);
  const taxDeducted = roundMoney(lines.filter((l) => !companyPaid(String(l.employee_id))).reduce((t, l) => t + money(l.withholding_tax), 0));
  if (taxDeducted) bridge.push({ key: "tax", label: "ภาษีหัก ณ ที่จ่าย", sign: -1, amount: taxDeducted, fields: ["withholding_tax"], source: "ตั้งค่าเงินเดือนรายคน (คิดแบบบริษัทรับภาระภาษีส่วนเพิ่ม)", people: lines.filter((l) => money(l.withholding_tax) && !companyPaid(String(l.employee_id))).length });
  const taxCompanyLines = lines.filter((l) => money(l.withholding_tax) && companyPaid(String(l.employee_id)));

  const totals = {
    people: lines.length,
    gross: sum(["gross_pay"]), total_deduction: sum(["total_deduction"]), net: sum(["net_pay"]),
    net_rounded: lines.reduce((t, l) => t + Math.round(money(l.net_pay)), 0),
    tax_company_paid: roundMoney(taxCompanyLines.reduce((t, l) => t + money(l.withholding_tax), 0)),
    tax_company_paid_people: taxCompanyLines.length,
  };

  // ---------- ตรวจอัตโนมัติ ----------
  const checks: RecheckCheck[] = [];
  const ids = (ps: RecheckPerson[]) => ps.map((p) => p.employee_id);
  const codes = (ps: RecheckPerson[], max = 6) => ps.slice(0, max).map((p) => p.code).join(", ") + (ps.length > max ? ` และอีก ${ps.length - max} คน` : "");
  if (basis === "live") {
    checks.push({ level: "error", code: "no_saved_run", title: "งวดนี้ยังไม่ได้บันทึกผลคำนวณ", detail: "ตัวเลขด้านล่างเป็นผลคำนวณสด ยังไม่ได้บันทึก — ไปหน้าคำนวณงวดแล้วกดบันทึกผลก่อนสร้างรอบจ่าย", fix: { label: "ไปคำนวณงวด", href: `/payroll/calc-run?period_id=${periodId}` } });
  }
  const arithBad = people.filter((p) => !near(roundMoney(p.gross - p.total_deduction), p.net));
  checks.push(arithBad.length
    ? { level: "error", code: "arith", title: `รายได้ − หัก ≠ สุทธิ ${arithBad.length} คน`, detail: codes(arithBad), employee_ids: ids(arithBad) }
    : { level: "ok", code: "arith", title: `รายได้ − หัก = สุทธิ ครบทุกคน (${people.length}/${people.length})` });

  if (basis === "saved") {
    if (!input.liveLines) checks.push({ level: "info", code: "live_unavailable", title: "คำนวณสดเทียบไม่ได้ในตอนนี้", detail: "ยังดูผลที่บันทึกได้ตามปกติ" });
    else {
      const changed = people.filter((p) => p.flags.includes("changed") || p.flags.includes("not_in_live"));
      const diff = roundMoney(changed.reduce((t, p) => t + (money(p.live_net) - p.net), 0) + notInSaved.reduce((t, l) => t + money(l.net_pay), 0));
      checks.push(changed.length || notInSaved.length
        ? {
            level: "warning", code: "changed_since_calc",
            title: `ข้อมูลเปลี่ยนหลังคำนวณ — ยอดสดต่างจากที่บันทึก ${changed.length + notInSaved.length} คน (รวม ${diff >= 0 ? "+" : ""}฿${fmtBaht(diff)})`,
            detail: [changed.length ? codes(changed) : "", notInSaved.length ? `ยังไม่อยู่ในผลคำนวณ ${notInSaved.length} คน` : ""].filter(Boolean).join(" · ") + " — คำนวณ + บันทึกใหม่ แล้วอัปเดตรอบจ่าย",
            employee_ids: ids(changed), fix: { label: "ไปคำนวณใหม่", href: `/payroll/calc-run?period_id=${periodId}` },
          }
        : { level: "ok", code: "changed_since_calc", title: "ผลคำนวณสดตอนนี้ตรงกับที่บันทึกไว้ทุกคน" });
    }
  }

  const monthEnd = input.batches.filter((b) => b.batch_type === "month_end" && b.status !== "cancelled");
  if (!monthEnd.length) checks.push({ level: "info", code: "no_month_end_batch", title: "ยังไม่ได้สร้างรอบจ่ายปลายเดือน", fix: { label: "ไปรอบจ่ายเงิน", href: `/payroll/payments?period_id=${periodId}` } });
  else {
    const batchTotal = roundMoney(monthEnd.reduce((t, b) => t + ((b.payment_batch_lines as Row[] | null) ?? []).filter((l) => l.status !== "cancelled").reduce((s, l) => s + money(l.paid_amount), 0), 0));
    checks.push(Math.abs(batchTotal - totals.net_rounded) < 1
      ? { level: "ok", code: "month_end_batch", title: `ยอดรอบจ่ายปลายเดือน ฿${fmtBaht(batchTotal)} ตรงกับสุทธิรวม` }
      : {
          level: "warning", code: "month_end_batch", title: `ยอดรอบจ่ายปลายเดือน ฿${fmtBaht(batchTotal)} ไม่ตรงกับสุทธิรวม ฿${fmtBaht(totals.net_rounded)}`,
          detail: "กด \"อัปเดตยอดจากคำนวณล่าสุด\" ในหน้ารอบจ่าย", fix: { label: "ไปรอบจ่ายเงิน", href: `/payroll/payments?period_id=${periodId}&batch_id=${String(monthEnd[0].id)}` },
        });
  }

  const midPeople = people.filter((p) => p.items.some((it) => it.key === "mid_month_paid" && it.amount > 0));
  const midShort = people.filter((p) => p.items.some((it) => it.key === "mid_month_paid" && it.warn?.startsWith("ควรหัก")));
  if (midShort.length) checks.push({ level: "warning", code: "mid_short", title: `เงินกลางเดือนยังไม่ถูกหัก ${midShort.length} คน`, detail: codes(midShort), employee_ids: ids(midShort) });
  else if (midPeople.length) checks.push({ level: "ok", code: "mid_short", title: `เงินกลางเดือนหักครบ ${midPeople.length} คน ฿${fmtBaht(sum(["mid_month_paid"]))}` });

  const neg = people.filter((p) => p.flags.includes("negative"));
  checks.push(neg.length
    ? { level: "error", code: "negative", title: `สุทธิติดลบ ${neg.length} คน`, detail: codes(neg), employee_ids: ids(neg) }
    : { level: "ok", code: "negative", title: "ไม่มีใครสุทธิติดลบ" });

  const zero = people.filter((p) => p.flags.includes("zero_gross"));
  if (zero.length) {
    const allContractors = zero.every((p) => p.wage_label === "ช่างเหมา");
    checks.push({ level: "warning", code: "zero_gross", title: `รายได้ ฿0 จำนวน ${zero.length} คน`, detail: `${codes(zero)}${allContractors ? " — ช่างเหมายังไม่มียอดงานเหมา (ตั้งใจหรือลืมลง?)" : ""}`, employee_ids: ids(zero) });
  }

  const mism = people.filter((p) => p.flags.includes("source_mismatch"));
  if (mism.length) checks.push({ level: "warning", code: "source_mismatch", title: `รายการต้นทางไม่ตรงกับผลคำนวณ ${mism.length} คน`, detail: `${codes(mism)} — กดดูรายคนเพื่อเห็นบรรทัดที่ไม่ตรง`, employee_ids: ids(mism) });

  const oldPrice = people.filter((p) => p.flags.includes("old_price"));
  if (oldPrice.length) {
    // ผลต่อสุทธิ: รายการหัก (sign −1) ราคาขึ้น = ได้น้อยลง · OT (sign +1) ราคาขึ้น = ได้เพิ่ม
    const rows = oldPrice.flatMap((p) => p.items.filter((it) => it.sign !== 0).flatMap((it) => it.sources.filter((s) => s.expected !== undefined)
      .map((s) => ({ ot: it.key === "overtime_amount", effect: it.sign * (roundMoney(money(s.expected)) - money(s.amount)) }))));
    const net = roundMoney(rows.reduce((t, r) => t + r.effect, 0));
    const dedUp = roundMoney(-rows.filter((r) => !r.ot).reduce((t, r) => t + r.effect, 0));
    const otUp = roundMoney(rows.filter((r) => r.ot).reduce((t, r) => t + r.effect, 0));
    const parts = [dedUp ? `หัก${dedUp > 0 ? "เพิ่ม" : "ลด"} ฿${fmtBaht(Math.abs(dedUp))}` : "", otUp ? `OT ${otUp > 0 ? "เพิ่ม" : "ลด"} ฿${fmtBaht(Math.abs(otUp))}` : ""].filter(Boolean).join(" · ");
    checks.push({
      level: "warning", code: "old_price",
      title: `สาย/ขาด/ลา/OT ${rows.length} รายการ (${oldPrice.length} คน) คิดราคาไม่ตรงสูตรตอนนี้ — ถ้าคิดใหม่ พนักงาน${net < 0 ? "ได้น้อยลง" : "ได้เพิ่ม"}รวม ฿${fmtBaht(Math.abs(net))}`,
      detail: `${parts ? `${parts} · ` : ""}ราคาถูกคิดไว้ตอนลงรายการ ถ้าแก้วันทำงานของงวด (ตอนนี้ ${fmtNum(money(period.default_work_days))} วัน) หรือเงินเดือนในสัญญาทีหลัง รายการเดิมยังใช้ราคาเก่า · ${codes(oldPrice)}`,
      employee_ids: ids(oldPrice),
    });
  }

  if (totals.tax_company_paid) checks.push({ level: "info", code: "tax_company_paid", title: `ภาษีหัก ณ ที่จ่าย ฿${fmtBaht(totals.tax_company_paid)} ของ ${totals.tax_company_paid_people} คน บริษัทออกให้`, detail: "ยอดนี้จึงไม่อยู่ในยอดหักของพนักงาน", employee_ids: taxCompanyLines.map((l) => String(l.employee_id)) });

  // คำเตือนจากด่านตรวจกลางของงวด (lib/payroll-validation) — ไม่ซ้ำกับที่ตรวจข้างบน
  for (const v of input.validationIssues ?? []) {
    if (v.code === "existing_runs") continue;
    checks.push({ level: v.level, code: `validation:${v.code}`, title: `${v.title}${v.count != null ? ` (${v.count})` : ""}`, detail: v.detail, fix: v.fix });
  }

  const order = { error: 0, warning: 1, info: 2, ok: 3 } as const;
  checks.sort((a, b) => order[a.level] - order[b.level]);

  return {
    period: {
      id: periodId, name: String(period.period_name ?? ""), status: String(period.status ?? ""),
      start_date: String(period.start_date ?? ""), end_date: String(period.end_date ?? ""),
      work_days: money(period.default_work_days), hours_per_day: money(period.default_hours_per_day) || 8,
    },
    basis,
    run: input.run ? { id: String(input.run.id), run_no: money(input.run.run_no), calculated_at: (input.run.calculated_at ?? input.run.created_at ?? null) as string | null } : null,
    totals, bridge, checks, people,
    reprice: buildRepricePlan(people),
  };
}

// ---------- คิดราคาใหม่ (รายการที่ราคาไม่ตรงสูตรตอนนี้) ----------

export type RepriceItem = {
  key: string;               // table:id:field — ใช้ยืนยันรายการเดียวกันตอนกดบันทึก
  ref: RecheckRef;
  employee_id: string;
  code: string;
  name: string;
  item_label: string;        // เช่น "หักสาย 12 นาที"
  label: string;             // เช่น "11 ต.ค. สาย 3 นาที"
  old_amount: number;
  new_amount: number;
  net_effect: number;        // ผลต่อสุทธิของพนักงาน (+ = ได้เพิ่ม · − = ได้น้อยลง)
};

export const repriceKey = (r: RecheckRef) => `${r.table}:${r.id}:${r.field}`;

/** รายการที่ราคาบันทึกไว้ไม่ตรงสูตรตอนนี้ (ป้ายเหลือง "สูตรตอนนี้ได้ ฿…") พร้อมราคาใหม่ — ไม่แตะ DB
 *  ราคาใหม่มาจาก buildPeriodRecheck ซึ่งใช้สูตรกลางชุดเดียวกับฟอร์มลงสาย/ขาด/OT */
export function buildRepricePlan(people: RecheckPerson[]): RepriceItem[] {
  const out: RepriceItem[] = [];
  for (const p of people) {
    for (const it of p.items) {
      if (it.sign === 0) continue;
      for (const s of it.sources) {
        if (s.expected === undefined || !s.ref) continue;
        const oldAmount = money(s.amount), newAmount = roundMoney(s.expected);
        out.push({
          key: repriceKey(s.ref), ref: s.ref, employee_id: p.employee_id, code: p.code, name: p.name,
          item_label: it.label, label: s.label, old_amount: oldAmount, new_amount: newAmount,
          net_effect: roundMoney(it.sign * (newAmount - oldAmount)),
        });
      }
    }
  }
  return out;
}

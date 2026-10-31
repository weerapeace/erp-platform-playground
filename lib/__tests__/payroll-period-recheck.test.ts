import { describe, expect, it } from "vitest";
import { buildPeriodRecheck, type RecheckInput } from "@/lib/payroll-period-recheck";

// ตัวอย่างจริงที่ย่อมา: ISG-006 งวด ก.ย. 2026 (รายเดือน 14,400 · งานเหมา 6,000 · ค่าบ้าน 600 · ขาด 1 วัน · สาย 10 นาที · เบิกกลางเดือน 1,500)
const EMP = "e-006";
const period = { id: "p-9", period_name: "ไอเอสจี - กันยายน", status: "draft", start_date: "2026-09-01", end_date: "2026-09-30", default_work_days: 26, default_hours_per_day: 8, payroll_period_holidays: [] };
const line = {
  employee_id: EMP, employee_code: "ISG-006", wage_type: "monthly", contract_type: "permanent",
  base_salary: 14400, daily_wage_amount: 0, hourly_wage_amount: 0, piece_rate_amount: 6000, overtime_amount: 0,
  allowance_amount: 600, bonus_amount: 0, commission_amount: 0, late_deduction: 11.54, absence_deduction: 553.85,
  unpaid_leave_deduction: 0, advance_deduction: 0, damage_deduction: 0, social_security_employee: 558, withholding_tax: 0,
  other_deduction: 0, mid_month_paid: 1500, gross_pay: 21000, total_deduction: 2623.39, net_pay: 18376.61, attendance_days: 4,
};
const midBatch = { id: "b-mid", batch_no: "MID-MONTH-62aaaf85", batch_type: "mid_month", status: "paid", payment_date: "2026-09-16", payment_batch_lines: [{ employee_id: EMP, paid_amount: 1500, status: "paid" }] };
const monthEnd = { id: "b-end", batch_type: "month_end", status: "draft", payment_batch_lines: [{ employee_id: EMP, paid_amount: 18377, status: "draft" }] };

function input(over: Partial<RecheckInput> = {}): RecheckInput {
  return {
    period, run: { id: "r-6", run_no: 6, calculated_at: "2026-09-30T06:50:10Z" },
    savedLines: [line], liveLines: [{ ...line }],
    employees: new Map([[EMP, { id: EMP, employee_code: "ISG-006", nickname: "แพง" }]]),
    contracts: new Map([[EMP, { id: "c1", contract_type: "permanent", wage_type: "monthly", base_salary: 14400, start_date: "2026-01-01" }]]),
    settings: new Map([[EMP, { employee_id: EMP, social_security_enabled: true, social_security_employee_amount: 558 }]]),
    attendance: [
      { employee_id: EMP, work_date: "2026-09-10", absence_hours: 8, absence_deduction: 553.85, late_minutes: 0, late_deduction: 0, status: "approved" },
      { employee_id: EMP, work_date: "2026-09-11", late_minutes: 3, late_deduction: 3.46, status: "approved" },
      { employee_id: EMP, work_date: "2026-09-23", late_minutes: 1, late_deduction: 1.15, status: "approved" },
      { employee_id: EMP, work_date: "2026-09-25", late_minutes: 2, late_deduction: 2.31, status: "approved" },
      { employee_id: EMP, work_date: "2026-09-26", late_minutes: 4, late_deduction: 4.62, status: "approved" },
    ],
    leave: [{ employee_id: EMP, leave_date: "2026-09-03", leave_type: "sick_paid", days: 1, unpaid_leave_deduction: 0, status: "approved" }],
    overtime: [], advances: [],
    adjustments: [{ employee_id: EMP, adjustment_type: "earning", source_type: "piecework", item_name: "งานเหมา", amount: 6000, status: "approved" }],
    recurring: [{ employee_id: EMP, item_name: "ค่าบ้านแน่นอน", item_type: "earning", amount_per_period: 600, calculation_method: "fixed", status: "active", start_date: "2026-01-01" }],
    batches: [midBatch, monthEnd],
    ...over,
  };
}

describe("payroll-period-recheck", () => {
  it("explains every amount of a person with formulas and source records", () => {
    const r = buildPeriodRecheck(input());
    const p = r.people[0];
    const item = (key: string) => p.items.find((it) => it.key === key)!;
    expect(item("base_salary").formula).toContain("ทำครบงวด");
    expect(item("absence_deduction").sources.map((s) => s.label)).toEqual(["10 ก.ย. ขาด 8 ชม."]);
    expect(item("late_deduction").label).toBe("หักสาย 10 นาที");
    expect(item("late_deduction").sources).toHaveLength(4);
    expect(item("mid_month_paid").sources[0].label).toContain("MID-MONTH-62aaaf85 · จ่ายแล้ว 16 ก.ย.");
    expect(item("paid_leave_info").sign).toBe(0);
    expect(p.flags).toEqual([]);
    expect(p.net_rounded).toBe(18377);
  });

  it("builds the period money bridge and passes the arithmetic + payment checks", () => {
    const r = buildPeriodRecheck(input());
    expect(r.bridge.map((b) => [b.key, b.amount])).toEqual([
      ["wages", 14400], ["piece", 6000], ["allowance", 600], ["ss", 558], ["mid", 1500], ["absence", 553.85], ["late", 11.54],
    ]);
    const levels = Object.fromEntries(r.checks.map((c) => [c.code, c.level]));
    expect(levels).toMatchObject({ arith: "ok", changed_since_calc: "ok", month_end_batch: "ok", mid_short: "ok", negative: "ok" });
  });

  it("flags people whose data changed after the saved calculation", () => {
    const r = buildPeriodRecheck(input({ liveLines: [{ ...line, net_pay: 18876.61 }] }));
    expect(r.people[0].flags).toContain("changed");
    const c = r.checks.find((x) => x.code === "changed_since_calc")!;
    expect(c.level).toBe("warning");
    expect(c.title).toContain("+฿500.00");
  });

  it("flags entries priced with an old rate (period work days changed after entry)", () => {
    const att = input().attendance.map((a) => a.work_date === "2026-09-10" ? { ...a, absence_deduction: 533.33 } : a);
    const r = buildPeriodRecheck(input({ attendance: att, savedLines: [{ ...line, absence_deduction: 533.33 }], liveLines: null }));
    expect(r.people[0].flags).toContain("old_price");
    expect(r.people[0].flags).not.toContain("source_mismatch");
    expect(r.checks.find((c) => c.code === "old_price")?.title).toContain("1 รายการ (1 คน)");
  });

  it("warns when an approved mid-month payment was not deducted", () => {
    const r = buildPeriodRecheck(input({ savedLines: [{ ...line, mid_month_paid: 0, total_deduction: 1123.39, net_pay: 19876.61 }], liveLines: null }));
    expect(r.checks.find((c) => c.code === "mid_short")?.level).toBe("warning");
  });

  it("falls back to the live calculation when the period was never saved", () => {
    const r = buildPeriodRecheck(input({ run: null, savedLines: [] }));
    expect(r.basis).toBe("live");
    expect(r.checks[0]).toMatchObject({ level: "error", code: "no_saved_run" });
    expect(r.people).toHaveLength(1);
  });
});

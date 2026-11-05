import { describe, expect, it } from "vitest";
import { dayMonthToIso, matchEmployee, normQty, normTime, parseWorkLogQr, stepsForQr, validateWorkLogRow, workMinutes, type WorkLogRow } from "./work-log-read";
import { planWorkLogPages } from "./work-log-sheet";

const emps = [
  { id: "e1", nickname: "น้อย", first_name: "สมใจ", last_name: "ใจดี", code: "001" },
  { id: "e2", nickname: "ดาว", first_name: "ดวงดาว", last_name: "", code: "002" },
  { id: "e3", nickname: "ดาวเรือง", first_name: "เรือง", last_name: "", code: "003" },
  { id: "e4", nickname: "แก้ว", first_name: "กาญจนา", last_name: "", code: "004" },
];

const row = (p: Partial<WorkLogRow> = {}): WorkLogRow => ({
  line_key: "p1:S01#1", kind: "step", step_id: "s", step_code: "S01", step_name: "ตัด", name_written: "น้อย", employee_id: "e1",
  work_date: "2026-11-05", start_time: "08:30", end_time: "11:30", qty_done: 74, qty_waste: 0, step_done: false, note: "", unsure: [], include: true, ...p,
});

describe("work-log-read", () => {
  it("round-trips the QR printed by the sheet builder", () => {
    const mo = { id: "11111111-2222-3333-4444-555555555555" };
    const steps = [{ id: "abcdef01-0000-0000-0000-000000000000", sequence: 1, step_name: "ตัด" }, { id: "abcdef02-0000-0000-0000-000000000000", sequence: 2, step_name: "เย็บ" }];
    const qr = parseWorkLogQr(planWorkLogPages(mo, steps, { linesPerStep: 3, extraRows: 4 })[0].qrText);
    expect(qr).toEqual({ moId: mo.id, page: 1, total: 1, linesPerStep: 3, stepPrefixes: ["abcdef01", "abcdef02"] });
    expect(stepsForQr(qr!, [...steps].reverse()).map((s) => s?.step_name)).toEqual(["ตัด", "เย็บ"]);
    expect(parseWorkLogQr("hello")).toBeNull();
    expect(parseWorkLogQr("WL1|not-a-uuid|1/1|3|")).toBeNull();
  });

  it("matches handwritten names to employees", () => {
    expect(matchEmployee("น้อย", emps)).toEqual({ employee_id: "e1", sure: true, candidates: ["e1"] });
    expect(matchEmployee("คุณ แก้ว", emps).employee_id).toBe("e4");
    expect(matchEmployee("สมใจ", emps).employee_id).toBe("e1");
    const dao = matchEmployee("ดาว", emps);
    expect(dao.employee_id).toBe("e2");
    const fuzzy = matchEmployee("น้อบ", emps);
    expect(fuzzy.sure).toBe(false);
    expect(fuzzy.employee_id).toBe("e1");
    expect(matchEmployee("", emps).employee_id).toBeNull();
  });

  it("computes minutes minus lunch break", () => {
    expect(workMinutes("08:30", "11:30")).toBe(180);
    expect(workMinutes("08:00", "17:00")).toBe(480);
    expect(workMinutes("12:30", "14:00")).toBe(60);
    expect(workMinutes("15:00", "14:00")).toBeNull();
  });

  it("normalizes times, quantities and day/month dates", () => {
    expect(normTime("1305")).toBe("13:05");
    expect(normTime("8.3")).toBeNull();
    expect(normTime("8:30")).toBe("08:30");
    expect(normTime("25:00")).toBeNull();
    expect(normQty("1,200")).toBe(1200);
    expect(normQty("")).toBeNull();
    expect(dayMonthToIso("05/11", "2026-11-05")).toBe("2026-11-05");
    expect(dayMonthToIso("30/12", "2027-01-02")).toBe("2026-12-30");
    expect(dayMonthToIso("31/02", "2026-11-05")).toBeNull();
  });

  it("flags blocking errors and soft warnings", () => {
    const ctx = { moQty: 100, today: "2026-11-05" };
    expect(validateWorkLogRow(row(), ctx)).toEqual([]);
    expect(validateWorkLogRow(row({ qty_done: 150 }), ctx)[0]).toMatchObject({ field: "qty_done", level: "error" });
    expect(validateWorkLogRow(row({ end_time: "08:00" }), ctx)[0]).toMatchObject({ field: "end_time", level: "error" });
    expect(validateWorkLogRow(row({ employee_id: null }), ctx)[0]).toMatchObject({ field: "employee_id", level: "error" });
    expect(validateWorkLogRow(row({ unsure: ["done"] }), ctx)[0]).toMatchObject({ field: "qty_done", level: "warn" });
    expect(validateWorkLogRow(row({ include: false, employee_id: null }), ctx)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { buildDailySeries, findLowCash, planPayRun, type CashflowEvent } from "@/lib/cashflow";
import { DEFAULT_CASHFLOW_SETTINGS, cleanCashflowSettings } from "@/lib/cashflow-settings";

const ev = (id: string, date: string, direction: "in" | "out", amount: number, source: CashflowEvent["source"] = "purchase_order"): CashflowEvent =>
  ({ id, date, direction, amount, source, certainty: "expected", ref: id, party: "ร้าน", dateConfident: true, docId: `doc-${id}` });

describe("เงินกันขั้นต่ำ — findLowCash", () => {
  const events = [ev("a", "2026-11-05", "out", 300), ev("b", "2026-11-07", "in", 100), ev("c", "2026-11-10", "out", 400)];
  const series = buildDailySeries(events, 1000, "2026-11-03", "2026-11-30");

  it("หาวันแรกที่ต่ำกว่าเงินกัน + จุดต่ำสุด + ต้องหาเงินเพิ่มเท่าไร", () => {
    const r = findLowCash(series, 500, "2026-11-03");
    expect(r.first).toEqual({ date: "2026-11-10", balance: 400 });
    expect(r.low).toEqual({ date: "2026-11-10", balance: 400 });
    expect(r.shortfall).toBe(100);
  });
  it("ไม่ต่ำกว่าเลย = first null · shortfall 0", () => {
    const r = findLowCash(series, 0, "2026-11-03");
    expect(r.first).toBeNull();
    expect(r.shortfall).toBe(0);
  });
  it("ยอดเริ่มก็ต่ำกว่าแล้ว = นับเป็นวันนี้", () => {
    expect(findLowCash(series, 2000, "2026-11-03").first).toEqual({ date: "2026-11-03", balance: 1000 });
  });
});

describe("จัดรอบจ่าย — planPayRun", () => {
  const events = [
    ev("old-big", "2026-10-01", "out", 500), ev("old-small", "2026-10-01", "out", 100),
    ev("due", "2026-11-08", "out", 300), ev("later", "2026-12-01", "out", 50),
    ev("loan", "2026-11-05", "out", 999, "loan"), ev("in", "2026-11-04", "in", 999, "sales_order"),
  ];
  it("เฉพาะ PO ที่ครบกำหนดภายในวันที่ · เก่าก่อน ยอดน้อยก่อน · ใบที่ใหญ่เกินงบข้ามไปหยิบใบถัดไป", () => {
    const r = planPayRun(events, 450, "2026-11-10");
    expect(r.picked.map((e) => e.id)).toEqual(["old-small", "due"]);
    expect(r.left.map((e) => e.id)).toEqual(["old-big"]);
    expect(r.total).toBe(400);
  });
  it("งบ 0 = ไม่หยิบอะไร · งบพอ = หยิบครบ", () => {
    expect(planPayRun(events, 0, "2026-11-10").picked).toEqual([]);
    expect(planPayRun(events, 10_000, "2026-11-10").picked.map((e) => e.id)).toEqual(["old-small", "old-big", "due"]);
  });
});

describe("ค่าตั้งกลาง — cleanCashflowSettings", () => {
  it("ค่าผิดรูปแบบใช้ค่าตั้งต้น · ติดลบไม่ได้ · วันต้องอยู่ในตัวเลือก", () => {
    expect(cleanCashflowSettings(null)).toEqual(DEFAULT_CASHFLOW_SETTINGS);
    expect(cleanCashflowSettings({ safetyBuffer: -5, alertDays: 9, alertEnabled: "yes" })).toEqual(DEFAULT_CASHFLOW_SETTINGS);
    expect(cleanCashflowSettings({ safetyBuffer: "300000", alertDays: 30, alertEnabled: false })).toEqual({ safetyBuffer: 300000, alertDays: 30, alertEnabled: false });
  });
});

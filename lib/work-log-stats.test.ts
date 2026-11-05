import { describe, expect, it } from "vitest";
import { demoStatEntries, durationLabel, median, personStats, stepStats, verdictOf, type StatEntry } from "./work-log-stats";

const e = (p: Partial<StatEntry>): StatEntry => ({ id: Math.random().toString(36), step_id: "s1", step_name: "เย็บขอบ", product_sku: "A", product_name: "กระเป๋า",
  employee_id: "e1", employee_name: "น้อย", work_date: "2026-11-01", minutes: 60, qty_done: 20, qty_waste: 0, ...p });

describe("work-log-stats", () => {
  it("median ignores outliers that would skew an average", () => {
    expect(median([10, 11, 12, 13, 100])).toBe(12);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBeNull();
  });

  it("builds a standard only from usable recent lines and judges people", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => e({ employee_id: "fast", employee_name: "เร็ว", qty_done: 30, work_date: `2026-11-0${i + 1}` })),
      ...Array.from({ length: 6 }, (_, i) => e({ employee_id: "mid", employee_name: "กลาง", qty_done: 20, work_date: `2026-11-0${i + 1}` })),
      ...Array.from({ length: 6 }, (_, i) => e({ employee_id: "slow", employee_name: "ช้า", qty_done: 12, work_date: `2026-11-0${i + 1}` })),
      e({ employee_id: "new", employee_name: "ใหม่", qty_done: 25 }),
      e({ employee_id: "mid", minutes: 5, qty_done: 500 }),     // สั้นเกิน ไม่นับ
    ];
    const [s] = stepStats(rows, "step");
    expect(s.reliable).toBe(true);
    expect(s.standard).toBe(20);
    const v = Object.fromEntries(s.people.map((p) => [p.employee_id, p.verdict]));
    expect(v).toEqual({ fast: "fast", mid: "normal", slow: "slow", new: "few" });
    const people = personStats(rows, [s]);
    expect(people[0].employee_id).toBe("fast");
    expect(people.find((p) => p.employee_id === "new")?.verdict).toBe("few");
  });

  it("is not reliable with fewer than 5 lines", () => {
    const [s] = stepStats([e({}), e({}), e({})], "step");
    expect(s.reliable).toBe(false);
    expect(s.people[0].verdict).toBe("few");
  });

  it("groups the same step name across products in name mode", () => {
    const rows = [e({ step_id: "a", product_sku: "A" }), e({ step_id: "b", product_sku: "B", step_name: " เย็บขอบ " })];
    expect(stepStats(rows, "step")).toHaveLength(2);
    expect(stepStats(rows, "name")).toHaveLength(1);
  });

  it("formats duration and verdict thresholds", () => {
    expect(durationLabel(100, 20, 8)).toBe("5 ชม.");
    expect(durationLabel(400, 20, 8)).toBe("2.5 วัน");
    expect(durationLabel(100, null, 8)).toBe("—");
    expect(verdictOf(1.2, 6)).toBe("fast");
    expect(verdictOf(0.8, 6)).toBe("slow");
    expect(verdictOf(1.2, 2)).toBe("few");
  });

  it("demo data produces three reliable steps", () => {
    const s = stepStats(demoStatEntries("2026-11-05"), "step");
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.reliable)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { applyManualDone, cleanManualDone, isValidManualPeriod, manualDoneMark } from "@/lib/cashflow-manual-done";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("รายการประจำ — ติ๊กจ่ายแล้ว / ข้ามเดือนนี้", () => {
  it("ติ๊กแล้วเห็น · ย้อนกลับแล้วหาย", () => {
    const m1 = applyManualDone({}, A, "2026-11", "paid", "2026-11-04");
    expect(manualDoneMark(m1, A, "2026-11")).toBe("paid");
    expect(manualDoneMark(m1, A, "2026-12")).toBeNull();
    const m2 = applyManualDone(m1, A, "2026-11", "undo", "2026-11-04");
    expect(manualDoneMark(m2, A, "2026-11")).toBeNull();
    expect(m2[A]).toBeUndefined();
  });

  it("ไม่แก้ค่าเดิม (immutable) · รายการอื่นไม่โดน", () => {
    const base = { [B]: { "2026-10": "skipped" as const } };
    const next = applyManualDone(base, A, "once", "skipped", "2026-11-04");
    expect(base).toEqual({ [B]: { "2026-10": "skipped" } });
    expect(next[B]).toEqual({ "2026-10": "skipped" });
    expect(next[A]).toEqual({ once: "skipped" });
  });

  it("ตัดเดือนที่เก่าเกิน 13 เดือนทิ้ง (once เก็บไว้)", () => {
    const base = { [B]: { "2025-01": "paid" as const, "2026-10": "paid" as const, once: "paid" as const } };
    const next = applyManualDone(base, A, "2026-11", "paid", "2026-11-04");
    expect(next[B]).toEqual({ "2026-10": "paid", once: "paid" });
  });

  it("อ่านค่าที่เก็บไว้อย่างปลอดภัย — ค่าเสียทิ้ง", () => {
    expect(cleanManualDone(null)).toEqual({});
    expect(cleanManualDone([1, 2])).toEqual({});
    expect(cleanManualDone({ "not-uuid": { "2026-11": "paid" }, [A]: { "2026-11": "paid", "2026-1": "paid", bad: "x", "2026-12": "nope" } }))
      .toEqual({ [A]: { "2026-11": "paid" } });
  });

  it("งวดที่ใช้ได้ = YYYY-MM หรือ once", () => {
    expect(isValidManualPeriod("2026-11")).toBe(true);
    expect(isValidManualPeriod("once")).toBe(true);
    expect(isValidManualPeriod("2026-11-01")).toBe(false);
    expect(isValidManualPeriod(202611)).toBe(false);
  });
});

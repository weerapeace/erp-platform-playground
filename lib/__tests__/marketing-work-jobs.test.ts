import { describe, it, expect } from "vitest";
import {
  cleanSteps, discountProblem, discountedPrice, dueState, itemProgress, jobProgress, newPriceRange,
  nextStepKey, snapshotBasePrice, stepsFromLabels, kindInfo, shortThaiDate,
} from "@/lib/marketing/work-jobs";

describe("ราคา Clearance", () => {
  it("ลดเป็น % และเป็นบาท", () => {
    expect(discountedPrice(1290, 20, "percent")).toBe(1032);
    expect(discountedPrice(1590, 300, "baht")).toBe(1290);
    expect(discountedPrice(999, 15, "percent")).toBe(849.15);   // ปัดสตางค์ ไม่มีเลขเพี้ยน
  });
  it("ไม่ใส่ส่วนลด = ราคาเดิม · ไม่มีราคาเต็ม = null", () => {
    expect(discountedPrice(990, null, "percent")).toBe(990);
    expect(discountedPrice(null, 10, "percent")).toBeNull();
  });
  it("ราคาใหม่เป็นช่วงเมื่อสีราคาต่างกัน", () => {
    expect(newPriceRange({ base_price_min: 990, base_price_max: 1290, discount_value: 10, discount_unit: "percent" })).toEqual({ from: 891, to: 1161 });
    expect(newPriceRange({ base_price_min: 990, base_price_max: 990, discount_value: 100, discount_unit: "baht" })).toEqual({ from: 890, to: 890 });
    expect(newPriceRange({ base_price_min: null, base_price_max: null, discount_value: 10, discount_unit: "baht" })).toBeNull();
  });
  it("ตรวจส่วนลดผิด", () => {
    expect(discountProblem(990, 120, "percent")).toMatch(/100%/);
    expect(discountProblem(990, 1000, "baht")).toMatch(/เกินราคาเต็ม/);
    expect(discountProblem(990, -5, "baht")).toMatch(/ติดลบ/);
    expect(discountProblem(990, 50, "percent")).toBeNull();
    expect(discountProblem(null, 500, "baht")).toBeNull();   // ยังไม่มีราคาเต็ม ตรวจเพดานไม่ได้
  });
  it("ราคาเต็มตอนใส่เข้างาน: สี → รุ่น → ไม่มี", () => {
    expect(snapshotBasePrice([1290, 990, 0, null], 500)).toEqual({ min: 990, max: 1290 });
    expect(snapshotBasePrice([0, null], 890)).toEqual({ min: 890, max: 890 });
    expect(snapshotBasePrice([], 0)).toEqual({ min: null, max: null });
  });
});

describe("ขั้นตอน + ความคืบหน้า", () => {
  const steps = stepsFromLabels(["ทำรูป", " แก้ Lazada ", "", "แก้ Shopee"]);
  it("สร้างขั้นตอนจากแบบงาน (ตัดช่องว่าง/ชื่อว่าง)", () => {
    expect(steps).toEqual([{ key: "s1", label: "ทำรูป" }, { key: "s2", label: "แก้ Lazada" }, { key: "s3", label: "แก้ Shopee" }]);
    expect(nextStepKey(steps)).toBe("s4");
    expect(kindInfo("clearance").steps.length).toBe(3);
  });
  it("cleanSteps: คีย์ซ้ำ/ผิดรูปแบบได้คีย์ใหม่ · ชื่อว่างทิ้ง", () => {
    const out = cleanSteps([{ key: "s1", label: "A" }, { key: "s1", label: "B" }, { key: "bad key!", label: "C" }, { key: "s9", label: "  " }, "D"]);
    expect(out.map((s) => s.label)).toEqual(["A", "B", "C", "D"]);
    expect(new Set(out.map((s) => s.key)).size).toBe(4);
    expect(out[0].key).toBe("s1");
    expect(cleanSteps("x")).toEqual([]);
  });
  it("นับเฉพาะขั้นตอนที่ยังอยู่ (ลบขั้นตอนแล้วไม่นับ)", () => {
    const done = { s1: { at: "t", by: null }, s3: { at: "t", by: null }, s9: { at: "t", by: null } };
    expect(itemProgress(done, steps)).toEqual({ done: 2, total: 3, complete: false });
    const all = { s1: { at: "t", by: null }, s2: { at: "t", by: null }, s3: { at: "t", by: null } };
    expect(jobProgress([{ step_done: done }, { step_done: all }, { step_done: {} }], steps)).toEqual({ models: 3, modelsDone: 1, stepsDone: 5, stepsTotal: 9, pct: 56 });
    expect(jobProgress([], steps).pct).toBe(0);
    expect(itemProgress({}, []).complete).toBe(false);   // งานไม่มีขั้นตอน ไม่ถือว่าเสร็จ
  });
});

describe("วันครบกำหนด", () => {
  it("เลยกำหนด / วันนี้ / ใกล้ / ปกติ", () => {
    expect(dueState("2026-10-17", "2026-10-18")).toBe("overdue");
    expect(dueState("2026-10-18", "2026-10-18")).toBe("today");
    expect(dueState("2026-10-21", "2026-10-18")).toBe("soon");
    expect(dueState("2026-11-30", "2026-10-18")).toBe("ok");
    expect(dueState(null, "2026-10-18")).toBeNull();
    expect(dueState("2026-11-01", "2026-10-31")).toBe("soon");   // ข้ามเดือน
  });
  it("วันที่ไทยสั้น", () => {
    expect(shortThaiDate("2026-10-31")).toBe("31 ต.ค.");
    expect(shortThaiDate(null)).toBe("");
  });
});

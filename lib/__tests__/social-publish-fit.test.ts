import { describe, it, expect } from "vitest";
import { sanitizeFit, fitQuery, parseFitQuery, fitTargetRatio, padBox, cropBox, ratioLabel, DEFAULT_IG_FIT } from "@/lib/social-publish/fit";

describe("fitTargetRatio (ปรับเฉพาะที่ต้องปรับ)", () => {
  it("auto: รูป 2:3 (สูงเกิน 4:5) → 4:5 · รูปที่อยู่ในช่วงแล้ว → ไม่ปรับ", () => {
    expect(fitTargetRatio(1066 / 1600, DEFAULT_IG_FIT)).toBeCloseTo(0.8);
    expect(fitTargetRatio(1200 / 1500, DEFAULT_IG_FIT)).toBeNull();
    expect(fitTargetRatio(1, DEFAULT_IG_FIT)).toBeNull();
  });
  it("auto: แนวนอนกว้างเกิน 1.91 → 1.91", () => {
    expect(fitTargetRatio(2.5, DEFAULT_IG_FIT)).toBeCloseTo(1.91);
  });
  it("บังคับ 1:1 ทุกรูป", () => {
    expect(fitTargetRatio(0.8, { mode: "pad", ratio: 1, bg: "white" })).toBe(1);
    expect(fitTargetRatio(1, { mode: "pad", ratio: 1, bg: "white" })).toBeNull();
  });
});

describe("padBox / cropBox", () => {
  it("เติมขอบรูป 1066×1600 เป็น 4:5 = ขยายความกว้าง วางกึ่งกลาง", () => {
    expect(padBox(1066, 1600, 0.8)).toEqual({ width: 1280, height: 1600, left: 107, top: 0 });
  });
  it("เติมขอบรูปแนวนอนเป็น 1:1 = ขยายความสูง", () => {
    expect(padBox(1600, 900, 1)).toEqual({ width: 1600, height: 1600, left: 0, top: 350 });
  });
  it("ครอปรูป 1066×1600 เป็น 4:5 = ตัดบน-ล่าง", () => {
    expect(cropBox(1066, 1600, 0.8)).toEqual({ width: 1066, height: 1333, left: 0, top: 134 });
  });
});

describe("sanitizeFit / query", () => {
  it("รับเฉพาะค่าที่ถูก · สีแปลก = ขาว · สัดส่วนถูกบีบ 0.5–2", () => {
    expect(sanitizeFit({ mode: "pad", ratio: "auto", bg: "#FF00aa" })).toEqual({ mode: "pad", ratio: "auto", bg: "ff00aa" });
    expect(sanitizeFit({ mode: "pad", ratio: 9, bg: "red;drop" })).toEqual({ mode: "pad", ratio: 2, bg: "white" });
    expect(sanitizeFit({ mode: "stretch", ratio: 1 })).toBeNull();
    expect(sanitizeFit(null)).toBeNull();
  });
  it("ไป-กลับ query string ได้ค่าเดิม", () => {
    const f = { mode: "crop" as const, ratio: 0.5625, bg: "blur" };
    expect(parseFitQuery(new URLSearchParams(fitQuery(f)))).toEqual(f);
    expect(parseFitQuery(new URLSearchParams("k=x"))).toBeNull();
  });
  it("ชื่อสัดส่วน", () => {
    expect(ratioLabel(1066 / 1600)).toBe("2:3");
    expect(ratioLabel(0.8)).toBe("4:5");
  });
});

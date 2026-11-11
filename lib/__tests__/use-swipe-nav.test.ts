import { describe, expect, it } from "vitest";
import { swipeAxis, swipeOffset, swipeResult } from "@/lib/use-swipe-nav";

describe("swipeAxis — แนวนอนชัด ๆ เท่านั้นถึงนับเป็นปัด", () => {
  it("ขยับน้อย = ยังไม่ตัดสิน", () => {
    expect(swipeAxis(5, 3)).toBeNull();
  });
  it("แนวนอนมากกว่าแนวตั้ง (1.2 เท่า) = ปัด · ไม่งั้น = เลื่อนจอ", () => {
    expect(swipeAxis(-30, 5)).toBe("x");
    expect(swipeAxis(20, 30)).toBe("y");
    expect(swipeAxis(24, 22)).toBe("y");   // เฉียง ๆ = ให้จอเลื่อนขึ้นลง (ไม่เปลี่ยนแท็บพลาด)
  });
});

describe("swipeResult — ทิศแบบ LINE/IG: ปัดซ้าย = แท็บถัดไป", () => {
  it("ปัดซ้ายเกิน 60px = ถัดไป · ปัดขวาเกิน 60px = ก่อนหน้า · ไม่ถึง = อยู่ที่เดิม", () => {
    expect(swipeResult(-80)).toBe(1);
    expect(swipeResult(90)).toBe(-1);
    expect(swipeResult(-40)).toBe(0);
    expect(swipeResult(59)).toBe(0);
  });
  it("สุดทางแล้ว = ไม่ไปต่อ", () => {
    expect(swipeResult(-120, { canNext: false })).toBe(0);
    expect(swipeResult(120, { canPrev: false })).toBe(0);
  });
});

describe("swipeOffset — สุดทางแล้วหนืด", () => {
  it("ปกติเลื่อนตามนิ้ว · ทางที่ไม่มีแท็บ = 30%", () => {
    expect(swipeOffset(-50)).toBe(-50);
    expect(swipeOffset(-50, false, true)).toBe(-15);
    expect(swipeOffset(40, true, false)).toBe(12);
  });
});

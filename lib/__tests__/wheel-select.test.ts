import { describe, expect, it } from "vitest";
import { nextOptionValue } from "@/components/wheel-select";

const opts = [{ value: "auto" }, { value: "none" }, { value: "sm" }, { value: "md", disabled: true }, { value: "lg" }];

describe("WheelSelect: เลื่อนตัวเลือก", () => {
  it("ลง = ตัวล่าง · ขึ้น = ตัวบน", () => {
    expect(nextOptionValue(opts, "none", 1)).toBe("sm");
    expect(nextOptionValue(opts, "none", -1)).toBe("auto");
  });
  it("ข้ามตัวที่ปิดไว้", () => {
    expect(nextOptionValue(opts, "sm", 1)).toBe("lg");
    expect(nextOptionValue(opts, "lg", -1)).toBe("sm");
  });
  it("ชนขอบ = ไม่เปลี่ยน", () => {
    expect(nextOptionValue(opts, "auto", -1)).toBeNull();
    expect(nextOptionValue(opts, "lg", 1)).toBeNull();
  });
  it("ค่าปัจจุบันไม่อยู่ในรายการ = เริ่มจากต้น/ท้าย", () => {
    expect(nextOptionValue(opts, "x", 1)).toBe("auto");
    expect(nextOptionValue(opts, "x", -1)).toBe("lg");
    expect(nextOptionValue([], "x", 1)).toBeNull();
  });
});

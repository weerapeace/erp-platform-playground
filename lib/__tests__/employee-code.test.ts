import { describe, it, expect } from "vitest";
import { nextEmployeeCode, bumpCode } from "../employee-code";

describe("nextEmployeeCode", () => {
  it("ต่อเลขจากรหัสมากสุดของแผนก (ข้อมูลจริงของช่างเหมา)", () => {
    expect(nextEmployeeCode(["ISG-CM-1001", "ISG-CM-1002", "ISG-CM-1011", "ISG-CM-1017"])).toBe("ISG-CM-1018");
  });
  it("คงจำนวนหลักเดิม (เติมศูนย์หน้า)", () => {
    expect(nextEmployeeCode(["ISG-085", "ISG-106"])).toBe("ISG-107");
    expect(nextEmployeeCode(["EMP-0009"])).toBe("EMP-0010");
  });
  it("มีหลายรูปแบบปนกัน → ใช้รูปแบบที่คนใช้เยอะสุด", () => {
    expect(nextEmployeeCode(["ISG-CM-1001", "ISG-CM-1002", "TMP-1"])).toBe("ISG-CM-1003");
  });
  it("ไม่มีรหัสให้อ้างอิง / รหัสไม่มีตัวเลขท้าย → คืน null ให้ผู้เรียก fallback", () => {
    expect(nextEmployeeCode([])).toBeNull();
    expect(nextEmployeeCode([null, undefined, "  "])).toBeNull();
    expect(nextEmployeeCode(["ช่างเหมา"])).toBeNull();
  });
});

describe("bumpCode", () => {
  it("ขยับเลขท้ายเมื่อรหัสชนกัน", () => {
    expect(bumpCode("ISG-CM-1018")).toBe("ISG-CM-1019");
    expect(bumpCode("ISG-099")).toBe("ISG-100");
  });
  it("ไม่มีตัวเลขท้าย → ต่อ -1", () => {
    expect(bumpCode("ABC")).toBe("ABC-1");
  });
});

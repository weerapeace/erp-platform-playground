import { describe, expect, it } from "vitest";
import { PRESET_AUTO_NEW, isAutoNewPreset } from "@/lib/record-tasks";

// สวิตช์ "ใบใหม่" ของค่าที่ใช้บ่อย (erp_lookups.metadata.auto_new) — ต้องเป็น true จริงเท่านั้นถึงใส่ให้ตอนสร้างใบใหม่
describe("isAutoNewPreset", () => {
  it("เปิดสวิตช์ = true", () => {
    expect(isAutoNewPreset({ [PRESET_AUTO_NEW]: true })).toBe(true);
    expect(isAutoNewPreset({ links: true, auto_new: true })).toBe(true);
  });
  it("ไม่เปิด / ค่าแปลก / ไม่มี metadata = false", () => {
    expect(isAutoNewPreset({ auto_new: false })).toBe(false);
    expect(isAutoNewPreset({ auto_new: "true" })).toBe(false);
    expect(isAutoNewPreset({ links: true })).toBe(false);
    expect(isAutoNewPreset({})).toBe(false);
    expect(isAutoNewPreset(null)).toBe(false);
    expect(isAutoNewPreset(undefined)).toBe(false);
  });
});

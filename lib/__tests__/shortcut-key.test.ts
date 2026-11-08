import { describe, it, expect } from "vitest";
import { shortcutKey } from "../shortcut-key";

describe("shortcutKey (คีย์ลัดไม่ขึ้นกับภาษาแป้นพิมพ์)", () => {
  it("แป้นพิมพ์ไทย Ctrl+Z ได้ e.key = ผ แต่ยังรู้ว่าเป็น z", () => {
    expect(shortcutKey({ key: "ผ", code: "KeyZ" })).toBe("z");
    expect(shortcutKey({ key: "ฟ", code: "KeyA" })).toBe("a");
    expect(shortcutKey({ key: "ก", code: "KeyD" })).toBe("d");
    expect(shortcutKey({ key: "ั", code: "KeyY" })).toBe("y");
  });
  it("ภาษาอังกฤษ/ตัวพิมพ์ใหญ่ ปกติ", () => {
    expect(shortcutKey({ key: "Z", code: "KeyZ" })).toBe("z");
    expect(shortcutKey({ key: "1", code: "Digit1" })).toBe("1");
  });
  it("ปุ่มอื่น / ไม่มี code = ใช้ e.key", () => {
    expect(shortcutKey({ key: "Delete", code: "Delete" })).toBe("delete");
    expect(shortcutKey({ key: "z", code: "" })).toBe("z");
  });
});

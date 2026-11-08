import { describe, it, expect } from "vitest";
import { shortcutKey } from "../shortcut-key";

describe("shortcutKey (คีย์ลัดไม่ขึ้นกับภาษาแป้นพิมพ์)", () => {
  it("แป้นพิมพ์ไทย Ctrl+Z ได้ e.key = ผ แต่ยังรู้ว่าเป็น z", () => {
    expect(shortcutKey({ key: "ผ", code: "KeyZ" })).toBe("z");
    expect(shortcutKey({ key: "ฟ", code: "KeyA" })).toBe("a");
    expect(shortcutKey({ key: "ก", code: "KeyD" })).toBe("d");
    expect(shortcutKey({ key: "ั", code: "KeyY" })).toBe("y");
    expect(shortcutKey({ key: "ย", code: "KeyP" })).toBe("p");
  });
  it("แป้นพิมพ์ไทย: แถวตัวเลข + เครื่องหมาย", () => {
    expect(shortcutKey({ key: "ๅ", code: "Digit1" })).toBe("1");
    expect(shortcutKey({ key: "-", code: "Digit3" })).toBe("-");   // ไทยกดปุ่ม 3 ได้ "-" (ตัวอังกฤษ) → เชื่อตามที่พิมพ์
    expect(shortcutKey({ key: "ฝ", code: "Slash" })).toBe("/");
  });
  it("ภาษาอังกฤษ/ตัวพิมพ์ใหญ่/ตัวเลข ปกติ", () => {
    expect(shortcutKey({ key: "Z", code: "KeyZ" })).toBe("z");
    expect(shortcutKey({ key: "1", code: "Digit1" })).toBe("1");
    expect(shortcutKey({ key: "?", code: "Slash" })).toBe("?");
    expect(shortcutKey({ key: "/", code: "NumpadDivide" })).toBe("/");
  });
  it("แป้นแบบอื่น (Dvorak) ยังถูก — ไม่บังคับตำแหน่งปุ่ม", () => {
    expect(shortcutKey({ key: "z", code: "Slash" })).toBe("z");
  });
  it("ปุ่มพิเศษ / ไม่มี code = ใช้ e.key", () => {
    expect(shortcutKey({ key: "Delete", code: "Delete" })).toBe("delete");
    expect(shortcutKey({ key: "ArrowLeft", code: "ArrowLeft" })).toBe("arrowleft");
    expect(shortcutKey({ key: "z", code: "" })).toBe("z");
  });
});

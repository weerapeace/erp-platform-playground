import { describe, expect, it } from "vitest";
import { clampToolboxPos, hotkeyCode, isTypingTarget, parseToolboxPos, wheelAction } from "@/lib/board-kit";

describe("wheelAction", () => {
  it("หมุนเฉย ๆ = ปล่อยให้เลื่อนตามปกติ", () => expect(wheelAction(false)).toBe("pass"));
  it("Ctrl = ซูม", () => expect(wheelAction(true)).toBe("zoom"));
});

describe("toolbox pos", () => {
  it("อ่านค่าผิดรูป = null", () => {
    expect(parseToolboxPos(null)).toBeNull();
    expect(parseToolboxPos({ x: "a", y: 1 })).toBeNull();
    expect(parseToolboxPos({ x: 10, y: 20, fold: true })).toEqual({ x: 10, y: 20, fold: true });
  });
  it("กันหลุดนอกกระดาน", () => {
    expect(clampToolboxPos({ x: 900, y: -5 }, { w: 100, h: 200 }, { w: 500, h: 400 })).toEqual({ x: 396, y: 4 });
    expect(clampToolboxPos({ x: 50, y: 50 }, { w: 100, h: 500 }, { w: 500, h: 400 })).toEqual({ x: 50, y: 4 });
  });
});

describe("hotkeys", () => {
  it("ตัวอักษร → ตำแหน่งปุ่ม", () => {
    expect(hotkeyCode("v")).toBe("KeyV");
    expect(hotkeyCode("1")).toBe("Digit1");
    expect(hotkeyCode("Ctrl+Z")).toBeNull();
  });
  it("พิมพ์ในช่อง = ไม่รับปุ่มลัด", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", closest: () => null })).toBe(false);
  });
});

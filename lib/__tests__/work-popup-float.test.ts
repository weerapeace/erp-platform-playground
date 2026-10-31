import { describe, expect, it } from "vitest";
import { parseWorkPopupFloatPref, workPopupAnchor, WORK_POPUP_FLOAT_DEFAULT } from "@/components/work-popup/float-pref";
import { anchorFromRect, parseCornerAnchor } from "@/lib/use-corner-drag";

describe("parseWorkPopupFloatPref", () => {
  it("ค่าเพี้ยน = null (ใช้ค่าตั้งต้น: เปิด · กาง · ขวาล่าง)", () => {
    expect(parseWorkPopupFloatPref(null)).toBeNull();
    expect(parseWorkPopupFloatPref("x")).toBeNull();
    expect(WORK_POPUP_FLOAT_DEFAULT).toEqual({ enabled: true, minimized: false, position: "br", anchor: null });
  });
  it("อ่านค่าที่บันทึกไว้ · ช่องที่ขาดใช้ค่าตั้งต้น · มุมแปลก = ขวาล่าง", () => {
    expect(parseWorkPopupFloatPref({ enabled: false })).toEqual({ enabled: false, minimized: false, position: "br", anchor: null });
    expect(parseWorkPopupFloatPref({ enabled: true, minimized: true, position: "tr" })).toEqual({ enabled: true, minimized: true, position: "tr", anchor: null });
    expect(parseWorkPopupFloatPref({ position: "left" })).toEqual({ enabled: true, minimized: false, position: "br", anchor: null });
  });
  it("ตำแหน่งที่ลากไว้ชนะมุมสำเร็จรูป · ค่าเพี้ยนทิ้ง", () => {
    const p = parseWorkPopupFloatPref({ position: "tr", anchor: { h: "l", v: "b", x: 40.4, y: 12 } })!;
    expect(workPopupAnchor(p)).toEqual({ h: "l", v: "b", x: 40, y: 12 });
    expect(workPopupAnchor({ ...p, anchor: null })).toEqual({ h: "r", v: "t", x: 16, y: 64 });
    expect(parseCornerAnchor({ h: "x", v: "b", x: 1, y: 1 })).toBeNull();
    expect(parseCornerAnchor({ h: "l", v: "b", x: "1", y: 1 })).toBeNull();
  });
});

describe("anchorFromRect", () => {
  it("เกาะมุมจอที่ใกล้สุด + ระยะจากมุมนั้น", () => {
    expect(anchorFromRect({ left: 20, top: 30, right: 180, bottom: 70 }, 1440, 900)).toEqual({ h: "l", v: "t", x: 20, y: 30 });
    expect(anchorFromRect({ left: 1200, top: 820, right: 1400, bottom: 860 }, 1440, 900)).toEqual({ h: "r", v: "b", x: 40, y: 40 });
  });
});

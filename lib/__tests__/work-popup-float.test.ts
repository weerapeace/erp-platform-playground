import { describe, expect, it } from "vitest";
import { parseWorkPopupFloatPref, WORK_POPUP_FLOAT_DEFAULT } from "@/components/work-popup/float-pref";

describe("parseWorkPopupFloatPref", () => {
  it("ค่าเพี้ยน = null (ใช้ค่าตั้งต้น: เปิด · กาง · ขวาล่าง)", () => {
    expect(parseWorkPopupFloatPref(null)).toBeNull();
    expect(parseWorkPopupFloatPref("x")).toBeNull();
    expect(WORK_POPUP_FLOAT_DEFAULT).toEqual({ enabled: true, minimized: false, position: "br" });
  });
  it("อ่านค่าที่บันทึกไว้ · ช่องที่ขาดใช้ค่าตั้งต้น · มุมแปลก = ขวาล่าง", () => {
    expect(parseWorkPopupFloatPref({ enabled: false })).toEqual({ enabled: false, minimized: false, position: "br" });
    expect(parseWorkPopupFloatPref({ enabled: true, minimized: true, position: "tr" })).toEqual({ enabled: true, minimized: true, position: "tr" });
    expect(parseWorkPopupFloatPref({ position: "left" })).toEqual({ enabled: true, minimized: false, position: "br" });
  });
});

import { describe, expect, it } from "vitest";
import {
  CENTER_TABS, FLOAT_WIDTH_MAX, FLOAT_WIDTH_MIN, WORK_POPUP_FLOAT_DEFAULT,
  clampFloatWidth, floatLevel, nextWidthPreset, orderTabs, parseWorkPopupFloatPref, workPopupAnchor,
} from "@/components/work-popup/float-pref";
import { anchorFromRect, parseCornerAnchor } from "@/lib/use-corner-drag";

describe("parseWorkPopupFloatPref", () => {
  it("ค่าเพี้ยน = null (ใช้ค่าตั้งต้น: เปิด · กาง · ขวาล่าง)", () => {
    expect(parseWorkPopupFloatPref(null)).toBeNull();
    expect(parseWorkPopupFloatPref("x")).toBeNull();
    expect(WORK_POPUP_FLOAT_DEFAULT).toEqual({ enabled: false, minimized: false, position: "br", anchor: null, mode: "card" });
  });
  it("อ่านค่าที่บันทึกไว้ · ช่องที่ขาดใช้ค่าตั้งต้น · มุมแปลก = ขวาล่าง", () => {
    expect(parseWorkPopupFloatPref({ enabled: false })).toEqual({ enabled: false, minimized: false, position: "br", anchor: null, mode: "card" });
    expect(parseWorkPopupFloatPref({ enabled: true, minimized: true, position: "tr" })).toEqual({ enabled: true, minimized: true, position: "tr", anchor: null, mode: "card" });
    expect(parseWorkPopupFloatPref({ position: "left" })).toEqual({ enabled: false, minimized: false, position: "br", anchor: null, mode: "card" });
  });
  it("ตำแหน่งที่ลากไว้ชนะมุมสำเร็จรูป · ค่าเพี้ยนทิ้ง", () => {
    const p = parseWorkPopupFloatPref({ position: "tr", anchor: { h: "l", v: "b", x: 40.4, y: 12 } })!;
    expect(workPopupAnchor(p)).toEqual({ h: "l", v: "b", x: 40, y: 12 });
    expect(workPopupAnchor({ ...p, anchor: null, mode: "card" })).toEqual({ h: "r", v: "t", x: 16, y: 64 });
    expect(parseWorkPopupFloatPref({ mode: "drawer" })?.mode).toBe("drawer");
    expect(parseWorkPopupFloatPref({ mode: "x" })?.mode).toBe("card");
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

describe("ความกว้างการ์ด — ยิ่งกว้างยิ่งเตี้ย (2026-11-11)", () => {
  it("ระดับ: แคบ <460 · กลาง 460–599 · กว้าง ≥600", () => {
    expect(floatLevel(400)).toBe(1);
    expect(floatLevel(459)).toBe(1);
    expect(floatLevel(460)).toBe(2);
    expect(floatLevel(599)).toBe(2);
    expect(floatLevel(600)).toBe(3);
  });
  it("บีบให้อยู่ในช่วง และไม่เกินพื้นที่บนจอ (แต่ไม่ต่ำกว่าขั้นต่ำ)", () => {
    expect(clampFloatWidth(100)).toBe(FLOAT_WIDTH_MIN);
    expect(clampFloatWidth(5000)).toBe(FLOAT_WIDTH_MAX);
    expect(clampFloatWidth(700, 520)).toBe(520);
    expect(clampFloatWidth(700, 200)).toBe(FLOAT_WIDTH_MIN);
    expect(clampFloatWidth(Number.NaN)).toBe(400);
    expect(clampFloatWidth(512.6)).toBe(513);
  });
  it("ปุ่มสลับ: แคบ → กลาง → กว้าง → แคบ · จอไม่พอข้ามไปแคบ", () => {
    expect(nextWidthPreset(400)).toBe(520);
    expect(nextWidthPreset(520)).toBe(680);
    expect(nextWidthPreset(680)).toBe(400);
    expect(nextWidthPreset(450)).toBe(520);
    expect(nextWidthPreset(520, 600)).toBe(400);
  });
  it("อ่านค่าตั้งใหม่: width/tabOrder/tabHidden/hideImg · ค่าเพี้ยนทิ้ง", () => {
    const p = parseWorkPopupFloatPref({ width: 9999, tabOrder: ["bell", "work", "bell", 3, "BAD KEY"], tabHidden: [], hideImg: true })!;
    expect(p.width).toBe(FLOAT_WIDTH_MAX);
    expect(p.tabOrder).toEqual(["bell", "work"]);
    expect(p.tabHidden).toBeUndefined();
    expect(p.hideImg).toBe(true);
    const q = parseWorkPopupFloatPref({ width: "wide", hideImg: "yes" })!;
    expect(q.width).toBeUndefined();
    expect(q.hideImg).toBeUndefined();
  });
});

describe("orderTabs — ลำดับแท็บที่จัดเอง + แท็บที่ปิด", () => {
  const tabs = ["work", "tasks", "line", "bell", "gif"].map((key) => ({ key }));
  it("ไม่ได้จัด = ลำดับเดิม", () => {
    expect(orderTabs(tabs).map((t) => t.key)).toEqual(["work", "tasks", "line", "bell", "gif"]);
  });
  it("จัดแล้ว = ตามที่จัด · แท็บใหม่ที่ไม่อยู่ในลำดับต่อท้าย · key ที่ไม่มีแล้วไม่พัง", () => {
    expect(orderTabs(tabs, ["bell", "gone", "work"]).map((t) => t.key)).toEqual(["bell", "work", "tasks", "line", "gif"]);
  });
  it("ตัดแท็บที่ปิดไว้", () => {
    expect(orderTabs(tabs, ["gif", "work"], ["work", "line"]).map((t) => t.key)).toEqual(["gif", "tasks", "bell"]);
  });
  it("ทะเบียนแท็บไม่มี key ซ้ำ", () => {
    expect(new Set(CENTER_TABS.map((t) => t.key)).size).toBe(CENTER_TABS.length);
  });
});

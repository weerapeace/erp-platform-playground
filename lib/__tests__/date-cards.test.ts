import { describe, expect, it } from "vitest";
import { dateStatus, dateTimeline, dayNumber, thaiDateParts, todayIsoTh } from "@/lib/date-cards";

const TODAY = "2026-11-07";

describe("thaiDateParts", () => {
  it("แตกวันที่แบบไทย พ.ศ.", () => {
    expect(thaiDateParts("2026-11-12")).toMatchObject({ day: 12, month: "พ.ย.", yearShort: "69", yearBe: 2569, weekday: "พฤหัสฯ", text: "12 พ.ย. 69" });
    expect(thaiDateParts("")).toBeNull();
    expect(thaiDateParts("12/11/2026")).toBeNull();
  });
});

describe("dateStatus", () => {
  it("กำหนดการ: อีก/วันนี้/เลย + สีตามความใกล้", () => {
    expect(dateStatus("2026-11-12", "due", TODAY)).toEqual({ text: "อีก 5 วัน", tone: "ok" });
    expect(dateStatus("2026-11-09", "due", TODAY)).toEqual({ text: "อีก 2 วัน", tone: "warn" });
    expect(dateStatus(TODAY, "due", TODAY)).toEqual({ text: "วันนี้", tone: "warn" });
    expect(dateStatus("2026-11-05", "due", TODAY)).toEqual({ text: "เลยมา 2 วัน", tone: "bad" });
  });
  it("งานปิดแล้ว = ไม่เตือนสี", () => {
    expect(dateStatus("2026-11-05", "due", TODAY, true)?.tone).toBe("muted");
  });
  it("วันที่สั่ง = ผ่านมากี่วัน (ข้ามเดือนถูก ไม่ร่นตามเวลาไทย)", () => {
    expect(dateStatus("2026-07-21", "since", TODAY)).toEqual({ text: "ผ่านมา 109 วัน", tone: "muted" });
  });
});

describe("dateTimeline", () => {
  it("ผ่านไปกี่ % ของช่วง", () => {
    const tl = dateTimeline("2026-11-01", "2026-11-11", TODAY)!;
    expect(tl).toEqual({ pct: 60, elapsed: 6, total: 10, over: false });
  });
  it("เลยกำหนด = 100% + over", () => {
    expect(dateTimeline("2026-10-01", "2026-11-01", TODAY)).toMatchObject({ pct: 100, over: true });
  });
  it("ข้อมูลไม่พอ / วันกำหนดก่อนวันเริ่ม = null", () => {
    expect(dateTimeline("", "2026-11-01", TODAY)).toBeNull();
    expect(dateTimeline("2026-11-05", "2026-11-01", TODAY)).toBeNull();
  });
});

describe("todayIsoTh / dayNumber", () => {
  it("เที่ยงคืนครึ่งเวลาไทย (17:30 UTC ของวันก่อน) = วันใหม่แล้ว", () => {
    expect(todayIsoTh(new Date("2026-11-06T17:30:00Z"))).toBe("2026-11-07");
    expect(dayNumber("2026-11-07")! - dayNumber("2026-11-06")!).toBe(1);
  });
});

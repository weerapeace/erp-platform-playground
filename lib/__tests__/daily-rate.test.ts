import { describe, it, expect } from "vitest";
import { daysBetween, staleRateDays, latestActiveRate, planSetDailyRate, validRate, RATE_STALE_DAYS } from "@/lib/daily-rate";

describe("เรทกลางเก่าแค่ไหน (ข้อเสนอ 1)", () => {
  it("เคสจริง: เรทล่าสุด 13/11 ใบวันที่ 22/11 → เก่า 9 วัน", () => {
    expect(daysBetween("2026-11-13", "2026-11-22")).toBe(9);
    expect(staleRateDays("2026-11-13", "2026-11-22")).toBe(9);
  });
  it("ไม่เกิน 3 วัน / วันที่ไม่ครบ = ไม่เตือน", () => {
    expect(RATE_STALE_DAYS).toBe(3);
    expect(staleRateDays("2026-11-19", "2026-11-22")).toBeNull();
    expect(staleRateDays(null, "2026-11-22")).toBeNull();
    expect(staleRateDays("2026-11-13T06:55:54Z", "2026-11-22")).toBe(9);
  });
  it("ข้ามเดือน/ปี", () => { expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3); });
});

describe("เรทกลางล่าสุด", () => {
  it("ข้ามแถวที่ปิด / เรท 0", () => {
    const rows = [{ id: "a", rate_date: "2026-11-20", rate: 5.3, is_active: false }, { id: "b", rate_date: "2026-11-13", rate: "5.21" }, { id: "c", rate_date: "2026-11-21", rate: 0 }];
    expect(latestActiveRate(rows)?.id).toBe("b");
  });
});

describe("ตั้งเรทกลางของวันนี้ (rate_date ห้ามซ้ำ)", () => {
  const rows = [{ id: "t", rate_date: "2026-11-22", rate: 5.25, is_active: true }, { id: "o", rate_date: "2026-11-13", rate: 5.21 }];
  it("ยังไม่มีแถววันนี้ = เพิ่มใหม่", () => { expect(planSetDailyRate(rows.slice(1), "2026-11-22", 5.3)).toEqual({ mode: "create" }); });
  it("มีแล้ว = แก้แถวเดิม + เก็บค่าเดิมไว้ย้อนกลับ", () => { expect(planSetDailyRate(rows, "2026-11-22", 5.3)).toEqual({ mode: "update", id: "t", before: { rate: 5.25, is_active: true } }); });
  it("แถววันนี้ถูกปิดไว้ = เปิดกลับ (ย้อนกลับ = ปิดอีกครั้ง)", () => {
    expect(planSetDailyRate([{ id: "t", rate_date: "2026-11-22", rate: 5.25, is_active: false }], "2026-11-22", 5.25)).toEqual({ mode: "update", id: "t", before: { rate: 5.25, is_active: false } });
  });
  it("เรทเท่าเดิม = ไม่ทำอะไร", () => { expect(planSetDailyRate(rows, "2026-11-22", 5.25)).toEqual({ mode: "same" }); });
});

describe("เรทที่พิมพ์", () => {
  it("ต้องมากกว่า 0 · ปัด 4 ตำแหน่ง", () => {
    expect(validRate("0").ok).toBe(false);
    expect(validRate("abc").ok).toBe(false);
    expect(validRate("5.212345").rate).toBe(5.2123);
  });
  it("ต่างจากเรทกลางมาก = เตือนพิมพ์ผิดหลัก (ยังใช้ได้)", () => {
    expect(validRate("52.1", 5.21)).toMatchObject({ ok: true, warn: expect.stringContaining("พิมพ์ผิดหลัก") });
    expect(validRate("5.3", 5.21).warn).toBeNull();
  });
});

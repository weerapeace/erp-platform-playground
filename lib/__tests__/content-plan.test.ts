import { describe, it, expect } from "vitest";
import { stageOf, datesForWeekday, bangkokDateKey, bangkokIso, planSlotsForMonth, targetProgress, type PlanSlot, type PlanTarget } from "@/lib/marketing/content-plan";

describe("content-plan helpers", () => {
  it("stageOf: ขั้นคิดจากสถานะเดิม", () => {
    expect(stageOf({ status: "draft", task_id: null })).toBe("idea");
    expect(stageOf({ status: "draft", task_id: "t1" })).toBe("making");
    expect(stageOf({ status: "ready" })).toBe("ready");
    expect(stageOf({ status: "cancelled" })).toBeNull();
  });

  it("datesForWeekday: ต.ค. 2026 วันจันทร์ = 5,12,19,26 · อาทิตย์ = 4,11,18,25", () => {
    expect(datesForWeekday("2026-10", 0)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(datesForWeekday("2026-10", 6)).toEqual(["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
  });

  it("เวลาไทย: 23:30 น. ไทย ยังเป็นวันเดียวกัน (ไม่ร่น/ไม่เลื่อนวัน)", () => {
    const iso = bangkokIso("2026-10-31", "23:30");
    expect(iso).toBe("2026-10-31T16:30:00.000Z");
    expect(bangkokDateKey(iso)).toBe("2026-10-31");
    expect(bangkokDateKey("2026-10-31T17:30:00.000Z")).toBe("2026-11-01");   // 00:30 ไทยของวันถัดไป
  });

  it("planSlotsForMonth: ข้ามวันที่ผ่านแล้ว + ที่เคยสร้างแล้ว", () => {
    const slot: PlanSlot = { id: "s1", brand_id: "b", weekday: 0, post_time: "19:00", platform: "instagram", post_type: "reel", pillar_id: null, title: "สินค้าใหม่", is_active: true };
    const off: PlanSlot = { ...slot, id: "s2", is_active: false };
    const r = planSlotsForMonth([slot, off], "2026-10", new Set(["s1|2026-10-19"]), "2026-10-12");
    expect(r.create.map((c) => c.date)).toEqual(["2026-10-12", "2026-10-26"]);
    expect(r.skippedPast).toBe(1);       // 5 ต.ค.
    expect(r.skippedExisting).toBe(1);   // 19 ต.ค.
    expect(r.create[0]).toMatchObject({ slot_id: "s1", time: "19:00", platform: "instagram", post_type: "reel", title: "สินค้าใหม่" });
  });

  it("targetProgress: นับตามแบรนด์ + ช่องทาง + รูปแบบ + เดือน (เวลาไทย)", () => {
    const t: PlanTarget = { id: "t", brand_id: "b", platform: "instagram", post_type: "reel", monthly_count: 8 };
    const items = [
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: bangkokIso("2026-10-05", "10:00"), status: "draft" },
      { brand_id: "b", platforms: ["instagram", "tiktok"], post_type: "image,reel", scheduled_at: bangkokIso("2026-10-31", "23:30"), status: "published" },
      { brand_id: "b", platforms: ["instagram"], post_type: "image", scheduled_at: bangkokIso("2026-10-06", "10:00"), status: "draft" },     // รูปแบบไม่ตรง
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: bangkokIso("2026-11-01", "00:30"), status: "draft" },      // เดือนหน้า
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: bangkokIso("2026-10-07", "10:00"), status: "cancelled" },  // ยกเลิก
      { brand_id: "x", platforms: ["instagram"], post_type: "reel", scheduled_at: bangkokIso("2026-10-07", "10:00"), status: "draft" },      // แบรนด์อื่น
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: null, status: "draft" },                                   // ยังไม่ลงวัน
    ];
    expect(targetProgress(t, items, "2026-10")).toEqual({ planned: 2, published: 1 });
    expect(targetProgress({ ...t, post_type: null }, items, "2026-10")).toEqual({ planned: 3, published: 1 });
  });
});

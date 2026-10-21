import { describe, it, expect } from "vitest";
import { stageOf, datesForWeekday, bangkokDateKey, bangkokIso, planSlotsForMonth, targetProgress, dateKeyOf, timeOf, toScheduledIso, type PlanSlot, type PlanTarget } from "@/lib/marketing/content-plan";

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
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: toScheduledIso("2026-10-05", "10:00"), status: "draft" },
      { brand_id: "b", platforms: ["instagram", "tiktok"], post_type: "image,reel", scheduled_at: toScheduledIso("2026-10-31", "23:30"), status: "published" },
      { brand_id: "b", platforms: ["instagram"], post_type: "image", scheduled_at: toScheduledIso("2026-10-06", "10:00"), status: "draft" },     // รูปแบบไม่ตรง
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: toScheduledIso("2026-11-01", "00:30"), status: "draft" },      // เดือนหน้า
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: toScheduledIso("2026-10-07", "10:00"), status: "cancelled" },  // ยกเลิก
      { brand_id: "x", platforms: ["instagram"], post_type: "reel", scheduled_at: toScheduledIso("2026-10-07", "10:00"), status: "draft" },      // แบรนด์อื่น
      { brand_id: "b", platforms: ["instagram"], post_type: "reel", scheduled_at: null, status: "draft" },                                   // ยังไม่ลงวัน
    ];
    expect(targetProgress(t, items, "2026-10")).toEqual({ planned: 2, published: 1 });
    expect(targetProgress({ ...t, post_type: null }, items, "2026-10")).toEqual({ planned: 3, published: 1 });
  });

  it("targetProgress: ระบุประเภทการลง = นับเฉพาะที่ติ๊กประเภทนั้นบนช่องทางนั้น", () => {
    const t: PlanTarget = { id: "t", brand_id: "b", placement_type: "shop_decor", platform: "shopee", post_type: null, monthly_count: 2 };
    const at = bangkokIso("2026-10-10", "10:00");
    const items = [
      { brand_id: "b", platforms: ["shopee"], placements: ["shop_decor:shopee"], scheduled_at: at, status: "published" },
      { brand_id: "b", platforms: ["shopee", "lazada"], placements: ["product:shopee", "shop_decor:lazada"], scheduled_at: at, status: "draft" }, // แต่งร้านแต่คนละช่องทาง
      { brand_id: "b", platforms: ["shopee"], placements: [], scheduled_at: at, status: "draft" },                                                // ไม่ระบุประเภท
    ];
    expect(targetProgress(t, items, "2026-10")).toEqual({ planned: 1, published: 1 });
    expect(targetProgress({ ...t, placement_type: null }, items, "2026-10")).toEqual({ planned: 3, published: 1 });
  });
});

import { platformsFromPlacements, placementLabelsFor, parsePlacement, DEFAULT_PLACEMENTS } from "@/lib/marketing/content-plan";
describe("placements (ลงที่ไหน แบบแบ่งประเภท)", () => {
  it("parsePlacement / platformsFromPlacements รวมช่องทางไม่ซ้ำ + คงช่องทางเดิมที่ไม่มีประเภท", () => {
    expect(parsePlacement("story:instagram")).toEqual({ type: "story", platform: "instagram" });
    expect(parsePlacement("bad")).toBeNull();
    expect(platformsFromPlacements(["shop_decor:shopee", "product:shopee", "story:facebook"], ["line_oa"])).toEqual(["shopee", "facebook", "line_oa"]);
  });
  it("placementLabelsFor: ป้ายเฉพาะช่องทางของแถว", () => {
    const pl = ["shop_decor:shopee", "product:shopee", "story:facebook"];
    expect(placementLabelsFor(pl, "shopee", DEFAULT_PLACEMENTS)).toEqual(["🏪 แต่งร้าน", "🛍️ ในสินค้า"]);
    expect(placementLabelsFor(pl, null, DEFAULT_PLACEMENTS)).toEqual(["🏪 แต่งร้าน", "🛍️ ในสินค้า", "📱 Story"]);
  });
});

describe("scheduled_at = เวลาไทยตามนาฬิกา (ข้อตกลงเดียวกับป๊อปคอนเทนต์/ปฏิทิน)", () => {
  it("อ่านได้ทั้งค่าที่บันทึกจากฟอร์ม และค่าที่ DB ส่งกลับ (+00:00)", () => {
    expect(dateKeyOf("2026-10-21T18:00")).toBe("2026-10-21");
    expect(dateKeyOf("2026-10-21T18:00:00+00:00")).toBe("2026-10-21");   // โพสต์ 6 โมงเย็น ไม่เลื่อนไปวันถัดไป
    expect(timeOf("2026-10-21T18:00:00+00:00")).toBe("18:00");
    expect(dateKeyOf(null)).toBeNull();
    expect(dateKeyOf("bad")).toBeNull();
    expect(timeOf(undefined, "09:00")).toBe("09:00");
  });
  it("toScheduledIso → รูปเดียวกับฟอร์ม และอ่านกลับได้ค่าเดิม", () => {
    const v = toScheduledIso("2026-10-31", "23:30");
    expect(v).toBe("2026-10-31T23:30:00");
    expect(dateKeyOf(v)).toBe("2026-10-31");
    expect(timeOf(v)).toBe("23:30");
    expect(toScheduledIso("2026-01-05", "9:5")).toBe("2026-01-05T09:05:00");
  });
});

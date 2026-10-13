import { describe, it, expect } from "vitest";
import { refreshStatus, refreshStatuses, refreshRuleMatches, bangkokIso, type RefreshRule } from "@/lib/marketing/content-plan";

const rule = (p: Partial<RefreshRule> = {}): RefreshRule => ({
  id: "r1", brand_id: "b1", placement_type: "shop_decor", platform: "shopee", every_days: 14, lead_days: 3, title: "แบนเนอร์ร้าน", is_active: true, ...p,
});
const item = (id: string, date: string, status = "published", p: Record<string, unknown> = {}) => ({
  id, title: id, brand_id: "b1", platforms: ["shopee"], placements: ["shop_decor:shopee"], scheduled_at: bangkokIso(date, "10:00"), status, ...p,
});
const TODAY = "2026-10-13";

describe("รอบเปลี่ยน (refresh rules)", () => {
  it("จับคู่: แบรนด์ + ประเภท:ช่องทาง · ไม่นับที่ยกเลิก/ไม่มีวัน · ประเภทว่าง = ทุกประเภทบนช่องทางนั้น", () => {
    expect(refreshRuleMatches(rule(), item("a", "2026-10-01"))).toBe(true);
    expect(refreshRuleMatches(rule(), item("a", "2026-10-01", "cancelled"))).toBe(false);
    expect(refreshRuleMatches(rule(), item("a", "2026-10-01", "published", { brand_id: "b2" }))).toBe(false);
    expect(refreshRuleMatches(rule(), item("a", "2026-10-01", "published", { placements: ["product:shopee"] }))).toBe(false);
    expect(refreshRuleMatches(rule({ placement_type: null }), item("a", "2026-10-01", "published", { placements: [] }))).toBe(true);
    expect(refreshRuleMatches(rule(), { id: "x", brand_id: "b1", placements: ["shop_decor:shopee"], scheduled_at: null, status: "draft" })).toBe(false);
  });

  it("ยังไม่เคยทำ + ไม่มีของลงวัน = never · วันแนะนำ = วันนี้", () => {
    const s = refreshStatus(rule(), [], TODAY);
    expect(s.state).toBe("never");
    expect(s.suggestDate).toBe(TODAY);
  });

  it("ทำล่าสุด 1 ต.ค. ทุก 14 วัน → ครบรอบ 15 ต.ค. (อีก 2 วัน ≤ เตือนล่วงหน้า 3) = due_soon", () => {
    const s = refreshStatus(rule(), [item("a", "2026-10-01")], TODAY);
    expect(s.lastDone).toBe("2026-10-01");
    expect(s.nextDue).toBe("2026-10-15");
    expect(s.daysLeft).toBe(2);
    expect(s.state).toBe("due_soon");
    expect(s.suggestDate).toBe("2026-10-15");
  });

  it("ยังไกลรอบ = waiting · เลยรอบ = overdue (วันแนะนำ = วันนี้)", () => {
    expect(refreshStatus(rule(), [item("a", "2026-10-10")], TODAY).state).toBe("waiting");
    const s = refreshStatus(rule(), [item("a", "2026-09-20")], TODAY);
    expect(s.state).toBe("overdue");
    expect(s.daysLeft).toBe(-9);
    expect(s.suggestDate).toBe(TODAY);
  });

  it("ลงวันไว้แล้ว (ขั้นไหนก็ได้) ทันรอบ = prepared · ช้ากว่ารอบ = late_plan", () => {
    const done = item("a", "2026-10-01");
    expect(refreshStatus(rule(), [done, item("b", "2026-10-15", "draft")], TODAY).state).toBe("prepared");
    const late = refreshStatus(rule(), [done, item("b", "2026-10-20", "draft")], TODAY);
    expect(late.state).toBe("late_plan");
    expect(late.prepared?.id).toBe("b");
  });

  it("ไอเดียวันที่ผ่านมาแล้วแต่ยังไม่ถึงขั้นพร้อม ไม่นับว่าทำแล้ว", () => {
    expect(refreshStatus(rule(), [item("a", "2026-10-05", "draft")], TODAY).state).toBe("never");
  });

  it("เรียงด่วนสุดก่อน และข้ามกฎที่ปิดอยู่", () => {
    const list = refreshStatuses([
      rule({ id: "wait" }),
      rule({ id: "off", is_active: false }),
      rule({ id: "late", platform: "lazada" }),
    ], [item("a", "2026-10-10"), item("c", "2026-09-01", "published", { platforms: ["lazada"], placements: ["shop_decor:lazada"] })], TODAY);
    expect(list.map((s) => s.rule.id)).toEqual(["late", "wait"]);
    expect(list[0].state).toBe("overdue");
  });
});

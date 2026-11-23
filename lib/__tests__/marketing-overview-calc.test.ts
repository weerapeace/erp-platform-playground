import { describe, expect, it } from "vitest";
import {
  abcClassify, buildMarketingAlerts, campaignDaysBetween, campaignResult, cancelReasonGroup, changePct, comparePeriods,
  daysInclusive, groupCancelReasons, paceToTarget, significantFalls, topHeatCells, trendOf, weekHourHeatmap,
} from "@/lib/marketing-overview-calc";

describe("marketing-overview-calc", () => {
  it("ความเร็วถึงเป้า", () => {
    const p = paceToTarget(899_000, 1_300_000, "2026-11-23");
    expect(p.daysInMonth).toBe(30);
    expect(p.daysLeft).toBe(7);
    expect(Math.round(p.expectedByNow!)).toBe(996_667);
    expect(Math.round(p.needPerDay!)).toBe(Math.round(401_000 / 8));
    expect(Math.round(p.forecast)).toBe(Math.round((899_000 / 23) * 30));
    const none = paceToTarget(500, null, "2026-11-23");
    expect(none.pct).toBeNull();
    expect(none.needPerDay).toBeNull();
  });

  it("เทียบช่วงเวลา (ช่วงก่อน · เดือนก่อน · ปีก่อน · เดือนสั้นกว่า)", () => {
    expect(daysInclusive("2026-11-01", "2026-11-23")).toBe(23);
    expect(comparePeriods("2026-11-01", "2026-11-23")).toEqual({
      prev: { from: "2026-10-09", to: "2026-10-31" },
      lastMonth: { from: "2026-10-01", to: "2026-10-23" },
      lastYear: { from: "2025-11-01", to: "2025-11-23" },
    });
    expect(comparePeriods("2026-03-31", "2026-03-31").lastMonth).toEqual({ from: "2026-02-28", to: "2026-02-28" });
    expect(comparePeriods("2026-01-05", "2026-01-10").lastMonth.from).toBe("2025-12-05");
    expect(changePct(110, 100)).toBeCloseTo(0.1);
    expect(changePct(5, 0)).toBeNull();
  });

  it("แผนที่ความร้อน: วันไทย จันทร์=0 · ชั่วโมงไทย", () => {
    // 2026-11-23 เป็นวันจันทร์ · 13:00Z = 20:00 ไทย · 2026-11-22T18:30Z = จันทร์ 01:30 ไทย
    const g = weekHourHeatmap([{ ordered_at: "2026-11-23T13:00:00Z", v: 100 }, { ordered_at: "2026-11-22T18:30:00Z", v: 50 }, { ordered_at: null, v: 9 }], (o) => o.v);
    expect(g[0][20]).toBe(100);
    expect(g[0][1]).toBe(50);
    expect(topHeatCells(g, 1)).toEqual([{ day: 0, hour: 20, value: 100 }]);
  });

  it("จัดกลุ่มเหตุผลยกเลิก (ไทย/อังกฤษ)", () => {
    expect(cancelReasonGroup("Seller did not Ship")).toBe("store");
    expect(cancelReasonGroup("Out of Stock")).toBe("store");
    expect(cancelReasonGroup("Unpaid Order")).toBe("unpaid");
    expect(cancelReasonGroup("ลูกค้าปล่อยไว้จนเกินกำหนดชำระเงิน")).toBe("unpaid");
    expect(cancelReasonGroup("Modify existing order (colour, size, address, voucher, etc.)")).toBe("modify");
    expect(cancelReasonGroup("Need to input / Change Voucher Code")).toBe("modify");
    expect(cancelReasonGroup("จำเป็นต้องเปลี่ยนสีหรือขนาด")).toBe("modify");
    expect(cancelReasonGroup("Found Cheaper Elsewhere")).toBe("cheaper");
    expect(cancelReasonGroup("Parcel lost in transit. The eligible compensation has been credited")).toBe("delivery");
    expect(cancelReasonGroup("การจัดส่งพัสดุไม่สำเร็จ")).toBe("delivery");
    expect(cancelReasonGroup("Others / change of mind")).toBe("changed_mind");
    expect(cancelReasonGroup("ไม่ต้องการแล้ว")).toBe("changed_mind");
    expect(cancelReasonGroup("Others")).toBe("other");
    expect(cancelReasonGroup(null)).toBe("other");
    const rows = groupCancelReasons(["Out of Stock", "Seller did not Ship", "Out of Stock", "Unpaid Order", null]);
    expect(rows[0]).toMatchObject({ key: "store", count: 3, storeFault: true });
    expect(rows[0].reasons[0]).toEqual({ reason: "Out of Stock", count: 2 });
    expect(rows.find((r) => r.key === "other")?.reasons[0].reason).toBe("ไม่ระบุ");
  });

  it("80/20 (ABC)", () => {
    const r = abcClassify([{ k: "c", sales: 5 }, { k: "a", sales: 70 }, { k: "b", sales: 20 }, { k: "d", sales: 5 }]);
    expect(r.map((x) => `${x.k}${x.abc}`)).toEqual(["aA", "bA", "cB", "dC"]);
    expect(abcClassify([{ sales: 0 }])[0].abc).toBe("C");
  });

  it("ดาวรุ่ง / กำลังตก", () => {
    expect(trendOf(140, 100).trend).toBe("rising");
    expect(trendOf(38, 100).trend).toBe("falling");
    expect(trendOf(110, 100).trend).toBe("steady");
    expect(trendOf(50, 0, { minBase: 10 }).trend).toBe("new");
    expect(trendOf(0, 50, { minBase: 10 }).trend).toBe("gone");
    expect(trendOf(3, 1, { minBase: 1000 }).trend).toBe("steady");   // ยอดน้อย แกว่งไม่นับ
  });

  it("วันพิเศษ + ผลแคมเปญ", () => {
    const days = campaignDaysBetween("2026-10-20", "2026-11-23");
    expect(days.map((d) => d.label)).toEqual(["กลางเดือน 15.11", "11.11", "เงินเดือนออก 25.10"]);
    expect(days.find((d) => d.date === "2026-11-11")?.label).toBe("11.11");
    expect(days.some((d) => d.date === "2026-11-15")).toBe(true);
    expect(days[0].date >= days[days.length - 1].date).toBe(true);

    const daily = new Map<string, { sales: number; orders: number }>();
    for (let i = -14; i <= -8; i++) daily.set(new Date(Date.parse("2026-11-11T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), { sales: 40_000, orders: 80 });
    for (const d of ["2026-11-08", "2026-11-09", "2026-11-10"]) daily.set(d, { sales: 30_000, orders: 60 });
    daily.set("2026-11-11", { sales: 140_000, orders: 258 });
    const r = campaignResult(daily, "2026-11-11");
    expect(r.baseline).toBe(40_000);
    expect(r.lift).toBe(3.5);
    expect(r.preChange).toBeCloseTo(-0.25);
    expect(r.postChange).toBe(-1);
    expect(r.series).toHaveLength(15);
    expect(r.series[7]).toMatchObject({ date: "2026-11-11", offset: 0, sales: 140_000 });
  });

  it("สินค้า A ที่ตกจริง (ยอดหายเป็นเงินก้อน)", () => {
    const rows = [
      { k: "big", abc: "A" as const, trend: "falling" as const, cur: 3000, prev: 9000 },
      { k: "tiny", abc: "A" as const, trend: "falling" as const, cur: 600, prev: 1200 },
      { k: "gone", abc: "A" as const, trend: "gone" as const, cur: 0, prev: 20000 },
      { k: "b", abc: "B" as const, trend: "falling" as const, cur: 0, prev: 50000 },
      { k: "up", abc: "A" as const, trend: "rising" as const, cur: 9000, prev: 3000 },
    ];
    expect(significantFalls(rows, 100_000).map((r) => r.k)).toEqual(["gone", "big"]);
    expect(significantFalls(rows, 2_000_000).map((r) => r.k)).toEqual(["gone"]);   // 0.5% = 10,000
  });

  it("แจ้งเตือน", () => {
    const pace = paceToTarget(800_000, 1_300_000, "2026-11-23");
    const a = buildMarketingAlerts({ pace, yesterday: 10_000, avgDaily28: 40_000, storeFaultCancels7d: 4, fallingA: [{ name: "LM-1", change: -0.6 }] });
    expect(a.map((x) => x.key)).toEqual(["behind_target", "sales_drop", "store_cancel", "falling_a"]);
    expect(a[2].level).toBe("danger");
    const ok = buildMarketingAlerts({ pace: paceToTarget(1_000_000, 1_300_000, "2026-11-23"), yesterday: 40_000, avgDaily28: 40_000, storeFaultCancels7d: 0, fallingA: [] });
    expect(ok).toEqual([]);
  });
});

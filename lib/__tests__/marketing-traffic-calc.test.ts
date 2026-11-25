import { describe, expect, it } from "vitest";
import { dailyDeltas, flagItems, ratingDrops, viewSpikes, type ItemSnap } from "../marketing-traffic-calc";
import { parseItemExtra } from "../marketing-traffic-server";

const snap = (item_id: string, date: string, views: number, extra: Partial<ItemSnap> = {}): ItemSnap => ({ item_id, brand_id: "b", date, views, likes: 0, sales: 0, rating: 4.9, comments: 10, ...extra });

describe("ยอดรายวันจากยอดสะสม", () => {
  it("ต้องมีวันก่อนติดกัน · ติดลบ = 0", () => {
    const d = dailyDeltas([snap("1", "2026-11-24", 100), snap("1", "2026-11-25", 130, { likes: 2 }), snap("1", "2026-11-27", 150), snap("2", "2026-11-25", 50), snap("2", "2026-11-26", 40)]);
    expect(d).toEqual([
      { item_id: "1", date: "2026-11-25", views: 30, likes: 2, comments: 0 },
      { item_id: "2", date: "2026-11-26", views: 0, likes: 0, comments: 0 },
    ]);
  });
});

describe("ป้ายสินค้า", () => {
  it("คนดูเยอะขายน้อย / ขายดีคนดูน้อย", () => {
    const base = [100, 120, 90, 110, 95, 105, 130, 115].map((v, i) => ({ item_id: String(i), views: v, likes: 0, newReviews: 0, units: 3, rating: null }));
    const rows = flagItems([...base, { item_id: "hi", views: 900, likes: 0, newReviews: 0, units: 1, rating: null }, { item_id: "sell", views: 40, likes: 0, newReviews: 0, units: 20, rating: null }]);
    expect(rows.find((r) => r.item_id === "hi")!.flag).toBe("many_views_low_sales");
    expect(rows.find((r) => r.item_id === "sell")!.flag).toBe("selling_low_views");
    expect(flagItems(base.slice(0, 3)).every((r) => r.flag === null)).toBe(true);
  });
});

describe("เตือน", () => {
  it("ดาวตก / ดาวต่ำ", () => {
    const r = ratingDrops([snap("1", "d", 0, { rating: 4.7 }), snap("2", "d", 0, { rating: 4.3 }), snap("3", "d", 0, { rating: 4.2, comments: 2 })], [snap("1", "p", 0, { rating: 4.8 })]);
    expect(r.map((x) => [x.item_id, x.reason])).toEqual([["1", "dropped"], ["2", "low"]]);
  });
  it("คนดูพุ่ง ≥ 3 เท่า และ ≥ 50", () => {
    const days = [20, 22, 18, 25].map((v, i) => ({ item_id: "1", date: `2026-11-2${i}`, views: v, likes: 0, comments: 0 }));
    expect(viewSpikes([...days, { item_id: "1", date: "2026-11-24", views: 90, likes: 0, comments: 0 }], "2026-11-24")).toHaveLength(1);
    expect(viewSpikes([...days, { item_id: "1", date: "2026-11-24", views: 40, likes: 0, comments: 0 }], "2026-11-24")).toHaveLength(0);
  });
  it("แปลงคำตอบ get_item_extra_info", () => {
    expect(parseItemExtra({ response: { item_list: [{ item_id: 25, sale: 1, views: 2, likes: 3, rating_star: 4.02, comment_count: 5 }, { item_id: 26, rating_star: 0 }] } }))
      .toEqual([{ item_id: "25", views: 2, likes: 3, sales: 1, rating: 4.02, comments: 5 }, { item_id: "26", views: 0, likes: 0, sales: 0, rating: null, comments: 0 }]);
  });
});

import { describe, expect, it } from "vitest";
import { affiliateByProduct, appendHistory, engagementOf, postSummary, priceGap, reviewSummary, reviewsByItem } from "../marketing-content-calc";
import { parseComments, parseFbPosts, parseIgMedia } from "../marketing-content-server";

describe("รีวิว", () => {
  const rows = [
    { item_id: "1", rating: 5, reply: "ขอบคุณ", images: ["a"], created_at_shop: "2026-11-20T00:00:00Z" },
    { item_id: "1", rating: 2, reply: null, images: null, created_at_shop: "2026-11-21T00:00:00Z" },
    { item_id: "2", rating: 3, reply: null, images: [], created_at_shop: "2026-11-22T00:00:00Z" },
    { item_id: "2", rating: 4, reply: null, images: null, created_at_shop: "2026-11-23T00:00:00Z" },
  ];
  it("สรุป", () => {
    const s = reviewSummary(rows);
    expect(s).toMatchObject({ count: 4, dist: [0, 1, 1, 1, 1], replyRate: 0.25, lowOpen: 2, withPhotos: 1 });
    expect(s.avg).toBeCloseTo(3.5);
  });
  it("ต่อสินค้า", () => {
    const b = reviewsByItem(rows);
    expect(b.map((x) => [x.item_id, x.lowOpen])).toEqual([["1", 1], ["2", 1]]);
    expect(b[0].last).toBe("2026-11-21T00:00:00Z");
  });
  it("แปลงคำตอบ get_comment", () => {
    const r = parseComments({ response: { more: true, next_cursor: "20", item_comment_list: [{ comment_id: 12, comment: "ok", buyer_username: "tom", item_id: 165, rating_star: 2, hidden: false, create_time: 1603153057, comment_reply: { reply: "ขอโทษครับ", create_time: 1712053073 }, media: { image_url_list: ["x.jpg"] } }] } });
    expect(r.more).toBe(true);
    expect(r.next).toBe("20");
    expect(r.rows[0]).toMatchObject({ comment_id: "12", item_id: "165", rating: 2, reply: "ขอโทษครับ", images: ["x.jpg"], created_at_shop: "2020-10-20T00:17:37.000Z" });
  });
});

describe("โพสต์", () => {
  it("FB / IG + สรุป", () => {
    const fb = parseFbPosts([{ id: "p1", message: "โปร", created_time: "2026-11-20T10:00:00+0000", reactions: { summary: { total_count: 30 } }, comments: { summary: { total_count: 4 } }, shares: { count: 2 } }]);
    const ig = parseIgMedia([{ id: "m1", caption: "รีวิว", timestamp: "2026-11-21T10:00:00+0000", media_type: "VIDEO", like_count: 50, comments_count: 5 }]);
    expect(fb[0]).toMatchObject({ post_id: "p1", likes: 30, comments: 4, shares: 2 });
    expect(ig[0]).toMatchObject({ post_id: "m1", media_type: "video", likes: 50 });
    expect(engagementOf(fb[0] as never)).toBe(36);
    const s = postSummary([{ platform: "facebook", likes: 30, comments: 4, shares: 2, views: null, posted_at: null }, { platform: "instagram", likes: 50, comments: 5, shares: 0, views: null, posted_at: null }]);
    expect(s.map((x) => [x.platform, x.engagement])).toEqual([["instagram", 55], ["facebook", 36]]);
  });
});

describe("แอฟฟิลิเอต", () => {
  it("ปันส่วนค่าคอมตามมูลค่าบรรทัด · ไม่นับออเดอร์ที่ไม่มีค่าคอม", () => {
    const r = affiliateByProduct([
      { order_id: "o1", product: "A", value: 300 }, { order_id: "o1", product: "B", value: 100 }, { order_id: "o2", product: "A", value: 500 },
    ], new Map([["o1", 40]]));
    expect(r).toEqual([{ product: "A", orders: 1, sales: 300, commission: 30, rate: 0.1 }, { product: "B", orders: 1, sales: 100, commission: 10, rate: 0.1 }]);
  });
});

describe("คู่แข่ง", () => {
  it("ประวัติ + ส่วนต่างราคา", () => {
    const h = appendHistory([], { price: 500, rating: 4.8, sold: 10 }, { price: 450, rating: 4.8, sold: 12 }, "t1");
    expect(h).toEqual([{ at: "t1", price: 450, rating: 4.8, sold: 12 }]);
    expect(appendHistory(h, { price: 450, rating: 4.8, sold: 12 }, { price: 450, rating: 4.8, sold: 12 }, "t2")).toHaveLength(1);
    expect(priceGap(550, 500)).toBeCloseTo(0.1);
    expect(priceGap(null, 500)).toBeNull();
  });
});

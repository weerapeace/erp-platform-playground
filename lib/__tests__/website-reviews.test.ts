import { describe, it, expect, beforeAll } from "vitest";
import { autoApprove, cleanEntry, publicAuthor, reviewPoints, summarize } from "../website-reviews";
import { issueReviewToken, verifyReviewToken, reviewUrl } from "../review-token";
import { cleanSynonyms, normalizeSiteInfo, publicSiteInfo } from "../website-site-info";
import { aggregateTerms, cleanSearchTerm } from "../website-search-terms";
import { orderMessage, type MessageOrder } from "../customer-messages";

/** ⭐ รีวิวสินค้า + 🔍 คำค้น + 💬 แชทลอย (ชุด 2 · 2026-10-21) */
describe("รีวิว: กฎ", () => {
  it("สรุปดาว: เฉลี่ยทศนิยม 1 ตำแหน่ง · นับแยกดาว · ข้ามค่าผิด", () => {
    expect(summarize([5, 4, 4, 0, 9, 3])).toEqual({ avg: 4, count: 4, dist: [0, 0, 1, 2, 1] });
    expect(summarize([])).toEqual({ avg: 0, count: 0, dist: [0, 0, 0, 0, 0] });
    expect(summarize([5, 4]).avg).toBe(4.5);
  });

  it("ชื่อบนเว็บ: ชื่อแรก + อักษรแรกนามสกุล · อีเมล/เบอร์ไม่โชว์", () => {
    expect(publicAuthor("สมชาย ใจดี")).toBe("สมชาย ใ.");
    expect(publicAuthor("Ann")).toBe("Ann");
    expect(publicAuthor("a@b.co")).toBe("ลูกค้า");
    expect(publicAuthor("0812345678", "en")).toBe("Customer");
    expect(publicAuthor("")).toBe("ลูกค้า");
  });

  it("รับค่ารีวิว: ดาว 1–5 เท่านั้น · ตัดแท็ก HTML · รหัสตัวใหญ่", () => {
    expect(cleanEntry({ code: " roar01 ", rating: 5, body: "ดีมาก <script>x</script>" })).toEqual({ code: "ROAR01", rating: 5, body: "ดีมาก x" });
    expect(cleanEntry({ code: "A", rating: 6 })).toBeNull();
    expect(cleanEntry({ code: "", rating: 4 })).toBeNull();
    expect(cleanEntry(null)).toBeNull();
  });

  it("อนุมัติอัตโนมัติ: เฉพาะซื้อจริง + 4–5 ดาว + ร้านเปิด", () => {
    expect(autoApprove({ reviews_auto_approve: true }, true, 4)).toBe(true);
    expect(autoApprove({ reviews_auto_approve: true }, true, 3)).toBe(false);
    expect(autoApprove({ reviews_auto_approve: true }, false, 5)).toBe(false);
    expect(autoApprove({ reviews_auto_approve: false }, true, 5)).toBe(false);
  });

  it("แต้ม: สมาชิก + ซื้อจริง + เปิดแต้ม · รูปได้เพิ่ม", () => {
    const info = { points_enabled: true, reviews_auto_approve: false, reviews_points: 10, reviews_photo_points: 5 };
    expect(reviewPoints(info, { customerId: "c1", verified: true, images: 2 })).toBe(15);
    expect(reviewPoints(info, { customerId: "c1", verified: true, images: 0 })).toBe(10);
    expect(reviewPoints(info, { customerId: null, verified: true, images: 2 })).toBe(0);
    expect(reviewPoints({ ...info, points_enabled: false }, { customerId: "c1", verified: true, images: 2 })).toBe(0);
    expect(reviewPoints(info, { customerId: "c1", verified: false, images: 0 })).toBe(0);
  });
});

describe("รีวิว: ลิงก์รีวิวของออเดอร์", () => {
  beforeAll(() => {
    process.env.STOREFRONT_PREVIEW_SECRET = "test-secret";
  });
  const id = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it("ออกแล้วตรวจคืน id ได้ · แก้ตัวอักษร/หมดอายุ = ใช้ไม่ได้", () => {
    const t = issueReviewToken(id)!;
    expect(t).toMatch(/^[0-9a-f]{32}\.[0-9a-z]+\.[A-Za-z0-9_-]{24}$/);
    expect(verifyReviewToken(t)).toBe(id);
    expect(verifyReviewToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(verifyReviewToken(t, Date.now() + 181 * 864e5)).toBeNull();
    expect(verifyReviewToken("nope")).toBeNull();
    expect(issueReviewToken("not-a-uuid")).toBeNull();
  });

  it("ลิงก์เต็ม: ไม่มีเบอร์/ชื่อในลิงก์ · /en สำหรับลูกค้าอังกฤษ · ไม่มีโดเมน = null", () => {
    expect(reviewUrl("https://shop.co", id)).toMatch(/^https:\/\/shop\.co\/review\?t=/);
    expect(reviewUrl("https://shop.co", id, "en")).toMatch(/^https:\/\/shop\.co\/en\/review\?t=/);
    expect(reviewUrl(null, id)).toBeNull();
  });

  it("อีเมลขอบคุณ (สำเร็จ) มีปุ่มรีวิวแทนปุ่มตามออเดอร์ · สถานะอื่นไม่มี", () => {
    const o = { orderNo: "LM-1", status: "completed", customerName: "Ann", paymentMethod: "cod", paymentStatus: "paid", items: [], subtotal: 0, shippingFee: 0, discount: 0, grandTotal: 0, note: "", promptpay: null } as unknown as MessageOrder;
    const shop = { name: "Shop", siteUrl: "https://shop.co", reviewUrl: "https://shop.co/review?t=x" };
    const m = orderMessage("completed", o, shop, "th");
    expect(m.link).toEqual({ text: "⭐ รีวิวสินค้า", href: "https://shop.co/review?t=x" });
    expect(m.text).toContain("https://shop.co/review?t=x");
    expect(orderMessage("shipped", o, shop, "th").link?.href).toContain("/track?no=LM-1");
  });
});

describe("ตั้งค่า ชุด 2", () => {
  it("คำพ้อง: บรรทัดละกลุ่ม · ตัดซ้ำ/ว่าง · กลุ่มเดี่ยวทิ้ง", () => {
    expect(cleanSynonyms("กระเป๋าสตางค์, wallet ,wallet,\nเดี่ยว\n  belt ; เข็มขัด  ")).toBe("กระเป๋าสตางค์, wallet\nbelt, เข็มขัด");
    expect(cleanSynonyms(null)).toBe("");
  });

  it("ค่าเริ่ม: แชท/รีวิวปิด · เฉพาะคนซื้อ · โชว์ดาวบนการ์ด · แต้มติดลบ = 0 · ชวนรีวิวในอีเมลไม่ออกหน้าเว็บ", () => {
    const i = normalizeSiteInfo({ reviews_points: -5, reviews_photo_points: "20" });
    expect(i.chat_enabled).toBe(false);
    expect(i.reviews_enabled).toBe(false);
    expect(i.reviews_buyers_only).toBe(true);
    expect(i.reviews_show_cards).toBe(true);
    expect(i.reviews_points).toBe(0);
    expect(i.reviews_photo_points).toBe(20);
    const pub = publicSiteInfo(i) as unknown as Record<string, unknown>;
    expect("reviews_request_email" in pub).toBe(false);
    expect(pub.chat_enabled).toBe(false);
  });

  it("ลิงก์ Messenger ต้องเป็น http(s)", () => {
    expect(normalizeSiteInfo({ chat_messenger_url: "javascript:alert(1)" }).chat_messenger_url).toBe("");
    expect(normalizeSiteInfo({ chat_messenger_url: "https://m.me/shop" }).chat_messenger_url).toBe("https://m.me/shop");
  });
});

describe("🔍 คำค้น", () => {
  it("เก็บเฉพาะคำค้นจริง · ไม่เก็บอีเมล/เบอร์", () => {
    expect(cleanSearchTerm("  Black   BAG ")).toBe("black bag");
    expect(cleanSearchTerm("a")).toBe("");
    expect(cleanSearchTerm("me@mail.com")).toBe("");
    expect(cleanSearchTerm("081-234-5678")).toBe("");
  });

  it("รวมหลายวัน: นับรวม · ผลล่าสุดตามวันล่าสุด · กรองหาไม่เจอ", () => {
    const rows = [
      { q: "wallet", day: "2026-10-20", hits: 3, last_results: 0 },
      { q: "wallet", day: "2026-10-21", hits: 2, last_results: 4 },
      { q: "หนังวัว", day: "2026-10-21", hits: 1, last_results: 0 },
    ];
    expect(aggregateTerms(rows)).toEqual([
      { q: "wallet", hits: 5, lastResults: 4, lastDay: "2026-10-21" },
      { q: "หนังวัว", hits: 1, lastResults: 0, lastDay: "2026-10-21" },
    ]);
    expect(aggregateTerms(rows, { notFound: true }).map((t) => t.q)).toEqual(["หนังวัว"]);
  });
});

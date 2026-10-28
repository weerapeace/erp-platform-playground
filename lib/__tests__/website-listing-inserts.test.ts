import { describe, expect, it } from "vitest";
import { cardMatchesAnchor, newListingInsert, normalizeListingInserts, resolveInsertAt, type ListingInsert } from "../website-listing";

const cards = [
  { code: "PIX01", slug: "pix01" },
  { code: "PIX19", slug: "pix19" },
  { code: "PIX28", slug: "pix28", cardMain: "sku-aaaa1111" }, // การ์ดรุ่น (มีสีหลักตั้งไว้ แต่ไม่ใช่การ์ด SKU)
  { code: "PIX30", slug: "pix30" },
];
// การ์ดแบบ SKU (แตกสี) — cardKey "id:sku-x" + cardMain = สีนั้น
const skuCards = [
  { code: "PIX01", cardKey: "p1:sku-0001", cardMain: "sku-0001" },
  { code: "PIX28", cardKey: "p28:sku-aaaa1111", cardMain: "sku-aaaa1111" },
  { code: "PIX28", cardKey: "p28:sku-bbbb2222", cardMain: "sku-bbbb2222" },
];
const ins = (p: Partial<ListingInsert>): ListingInsert => ({ ...newListingInsert(4), ...p });

describe("cardMatchesAnchor", () => {
  it("Parent = ทุกการ์ดของรุ่น · SKU = การ์ดสีนั้น / การ์ดรุ่นของสีนั้น", () => {
    expect(cardMatchesAnchor(cards[2], "PIX28")).toBe(true);
    expect(cardMatchesAnchor(cards[2], "pix28")).toBe(true);
    expect(cardMatchesAnchor(cards[2], "PIX28:sku-bbbb2222")).toBe(true); // หน้าการ์ดรุ่น → การ์ดรุ่นของ SKU นั้น
    expect(cardMatchesAnchor(skuCards[1], "PIX28:sku-bbbb2222")).toBe(false);
    expect(cardMatchesAnchor(skuCards[2], "PIX28:sku-bbbb2222")).toBe(true);
    expect(cardMatchesAnchor(skuCards[1], "PIX28")).toBe(true);
    expect(cardMatchesAnchor(cards[0], "PIX28")).toBe(false);
  });
});

describe("resolveInsertAt", () => {
  it("ตามลำดับ (เดิม)", () => {
    expect(resolveInsertAt(ins({ after: 2 }), cards)).toEqual({ at: 2, via: "pos" });
  });
  it("ผูกกับสินค้า: หลัง/ก่อน · ตัวแรกที่เจอในหน้า", () => {
    expect(resolveInsertAt(ins({ placeBy: "product", anchors: ["PIX28"] }), cards)).toEqual({ at: 3, via: "anchor" });
    expect(resolveInsertAt(ins({ placeBy: "product", anchors: ["PIX28"], anchorSide: "before" }), cards)).toEqual({ at: 2, via: "anchor" });
    expect(resolveInsertAt(ins({ placeBy: "product", anchors: ["PIX30", "PIX19"] }), cards)).toEqual({ at: 2, via: "anchor" });
  });
  it("SKU บนหน้าการ์ดแตกสี = ติดการ์ดสีนั้น", () => {
    expect(resolveInsertAt(ins({ placeBy: "product", anchorKind: "sku", anchors: ["PIX28:sku-bbbb2222"] }), skuCards)).toEqual({ at: 3, via: "anchor" });
  });
  it("ไม่เจอ: ไม่โชว์ / ใช้ลำดับแทน", () => {
    expect(resolveInsertAt(ins({ placeBy: "product", anchors: ["ZZZ"] }), cards)).toBeNull();
    expect(resolveInsertAt(ins({ placeBy: "product", anchors: ["ZZZ"], anchorFallback: "pos", after: 1 }), cards)).toEqual({ at: 1, via: "pos" });
    expect(resolveInsertAt(ins({ placeBy: "product", anchors: [] }), cards)).toBeNull();
  });
});

describe("normalizeListingInserts (ผูกสินค้า + วิดีโอ)", () => {
  it("ค่าเริ่ม = แบบเดิม (ของที่บันทึกไว้ก่อนหน้าไม่เปลี่ยน)", () => {
    const [x] = normalizeListingInserts([{ id: "a", imageKey: "x.jpg", after: 3 }]);
    expect(x).toMatchObject({ placeBy: "pos", anchorKind: "parent", anchors: [], anchorSide: "after", anchorFallback: "hide", anchorFollow: true, videoKey: null, mobileVideoKey: null });
  });
  it("ทำความสะอาดรหัส + วิดีโอ", () => {
    const [x] = normalizeListingInserts([
      { id: "a", placeBy: "product", anchorKind: "sku", anchors: ["pix28:sku-bbbb2222", "PIX28:sku-bbbb2222", "bad code", "a:b:c", "PIX01"], anchorSide: "before", anchorFallback: "pos", anchorFollow: false, videoKey: "storefront-hero/clip.mp4", mobileVideoKey: "<bad>" },
    ]);
    expect(x.anchors).toEqual(["PIX28:sku-bbbb2222", "PIX01"]);
    expect(x).toMatchObject({ placeBy: "product", anchorKind: "sku", anchorSide: "before", anchorFallback: "pos", anchorFollow: false, videoKey: "storefront-hero/clip.mp4", mobileVideoKey: null });
  });
});

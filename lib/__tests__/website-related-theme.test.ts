import { describe, it, expect } from "vitest";
import { normalizeParts, normalizeProductSections, normalizeHiddenSections, legacySourceOf, rulesFromSource } from "../website-theme";
import { cleanRelatedCodes, listingPatchToRow } from "../website-listing-patch";

/**
 * 🔗 แท็บ "แนะนำสินค้า" (2026-10-20) — ธีมเก่าต้องหน้าตาเหมือนเดิม:
 *  - ธีมเก่าไม่มี rules → แปลงจาก source (เลือกเองรายรุ่นก่อน แล้วแหล่งเดิม)
 *  - ส่วน "recent" (ดูล่าสุด) ใหม่ → อยู่ต่อจาก "related" (ที่เดิม) · ธีมเก่าซ่อน related = ซ่อน recent ด้วย
 */
describe("สินค้าที่เกี่ยวข้อง: กฎหลายชั้น", () => {
  it("ธีมเก่า (source เดียว) → rules [pinned, source] · เติมสินค้าอื่น", () => {
    const r = normalizeParts({ related: { source: "collection", count: 6 } }).related;
    expect(r.rules).toEqual(["pinned", "collection"]);
    expect(r.fill).toBe(true);
    expect(r.count).toBe(6);
    expect(normalizeParts({}).related.rules).toEqual(rulesFromSource("category"));
  });
  it("rules ใหม่: กรองค่ามั่ว/ซ้ำ · [] = ไม่ใช้กฎ · source คำนวณให้เว็บรุ่นเก่า", () => {
    const r = normalizeParts({ related: { rules: ["price", "bogus", "material", "price", "featured"], fill: false } }).related;
    expect(r.rules).toEqual(["price", "material", "featured"]);
    expect(r.fill).toBe(false);
    expect(r.source).toBe("featured");
    expect(normalizeParts({ related: { rules: [] } }).related.rules).toEqual([]);
    expect(legacySourceOf(["pinned", "price"])).toBe("category");
  });
  it("ดูล่าสุด: หัวข้อ + จำนวน 2–12 (ค่าเริ่ม 4 = เท่าเดิม)", () => {
    expect(normalizeParts({}).recent).toEqual({ title: "", count: 4 });
    expect(normalizeParts({ recent: { title: " ที่คุณเพิ่งดู ", count: 99 } }).recent).toEqual({ title: "ที่คุณเพิ่งดู", count: 12 });
  });
});

describe("ส่วนประกอบหน้าสินค้า: recent", () => {
  it("ลำดับเก่า (ไม่มี recent) → ต่อหลัง related · related ไม่ได้อยู่ท้าย ก็ยังติดกัน", () => {
    expect(normalizeProductSections(["gallery", "buy", "details", "banner", "related"])).toEqual(["gallery", "buy", "details", "banner", "related", "recent"]);
    expect(normalizeProductSections(["gallery", "related", "buy", "details", "banner"])).toEqual(["gallery", "related", "recent", "buy", "details", "banner"]);
    expect(normalizeProductSections(["recent", "gallery", "buy", "details", "banner", "related"])[0]).toBe("recent");
  });
  it("ธีมเก่าซ่อน related = เดิม ดูล่าสุด หายด้วย → ซ่อน recent ตาม · ลำดับใหม่ที่มี recent = ตามที่ตั้ง", () => {
    expect(normalizeHiddenSections(["banner", "related"], [], ["gallery", "related"])).toEqual(["banner", "related", "recent"]);
    expect(normalizeHiddenSections(["related"], [], ["gallery", "related", "recent"])).toEqual(["related"]);
    expect(normalizeHiddenSections(["recent"], [], undefined)).toEqual(["recent"]);
    expect(normalizeHiddenSections(["banner"], [], undefined)).toEqual(["banner"]);
  });
});

describe("เลือกเองรายรุ่น: web_related", () => {
  it("ตัวพิมพ์ใหญ่ ไม่ซ้ำ ≤ 12 · ว่าง = null", () => {
    expect(cleanRelatedCodes(["ttm130", "TTM130", " roar02 ", "", "bad code!", 5])).toEqual(["TTM130", "ROAR02", "5"]);
    expect(cleanRelatedCodes(Array.from({ length: 20 }, (_, i) => `A${i}`))).toHaveLength(12);
    expect(listingPatchToRow({ webRelated: [] })).toEqual({ web_related: null });
    expect(listingPatchToRow({ webRelated: ["x1"] })).toEqual({ web_related: ["X1"] });
  });
});

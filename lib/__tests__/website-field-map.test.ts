import { describe, it, expect } from "vitest";
import { normalizeFieldMap, DEFAULT_WEB_CATEGORIES, resolveComparePrice } from "../website-field-map";

/**
 * หมวดสินค้าบนเว็บร้าน — เจ้าของเพิ่ม/แก้/ลบเองได้ (เก็บใน shops.field_map.categories)
 * เว็บร้านวาดเมนูหมวด + การ์ดหมวดหน้าแรกจากรายการนี้ ไม่ฝังในโค้ดเว็บ
 * เทสต์นี้กันเคสที่จะทำให้ "หมวดหาย" หรือ "สินค้าไปกองในหมวดที่ไม่มีในเมนู"
 */
describe("normalizeFieldMap — รายการหมวดของร้าน", () => {
  it("ร้านที่ยังไม่เคยตั้ง (null) ได้ชุดตั้งต้นครบ พร้อมคำโปรย", () => {
    const m = normalizeFieldMap(null);
    expect(m.categories).toEqual(DEFAULT_WEB_CATEGORIES);
    expect(m.categories.every((c) => c.blurb.length > 0)).toBe(true);
  });

  it("ตั้งเองแล้วใช้ของที่ตั้ง และเก็บคำโปรยไว้", () => {
    const m = normalizeFieldMap({
      categories: [{ key: "tools", label: "เครื่องมือ", icon: "🔧", blurb: "เหล็กตอก มีดฝาน" }],
    });
    // รูปหมวด / แบนเนอร์ / ลำดับสินค้า ยังไม่ตั้ง = ค่าว่าง (ไม่ทำให้หมวดเดิมเปลี่ยนหน้าตา)
    expect(m.categories).toEqual([{ key: "tools", label: "เครื่องมือ", icon: "🔧", blurb: "เหล็กตอก มีดฝาน", imageKey: null, bannerKey: null, order: [], seoTitle: "", seoDescription: "" }]);
  });

  it("คำโปรยที่ไม่ใช่ข้อความ / ยาวเกิน ถูกจัดให้เรียบร้อย ไม่ทำให้หมวดหาย", () => {
    const m = normalizeFieldMap({
      categories: [
        { key: "a", label: "เอ", icon: "", blurb: { evil: true } },
        { key: "b", label: "บี", icon: "", blurb: "x".repeat(500) },
      ],
    });
    expect(m.categories).toHaveLength(2);
    expect(m.categories[0].blurb).toBe("");
    expect(m.categories[1].blurb).toHaveLength(240);
  });

  it("หมวดที่ไม่มีรหัสหรือไม่มีชื่อ ถูกตัดออก (กรอกค้างไว้ครึ่งเดียว)", () => {
    const m = normalizeFieldMap({
      categories: [
        { key: "ok", label: "ใช้ได้", icon: "✅", blurb: "" },
        { key: "", label: "ยังไม่ใส่รหัส", icon: "", blurb: "" },
        { key: "nolabel", label: "", icon: "", blurb: "" },
      ],
    });
    expect(m.categories.map((c) => c.key)).toEqual(["ok"]);
  });

  it("รหัสหมวดซ้ำ เก็บตัวแรกตัวเดียว", () => {
    const m = normalizeFieldMap({
      categories: [
        { key: "dup", label: "ตัวแรก", icon: "", blurb: "" },
        { key: "dup", label: "ตัวซ้ำ", icon: "", blurb: "" },
      ],
    });
    expect(m.categories).toHaveLength(1);
    expect(m.categories[0].label).toBe("ตัวแรก");
  });

  it("กฎจับคู่ที่ชี้ไปหมวดที่ถูกลบแล้ว ไม่ค้างไว้", () => {
    const m = normalizeFieldMap({
      categories: [{ key: "keep", label: "เก็บไว้", icon: "", blurb: "" }],
      category: { default: "keep", rules: { หนัง: "keep", ผ้า: "ลบไปแล้ว" } },
    });
    expect(m.category.rules).toEqual({ หนัง: "keep" });
  });

  it("หมวดตั้งต้นที่ชี้ไปหมวดที่ไม่มีอยู่ ถูกดึงกลับมาเป็นหมวดแรก", () => {
    const m = normalizeFieldMap({
      categories: [{ key: "first", label: "หมวดแรก", icon: "", blurb: "" }],
      category: { default: "หายไปแล้ว", rules: {} },
    });
    expect(m.category.default).toBe("first");
  });
});

describe("resolveComparePrice — ราคาเต็มขีดฆ่า", () => {
  it("Parent SKU กรอกไว้และสูงกว่า = ใช้ของ Parent", () => {
    expect(resolveComparePrice(2490, [], 1190)).toBe(2490);
  });
  it("Parent ว่าง/0 → ใช้ของ SKU ลูก (ROAR01: 890 → 1,890)", () => {
    expect(resolveComparePrice("0.0000", [{ list_price: "890", fake_price: "1890" }, { list_price: "890", fake_price: "1890" }], 890)).toBe(1890);
    expect(resolveComparePrice(null, [{ list_price: 890, fake_price: 1690 }], 890)).toBe(1690);
  });
  it("ดู SKU ที่ราคาเท่าราคาที่โชว์ก่อน · ไม่มีค่อยดูทุกตัว", () => {
    const kids = [{ list_price: 890, fake_price: 1290 }, { list_price: 990, fake_price: 1990 }];
    expect(resolveComparePrice(0, kids, 890)).toBe(1290);
    expect(resolveComparePrice(0, [{ list_price: 950, fake_price: 1500 }], 990)).toBe(1500);
  });
  it("ไม่สูงกว่าราคาขาย / ราคาขาย 0 = ไม่มีขีดฆ่า", () => {
    expect(resolveComparePrice(0, [{ list_price: 890, fake_price: 890 }], 890)).toBeNull();
    expect(resolveComparePrice(0, [{ list_price: 0, fake_price: 0 }], 890)).toBeNull();
    expect(resolveComparePrice(1000, [], 0)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  cmNumbers, descLines, duplicateLines, groupSkusByBase, isDuplicateLine, listingChecks, plainColor, priceSummary, skuFlags,
  type ListingParent, type ListingSku,
} from "@/lib/product-listing-checks";

const sku = (code: string, color_th: string | null, color_en: string | null, list: number | null, fake: number | null, images = 1): ListingSku =>
  ({ code, color_th, color_en, list_price: list, fake_price: fake, images });
const parent = (over: Partial<ListingParent>): ListingParent => ({
  code: "X", introduction: null, description: "- วัสดุ: ผ้า\n- ผลิตในประเทศไทย", english_description: "- Material: Canvas\n- Made in Thailand",
  size: { length: 10, height: 10, thickness: 1 }, parent_images: 3, description_images: 2, skus: [sku("X-01", "ดำ", "Black (01)", 219, 390)], ...over,
});
const keys = (p: ListingParent) => listingChecks(p).map((c) => c.key);

describe("ตัวช่วยอ่านข้อความ", () => {
  it("descLines ตัดขีดนำหน้า + บรรทัดว่าง", () => {
    expect(descLines("- a\n\n•  b \r\n* c")).toEqual(["a", "b", "c"]);
  });
  it("duplicateLines ไม่สนตัวพิมพ์/ช่องว่าง/จุดท้าย", () => {
    expect(duplicateLines("- Made in Thailand\n- Weight\n- made in  thailand.")).toEqual(["Made in Thailand"]);
    expect(isDuplicateLine("made in thailand", ["Made in Thailand"])).toBe(true);
  });
  it("cmNumbers อ่านทั้ง ซม. และ cm", () => {
    expect(cmNumbers("- สายคล้องคอ: 42 ซม.\n- W 9 × H 11.5 cm")).toEqual([42, 11.5]);
  });
  it("plainColor ตัดรหัสท้ายชื่อ", () => {
    expect(plainColor("Black (01D)")).toBe("Black");
    expect(plainColor(null)).toBe("");
  });
});

describe("listingChecks — เคสจากข้อมูลจริง", () => {
  it("ข้อมูลครบ = ไม่เตือน", () => {
    expect(keys(parent({}))).toEqual([]);
  });

  it("BSTP016: บรรทัดซ้ำทั้งไทย/อังกฤษ · ไม่มีขนาด · ไม่มีรูป", () => {
    const k = keys(parent({
      description: "- วัสดุ: PU\n- ผลิตในประเทศไทย\n- อะไหล่ซิงค์\n- ผลิตในประเทศไทย\n- ความสูงหูหิ้ว: 86 ซม.",
      english_description: "- Made in Thailand\n- Weight: 120 g\n- Handle drop: 86 cm\n- Made in Thailand\n- Rust-resistant",
      size: null, parent_images: 0, skus: [1, 2, 3, 4, 5].map((i) => sku(`B-0${i}`, "ดำ", "Black", 99, 190, 0)),
    }));
    expect(k).toEqual(["desc_th_dup", "desc_en_dup", "size_missing", "parent_no_images", "sku_no_images"]);
  });

  it("WK46: ชื่อสีไทยเป็นอังกฤษ + อังกฤษเป็นไทย + ซม. ไม่ตรง", () => {
    const p = parent({
      description: "- วัสดุ: หนังวัว\n- สายคล้องคอ: 42 ซม.",
      english_description: "- Material: leather\n- Size: W 9 × H 11.5 × D 1 cm\n- Handle drop: 40 cm",
      skus: [sku("WK46-01", "Black", "ดำ (01)", 729, 1490), sku("WK46-02", "น้ำตาล", "น้ำตาล (02)", 729, 1490)],
    });
    const c = listingChecks(p);
    expect(c.map((x) => x.key)).toEqual(["desc_cm_mismatch", "color_th_english", "color_en_thai"]);
    expect(c[0].text).toContain("42");
    expect(c.find((x) => x.key === "color_en_thai")?.text).toContain("2");
  });

  it("SHB06: อังกฤษสั้นกว่าไทยมาก + ไม่มีราคาขีดฆ่า", () => {
    const k = keys(parent({
      description: "- a\n- b\n- c\n- d\n- e\n- f\n- g", english_description: "- Material: Canvas",
      skus: [sku("S-01", "ดำ", "Black", 790, 0), sku("S-02", "ครีม", "Cream", 790, null)],
    }));
    expect(k).toEqual(["desc_en_short", "fake_missing"]);
  });

  it("PIX47: ชื่อสีอังกฤษว่าง + SKU ไม่มีรูป", () => {
    expect(keys(parent({ skus: [sku("PIX47-01", "ดำ", null, 219, 390, 0)] }))).toEqual(["color_en_empty", "sku_no_images"]);
  });

  it("ไม่มี Description / ไม่มีราคาขาย / ขีดฆ่าต่ำกว่าราคาขาย", () => {
    const k = keys(parent({ description: "", english_description: null, skus: [sku("Z-01", "", "Red", 0, 0), sku("Z-02", "แดง", "Red", 500, 400)] }));
    expect(k).toEqual(["desc_th_empty", "desc_en_empty", "color_th_empty", "price_missing", "fake_missing", "fake_low"]);
  });
});

describe("skuFlags / priceSummary / groupSkusByBase", () => {
  it("skuFlags ชี้ช่องที่ผิด", () => {
    expect(skuFlags(sku("A", "Black", "ดำ", 729, 1490, 0))).toEqual({ colorTh: true, colorEn: true, listPrice: false, fakePrice: false, images: true });
  });
  it("priceSummary ราคาเท่ากันทุกสี + % ลด", () => {
    expect(priceSummary([sku("a", "ดำ", "B", 729, 1490), sku("b", "แดง", "R", 729, 1490)])).toEqual({ same: true, list: 729, fake: 1490, discountPct: 51 });
    expect(priceSummary([sku("a", "ดำ", "B", 790, 0)])).toEqual({ same: true, list: 790, fake: null, discountPct: null });
    expect(priceSummary([sku("a", "ดำ", "B", 100, 0), sku("b", "ดำ", "B", 200, 0)]).same).toBe(false);
  });
  it("groupSkusByBase รวมแบบย่อย D/G/N", () => {
    const g = groupSkusByBase(["WK46-01", "WK46-01D", "WK46-01G", "WK46-02", "WK46-02N"].map((c) => sku(c, "ดำ", "B", 1, 2)));
    expect(g.map((x) => [x.base, x.items.length])).toEqual([["WK46-01", 3], ["WK46-02", 2]]);
  });
});

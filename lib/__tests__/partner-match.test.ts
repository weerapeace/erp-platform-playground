import { describe, it, expect } from "vitest";
import {
  normShopName, compactShopName, shopTokenKey,
  buildPartnerMatcher, shopNameSimilarity, findDuplicateShops,
} from "../partner-match";

describe("normalize ชื่อร้าน", () => {
  it("ตัดเครื่องหมาย + ยุบช่องว่าง + ตัวพิมพ์เล็ก", () => {
    expect(normShopName("  A110  (ร้านซิปเมืองจีน) ")).toBe("a110 ร้านซิปเมืองจีน");
    expect(normShopName("K.ติง")).toBe("k ติง");
    expect(normShopName(null)).toBe("");
  });
  it("เก็บวรรณยุกต์ไทยไว้ครบ (ห้ามกลายเป็น ร านโซ)", () => {
    expect(compactShopName("ร้านโซ่ B131")).toBe("ร้านโซ่b131");
  });
  it("คีย์เรียงคำเท่ากันเมื่อสลับคำ", () => {
    expect(shopTokenKey("B131 ร้านโซ่")).toBe(shopTokenKey("ร้านโซ่ B131"));
    expect(shopTokenKey("B131 ร้านโซ่")).toBe("b131|ร้านโซ่");
  });
});

describe("buildPartnerMatcher", () => {
  const partners = [
    { id: "chain", display_name: "ร้านโซ่ B131", name_th: "ร้านโซ่ B131", is_supplier: true },
    { id: "zip", display_name: "A110 (ร้านซิปเมืองจีน)", name_th: null, is_supplier: true },
    { id: "ting", display_name: "ติง", name_th: "ติง", is_supplier: true },
    { id: "ting-old", display_name: "ติง", name_th: "ติง", is_supplier: false, is_active: false },
  ];
  const m = buildPartnerMatcher(partners);

  it("ชื่อตรงเป๊ะ", () => expect(m.match("A110 (ร้านซิปเมืองจีน)")?.id).toBe("zip"));
  it("ชื่อสลับคำก็เจอ", () => expect(m.match("B131 ร้านโซ่")?.id).toBe("chain"));
  it("เว้นวรรค/วงเล็บต่างก็เจอ", () => {
    expect(m.match("A110 ร้านซิปเมืองจีน")?.id).toBe("zip");
    expect(m.match("  ร้านโซ่   B131  ")?.id).toBe("chain");
  });
  it("ชื่อซ้ำ → ร้านที่ติ๊กผู้จำหน่าย+ยังเปิดใช้ชนะ", () => expect(m.match("ติง")?.id).toBe("ting"));
  it("ไม่เดาชื่อใกล้เคียง", () => {
    expect(m.match("K.ติง")).toBeUndefined();
    expect(m.match("ร้านซิป ISG")).toBeUndefined();
    expect(m.match("")).toBeUndefined();
    expect(m.match(null)).toBeUndefined();
  });
});

describe("shopNameSimilarity", () => {
  it("เหมือนกัน = 1", () => {
    expect(shopNameSimilarity("ติง", "ติง")).toBe(1);
    expect(shopNameSimilarity("B131 ร้านโซ่", "ร้านโซ่ B131")).toBe(1);
    expect(shopNameSimilarity("Tao Bao", "taobao")).toBe(1);
  });
  it("ชื่อหนึ่งอยู่ในอีกชื่อ = คล้ายมาก", () => {
    expect(shopNameSimilarity("ร้านด้าย", "ร้านด้ายเมืองจีน (HAO TI CHE THREAD)")).toBeGreaterThanOrEqual(0.8);
    expect(shopNameSimilarity("ติง", "K.ติง")).toBeGreaterThanOrEqual(0.8);
  });
  it("คนละร้านต้องได้คะแนนต่ำ", () => {
    expect(shopNameSimilarity("ร้านซิป ISG", "ร้านโซ่ B131")).toBeLessThan(0.82);
    expect(shopNameSimilarity("ติง", "ฮวง")).toBeLessThan(0.82);
    expect(shopNameSimilarity("ติง", "")).toBe(0);
  });
  it("ชื่อสั้น 1-2 ตัวที่บังเอิญอยู่ในชื่อยาว ไม่นับว่าคล้าย", () => {
    expect(shopNameSimilarity("K", "K.ติง")).toBeLessThan(0.82);
  });
});

describe("findDuplicateShops", () => {
  const partners = [
    { id: "1", display_name: "ติง", is_supplier: true },
    { id: "2", display_name: "K.ติง", is_supplier: true },
    { id: "3", display_name: "ร้านด้าย", is_supplier: true },
    { id: "4", display_name: "ร้านด้ายเมืองจีน (HAO TI CHE THREAD)", is_supplier: true },
    { id: "5", display_name: "ร้านซิป ISG", is_supplier: true },
  ];
  it("จับกลุ่มร้านที่น่าจะซ้ำ และไม่ลากร้านอื่นเข้ามา", () => {
    const groups = findDuplicateShops(partners);
    const ids = groups.map((g) => g.members.map((m) => m.id).sort().join(","));
    expect(ids).toContain("1,2");
    expect(ids).toContain("3,4");
    expect(groups.flatMap((g) => g.members.map((m) => m.id))).not.toContain("5");
  });
  it("ทะเบียนที่ไม่มีร้านซ้ำ → ไม่รายงานอะไรเลย", () => {
    expect(findDuplicateShops([{ id: "a", display_name: "ติง" }, { id: "b", display_name: "ฮวง" }])).toEqual([]);
  });
});

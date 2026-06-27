import { describe, it, expect } from "vitest";
import { composeDescription, buildSelectedTargets } from "@/lib/subtask-sync";

describe("composeDescription (subtask -> product description sync)", () => {
  it("replace: ใช้ข้อความใหม่ทั้งหมด (ตัดช่องว่าง)", () => {
    expect(composeDescription("ของเดิม", "  ใหม่ ", "replace")).toBe("ใหม่");
    expect(composeDescription(null, "ใหม่", "replace")).toBe("ใหม่");
  });

  it("append: ต่อท้ายของเดิม คั่นด้วยบรรทัดว่าง", () => {
    expect(composeDescription("เดิม", "ใหม่", "append")).toBe("เดิม\n\nใหม่");
  });

  it("append: ของเดิมว่าง -> เหลือแค่ข้อความใหม่ (ไม่มีบรรทัดว่างนำ)", () => {
    expect(composeDescription("", "ใหม่", "append")).toBe("ใหม่");
    expect(composeDescription(null, "ใหม่", "append")).toBe("ใหม่");
    expect(composeDescription("   ", "ใหม่", "append")).toBe("ใหม่");
  });

  it("append: ตัดช่องว่างหัวท้ายทั้งสองส่วน", () => {
    expect(composeDescription("  เดิม  ", "  ใหม่  ", "append")).toBe("เดิม\n\nใหม่");
  });
});

describe("buildSelectedTargets (ปลายทางรูปที่ติ๊กเลือกในป๊อปอัปส่งงาน)", () => {
  it("ไม่เลือกอะไร -> ว่าง (= ไม่ดันเข้าสินค้า)", () => {
    expect(buildSelectedTargets(null)).toEqual([]);
    expect(buildSelectedTargets({})).toEqual([]);
    expect(buildSelectedTargets({ parent_ids: [], sku_ids: [] })).toEqual([]);
  });

  it("map parent -> parent_skus_v2 และ sku -> skus_v2 (ชนิด owner ถูกต้อง)", () => {
    const r = buildSelectedTargets({ parent_ids: ["p1"], sku_ids: ["s1", "s2"] });
    expect(r).toEqual([
      { table: "parent_skus_v2", ownerType: "parent_sku", id: "p1" },
      { table: "skus_v2", ownerType: "product_sku", id: "s1" },
      { table: "skus_v2", ownerType: "product_sku", id: "s2" },
    ]);
  });

  it("ตัด id ว่าง/ซ้ำออก", () => {
    const r = buildSelectedTargets({ parent_ids: ["p1", "p1", ""], sku_ids: ["s1", "s1"] });
    expect(r).toEqual([
      { table: "parent_skus_v2", ownerType: "parent_sku", id: "p1" },
      { table: "skus_v2", ownerType: "product_sku", id: "s1" },
    ]);
  });
});

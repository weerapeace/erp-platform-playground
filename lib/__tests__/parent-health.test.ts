import { describe, expect, it } from "vitest";
import { healthSummary, parentHealthChecks, type ParentHealthFacts } from "@/lib/parent-health";

const OK: ParentHealthFacts = {
  hasCover: true, hasCategory: true, hasPlatformCategory: true, hasDescription: true, hasWeight: true,
  skuCount: 5, skuNoPrice: 0, hasBom: true, hasBuyPrice: false, notListedOn: [],
};

describe("parent-health (ต้องแก้ N อย่าง)", () => {
  it("ครบทุกอย่าง = ไม่มีรายการ", () => {
    expect(parentHealthChecks(OK)).toEqual([]);
    expect(healthSummary([])).toEqual({ count: 0, level: null });
  });

  it("ขาดหลายอย่าง: เรียงจำเป็นก่อน · บอกแท็บ/ช่องที่ต้องไป", () => {
    const items = parentHealthChecks({ ...OK, hasCover: false, skuNoPrice: 3, hasWeight: false, notListedOn: ["Shopee", "LINE Shopping"] });
    expect(items.map((i) => i.key)).toEqual(["no_cover", "sku_no_price", "no_weight", "not_listed"]);
    expect(items[1]).toMatchObject({ level: "required", tab: "prices", label: "SKU ยังไม่มีราคากลาง 3 ตัว" });
    expect(items[2]).toMatchObject({ level: "suggest", field: "weight_g" });
    expect(items[3].label).toBe("ยังไม่ลงขายที่ Shopee, LINE Shopping");
    expect(healthSummary(items)).toEqual({ count: 4, level: "required" });
  });

  it("ไม่มีต้นทุน = ไม่มีสูตรและไม่มีราคาซื้อ (ซื้อมาขายมีราคาซื้อ = ผ่าน)", () => {
    expect(parentHealthChecks({ ...OK, hasBom: false }).map((i) => i.key)).toEqual(["no_cost"]);
    expect(parentHealthChecks({ ...OK, hasBom: false, hasBuyPrice: true })).toEqual([]);
    expect(healthSummary(parentHealthChecks({ ...OK, hasBom: false }))).toEqual({ count: 1, level: "suggest" });
  });

  it("ไม่มี SKU ลูก = แจ้งข้อเดียว ไม่เตือนต้นทุนซ้ำ", () => {
    expect(parentHealthChecks({ ...OK, skuCount: 0, hasBom: false }).map((i) => i.key)).toEqual(["no_sku"]);
  });
});

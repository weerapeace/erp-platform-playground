import { describe, it, expect } from "vitest";
import { manualShipBy } from "../order-shipping";
import { productSummary } from "../platform-order-items-server";

/** ศูนย์ออเดอร์ (2026-11-19): คอลัมน์สินค้า · "ส่งภายใน" ของออเดอร์สร้างเอง */

describe("📅 ส่งภายในของออเดอร์สร้างเอง = สิ้นวันพรุ่งนี้ เวลาไทย", () => {
  it("กลางวันไทย → พรุ่งนี้ 23:59:59 (ไทย)", () => {
    // 19 พ.ย. 2026 19:43 ไทย = 12:43 UTC
    expect(manualShipBy(Date.UTC(2026, 10, 19, 12, 43))).toBe("2026-11-20T16:59:59.000Z");
  });
  it("หลังเที่ยงคืนไทยแต่ยังเป็นวันก่อนใน UTC → นับวันไทย", () => {
    // 20 พ.ย. 00:30 ไทย = 19 พ.ย. 17:30 UTC → ส่งภายใน 21 พ.ย. 23:59:59 ไทย
    expect(manualShipBy(Date.UTC(2026, 10, 19, 17, 30))).toBe("2026-11-21T16:59:59.000Z");
  });
});

describe("🛍 สรุปสินค้าในรายการ", () => {
  it("3 รายการแรก ชิ้นมากสุดก่อน + นับรายการทั้งหมด · ไม่มีรายการ = ว่าง", () => {
    const r = productSummary([
      { sku_code: "A", name: "a", qty: 1, image_key: null },
      { sku_code: "B", name: "b", qty: 3, image_key: "k" },
      { sku_code: "C", name: "c", qty: 2, image_key: null },
      { sku_code: "D", name: "d", qty: 1, image_key: null },
    ]);
    expect(r.item_count).toBe(4);
    expect(r.products.map((p) => p.sku_code)).toEqual(["B", "C", "A"]);
    expect(r.products[0].image_key).toBe("k");
    expect(productSummary([])).toEqual({ products: [], item_count: 0 });
  });
});

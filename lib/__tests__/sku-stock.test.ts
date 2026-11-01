import { describe, it, expect } from "vitest";
import { mergeSkuStock } from "../sku-stock";

/** 📦 ยอดสต๊อกต่อ SKU — ledger กลางก่อน · ตารางเก่าเป็นสำรอง · ไม่มีแถว = ไม่มีข้อมูล */
describe("mergeSkuStock", () => {
  it("หลายคลังของ SKU เดียว = บวกรวม + เวลาเคลื่อนไหวล่าสุด", () => {
    const m = mergeSkuStock(
      [
        { product_id: "a", qty_on_hand: 5, qty_reserved: 1, last_movement_at: "2026-10-01T00:00:00Z" },
        { product_id: "a", qty_on_hand: "3", qty_reserved: null, last_movement_at: "2026-10-05T00:00:00Z" },
      ],
      []
    );
    expect(m.get("a")).toEqual({ onHand: 8, reserved: 1, lastMovementAt: "2026-10-05T00:00:00Z" });
  });
  it("ตารางเก่าใช้เฉพาะ SKU ที่ ledger ไม่มี", () => {
    const m = mergeSkuStock(
      [{ product_id: "a", qty_on_hand: 2, qty_reserved: 0, last_movement_at: null }],
      [
        { sku_id: "a", qty_on_hand: 99, last_movement_at: null },
        { sku_id: "b", qty_on_hand: 4, last_movement_at: null },
      ]
    );
    expect(m.get("a")?.onHand).toBe(2);
    expect(m.get("b")?.onHand).toBe(4);
  });
  it("มีแถวแต่เหลือ 0 = อยู่ใน Map (หมดจริง) · ไม่มีแถว = ไม่อยู่ใน Map (ไม่มีข้อมูล)", () => {
    const m = mergeSkuStock([{ product_id: "z", qty_on_hand: 0, qty_reserved: 0, last_movement_at: null }], []);
    expect(m.get("z")?.onHand).toBe(0);
    expect(m.has("none")).toBe(false);
  });
});

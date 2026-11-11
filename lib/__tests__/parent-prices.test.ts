import { describe, expect, it } from "vitest";
import { parsePriceTabPrefs, pickSavedCosting, priceMismatch, shopPay } from "@/lib/parent-prices";
import { bomMaterialCost } from "@/lib/cost-inputs";

describe("parent-prices", () => {
  it("ราคาที่ลูกค้าจ่าย = ราคาลดถ้าต่ำกว่า", () => {
    expect(shopPay(890, 729)).toBe(729);
    expect(shopPay(729, null)).toBe(729);
    expect(shopPay(729, 0)).toBe(729);
    expect(shopPay(729, 800)).toBe(729);
    expect(shopPay(null, null)).toBeNull();
  });

  it("เตือนเมื่อต่างตั้งแต่ 1 บาท · ไม่รู้ราคา = ไม่เตือน", () => {
    expect(priceMismatch(699, 729)).toBe(true);
    expect(priceMismatch(729.4, 729)).toBe(false);
    expect(priceMismatch(null, 729)).toBe(false);
    expect(priceMismatch(699, 0)).toBe(false);
  });

  it("ต้นทุนที่บันทึก: เฉพาะ SKU ก่อน → ทั้งรุ่น → ไม่มี", () => {
    const saved = [
      { target_type: "parent", target_code: "WK46", scenario: { labor_mode: "system" }, qty_basis: 50 },
      { target_type: "sku", target_code: "WK46-02", scenario: { labor_mode: "piece" }, qty_basis: 0 },
    ];
    expect(pickSavedCosting("WK46-01", "WK46", saved)).toMatchObject({ from: "parent", qty: 50 });
    expect(pickSavedCosting("WK46-02", "WK46", saved)).toMatchObject({ from: "sku", qty: 1 });
    expect(pickSavedCosting("X-01", "X", saved)).toMatchObject({ from: null, scenario: null, qty: 1 });
  });

  it("ค่าตั้งผู้ใช้: กรองคอลัมน์ที่ไม่มีจริง · เตือนเปิดเป็นค่าตั้งต้น", () => {
    expect(parsePriceTabPrefs({ hiddenCost: ["labor", "nope"], warn: false })).toEqual({ hiddenCost: ["labor"], warn: false });
    expect(parsePriceTabPrefs({})).toEqual({ hiddenCost: [], warn: true });
    expect(parsePriceTabPrefs([])).toBeNull();
  });
});

describe("cost-inputs (ต้นทุนวัตถุดิบจาก BOM — ของกลาง)", () => {
  it("Σ ใช้/ชิ้น × ราคาวัตถุดิบ · ไม่มีราคา = นับ missing", () => {
    const r = bomMaterialCost(
      [{ component_sku: "A", qty: 2, uom: "Units" }, { component_sku: "B", qty: 0.13, uom: "หลา" }, { component_sku: "C", qty: 1 }, { component_sku: null, qty: 1 }],
      new Map([["A", 3.5], ["B", 45]]),
    );
    expect(r.material_cost_pp).toBe(12.85);
    expect(r.missing_price).toBe(2);
    expect(r.materials[1]).toMatchObject({ sku: "B", line_pp: 5.85, has_price: true });
  });
});

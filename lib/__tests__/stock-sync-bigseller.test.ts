import { describe, expect, it } from "vitest";
import { autoMapHeaders } from "@/lib/import";
import {
  BIGSELLER_IMPORT_SCHEMA, parseQty, isComboType, codeKey,
  normalizeBigSellerRows, compareQtyOf, openingQtyOf,
} from "@/lib/stock-sync/bigseller";

describe("parseQty", () => {
  it("อ่านตัวเลขที่มีจุลภาค/ช่องว่าง", () => {
    expect(parseQty("1,234")).toBe(1234);
    expect(parseQty(" 5 ")).toBe(5);
    expect(parseQty(12)).toBe(12);
    expect(parseQty("0")).toBe(0);
  });
  it("ว่าง/ขีด/ตัวหนังสือ = null", () => {
    expect(parseQty("")).toBeNull();
    expect(parseQty("-")).toBeNull();
    expect(parseQty(null)).toBeNull();
    expect(parseQty("abc")).toBeNull();
  });
});

describe("isComboType", () => {
  it("รู้จักสินค้าชุดทั้งไทย/อังกฤษ", () => {
    expect(isComboType("Combination SKU")).toBe(true);
    expect(isComboType("Combo")).toBe(true);
    expect(isComboType("สินค้าชุด")).toBe(true);
    expect(isComboType("Single SKU")).toBe(false);
    expect(isComboType("")).toBe(false);
  });
});

describe("autoMapHeaders กับหัวตาราง BigSeller", () => {
  it("เดาคอลัมน์อังกฤษได้", () => {
    const m = autoMapHeaders(["Merchant SKU", "SKU Name", "Warehouse", "On Hand", "Available"], BIGSELLER_IMPORT_SCHEMA.fields);
    expect(m).toMatchObject({ merchant_sku: "Merchant SKU", name: "SKU Name", warehouse: "Warehouse", qty_on_hand: "On Hand", qty_available: "Available" });
  });
  it("เดาคอลัมน์ไทยได้", () => {
    const m = autoMapHeaders(["รหัส SKU", "ชื่อสินค้า", "คลัง", "สต็อกที่ใช้ได้"], BIGSELLER_IMPORT_SCHEMA.fields);
    expect(m).toMatchObject({ merchant_sku: "รหัส SKU", name: "ชื่อสินค้า", warehouse: "คลัง", qty_available: "สต็อกที่ใช้ได้" });
  });
});

describe("normalizeBigSellerRows", () => {
  it("รวมยอดหลายคลังของรหัสเดียวกัน (ไม่สนตัวพิมพ์/ช่องว่าง)", () => {
    const { items, skipped } = normalizeBigSellerRows([
      { merchant_sku: "IG-A01", name: "สาย A", qty_available: 3, qty_on_hand: 4, warehouse: "คลังหลัก" },
      { merchant_sku: " ig-a01 ", qty_available: 2, qty_on_hand: 2, warehouse: "คลังสอง" },
      { merchant_sku: "IG-B02", qty_available: "1,000" },
    ]);
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(2);
    const a = items.find((x) => codeKey(x.code) === "IG-A01")!;
    expect(a).toMatchObject({ code: "IG-A01", name: "สาย A", available: 5, onHand: 6, warehouses: ["คลังหลัก", "คลังสอง"], rows: [2, 3] });
    expect(items.find((x) => x.code === "IG-B02")).toMatchObject({ available: 1000, onHand: null });
  });

  it("เลือกเฉพาะคลังเดียวได้", () => {
    const { items, skipped } = normalizeBigSellerRows([
      { merchant_sku: "IG-A01", qty_available: 3, warehouse: "คลังหลัก" },
      { merchant_sku: "IG-A01", qty_available: 9, warehouse: "คลังสอง" },
    ], { warehouse: "คลังหลัก" });
    expect(items).toHaveLength(1);
    expect(items[0].available).toBe(3);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].row).toBe(3);
  });

  it("ข้ามแถวที่ไม่มีรหัส / ไม่มียอด / ยอดติดลบ พร้อมเหตุผล", () => {
    const { items, skipped } = normalizeBigSellerRows([
      { merchant_sku: "", qty_available: 1 },
      { merchant_sku: "IG-X", qty_available: "", qty_on_hand: "-" },
      { merchant_sku: "IG-Y", qty_available: -2 },
      { merchant_sku: "IG-OK", qty_on_hand: 0 },
    ]);
    expect(items.map((i) => i.code)).toEqual(["IG-OK"]);
    expect(skipped.map((s) => s.reason)).toEqual(["ไม่มีรหัส SKU", "ไม่มีจำนวนสต๊อก", "จำนวนติดลบ"]);
  });

  it("ติดป้ายสินค้าชุด", () => {
    const { items } = normalizeBigSellerRows([{ merchant_sku: "SET-1", qty_available: 4, sku_type: "Combination SKU" }]);
    expect(items[0].isCombo).toBe(true);
  });
});

describe("ยอดที่ใช้เทียบ / ตั้งต้น", () => {
  it("เทียบใช้พร้อมขายก่อน · ตั้งต้นใช้ของในคลังก่อน", () => {
    expect(compareQtyOf({ available: 3, onHand: 5 })).toBe(3);
    expect(openingQtyOf({ available: 3, onHand: 5 })).toBe(5);
    expect(compareQtyOf({ available: null, onHand: 5 })).toBe(5);
    expect(openingQtyOf({ available: 3, onHand: null })).toBe(3);
  });
});

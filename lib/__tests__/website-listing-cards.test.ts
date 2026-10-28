import { describe, it, expect } from "vitest";
import { DEFAULT_LISTING, LISTING_ALL_KEY, LISTING_SKU_ORDERS, listingCardModeFor, normalizeListing } from "../website-listing";
import { normalizeFieldMap, resolveProduct, type ChildSku, type ParentRow } from "../website-field-map";

/**
 * 🎨 การ์ดทีละสี (SKU) ในหน้ารายการสินค้า (2026-10-28)
 * กันพลาด: ร้านเดิมหน้าตาเดิม (แบบรุ่น) · อัตโนมัติตามจำนวนรุ่น · ตั้งรายหมวดชนะค่าทั้งเว็บ · ค่าแปลกถูกตัด
 */
describe("🎨 การ์ดแบบรุ่น / ทีละสี ในหน้ารายการ", () => {
  it("ค่าเริ่ม = แบบรุ่น (ร้านเดิมไม่เปลี่ยน) · ปุ่มสลับปิด", () => {
    const l = normalizeListing({});
    expect(l).toMatchObject({ cardMode: "parent", cardAutoMax: 6, skuOrder: "mix", cardModeByCat: {}, cardSwitch: false });
    expect(DEFAULT_LISTING.cardMode).toBe("parent");
    expect(listingCardModeFor(l, "bags", 1)).toBe("parent");
  });
  it("อัตโนมัติ: หมวดที่มีรุ่นน้อยกว่าที่ตั้ง = ทีละสี · ถึงแล้ว = แบบรุ่น", () => {
    const l = normalizeListing({ cardMode: "auto", cardAutoMax: 6 });
    expect(listingCardModeFor(l, "accessories", 2)).toBe("sku");
    expect(listingCardModeFor(l, "bag-charms", 5)).toBe("sku");
    expect(listingCardModeFor(l, "card-holders", 6)).toBe("parent");
    expect(listingCardModeFor(l, LISTING_ALL_KEY, 35)).toBe("parent");
  });
  it("ตั้งรายหมวดชนะค่าทั้งเว็บ (ทั้งสองทาง) · หน้าสินค้าทั้งหมดตั้งได้ด้วยรหัส all", () => {
    const l = normalizeListing({ cardMode: "auto", cardAutoMax: 6, cardModeByCat: { accessories: "parent", bags: "sku", all: "sku" } });
    expect(listingCardModeFor(l, "accessories", 2)).toBe("parent");
    expect(listingCardModeFor(l, "bags", 16)).toBe("sku");
    expect(listingCardModeFor(l, LISTING_ALL_KEY, 35)).toBe("sku");
    expect(listingCardModeFor(normalizeListing({ cardMode: "sku" }), "bags", 16)).toBe("sku");
  });
  it("↕ เรียงการ์ดสี: สลับรุ่น / ทีละรุ่น / ตามรหัส SKU / สุ่ม เก็บได้ครบ · ค่าเริ่ม = สลับรุ่น", () => {
    for (const v of ["mix", "group", "code", "random"] as const) expect(normalizeListing({ skuOrder: v }).skuOrder).toBe(v);
    expect(LISTING_SKU_ORDERS.map((o) => o.value)).toEqual(["mix", "group", "code", "random"]);
    expect(normalizeListing({ skuOrder: "price" }).skuOrder).toBe("mix");
  });
  it("ค่าแปลกถูกตัด: โหมด/ลำดับไม่รู้จัก · จำนวนนอกช่วง · รหัสหมวด/ค่าไม่ถูก", () => {
    const l = normalizeListing({ cardMode: "x", cardAutoMax: 999, skuOrder: "y", cardSwitch: "yes", cardModeByCat: { "ok-1": "sku", "bad key": "sku", ok2: "auto", "<x>": "parent" } });
    expect(l).toMatchObject({ cardMode: "parent", cardAutoMax: 30, skuOrder: "mix", cardSwitch: false, cardModeByCat: { "ok-1": "sku" } });
    expect(normalizeListing({ cardAutoMax: 0 }).cardAutoMax).toBe(2);
    expect(normalizeListing({ cardModeByCat: ["sku"] }).cardModeByCat).toEqual({});
  });
});

describe("↕ ตามรหัส SKU: products API ส่งรหัส SKU ของแต่ละสี", () => {
  const kid = (n: number, code: string, color: string, color_index: number | null = null) =>
    ({ id: `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`, code, color, color_th: null, color_index, list_price: 790, cover_image_r2_key: null, attribute_values: {} }) as ChildSku;
  it("รหัสตัวแรกของสีนั้น (ตัดช่องว่างท้าย) · สีที่ไม่มีรหัส = ไม่ส่ง", () => {
    const map = normalizeFieldMap({ options: { source: "sku_color", label: "สี" } });
    const parent = { id: "p", code: "PIX34", name_th: "x" } as unknown as ParentRow;
    const r = resolveProduct(map, parent, [kid(2, "PIX34-02", "Plum"), kid(1, "PIX34-01  ", "Blackberry"), kid(3, "PIX34-01L", "Blackberry"), kid(4, "", "Berry")], null, null);
    expect(r.options?.items.map((i) => [i.label, i.code])).toEqual([
      ["Berry", undefined],
      ["Blackberry", "PIX34-01"],
      ["Plum", "PIX34-02"],
    ]);
  });
});

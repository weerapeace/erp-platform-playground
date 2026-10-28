import { describe, it, expect } from "vitest";
import { DEFAULT_LISTING, LISTING_ALL_KEY, listingCardModeFor, normalizeListing } from "../website-listing";

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
  it("ค่าแปลกถูกตัด: โหมด/ลำดับไม่รู้จัก · จำนวนนอกช่วง · รหัสหมวด/ค่าไม่ถูก", () => {
    const l = normalizeListing({ cardMode: "x", cardAutoMax: 999, skuOrder: "y", cardSwitch: "yes", cardModeByCat: { "ok-1": "sku", "bad key": "sku", ok2: "auto", "<x>": "parent" } });
    expect(l).toMatchObject({ cardMode: "parent", cardAutoMax: 30, skuOrder: "mix", cardSwitch: false, cardModeByCat: { "ok-1": "sku" } });
    expect(normalizeListing({ cardAutoMax: 0 }).cardAutoMax).toBe(2);
    expect(normalizeListing({ cardModeByCat: ["sku"] }).cardModeByCat).toEqual({});
  });
});

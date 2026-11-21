/**
 * เทสต์ "เปิดหน้าใหม่ให้เช็กหลังส่งขึ้นร้าน" (lib/push-open) — เจ้าของเลือก 2026-11-21 แบบ A · ค่าหลัก Seller Center · ข้อ 1-3
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_PUSH_OPEN, PUSH_OPEN_MAX_TABS, parsePushOpenPrefs, planPushOpen, pushOpenPageFor, pushOpenTabBudget, pushOpenTargets, type PushOpenPrefs } from "../push-open";

const on = (p: Partial<PushOpenPrefs> = {}): PushOpenPrefs => ({ ...DEFAULT_PUSH_OPEN, enabled: true, ...p });

describe("ค่าตั้ง", () => {
  it("ค่าเริ่มต้น = ปิด · ค่าหลัก Seller Center · ค่าผิดรูป = null · ค่ารายร้านที่ไม่รู้จักถูกตัด", () => {
    expect(DEFAULT_PUSH_OPEN).toEqual({ enabled: false, page: "seller", perShop: {} });
    expect(parsePushOpenPrefs("x")).toBeNull();
    expect(parsePushOpenPrefs({ enabled: true, page: "store", perShop: { shopee: "both", lazada: "bad", tiktok: "off" } }))
      .toEqual({ enabled: true, page: "store", perShop: { shopee: "both", tiktok: "off" } });
    expect(parsePushOpenPrefs({ enabled: 1, page: "x" })).toEqual({ enabled: false, page: "seller", perShop: {} });
  });
  it("ปิดฟีเจอร์ = ไม่เปิด · ค่ารายร้านทับค่าหลัก · tiktok_shop ใช้ค่าของ tiktok", () => {
    expect(pushOpenPageFor(DEFAULT_PUSH_OPEN, "shopee")).toBe("off");
    const p = on({ perShop: { lazada: "off", tiktok: "store" } });
    expect(pushOpenPageFor(p, "shopee")).toBe("seller");
    expect(pushOpenPageFor(p, "lazada")).toBe("off");
    expect(pushOpenPageFor(p, "tiktok_shop")).toBe("store");
  });
});

describe("หน้าที่จะเปิด", () => {
  it("Seller Center ของ Shopee = หน้าแก้สินค้าตรง", () => {
    expect(pushOpenTargets({ code: "shopee", shopName: "Shopee", productId: "123" }, "seller"))
      .toEqual([{ url: "https://seller.shopee.co.th/portal/product/123", title: "Shopee · Shopee Seller Centre" }]);
  });
  it("ข้อ 2: หน้าสินค้ายังไม่พร้อม (ปิดขาย / ร่าง / ไม่มี Shop ID) → เปิด Seller Center แทน + เหตุผล", () => {
    const hidden = pushOpenTargets({ code: "shopee", shopName: "Shopee", productId: "1", shopRef: "9944732", state: "hidden" }, "store");
    expect(hidden).toHaveLength(1);
    expect(hidden[0].url).toBe("https://seller.shopee.co.th/portal/product/1");
    expect(hidden[0].note).toContain("ปิดขายไว้");
    const live = pushOpenTargets({ code: "shopee", shopName: "Shopee", productId: "1", shopRef: "9944732", state: "live" }, "store");
    expect(live[0].url).toBe("https://shopee.co.th/product/9944732/1");
    const noShop = pushOpenTargets({ code: "shopee", shopName: "Shopee", productId: "1", state: "live" }, "store");
    expect(noShop[0].note).toContain("Shop ID");
  });
  it("ไม่มีลิงก์ตรงเข้าหลังร้าน (TikTok/LINE) → หน้าแรกหลังร้าน + คัดลอกรหัส · ทั้งสองหน้า = 2 หน้า", () => {
    const tt = pushOpenTargets({ code: "tiktok", shopName: "TikTok", productId: "77", state: "live" }, "both");
    expect(tt.map((t) => t.url)).toEqual(["https://shop.tiktok.com/view/product/77?region=TH", "https://seller-th.tiktok.com/"]);
    expect(tt[1].copyId).toBe("77");
  });
  it("เว็บร้าน: ผู้เรียกส่งหน้าแก้ใน ERP มาแทน Seller Center", () => {
    expect(pushOpenTargets({ code: "website", shopName: "เว็บร้าน", productId: "x", links: { sellerCenter: "/website?edit=x", sellerExact: true, sellerLabel: "หน้าแก้ใน ERP" } }, "seller"))
      .toEqual([{ url: "/website?edit=x", title: "เว็บร้าน · หน้าแก้ใน ERP" }]);
  });
});

describe("หลายชิ้น / จำนวนแท็บ", () => {
  it("ข้อ 1: แท็บที่เปิดรอไว้ไม่เกิน 5 · ทั้งสองหน้า = 2 แท็บต่อชิ้น · ร้านที่ปิด = 0", () => {
    const p = on({ perShop: { lazada: "off", tiktok: "both" } });
    expect(pushOpenTabBudget([{ code: "shopee" }, { code: "lazada" }, { code: "tiktok" }], p)).toBe(3);
    expect(pushOpenTabBudget(Array.from({ length: 9 }, () => ({ code: "shopee" })), p)).toBe(PUSH_OPEN_MAX_TABS);
    expect(pushOpenTabBudget([{ code: "shopee" }], DEFAULT_PUSH_OPEN)).toBe(0);
  });
  it("planPushOpen เรียงตามที่ส่ง ข้ามร้านที่ปิด", () => {
    const p = on({ perShop: { lazada: "off" } });
    const t = planPushOpen([
      { code: "lazada", shopName: "Lazada", productId: "5" },
      { code: "shopee", shopName: "Shopee", productId: "6" },
    ], p);
    expect(t.map((x) => x.url)).toEqual(["https://seller.shopee.co.th/portal/product/6"]);
  });
});

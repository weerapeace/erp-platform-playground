import { describe, expect, it } from "vitest";
import { listingLinks, platformShopUrl } from "./platform-links";

describe("platformShopUrl (ย้ายมาจากหน้าบัญชีร้าน — ผลต้องเหมือนเดิม)", () => {
  it("ลิงก์เต็ม = คืนเดิม · @handle = สร้างตามร้าน · ว่าง/ไม่รู้จัก = null", () => {
    expect(platformShopUrl("line_shopping", "https://shop.line.me/@louismontini")).toBe("https://shop.line.me/@louismontini");
    expect(platformShopUrl("line_shopping", "@iginternational")).toBe("https://shop.line.me/@iginternational");
    expect(platformShopUrl("lazada", "igshop")).toBe("https://www.lazada.co.th/shop/igshop");
    expect(platformShopUrl("tiktok", "@ig")).toBe("https://www.tiktok.com/@ig");
    expect(platformShopUrl("shopee", " ")).toBeNull();
    expect(platformShopUrl("unknown", "x")).toBeNull();
  });
});

describe("listingLinks", () => {
  it("Lazada: หน้าร้านจากรหัสสินค้า + หลังร้านหน้าแก้สินค้าตรง (ไม่ต้องตั้งอะไร)", () => {
    expect(listingLinks("lazada", "16196625125", null)).toEqual({
      storefront: "https://www.lazada.co.th/products/i16196625125.html", storefrontHint: null,
      sellerCenter: "https://sellercenter.lazada.co.th/apps/product/publish?productId=16196625125", sellerExact: true, sellerLabel: "Lazada Seller Center",
    });
  });
  it("LINE: ลิงก์ร้านเต็ม (ข้อมูลจริง) / @handle → /product/{id} · ไม่มีลิงก์ร้าน = บอกให้ตั้ง · หลังร้าน = หน้าแรก MyShop", () => {
    expect(listingLinks("line_shopping", "1008265026", "https://shop.line.me/@louismontini").storefront).toBe("https://shop.line.me/@louismontini/product/1008265026");
    expect(listingLinks("line_shopping", "1008265026", "https://shop.line.me/@louismontini/").storefront).toBe("https://shop.line.me/@louismontini/product/1008265026");
    expect(listingLinks("line_shopping", "1", "@iginternational").storefront).toBe("https://shop.line.me/@iginternational/product/1");
    const none = listingLinks("line_shopping", "1", null);
    expect(none.storefront).toBeNull();
    expect(none.storefrontHint).toContain("บัญชีร้าน");
    expect(none).toMatchObject({ sellerCenter: "https://oaplus.line.biz/", sellerExact: false });
  });
  it("Shopee: หน้าร้านต้องมี Shop ID ตัวเลข (ตัวเลขล้วน / ดึงจากลิงก์สินค้า) · หลังร้านใช้แค่รหัสสินค้า", () => {
    expect(listingLinks("shopee", "10132767542", "123456").storefront).toBe("https://shopee.co.th/product/123456/10132767542");
    expect(listingLinks("shopee", "10132767542", "https://shopee.co.th/bag-i.987.555").storefront).toBe("https://shopee.co.th/product/987/10132767542");
    const noShop = listingLinks("shopee", "10132767542", "https://shopee.co.th/louismontini");
    expect(noShop.storefront).toBeNull();
    expect(noShop.storefrontHint).toContain("Shop ID");
    expect(noShop).toMatchObject({ sellerCenter: "https://seller.shopee.co.th/portal/product/10132767542", sellerExact: true });
  });
  it("TikTok: หน้าสินค้า + หลังร้านหน้าแรก", () => {
    expect(listingLinks("tiktok_shop", "17293", null)).toMatchObject({ storefront: "https://shop.tiktok.com/view/product/17293?region=TH", sellerExact: false });
  });
  it("ไม่มีรหัส / ร้านที่ไม่รู้จัก = ไม่มีลิงก์", () => {
    expect(listingLinks("lazada", "", null)).toMatchObject({ storefront: null, sellerCenter: null });
    expect(listingLinks("website", "x", null)).toMatchObject({ storefront: null, sellerCenter: null });
  });
});

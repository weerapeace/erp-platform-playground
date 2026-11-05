import { describe, it, expect } from "vitest";
import { convertPrice, currencyMismatch, isChinaShop, isCny, normCurrency, shopDefaultCurrency } from "@/lib/po-currency";

describe("สกุลเงินใบสั่งซื้อ เทียบกับร้าน", () => {
  it("สะกดหยวนได้หลายแบบ", () => {
    expect(isCny("YUAN")).toBe(true);
    expect(isCny("rmb")).toBe(true);
    expect(isCny("THB")).toBe(false);
    expect(normCurrency("CNY")).toBe("RMB");
    expect(normCurrency(null)).toBe("THB");
  });
  it("ร้านจีน = ประเทศจีน / Taobao / ตั้งสกุลหยวน", () => {
    expect(isChinaShop({ shop_country: "จีน", default_currency: "THB" })).toBe(true);
    expect(isChinaShop({ shop_country: null, default_currency: "RMB" })).toBe(true);
    expect(isChinaShop({ is_taobao: true })).toBe(true);
    expect(isChinaShop({ shop_country: "ไทย", default_currency: "THB" })).toBe(false);
    expect(isChinaShop(null)).toBe(false);
  });
  it("สกุลตั้งต้นของร้าน", () => {
    expect(shopDefaultCurrency({ shop_country: "จีน", default_currency: "THB" })).toBe("RMB");
    expect(shopDefaultCurrency({ shop_country: null, default_currency: "THB" })).toBe("THB");
    expect(shopDefaultCurrency(null)).toBeNull();
  });
  it("ร้านจีนแต่ใบเป็นบาท = เตือน", () => {
    expect(currencyMismatch("THB", { shop_country: "จีน" })).toBe(true);
    expect(currencyMismatch("YUAN", { shop_country: "จีน" })).toBe(false);
    expect(currencyMismatch("THB", { shop_country: "ไทย" })).toBe(false);
  });
  it("เปลี่ยนป้าย = ตัวเลขเดิม · แปลง = ตามเรท", () => {
    expect(convertPrice(45, "THB", "RMB", "relabel", 0)).toBe(45);
    expect(convertPrice(45, "THB", "RMB", "convert", 4.85)).toBeCloseTo(9.2784, 4);
    expect(convertPrice(10, "RMB", "THB", "convert", 4.85)).toBe(48.5);
    expect(convertPrice(10, "RMB", "YUAN", "convert", 4.85)).toBe(10);
    expect(() => convertPrice(45, "THB", "RMB", "convert", 0)).toThrow();
  });
});

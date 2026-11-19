import { describe, expect, it } from "vitest";
import { lineNeedsSku, looksNonProduct, skuLinkErrorText, unlinkedLineNames } from "@/lib/so-sku-link";

describe("ใบสั่งขายต้องผูก SKU (2026-11-19)", () => {
  it("ชื่อค่าบริการ = ไม่ใช่สินค้า", () => {
    expect(looksNonProduct("ค่าส่ง")).toBe(true);
    expect(looksNonProduct(" ค่าบล็อกสกรีน")).toBe(true);
    expect(looksNonProduct("มัดจำ 50%")).toBe(true);
    expect(looksNonProduct("กระเป๋าใส่เหรียญ GG x Disney")).toBe(false);
  });
  it("ต้องผูกเมื่อไม่มีรหัสและไม่ได้ติ๊กไม่ใช่สินค้า", () => {
    expect(lineNeedsSku({ sku: "GG-1" })).toBe(false);
    expect(lineNeedsSku({ sku: "  " })).toBe(true);
    expect(lineNeedsSku({ sku: null, non_product: true })).toBe(false);
  });
  it("รายชื่อ + ข้อความ", () => {
    const names = unlinkedLineNames([{ sku: "A", product_name: "x" }, { sku: null, product_name: "กระเป๋า" }, { sku: null, product_name: "ค่าส่ง", non_product: true }]);
    expect(names).toEqual(["กระเป๋า"]);
    expect(skuLinkErrorText(names)).toContain("1 รายการ");
  });
});

import { describe, it, expect } from "vitest";
import { normalizeTheme, mergeTheme, PRODUCT_LAYOUTS, SHOWCASE_FAMILY } from "../website-theme";

/** 🏛 หน้าสินค้า Style จากเว็บแบรนด์หรู (stack / columns / story) + ของเสริม (extras) — เว็บร้าน ProductLuxe */
describe("หน้าสินค้า: Style ใหม่ + ของเสริม", () => {
  it("เลือกได้ 5 แบบ · ค่าแปลก = คลาสสิก (ค่าเริ่ม) · ธีมเก่าไม่มี layout = คลาสสิกเหมือนเดิม", () => {
    expect(PRODUCT_LAYOUTS.map((x) => x.value)).toEqual(["classic", "showcase", "stack", "columns", "story"]);
    for (const v of ["stack", "columns", "story", "showcase"]) expect(normalizeTheme({ product: { layout: v } }).product.layout).toBe(v);
    expect(normalizeTheme({ product: { layout: "magazine" } }).product.layout).toBe("classic");
    expect(normalizeTheme({}).product.layout).toBe("classic");
    expect(SHOWCASE_FAMILY).not.toContain("classic");
  });

  it("ของเสริม: ไม่ได้ตั้ง = เปิดทั้งหมด · ปิดแล้วรอดการบันทึก (normalize + merge)", () => {
    expect(normalizeTheme({}).product.extras).toEqual({ stickyBuy: true, pairWith: true, lightbox: true, progress: true });
    const t = normalizeTheme({ product: { layout: "story", extras: { pairWith: false, progress: false, junk: 1 } } });
    expect(t.product.extras).toEqual({ stickyBuy: true, pairWith: false, lightbox: true, progress: false });
    const merged = mergeTheme({}, { product: t.product }) as { product: { extras: unknown } };
    expect(normalizeTheme(merged).product.extras).toEqual(t.product.extras);
  });
});

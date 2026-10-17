import { describe, expect, it } from "vitest";
import { defaultOverPages, normalizeOverPages, overPageKind } from "../website-header-over";

describe("header over pages", () => {
  it("ค่าเก่า overHero = เปิดแถวหน้าแรกอย่างเดียว", () => {
    const p = normalizeOverPages(undefined, true);
    expect(p.home).toEqual({ on: true, text: "light" });
    expect(p.product.on).toBe(false);
    expect(normalizeOverPages(null, false).home.on).toBe(false);
  });
  it("อ่านค่ารายหน้า + กันค่าเพี้ยน", () => {
    const p = normalizeOverPages({ product: { on: true, text: "dark" }, new: { on: true, text: "x" }, home: "bad" }, true);
    expect(p.product).toEqual({ on: true, text: "dark" });
    expect(p.new).toEqual({ on: true, text: defaultOverPages().new.text });
    expect(p.home.on).toBe(true);
  });
  it("path → ประเภทหน้า", () => {
    expect(overPageKind("/")).toBe("home");
    expect(overPageKind("")).toBe("home");
    expect(overPageKind("/product/roar-2000s")).toBe("product");
    expect(overPageKind("/shop")).toBe("listing");
    expect(overPageKind("/c/bags")).toBe("listing");
    expect(overPageKind("/collection/summer")).toBe("listing");
    expect(overPageKind("/new")).toBe("new");
    expect(overPageKind("/about-us")).toBe("custom");
    expect(overPageKind("/cart")).toBe("other");
    expect(overPageKind("/account/orders")).toBe("other");
    expect(overPageKind("/track?no=1")).toBe("other");
  });
});

import { describe, it, expect } from "vitest";
import { normalizeTheme, mergeTheme, PRODUCT_LAYOUTS, SHOWCASE_FAMILY, MATERIAL_VIEWS } from "../website-theme";
import { DEFAULT_PRODUCT_LUXE, normalizeProductLuxe } from "../website-product-luxe";

/** 🏛 หน้าสินค้า Style จากเว็บแบรนด์หรู (stack / columns / story) + ของเสริม (extras) + ปรับหน้าตา (luxe) — เว็บร้าน ProductLuxe */
describe("หน้าสินค้า: Style ใหม่ + ของเสริม", () => {
  it("เลือกได้ 5 แบบ · ค่าแปลก = คลาสสิก (ค่าเริ่ม) · ธีมเก่าไม่มี layout = คลาสสิกเหมือนเดิม", () => {
    expect(PRODUCT_LAYOUTS.map((x) => x.value)).toEqual(["classic", "showcase", "stack", "columns", "story"]);
    for (const v of ["stack", "columns", "story", "showcase"]) expect(normalizeTheme({ product: { layout: v } }).product.layout).toBe(v);
    expect(normalizeTheme({ product: { layout: "magazine" } }).product.layout).toBe("classic");
    expect(normalizeTheme({}).product.layout).toBe("classic");
    expect(SHOWCASE_FAMILY).not.toContain("classic");
  });

  it("ของเสริม: ไม่ได้ตั้ง = เปิดทั้งหมด · ปิดแล้วรอดการบันทึก (normalize + merge)", () => {
    expect(normalizeTheme({}).product.extras).toEqual({ stickyBuy: true, pairWith: true, lightbox: true, progress: true, thumbs: true, heroVideo: true, hoverZoom: true });
    const t = normalizeTheme({ product: { layout: "story", extras: { pairWith: false, progress: false, hoverZoom: false, junk: 1 } } });
    expect(t.product.extras).toEqual({ stickyBuy: true, pairWith: false, lightbox: true, progress: false, thumbs: true, heroVideo: true, hoverZoom: false });
    const merged = mergeTheme({}, { product: t.product }) as { product: { extras: unknown } };
    expect(normalizeTheme(merged).product.extras).toEqual(t.product.extras);
  });

  it("วัสดุกดได้: เลือก 'ปิด' ได้ · ค่าเก่า = ไปหน้าวัสดุเต็มเหมือนเดิม", () => {
    expect(MATERIAL_VIEWS.map((x) => x.value)).toContain("off");
    expect(normalizeTheme({ product: { materialView: "off" } }).product.materialView).toBe("off");
    expect(normalizeTheme({}).product.materialView).toBe("page");
  });
});

describe("หน้าสินค้า: ปรับหน้าตา Style ใหม่ (luxe)", () => {
  it("ไม่ได้ตั้ง = หน้าตารอบแรก (ทีละรูป · ตามแบบ · รูปเต็มจอ · แถบคราฟต์เปิด · แถวความมั่นใจปิด)", () => {
    const l = normalizeTheme({}).product.luxe;
    expect(l).toEqual(DEFAULT_PRODUCT_LUXE);
    expect([l.gridCols, l.mediaWidth, l.gap, l.mediaHeight, l.heroHeight, l.craft.show, l.trust.show]).toEqual([1, 0, "auto", "auto", "screen", true, false]);
    expect(l.trust.items).toHaveLength(4);
  });

  it("ค่ามั่ว = ค่าเริ่ม · ตัดเข้าช่วง · แถวความมั่นใจ ≤ 4 ข้อ · สีเองต้องเป็น #rrggbb", () => {
    const l = normalizeProductLuxe({
      gridCols: 3, mediaWidth: 99, gap: "huge", heroShade: 200, heroPos: "<x>",
      craft: { show: false, bg: "custom", hex: "#ABCDEF", side: "right", title: "เย็บมือ" },
      trust: { show: true, items: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, icon: "✔", text: `ข้อ ${i}` })) },
    });
    expect([l.gridCols, l.mediaWidth, l.gap, l.heroShade, l.heroPos]).toEqual([1, 0, "auto", 80, "bottom-left"]);
    expect(l.craft).toMatchObject({ show: false, bg: "custom", hex: "#abcdef", side: "right", title: "เย็บมือ" });
    expect(l.trust.items).toHaveLength(4);
    expect(normalizeProductLuxe({ craft: { bg: "custom", hex: "red" } }).craft.hex).toBe("");
    expect(normalizeProductLuxe({ mediaWidth: 62 }).mediaWidth).toBe(62);
  });

  it("คำแปลอังกฤษ (หัวข้องานคราฟต์ / ข้อความความมั่นใจ) ไม่หายตอนบันทึก", () => {
    const t = normalizeTheme({
      product: { luxe: { craft: { title: "เย็บมือ", title_en: "Hand-stitched" }, trust: { show: true, items: [{ id: "t1", icon: "🚚", text: "ส่งฟรี", text_en: "Free shipping" }] } } },
    });
    const l = t.product.luxe as unknown as { craft: Record<string, unknown>; trust: { items: Record<string, unknown>[] } };
    expect(l.craft.title_en).toBe("Hand-stitched");
    expect(l.trust.items[0].text_en).toBe("Free shipping");
  });
});

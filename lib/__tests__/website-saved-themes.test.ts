import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, FINE_COLOR_DEFAULTS, normalizeTheme, resolveOnBrand, tintPctOf, ON_BRAND_DARK } from "@/lib/website-theme";
import { applySavedTheme, themeLookOf, cleanSavedThemeScope } from "@/lib/website-saved-themes";
import { applyFullPreset, FULL_THEME_PRESETS } from "@/lib/website-theme-presets";

describe("สีละเอียด (normalizeTheme)", () => {
  it("ธีมเก่าที่ไม่มีช่องใหม่ = ค่าเริ่มต้น (หน้าตาเดิม)", () => {
    const t = normalizeTheme({ colors: { brand: "#123456" } });
    expect(t.colors.brand).toBe("#123456");
    for (const k of Object.keys(FINE_COLOR_DEFAULTS) as (keyof typeof FINE_COLOR_DEFAULTS)[]) expect(t.colors[k]).toBe(FINE_COLOR_DEFAULTS[k]);
  });
  it("รับค่าที่ถูก / ตัดค่าแปลก / auto / จำกัดความเข้ม", () => {
    const t = normalizeTheme({ colors: { onBrand: "auto", line: "#ddd", link: "red", price: "#C00", sale: "", stockIn: "x", softPct: 99 } });
    expect(t.colors.onBrand).toBe("auto");
    expect(t.colors.line).toBe("#ddd");
    expect(t.colors.link).toBe("");
    expect(t.colors.price).toBe("#C00");
    expect(t.colors.sale).toBe("");
    expect(t.colors.stockIn).toBe(FINE_COLOR_DEFAULTS.stockIn);
    expect(t.colors.softPct).toBe(40);
  });
  it("ตัวอักษรบนสีหลักอัตโนมัติ: สีเข้ม → ขาว · สีอ่อน → ดำ", () => {
    expect(resolveOnBrand({ brand: "#1E3A5F", onBrand: "auto" })).toBe("#FFFFFF");
    expect(resolveOnBrand({ brand: "#FFD54F", onBrand: "auto" })).toBe(ON_BRAND_DARK);
    expect(resolveOnBrand({ brand: "#FFD54F", onBrand: "#FFFFFF" })).toBe("#FFFFFF");
  });
  it("สีจางมากตามสัดส่วน (ค่าเดิม 14 → 5)", () => {
    expect(tintPctOf(14)).toBe(5);
    expect(tintPctOf(4)).toBe(2);
    expect(tintPctOf(28)).toBe(10);
  });
});

describe("ธีมที่บันทึกไว้", () => {
  const cur = normalizeTheme({
    colors: { brand: "#111111", price: "#AA0000" },
    logo: { text: "ร้าน A", mark: "A" },
    header: { button: { text: "ติดต่อ", href: "/contact" }, height: 80 },
    product: { layout: "showcase", partBox: { buy: { width: "full", spaceTop: "lg" } } },
  });

  it("บันทึกทั้งชุด: ไม่เก็บโลโก้/เมนู/ท้ายเว็บ/ปุ่มหัวเว็บ/ส่วนประกอบหน้าสินค้า", () => {
    const look = themeLookOf(cur, "full");
    expect(Object.keys(look).sort()).toEqual(["card", "colors", "fonts", "header", "logo", "page", "product", "radius", "shape", "typography"].sort());
    expect(look.logo).toEqual({ placeholder: cur.logo.placeholder });
    expect((look.header as Record<string, unknown>).button).toBeUndefined();
    expect((look.header as Record<string, unknown>).zones).toBeUndefined();
    expect((look.product as Record<string, unknown>).partBox).toBeUndefined();
    expect((look.product as Record<string, unknown>).detailItems).toBeUndefined();
    expect((look.colors as Record<string, unknown>).price).toBe("#AA0000");
  });

  it("บันทึกเฉพาะสี: มีแค่สี + สีป้ายลดราคา", () => {
    const look = themeLookOf(cur, "colors");
    expect(Object.keys(look).sort()).toEqual(["card", "colors"]);
    expect(look.card).toEqual({ autoBadges: { saleColor: cur.card.autoBadges.saleColor } });
  });

  it("ใช้ธีมร้านอื่น: หน้าตาเปลี่ยน · เนื้อหาร้านเดิมคงอยู่", () => {
    const other = normalizeTheme({ colors: { brand: "#8C2F2B", stockIn: "#00AA00" }, fonts: { display: "Trirong", body: "Sarabun" }, header: { height: 64, button: { text: "ไม่ควรมา", href: "/x" } }, product: { layout: "classic" }, logo: { text: "ร้าน B" } });
    const out = applySavedTheme(cur, { scope: "full", theme: themeLookOf(other, "full") });
    expect(out.colors.brand).toBe("#8C2F2B");
    expect(out.colors.stockIn).toBe("#00AA00");
    expect(out.colors.price).toBe(""); // ธีมที่ใช้ไม่ได้ตั้งราคา → ตามเดิม
    expect(out.fonts.display).toBe("Trirong");
    expect(out.header.height).toBe(64);
    expect(out.header.button).toEqual(cur.header.button);
    expect(out.logo.text).toBe("ร้าน A");
    expect(out.product.partBox).toEqual(cur.product.partBox);
    expect(out.menu).toEqual(cur.menu);
    expect(out.footer).toEqual(cur.footer);
  });

  it("ใช้เฉพาะสี: ฟอนต์/หัวเว็บไม่เปลี่ยน", () => {
    const other = normalizeTheme({ colors: { brand: "#00FF00" }, fonts: { display: "Trirong", body: "Sarabun" } });
    const out = applySavedTheme(cur, { scope: "colors", theme: themeLookOf(other, "colors") });
    expect(out.colors.brand).toBe("#00FF00");
    expect(out.fonts).toEqual(cur.fonts);
    expect(out.header).toEqual(cur.header);
  });

  it("ธีมเก่าที่บันทึกก่อนมีช่องสีใหม่ = เติมค่าเริ่มต้น", () => {
    const out = applySavedTheme(cur, { scope: "colors", theme: { colors: { brand: "#222222", ink: "#000000", page: "#FFFFFF", surface: "#FFFFFF", muted: "#999999", brandDeep: "#000000" } } });
    expect(out.colors.line).toBe(FINE_COLOR_DEFAULTS.line);
    expect(out.colors.softPct).toBe(FINE_COLOR_DEFAULTS.softPct);
  });

  it("scope แปลก = ไม่รับ", () => {
    expect(cleanSavedThemeScope("all")).toBeNull();
    expect(cleanSavedThemeScope("full")).toBe("full");
  });

  it("ธีมสำเร็จรูปทั้งชุด: สีละเอียดกลับเป็นค่าเริ่มต้น", () => {
    const out = applyFullPreset(cur, FULL_THEME_PRESETS[0]);
    expect(out.colors.brand).toBe(FULL_THEME_PRESETS[0].colors.brand);
    expect(out.colors.price).toBe("");
    expect(DEFAULT_THEME.colors.line).toBe(FINE_COLOR_DEFAULTS.line);
  });
});

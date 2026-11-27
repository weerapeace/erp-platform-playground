import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  DEFAULT_TYPOGRAPHY, FONT_PAIRS, LATIN_FONTS, THEME_FONTS, TYPE_ATTRS, fontLoadKb, fontStack, fontsHref, headingSizes, normalizeTypography, typeEffects,
} from "../erp-theme-fonts";
import { GOOGLE_FONTS } from "../website-theme";
import { DEFAULT_THEME_CONFIG, mergeThemeConfig, normalizeThemeConfig } from "../erp-theme-config";
import { EFFECT_ATTRS, themeEffects } from "../erp-theme-effects";

describe("คลังฟอนต์ธีม", () => {
  it("ทุกฟอนต์ที่ต้องโหลดมีใน GOOGLE_FONTS พร้อมน้ำหนักที่ใช้ (กันรายการเพี้ยนกัน)", () => {
    for (const f of [...THEME_FONTS, ...LATIN_FONTS]) {
      if (!f.google) continue;
      const g = GOOGLE_FONTS.find((x) => x.name === f.google);
      expect(g, f.google).toBeTruthy();
      for (const w of f.weights) expect(g!.weights.includes(w), `${f.google} ${w}`).toBe(true);
    }
  });
  it("key ไม่ซ้ำ + คู่แนะนำชี้ฟอนต์ที่มีจริง", () => {
    const keys = THEME_FONTS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of FONT_PAIRS) { expect(keys).toContain(p.heading); expect(keys).toContain(p.body); }
  });
  it("ค่าเริ่ม = ไม่มี attr = หน้าตาเดิม · ไม่ต้องโหลดฟอนต์", () => {
    expect(typeEffects(DEFAULT_TYPOGRAPHY).attrs).toEqual({});
    expect(fontLoadKb(DEFAULT_TYPOGRAPHY)).toBe(0);
    expect(fontStack("inter-noto", null)).toBe("'Inter','Noto Sans Thai',system-ui,sans-serif");
  });
  it("ฟอนต์อังกฤษวางหน้าฟอนต์ไทย", () => {
    expect(fontStack("sarabun", "poppins")).toBe("'Poppins','Sarabun',system-ui,sans-serif");
    expect(fontStack("sarabun", "inter")).toBe("'Inter','Sarabun',system-ui,sans-serif");
  });
  it("ลิงก์ Google Fonts ใช้เฉพาะน้ำหนักที่มี", () => {
    const itim = THEME_FONTS.find((f) => f.key === "itim")!;
    expect(fontsHref([itim])).toBe("https://fonts.googleapis.com/css2?family=Itim:wght@400&display=swap");
    expect(fontsHref([THEME_FONTS[0]])).toBeNull();
  });
  it("กรองค่าเพี้ยน + ย้ายขนาดหัวข้อแบบเก่าจาก chrome", () => {
    const t = normalizeTypography({ font: "comic", headingFont: "kanit", latinFont: "x", baseSize: 99, headingScale: 9, lineHeight: "?", numbers: "mono", weights: { button: 800, menu: 700 } });
    expect(t).toMatchObject({ font: "inter-noto", headingFont: "kanit", latinFont: null, baseSize: 17, headingScale: 2, lineHeight: "normal", numbers: "mono", weights: { button: null, tableHead: null, menu: 700 } });
    expect(normalizeTypography({}, "lg").headingScale).toBe(1.7);
    expect(normalizeTypography({ headingScale: null }, "lg").headingScale).toBeNull();
    expect(normalizeThemeConfig({ chrome: { headingSize: "sm" } }).typography.headingScale).toBe(1.3);
  });
  it("ตั้งครบ → attr ครบ และอยู่ในรายการล้าง", () => {
    const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, { typography: { headingFont: "kanit", headingWeight: 700, baseSize: 16, headingScale: 1.5, lineHeight: "loose", numbers: "tabular", weights: { button: 600, tableHead: 700, menu: 500 } } });
    const fx = themeEffects(cfg, { mobile: false, motionOff: false });
    for (const a of TYPE_ATTRS) expect(fx.attrs[a], a).toBeTruthy();
    for (const a of TYPE_ATTRS) expect((EFFECT_ATTRS as readonly string[]).includes(a), a).toBe(true);
    expect(fx.vars["--tm-h1"]).toBe(`${headingSizes(16, 1.5)[0]}px`);
    expect(fx.vars["--tm-fs-k"]).toBe("1.143");
  });
  it("CSS ใน globals มีกฎของทุก attr ตัวอักษร", () => {
    const css = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    for (const a of TYPE_ATTRS) expect(css.includes(`[data-${a}`), a).toBe(true);
  });
});

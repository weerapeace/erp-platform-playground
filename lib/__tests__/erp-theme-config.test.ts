import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_CONFIG,
  THEME_PRESETS,
  VEIL_MAX_OPACITY,
  autoFixContrast,
  contrastRatio,
  effectiveBgOpacity,
  mergeThemeConfig,
  mobileLiteConfig,
  normalizeThemeConfig,
  paletteFromPixels,
  presetConfig,
  scaleOf,
  themeCssVars,
  themeIssues,
} from "../erp-theme-config";
import { ORANGE_SCALE } from "../erp-theme";

describe("normalizeThemeConfig", () => {
  it("ค่าว่าง/ขยะ = ค่าเริ่ม", () => {
    expect(normalizeThemeConfig(null)).toEqual(DEFAULT_THEME_CONFIG);
    expect(normalizeThemeConfig("x")).toEqual(DEFAULT_THEME_CONFIG);
  });

  it("ตัดค่าเกินช่วง + สีผิดรูปแบบ", () => {
    const c = normalizeThemeConfig({
      colors: { primary: "red", accent: "#ABCDEF" },
      background: { opacity: 300, blur: -5, where: "sky" },
      gradient: { angle: "45" },
      typography: { baseSize: 40, headingWeight: 900, font: "comic" },
      shape: { radius: 99 },
      density: "huge",
    });
    expect(c.colors.primary).toBe(DEFAULT_THEME_CONFIG.colors.primary);
    expect(c.colors.accent).toBe("#abcdef");
    expect(c.background).toMatchObject({ opacity: 100, blur: 0, where: "page" });
    expect(c.gradient.angle).toBe(45);
    expect(c.typography).toEqual({ font: "inter-noto", baseSize: 16, headingWeight: 600 });
    expect(c.shape.radius).toBe(20);
    expect(c.density).toBe("normal");
  });

  it("merge แก้ลึกเฉพาะช่องที่ส่ง", () => {
    const c = mergeThemeConfig(DEFAULT_THEME_CONFIG, { gradient: { spots: { top: true } } });
    expect(c.gradient.spots).toEqual({ top: true, button: false, sidebar: false, banner: false, page: false });
    expect(c.gradient.color2).toBe(DEFAULT_THEME_CONFIG.gradient.color2);
  });
});

describe("สีและความอ่านง่าย", () => {
  it("สีเดิมได้ชุดเดิมเป๊ะ", () => {
    expect(scaleOf("#F97316")).toBe(ORANGE_SCALE);
  });

  it("contrastRatio ขาว/ดำ = 21", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
  });

  it("ธีมเริ่มต้นไม่เตือน", () => {
    expect(themeIssues(DEFAULT_THEME_CONFIG)).toEqual([]);
  });

  it("สีหลักอ่อนเกิน → เตือน แล้วแก้อัตโนมัติจนผ่าน", () => {
    const pale = mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { primary: "#fde68a" } });
    expect(themeIssues(pale).map((i) => i.key)).toContain("primary-button");
    const fixed = autoFixContrast(pale);
    expect(themeIssues(fixed).map((i) => i.key)).not.toContain("primary-button");
    expect(pale.colors.primary).toBe("#fde68a");
  });

  it("ตัวกันอ่านยาก: รูปทั้งหน้าไม่เกิน 40%", () => {
    const c = mergeThemeConfig(DEFAULT_THEME_CONFIG, { background: { image: "a.jpg", opacity: 90, veil: true } });
    expect(effectiveBgOpacity(c)).toBe(VEIL_MAX_OPACITY);
    const off = mergeThemeConfig(c, { background: { veil: false } });
    expect(effectiveBgOpacity(off)).toBe(90);
    expect(themeIssues(off).map((i) => i.key)).toContain("bg-veil");
  });

  it("โหมดเบามือถือ", () => {
    const c = mobileLiteConfig(presetConfig("creative-violet"));
    expect(c.animation.shine).toBe(false);
    expect(c.gradient.animate).toBe(false);
    expect(c.background.blur).toBe(0);
  });
});

describe("ธีมสำเร็จรูป", () => {
  it("มี 8 ชุด คีย์ไม่ซ้ำ · กรองแล้วไม่เตือนสีอ่านยาก", () => {
    expect(THEME_PRESETS).toHaveLength(8);
    expect(new Set(THEME_PRESETS.map((p) => p.key)).size).toBe(8);
    for (const p of THEME_PRESETS) {
      const c = presetConfig(p.key);
      expect(themeIssues(c).filter((i) => i.level === "warn"), p.key).toEqual([]);
    }
  });

  it("themeCssVars มีสีครบ + ตัวแปรอื่น", () => {
    const v = themeCssVars(presetConfig("ocean"));
    expect(v["--tm-primary-500"]).toBe("14 116 144");
    expect(v["--tm-radius"]).toBe("10px");
  });
});

describe("ดูดสีจากรูป", () => {
  it("เลือกสีที่เจอบ่อย + สีเน้นโทนต่าง · ข้ามสีเทา", () => {
    const px: number[] = [];
    const add = (r: number, g: number, b: number, n: number) => { for (let i = 0; i < n; i++) px.push(r, g, b, 255); };
    add(128, 128, 128, 500);   // เทา (ข้าม)
    add(14, 116, 144, 300);    // ฟ้าอมเขียว (บ่อยสุด)
    add(220, 38, 38, 100);     // แดง (โทนต่าง)
    const p = paletteFromPixels(px)!;
    expect(p.primary).toBe("#0e7490");
    expect(p.accent).toBe("#dc2626");
  });

  it("รูปไม่มีสีสด = null", () => {
    expect(paletteFromPixels([255, 255, 255, 255, 0, 0, 0, 255])).toBeNull();
  });
});

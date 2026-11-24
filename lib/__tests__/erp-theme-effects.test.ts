import { describe, expect, it } from "vitest";
import { BANNER_MAX_OPACITY, EFFECT_ATTRS, themeEffects } from "../erp-theme-effects";
import { DEFAULT_THEME_CONFIG, mergeThemeConfig, presetConfig } from "../erp-theme-config";

const pc = { mobile: false, motionOff: false };

describe("themeEffects", () => {
  it("ไม่มีธีม = ไม่ทาอะไร", () => {
    expect(themeEffects(null, pc)).toEqual({ attrs: {}, vars: {}, page: null, banner: null, mascot: null });
  });

  it("ธีมเริ่มต้น: ไม่มีเอฟเฟกต์ (ตัวนับเลขทำงานเหมือนเดิม)", () => {
    const e = themeEffects(DEFAULT_THEME_CONFIG, pc);
    expect(e.attrs).toEqual({});
    expect(e.page).toBeNull(); expect(e.banner).toBeNull(); expect(e.mascot).toBeNull();
  });

  it("ม่วงครีเอทีฟ: ปุ่มไล่สี+แสงวิ่ง · แถบบน · เมนูข้างไล่สี · เข้าหน้า", () => {
    const e = themeEffects(presetConfig("creative-violet"), pc);
    expect(e.attrs).toMatchObject({ "tm-btn": "grad", "tm-shine": "1", "tm-topbar": "1", "tm-sidegrad": "1", "tm-enter": "1", "tm-hover": "1", "tm-ganim": "1" });
    expect(e.attrs["tm-count"]).toBeUndefined();
    expect(e.vars["--tm-topbar"]).toContain("linear-gradient");
  });

  it("มือถือ = โหมดเบา (ไม่มีแสงวิ่ง/ไล่สีขยับ/มาสคอต)", () => {
    const cfg = mergeThemeConfig(presetConfig("creative-violet"), { animation: { mascot: true } });
    const e = themeEffects(cfg, { mobile: true, motionOff: false });
    expect(e.attrs["tm-shine"]).toBeUndefined();
    expect(e.attrs["tm-ganim"]).toBeUndefined();
    expect(e.mascot).toBeNull();
    expect(themeEffects(cfg, pc).mascot).not.toBeNull();
  });

  it("ปิดแอนิเมชัน = ไม่มี attr แอนิเมชัน · ตัวนับปิด", () => {
    const e = themeEffects(presetConfig("festive"), { mobile: false, motionOff: true });
    for (const k of ["tm-shine", "tm-enter", "tm-ganim"]) expect(e.attrs[k]).toBeUndefined();
    expect(e.attrs["tm-count"]).toBe("off");
    expect(e.attrs["tm-btn"]).toBe("grad");   // ไล่สีนิ่ง ๆ ไม่ใช่แอนิเมชัน
  });

  it("ปุ่มแบบอ่อน/ขอบ ไม่รับไล่สี/แสงวิ่ง", () => {
    const cfg = mergeThemeConfig(presetConfig("festive"), { components: { button: "outline" } });
    const e = themeEffects(cfg, pc);
    expect(e.attrs["tm-btn"]).toBeUndefined();
    expect(e.attrs["tm-shine"]).toBeUndefined();
  });

  it("รูปพื้นหลัง: ทั้งหน้า (จำกัด 40%) · แบนเนอร์ (จำกัด 55%) · แถบบน (มีฝ้า)", () => {
    const page = themeEffects(mergeThemeConfig(DEFAULT_THEME_CONFIG, { background: { image: "a.jpg", where: "page", opacity: 90 } }), pc);
    expect(page.page?.opacity).toBe(0.4);
    const ban = themeEffects(mergeThemeConfig(DEFAULT_THEME_CONFIG, { background: { image: "a.jpg", where: "banner", opacity: 90 } }), pc);
    expect(ban.banner?.opacity).toBe(BANNER_MAX_OPACITY / 100);
    const top = themeEffects(mergeThemeConfig(DEFAULT_THEME_CONFIG, { background: { image: "a.jpg", where: "top" } }), pc);
    expect(top.vars["--tm-topbar"]).toContain("rgba(0,0,0,.28)");
    expect(top.attrs["tm-topbar"]).toBe("1");
  });

  it("เมนูข้างเข้ม/สีธีม", () => {
    expect(themeEffects(presetConfig("factory-green"), pc).attrs["tm-sidebar"]).toBe("dark");
    const brand = themeEffects(presetConfig("midnight-blue"), pc);
    expect(brand.attrs["tm-sidebar"]).toBe("brand");
    expect(brand.vars["--tm-sidebar-bg"]).toBeTruthy();
  });

  it("attr ทุกตัวอยู่ในรายการล้าง", () => {
    const all = new Set<string>(EFFECT_ATTRS);
    for (const k of ["creative-violet", "festive", "factory-green", "midnight-blue"]) {
      for (const a of Object.keys(themeEffects(presetConfig(k), pc).attrs)) expect(all.has(a), a).toBe(true);
    }
  });
});

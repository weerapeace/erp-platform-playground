import { describe, expect, it } from "vitest";
import { COLOR_SETS, PART_COLORS, currentColorSet, harmonyColors, hexToHsl, hslToHex, swatchesFromPixels } from "../erp-theme-palettes";
import {
  DEFAULT_THEME_CONFIG, autoFixContrast, contrastRatio, mergeThemeConfig, normalizeThemeConfig, primaryScale, scaleOf, themeCssVars, themeIssues,
} from "../erp-theme-config";
import { shiftScale } from "../erp-theme";
import { themeEffects } from "../erp-theme-effects";
import { themeTopbarStyle } from "../erp-theme-assign";

describe("ชุดสี", () => {
  it("มี 16 ชุด key ไม่ซ้ำ · สีเป็น hex ตัวเล็ก", () => {
    expect(COLOR_SETS).toHaveLength(16);
    expect(new Set(COLOR_SETS.map((s) => s.key)).size).toBe(16);
    for (const s of COLOR_SETS) for (const x of [s.primary, s.accent, s.color2]) expect(x).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("ค่าเริ่ม (ส้มเดิม) ตรงกับชุด ส้มคลาสสิก", () => {
    expect(currentColorSet(DEFAULT_THEME_CONFIG.colors)).toBe("orange");
    expect(currentColorSet({ primary: "#123456", accent: "#654321" })).toBeNull();
  });
  it("ทุกชุด ปุ่มสีหลัก/สีรองตัวหนังสือขาวอ่านออก (ไม่ขึ้นจุดเหลือง)", () => {
    for (const s of COLOR_SETS) {
      const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { primary: s.primary, accent: s.accent }, gradient: { color2: s.color2 } });
      expect(themeIssues(cfg).filter((i) => i.key.endsWith("button")), s.key).toEqual([]);
    }
  });
});

describe("สีที่เข้ากัน + HSL", () => {
  it("hex ↔ hsl กลับมาเท่าเดิม (คลาดได้ 1)", () => {
    for (const h of ["#ea580c", "#0e7490", "#7c3aed", "#334155"]) {
      const back = hslToHex(...hexToHsl(h));
      const d = [1, 3, 5].map((i) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(h.slice(i, i + 2), 16)));
      expect(Math.max(...d)).toBeLessThanOrEqual(1);
    }
  });
  it("ให้ 3 แบบ · ตรงข้ามอยู่ห่าง ~180° · ตัวหนังสือขาวบนเฉด 600 อ่านออก", () => {
    const hs = harmonyColors("#0e7490");
    expect(hs.map((h) => h.key)).toEqual(["complement", "analogous", "mono"]);
    const d = Math.abs(hexToHsl(hs[0].color)[0] - hexToHsl("#0e7490")[0]);
    expect(Math.min(d, 360 - d)).toBeGreaterThan(170);
    for (const h of hs) expect(contrastRatio("#ffffff", scaleOf(h.color)[600])).toBeGreaterThanOrEqual(3);
  });
});

describe("ดูดหลายสีจากรูป", () => {
  const px = (list: [number, number, number, number][]) => list.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat());
  it("เรียงตามที่เจอบ่อย · ข้ามเทา/ขาว/ดำ · ไม่เกิน n", () => {
    const d = px([[220, 40, 40, 50], [40, 80, 220, 30], [250, 250, 250, 200], [20, 20, 20, 100], [128, 128, 128, 100], [40, 180, 80, 10]]);
    const s = swatchesFromPixels(d, 5);
    expect(s).toHaveLength(3);
    expect(s[0]).toBe("#dc2828");
    expect(swatchesFromPixels(d, 2)).toHaveLength(2);
  });
  it("รูปไม่มีสีสด = []", () => expect(swatchesFromPixels(px([[250, 250, 250, 10]]))).toEqual([]));
});

describe("เฉดปุ่ม (shiftScale)", () => {
  const sc = scaleOf("#0e7490");
  it("0 = เดิม · +1 = ปุ่ม (600) ใช้เฉด 700 · ปลายชุดใช้เฉดสุดท้ายซ้ำ", () => {
    expect(shiftScale(sc, 0)).toBe(sc);
    expect(shiftScale(sc, 1)[600]).toBe(sc[700]);
    expect(shiftScale(sc, -2)[600]).toBe(sc[400]);
    expect(shiftScale(sc, 2)[950]).toBe(sc[950]);
  });
  it("config.colors.shade กรอง -2…2 · primaryScale + ตัวแปร CSS ตาม", () => {
    expect(normalizeThemeConfig({ colors: { shade: 9 } }).colors.shade).toBe(2);
    const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { primary: "#0e7490", shade: 1 } });
    expect(primaryScale(cfg)[600]).toBe(sc[700]);
    expect(themeCssVars(cfg)["--tm-primary-600"]).toBe(themeCssVars(mergeThemeConfig(cfg, { colors: { shade: 0 } }))["--tm-primary-700"]);
  });
});

describe("สีแยกทีละส่วน", () => {
  it("ค่าเริ่ม = null ทุกส่วน · hex เพี้ยน = null · ล้างด้วย null ได้", () => {
    expect(Object.values(DEFAULT_THEME_CONFIG.colors.parts).every((v) => v === null)).toBe(true);
    expect(PART_COLORS.map((p) => p.key).sort()).toEqual(Object.keys(DEFAULT_THEME_CONFIG.colors.parts).sort());
    const n = normalizeThemeConfig({ colors: { parts: { topbar: "#1E293B", page: "red", link: 5 } } });
    expect(n.colors.parts).toMatchObject({ topbar: "#1e293b", page: null, link: null });
    expect(mergeThemeConfig(n, { colors: { parts: { topbar: null } } }).colors.parts.topbar).toBeNull();
  });
  it("ไม่ตั้ง = ไม่มี attr ใหม่ (หน้าตาเดิม)", () => {
    const fx = themeEffects(DEFAULT_THEME_CONFIG, { mobile: false, motionOff: false });
    for (const k of ["tm-pagebg", "tm-heading", "tm-link", "tm-border", "tm-sidetint", "tm-topbar"]) expect(fx.attrs[k]).toBeUndefined();
  });
  it("แถบบนเข้ม = 1 · อ่อน = light · เมนูข้างเข้ม = brand · อ่อน = sidetint", () => {
    const dark = mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { parts: { topbar: "#1e293b", sidebar: "#0f172a" } } });
    let fx = themeEffects(dark, { mobile: false, motionOff: false });
    expect(fx.attrs["tm-topbar"]).toBe("1");
    expect(fx.vars["--tm-topbar"]).toBe("#1e293b");
    expect(fx.attrs["tm-sidebar"]).toBe("brand");
    const light = mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { parts: { topbar: "#f1f5f9", sidebar: "#f1f5f9", page: "#fffbeb", heading: "#7c2d12", link: "#1d4ed8", border: "#cbd5e1" } } });
    fx = themeEffects(light, { mobile: false, motionOff: false });
    expect(fx.attrs["tm-topbar"]).toBe("light");
    expect(fx.attrs["tm-sidebar"]).toBeUndefined();
    expect(fx.attrs["tm-sidetint"]).toBe("1");
    expect(fx.vars).toMatchObject({ "--tm-page-bg": "#fffbeb", "--tm-heading": "#7c2d12", "--tm-link": "#1d4ed8", "--tm-border": "#cbd5e1" });
    expect(themeTopbarStyle(light)).toMatchObject({ backgroundColor: "#f1f5f9", color: "#0f172a" });
  });
  it("สีอ่านยาก → เตือน + แก้อัตโนมัติผ่าน", () => {
    const bad = mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { parts: { page: "#1e293b", link: "#93c5fd" } } });
    expect(themeIssues(mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { parts: { heading: "#e2e8f0" } } })).map((i) => i.key)).toContain("heading");
    expect(themeIssues(autoFixContrast(mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { parts: { heading: "#e2e8f0" } } }))).map((i) => i.key)).not.toContain("heading");
    expect(themeIssues(bad).map((i) => i.key)).toEqual(expect.arrayContaining(["page-dark", "link"]));
    const fixed = autoFixContrast(bad);
    expect(fixed.colors.parts.page).toBeNull();
    expect(themeIssues(fixed).filter((i) => ["page-dark", "heading", "link"].includes(i.key))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { BANNER_MAX_OPACITY, EFFECT_ATTRS, themeEffects } from "../erp-theme-effects";
import { DEFAULT_THEME_CONFIG, mergeThemeConfig, presetConfig } from "../erp-theme-config";

const pc = { mobile: false, motionOff: false };

describe("themeEffects", () => {
  it("ไม่มีธีม = ไม่ทาอะไร", () => {
    expect(themeEffects(null, pc)).toEqual({ attrs: {}, vars: {}, page: null, banner: null, mascot: null, particles: null });
  });

  it("ธีมเริ่มต้น: ไม่มีเอฟเฟกต์ (ตัวนับเลขทำงานเหมือนเดิม)", () => {
    const e = themeEffects(DEFAULT_THEME_CONFIG, pc);
    expect(e.attrs).toEqual({});
    expect(e.page).toBeNull(); expect(e.banner).toBeNull(); expect(e.mascot).toBeNull();
  });

  it("ม่วงครีเอทีฟ: ปุ่มไล่สี+แสงวิ่ง · แถบบน · เมนูข้างไล่สี · เข้าหน้า", () => {
    const e = themeEffects(presetConfig("creative-violet"), pc);
    expect(e.attrs).toMatchObject({ "tm-btn": "grad", "tm-shine": "1", "tm-topbar": "1", "tm-sidegrad": "1", "tm-enter": "fade", "tm-hover": "1", "tm-ganim": "1" });
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

describe("เอฟเฟกต์ต่อจุด (รอบ 2)", () => {
  const fest = mergeThemeConfig(DEFAULT_THEME_CONFIG, {
    effects: {
      targets: { button: { fx: ["pulse", "glow"], strength: 3 }, topbar: { fx: ["colorShift"] }, menu: { fx: ["accentBar", "pulse"] }, number: { fx: ["countUp", "glow"] }, bell: { fx: ["shake", "pulse"] } },
      ripple: true, scaleHover: true, underline: true, iconWiggle: true,
    },
  });

  it("แต่ละจุดได้ attr + ตัวแปรแอนิเมชันรวม", () => {
    const e = themeEffects(fest, pc);
    expect(e.attrs["tm-fx-button"]).toBe("pulse glow");
    expect(e.vars["--tm-anim-button"]).toMatch(/^tmPulse .+, tmGlow /);
    expect(e.vars["--tm-anim-topbar"]).toContain("tmShift");
    expect(e.vars["--tm-anim-number"]).toContain("tmTextGlow");   // ตัวเลข = เรืองที่ตัวหนังสือ
    expect(e.attrs["tm-fx-number"]).toBe("glow");                  // นับขึ้นใช้ระบบเดิม (tm-count)
    expect(e.vars["--tm-anim-bell-icon"]).toContain("tmShake");
    expect(e.vars["--tm-anim-bell-btn"]).toContain("tmPulse");
    expect(e.attrs).toMatchObject({ "tm-scale": "1", "tm-ripple": "1", "tm-underline": "1", "tm-wiggle": "1" });
  });

  it("กระพริบ/เปลี่ยนสีวน ช้ากว่า 1.2 วิเสมอ (ข้อ 34)", () => {
    const e = themeEffects(mergeThemeConfig(fest, { animation: { speed: "fast" }, effects: { targets: { topbar: { fx: ["colorShift"], strength: 3 } } } }), pc);
    const sec = Number(/tmShift ([\d.]+)s/.exec(e.vars["--tm-anim-topbar"])![1]);
    expect(sec).toBeGreaterThanOrEqual(1.2);
  });

  it("ปิดแอนิเมชัน = เหลือแค่แถบเน้น (ไม่ขยับ) · ไม่มีชี้/กด", () => {
    const e = themeEffects(fest, { mobile: false, motionOff: true });
    expect(e.attrs["tm-fx-menu"]).toBe("accentBar");
    expect(e.attrs["tm-fx-button"]).toBeUndefined();
    expect(e.attrs["tm-ripple"]).toBeUndefined();
  });

  it("มือถือ = ตัดเอฟเฟกต์วนตลอด เหลือสั่น/แถบเน้น", () => {
    const e = themeEffects(fest, { mobile: true, motionOff: false });
    expect(e.attrs["tm-fx-button"]).toBeUndefined();
    expect(e.attrs["tm-fx-bell"]).toBe("shake");
    expect(e.attrs["tm-fx-menu"]).toBe("accentBar");
  });
});

describe("การ์ด รอบ 3", () => {
  it("ค่าเริ่มของธีม = ไม่แตะการ์ด (ไม่มี attr ขอบ/เงา)", () => {
    const e = themeEffects(DEFAULT_THEME_CONFIG, pc);
    for (const k of ["tm-card-border", "tm-card-shadow", "tm-card-bar", "tm-card-hglow", "tm-inset", "tm-stagger"]) expect(e.attrs[k]).toBeUndefined();
  });
  it("ขอบ/เงา/เรือง/เงาใน/โผล่ทีละใบ ตามค่าตั้ง", () => {
    const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, {
      outline: { width: 2, color: "theme", style: "dashed", accentBar: true },
      elevation: { depth: "float", color: "theme", hoverGlow: true, inset: true },
      effects: { stagger: true, targets: { card: { fx: ["lift", "glow"] } } },
    });
    const e = themeEffects(cfg, pc);
    expect(e.attrs).toMatchObject({ "tm-card-border": "1", "tm-card-bar": "1", "tm-card-shadow": "1", "tm-card-hglow": "1", "tm-inset": "1", "tm-stagger": "1", "tm-fx-card": "lift glow" });
    expect(e.vars["--tm-card-bw"]).toBe("2px");
    expect(e.vars["--tm-card-bs"]).toBe("dashed");
    expect(e.vars["--tm-anim-card"]).toContain("tmGlow");
  });
  it("ขอบไล่สีวิ่ง: หยุดเมื่อปิดแอนิเมชัน", () => {
    const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, { outline: { gradient: true, running: true, width: 0 } });
    expect(themeEffects(cfg, pc).attrs).toMatchObject({ "tm-card-border": "grad", "tm-card-run": "1" });
    expect(themeEffects(cfg, pc).vars["--tm-card-bw"]).toBe("1px");
    expect(themeEffects(cfg, { mobile: false, motionOff: true }).attrs["tm-card-run"]).toBeUndefined();
  });
  it("CSS ใน globals ใช้ตัวเลือกการ์ดตัวเดียวกับ CARD_SELECTOR", async () => {
    const { readFileSync } = await import("node:fs");
    const { CARD_SELECTOR } = await import("../erp-theme-effects");
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toContain(CARD_SELECTOR);
  });
});

describe("รอบ 4: เข้าหน้า · อนุภาค · ป้ายด่วน", () => {
  const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, { effects: { enter: "zoom", particles: "sakura", targets: { badge: { fx: ["blink", "pulse"], strength: 2 } } } });
  it("เข้าหน้าบอกแบบใน attr", () => {
    expect(themeEffects(cfg, pc).attrs["tm-enter"]).toBe("zoom");
  });
  it("อนุภาค: PC มี · มือถือ/ปิดแอนิเมชัน ไม่มี", () => {
    expect(themeEffects(cfg, pc).particles?.kind).toBe("sakura");
    expect(themeEffects(cfg, { mobile: true, motionOff: false }).particles).toBeNull();
    expect(themeEffects(cfg, { mobile: false, motionOff: true }).particles).toBeNull();
  });
  it("ป้ายด่วน: attr + แอนิเมชัน + วงสีเหลืองอำพัน", () => {
    const e = themeEffects(cfg, pc);
    expect(e.attrs["tm-fx-badge"]).toBe("blink pulse");
    expect(e.vars["--tm-anim-badge"]).toMatch(/tmBlink .+, tmPulse/);
    expect(e.vars["--tm-ring-badge"]).toContain("217, 119, 6");
  });
});

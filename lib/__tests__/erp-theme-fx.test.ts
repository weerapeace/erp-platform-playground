import { describe, expect, it } from "vitest";
import {
  FX_PRESETS, MIN_FLASH_MS, TARGET_EFFECTS, fxDuration, normalizeElevation, normalizeFx, normalizeOutline,
} from "../erp-theme-fx";
import { DEFAULT_THEME_CONFIG, mergeThemeConfig, normalizeThemeConfig, presetConfig } from "../erp-theme-config";

const noLegacy = { shine: false, hover: false, countUp: true, enter: false, gradientAnimate: false, gradientTop: false, gradientButton: false };

describe("normalizeFx", () => {
  it("ตัดเอฟเฟกต์ที่จุดนั้นไม่รองรับ · ไม่เกิน 2 · ไม่ซ้ำ", () => {
    const fx = normalizeFx({ targets: { badge: { fx: ["blink", "shake", "blink", "pulse", "glow"], strength: 9 } } }, noLegacy);
    expect(fx.targets.badge).toEqual({ fx: ["blink", "pulse"], strength: 2 });
  });
  it("ไม่มีตาราง = แปลงจากค่าเดิมเฟส 4", () => {
    const fx = normalizeFx(undefined, { ...noLegacy, shine: true, hover: true, enter: true, gradientAnimate: true, gradientTop: true });
    expect(fx.targets.button.fx).toEqual(["shine"]);
    expect(fx.targets.card.fx).toEqual(["lift"]);
    expect(fx.targets.topbar.fx).toEqual(["flow"]);
    expect(fx.enter).toBe("fade");
  });
  it("ค่าขยะของเส้นขอบ/เงา = ค่าเริ่ม/ตัดช่วง", () => {
    expect(normalizeOutline({ width: 9, style: "wavy" })).toMatchObject({ width: 3, style: "solid" });
    expect(normalizeElevation({}, "strong").depth).toBe("medium");
  });
});

describe("ช่องเดิมคำนวณจากตาราง (โค้ดเฟส 4 อ่านต่อได้)", () => {
  it("ตาราง → animation.shine/hover/countUp/enter + gradient.animate + shape.shadow", () => {
    const c = normalizeThemeConfig({
      effects: { targets: { button: { fx: ["shine"] }, card: { fx: ["lift"] }, topbar: { fx: ["flow"] }, number: { fx: [] } }, enter: "zoom" },
      elevation: { depth: "float" },
    });
    expect(c.animation).toMatchObject({ shine: true, hover: true, countUp: false, enter: true });
    expect(c.gradient.animate).toBe(true);
    expect(c.shape.shadow).toBe("strong");
  });
  it("patch แบบเก่า (ธีมสำเร็จรูปเดิม) ยังทำงาน", () => {
    const c = presetConfig("creative-violet");
    expect(c.effects.targets.button.fx).toContain("shine");
    expect(c.animation.hover).toBe(true);
    const off = mergeThemeConfig(c, { animation: { shine: false } });
    expect(off.effects.targets.button.fx).not.toContain("shine");
  });
  it("ค่าเริ่มต้น = หน้าตาเดิม (มีแค่ตัวนับเลข)", () => {
    const t = DEFAULT_THEME_CONFIG.effects.targets;
    expect(Object.entries(t).filter(([, v]) => v.fx.length).map(([k]) => k)).toEqual(["number"]);
  });
});

describe("ข้อ 34 กันกระพริบเร็วเกิน", () => {
  it("กระพริบ/เปลี่ยนสีวน เร็วสุดไม่ต่ำกว่า MIN_FLASH_MS แม้แรงสุด + ความเร็วเร็ว", () => {
    for (const e of ["blink", "colorShift"] as const) {
      expect(fxDuration(e, 3, 0.3) * 1000).toBeGreaterThanOrEqual(MIN_FLASH_MS);
    }
  });
});

describe("ชุดสำเร็จรูป", () => {
  it("4 ชุด และทุกเอฟเฟกต์อยู่ในจุดที่รองรับ", () => {
    expect(FX_PRESETS.map((p) => p.name)).toEqual(["เรียบ", "สนุก", "หรู", "เทศกาล"]);
    for (const p of FX_PRESETS) {
      for (const [t, v] of Object.entries(p.fx.targets)) {
        for (const e of v.fx) expect(TARGET_EFFECTS[t as keyof typeof TARGET_EFFECTS], `${p.key}:${t}:${e}`).toContain(e);
        expect(v.fx.length).toBeLessThanOrEqual(2);
      }
      const c = mergeThemeConfig(DEFAULT_THEME_CONFIG, { effects: p.fx, outline: p.outline, elevation: p.elevation });
      expect(c.effects).toEqual(p.fx);
    }
  });
});

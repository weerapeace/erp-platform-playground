import { describe, expect, it } from "vitest";
import { ADV_GROUPS, currentFxPreset, groupOfCat, motionLevel, searchSettings, withMotionLevel } from "../erp-theme-easy";
import { DEFAULT_THEME_CONFIG, mergeThemeConfig } from "../erp-theme-config";
import { FX_PRESETS } from "../erp-theme-fx";

const withPreset = (k: string) => { const p = FX_PRESETS.find((x) => x.key === k)!; return mergeThemeConfig(DEFAULT_THEME_CONFIG, { effects: p.fx, outline: p.outline, elevation: p.elevation }); };

describe("ความเคลื่อนไหว", () => {
  it("ค่าเริ่ม = 0 (นิ่ง) · ชุดเทศกาล = 3", () => {
    expect(motionLevel(DEFAULT_THEME_CONFIG)).toBe(0);
    expect(motionLevel(withPreset("festive"))).toBe(3);
  });
  it("ตั้ง 0 = ตัดเอฟเฟกต์ขยับ เหลือยกตัว/แถบเน้น/นับขึ้น", () => {
    const c = withMotionLevel(withPreset("fun"), 0);
    expect(motionLevel(c)).toBe(0);
    expect(c.effects.targets.card.fx).toEqual(["lift"]);
    expect(c.effects.targets.menu.fx).toEqual(["accentBar"]);
    expect(c.effects.targets.number.fx).toContain("countUp");
  });
  it("ตั้ง 1–3 จากนิ่ง = ใส่ชุดสนุกแล้วปรับความแรง", () => {
    const c = withMotionLevel(DEFAULT_THEME_CONFIG, 3);
    expect(motionLevel(c)).toBe(3);
    expect(c.effects.targets.button.fx.length).toBeGreaterThan(0);
  });
});

describe("สไตล์/กลุ่ม/ค้นหา", () => {
  it("currentFxPreset รู้ว่าตรงชุดไหน", () => {
    expect(currentFxPreset(withPreset("luxe"))).toBe("luxe");
    expect(currentFxPreset(mergeThemeConfig(withPreset("luxe"), { effects: { targets: { bell: { fx: ["shake"] } } } }))).toBeNull();
  });
  it("โหมดละเอียด 4 กลุ่ม ครอบคลุม 11 หมวดไม่ซ้ำ", () => {
    const cats = ADV_GROUPS.flatMap((g) => g.cats);
    expect(ADV_GROUPS).toHaveLength(4);
    expect(new Set(cats).size).toBe(11);
    expect(groupOfCat("outline")).toBe("shape");
  });
  it("ค้นหา: เงา/กระพริบ/มืด", () => {
    expect(searchSettings("เงา").map((e) => e.cat)).toContain("outline");
    expect(searchSettings("กระพริบ")[0].cat).toBe("effects");
    expect(searchSettings("dark")[0].cat).toBe("mode");
    expect(searchSettings("  ")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import colors from "tailwindcss/colors";
import {
  DEFAULT_THEME_SCALES,
  ORANGE_SCALE,
  THEME_STOPS,
  VIOLET_SCALE,
  hexToChannels,
  isHexColor,
  scaleFromHex,
  tailwindScaleFor,
  themeVarName,
  themeVars,
} from "../erp-theme";

describe("erp-theme — ค่าเริ่มต้นต้องเท่าหน้าตาเดิมเป๊ะ", () => {
  it("accent เริ่มต้น = violet ของ Tailwind ทุกเฉด", () => {
    for (const s of THEME_STOPS) expect(VIOLET_SCALE[s]).toBe((colors.violet as Record<number, string>)[s]);
  });

  it("primary เริ่มต้น = ส้ม (orange ของ Tailwind) ทุกเฉด", () => {
    for (const s of THEME_STOPS) expect(ORANGE_SCALE[s]).toBe((colors.orange as Record<number, string>)[s]);
  });

  it("themeVars() ไม่ส่งอะไร = ค่าเริ่ม ครบ 2 บทบาท x 11 เฉด", () => {
    const v = themeVars();
    expect(Object.keys(v)).toHaveLength(22);
    expect(v["--tm-primary-600"]).toBe("234 88 12");
    expect(v["--tm-accent-600"]).toBe("124 58 237");
  });

  it("themeVars ทับเฉพาะบทบาทที่ส่งมา", () => {
    const v = themeVars({ primary: scaleFromHex("#0e7490") });
    expect(v["--tm-primary-500"]).toBe(hexToChannels("#0e7490"));
    expect(v["--tm-accent-500"]).toBe(hexToChannels(DEFAULT_THEME_SCALES.accent[500]));
  });
});

describe("erp-theme — ตัวช่วย", () => {
  it("hexToChannels", () => {
    expect(hexToChannels("#ffffff")).toBe("255 255 255");
    expect(hexToChannels("ea580c")).toBe("234 88 12");
    expect(() => hexToChannels("#fff")).toThrow();
  });

  it("isHexColor", () => {
    expect(isHexColor("#a16207")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it("tailwindScaleFor ชี้ตัวแปรพร้อม alpha", () => {
    expect(tailwindScaleFor("primary")[600]).toBe("rgb(var(--tm-primary-600) / <alpha-value>)");
    expect(themeVarName("accent", 50)).toBe("--tm-accent-50");
  });

  it("scaleFromHex: 500 = สีที่ส่งมา · อ่อนไปเข้มเรียงถูก", () => {
    const s = scaleFromHex("#0E7490");
    expect(s[500]).toBe("#0e7490");
    const lum = (h: string) => hexToChannels(h).split(" ").map(Number).reduce((a, b) => a + b, 0);
    for (let i = 1; i < THEME_STOPS.length; i++) {
      expect(lum(s[THEME_STOPS[i]])).toBeLessThanOrEqual(lum(s[THEME_STOPS[i - 1]]));
    }
    for (const st of THEME_STOPS) expect(isHexColor(s[st])).toBe(true);
  });
});

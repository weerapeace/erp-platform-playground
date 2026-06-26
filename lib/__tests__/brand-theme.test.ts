import { describe, it, expect } from "vitest";
import { resolveTheme, themeToCssVars, hexToRgba, isValidColor, contrastRatio, themeWarnings, DEFAULT_THEME, THEME_PRESETS } from "@/lib/brand-theme";

describe("brand-theme engine", () => {
  it("resolveTheme เติม default ให้ field ที่หาย", () => {
    const t = resolveTheme({ primary_color: "#ff0000" });
    expect(t.primary_color).toBe("#ff0000");
    expect(t.background_color).toBe(DEFAULT_THEME.background_color);
  });

  it("themeToCssVars แปลงเป็นตัวแปร --brand-*", () => {
    const vars = themeToCssVars({ primary_color: "#123456", card_radius: "8px" }) as Record<string, string>;
    expect(vars["--brand-primary"]).toBe("#123456");
    expect(vars["--brand-card-radius"]).toBe("8px");
    expect(vars["--brand-bg"]).toBe(DEFAULT_THEME.background_color);
  });

  it("custom_css_variables ที่ขึ้นต้น -- เท่านั้นที่ผ่าน", () => {
    const vars = themeToCssVars({ custom_css_variables: { "--ok": "red", "bad": "x" } }) as Record<string, string>;
    expect(vars["--ok"]).toBe("red");
    expect(vars["bad"]).toBeUndefined();
  });

  it("hexToRgba แปลง hex (3/6 หลัก) → rgba", () => {
    expect(hexToRgba("#ffffff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(hexToRgba("#000", 1)).toBe("rgba(0, 0, 0, 1)");
    expect(hexToRgba("rgba(1,2,3,0.4)", 0.5)).toBe("rgba(1,2,3,0.4)"); // ไม่ใช่ hex → คืนเดิม
  });

  it("isValidColor: hex/rgba ผ่าน, ค่าอื่นไม่ผ่าน", () => {
    expect(isValidColor("#abc")).toBe(true);
    expect(isValidColor("#aabbcc")).toBe(true);
    expect(isValidColor("rgba(0,0,0,0.5)")).toBe(true);
    expect(isValidColor("blue")).toBe(false);
    expect(isValidColor("")).toBe(false);
  });

  it("contrastRatio: ขาว/ดำ ~21, ขาว/ขาว =1", () => {
    const bw = contrastRatio("#ffffff", "#000000")!;
    expect(bw).toBeGreaterThan(20);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 1);
  });

  it("themeWarnings เตือนเมื่อปุ่มหลัก contrast ต่ำ", () => {
    const bad = resolveTheme({ button_primary_bg: "#ffffff", button_primary_text: "#f0f0f0" });
    expect(themeWarnings(bad).length).toBeGreaterThan(0);
    const ok = resolveTheme({ button_primary_bg: "#2563eb", button_primary_text: "#ffffff" });
    expect(themeWarnings(ok).length).toBe(0);
  });

  it("ทุก preset resolve ได้และมีสีถูกต้อง", () => {
    for (const p of THEME_PRESETS) {
      const t = resolveTheme(p.theme);
      expect(isValidColor(t.primary_color)).toBe(true);
      expect(isValidColor(t.background_color)).toBe(true);
    }
  });
});

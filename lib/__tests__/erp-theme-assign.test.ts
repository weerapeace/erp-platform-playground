import { describe, expect, it } from "vitest";
import {
  EMPTY_ACTIVE, appScope, diffAssignments, hasOwnHeader, isThemeScope, themeForApp, themeTopbarStyle, usageByTheme,
} from "../erp-theme-assign";
import { presetConfig } from "../erp-theme-config";

const ocean = presetConfig("ocean"), green = presetConfig("factory-green");

describe("themeForApp", () => {
  it("ไม่มีธีมเลย = null (หน้าตาเดิม)", () => {
    expect(themeForApp(EMPTY_ACTIVE, "sales")).toBeNull();
    expect(themeForApp(null, "sales")).toBeNull();
  });
  it("แอปมีธีมของตัวเองชนะธีมบริษัท · ไม่มี = ธีมบริษัท", () => {
    const a = { company: { theme_id: "c", config: ocean }, apps: { production: { theme_id: "g", config: green } } };
    expect(themeForApp(a, "production")).toBe(green);
    expect(themeForApp(a, "sales")).toBe(ocean);
    expect(themeForApp(a, null)).toBe(ocean);
  });
});

describe("แถบบนเดิม", () => {
  it("hasOwnHeader", () => {
    expect(hasOwnHeader({ theme_color: "#eb4224" })).toBe(true);
    expect(hasOwnHeader({ theme_color2: "#000000" })).toBe(true);
    expect(hasOwnHeader({ header_style: "image", header_image: "x.jpg" })).toBe(true);
    expect(hasOwnHeader({ header_style: "image", header_image: null })).toBe(false);
    expect(hasOwnHeader({ header_style: "gradient" })).toBe(false);
    expect(hasOwnHeader(null)).toBe(false);
  });
  it("themeTopbarStyle: ไล่สีเมื่อเปิดที่แถบบน", () => {
    expect(themeTopbarStyle(ocean).backgroundImage).toContain("linear-gradient");
    expect(themeTopbarStyle(green).backgroundColor).toBeTruthy();
  });
});

describe("บันทึก/นับ", () => {
  it("diffAssignments เก็บเฉพาะที่เปลี่ยน", () => {
    expect(diffAssignments({ company: "a", "app:x": "b" }, { company: "a", "app:x": null, "app:y": "c" }))
      .toEqual([{ scope: "app:x", theme_id: null }, { scope: "app:y", theme_id: "c" }]);
  });
  it("usageByTheme", () => {
    const u = usageByTheme([{ scope: "company", theme_id: "a" }, { scope: appScope("sales"), theme_id: "a" }, { scope: appScope("qc"), theme_id: "b" }]);
    expect(u.a).toEqual({ apps: ["sales"], company: true });
    expect(u.b.apps).toEqual(["qc"]);
  });
  it("isThemeScope", () => {
    expect(isThemeScope("company")).toBe(true);
    expect(isThemeScope("app:china-pay")).toBe(true);
    expect(isThemeScope("app:")).toBe(false);
    expect(isThemeScope("user:1")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { CHROME_ATTRS, DEFAULT_CHROME, chromeEffects, normalizeChrome } from "../erp-theme-chrome";
import { DEFAULT_THEME_CONFIG, mergeThemeConfig, normalizeThemeConfig, primaryScale, scaleOf } from "../erp-theme-config";
import { EFFECT_ATTRS, themeEffects } from "../erp-theme-effects";
import fs from "node:fs";
import path from "node:path";

const env = { mobile: false, motionOff: false };
const FULL = {
  chrome: {
    popup: { header: "gradient", backdrop: "blur", dim: 3, radius: 20, shadow: "theme", open: "up", drawerBar: true },
    table: { head: "theme", selected: "strong" }, input: { focus: "accent", ring: 3 }, button2: "soft", badgeShape: "dot", checks: true,
    menu: { selected: "strong", radius: 12 }, toast: { position: "bottom-center", style: "white" }, scrollbar: "theme",
    icon: { stroke: "bold", tint: true }, headingSize: "lg",
  },
  components: { button: "soft", table: "zebra", input: "filled", tabs: "box" },
  colors: { parts: { topbar: "#f1f5f9", sidebar: "#f1f5f9", page: "#fffbeb", heading: "#7c2d12", link: "#1d4ed8", border: "#cbd5e1" } },
};

describe("ชิ้นส่วนย่อย (chrome)", () => {
  it("ค่าเริ่ม = ไม่มี attr/ตัวแปรเลย (หน้าตาเดิม)", () => {
    const p = scaleOf("#f97316");
    expect(chromeEffects(DEFAULT_CHROME, p, p, "#f59e0b", 90, env)).toEqual({ attrs: {}, vars: {} });
    const fx = themeEffects(DEFAULT_THEME_CONFIG, env);
    for (const a of CHROME_ATTRS) expect(fx.attrs[a], a).toBeUndefined();
  });
  it("กรองค่าเพี้ยน · ธีมเก่าที่ไม่มี chrome = ค่าเริ่ม", () => {
    expect(normalizeThemeConfig({}).chrome).toEqual(DEFAULT_CHROME);
    const n = normalizeChrome({ popup: { header: "x", dim: 9, radius: 99 }, input: { ring: 7 }, menu: { radius: -3 } });
    expect(n.popup).toMatchObject({ header: "plain", dim: 2, radius: 28 });
    expect(n.input.ring).toBe(2);
    expect(n.menu.radius).toBe(0);
  });
  it("ตั้งครบ → attr + ตัวแปรครบ", () => {
    const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, FULL);
    const fx = themeEffects(cfg, env);
    expect(fx.attrs).toMatchObject({
      "tm-pop-head": "gradient", "tm-backdrop": "blur", "tm-pop-radius": "1", "tm-pop-shadow": "theme", "tm-pop-open": "up", "tm-drawer-bar": "1",
      "tm-thead": "theme", "tm-rowsel": "strong", "tm-focus": "accent", "tm-btn2": "soft", "tm-badge-shape": "dot", "tm-checks": "1",
      "tm-menu-sel": "strong", "tm-menu-radius": "1", "tm-toast-pos": "bottom-center", "tm-toast-style": "white", "tm-scrollbar": "theme",
      "tm-icon-sw": "bold", "tm-icon-tint": "1", "tm-hsize": "lg", "tm-btnstyle": "soft", "tm-table": "zebra", "tm-input": "filled", "tm-tabs": "box",
    });
    expect(fx.vars["--tm-pop-radius"]).toBe("20px");
    expect(fx.vars["--tm-backdrop-filter"]).toMatch(/blur/);
    expect(fx.vars["--tm-thead-bg"]).toBe(primaryScale(cfg)[600]);
    expect(fx.vars["--tm-ring-w"]).toBe("3px");
    expect(fx.vars["--tm-icon-sw"]).toBe("2.25");
  });
  it("มือถือไม่เบลอฉากหลัง · ปิดแอนิเมชัน = ไม่มีแอนิเมชันเปิดป๊อป", () => {
    const cfg = mergeThemeConfig(DEFAULT_THEME_CONFIG, FULL);
    expect(themeEffects(cfg, { mobile: true, motionOff: false }).vars["--tm-backdrop-filter"]).toBe("none");
    expect(themeEffects(cfg, { mobile: false, motionOff: true }).attrs["tm-pop-open"]).toBeUndefined();
  });
  it("attr ทุกตัวอยู่ในรายการล้าง (รวมสีแยกส่วน)", () => {
    const all = new Set<string>(EFFECT_ATTRS);
    const fx = themeEffects(mergeThemeConfig(DEFAULT_THEME_CONFIG, FULL), env);
    for (const a of Object.keys(fx.attrs)) expect(all.has(a), a).toBe(true);
    const dark = themeEffects(mergeThemeConfig(DEFAULT_THEME_CONFIG, { colors: { parts: { topbar: "#0f172a", sidebar: "#0f172a" } } }), env);
    for (const a of Object.keys(dark.attrs)) expect(all.has(a), a).toBe(true);
  });
  it("CSS ใน globals มีกฎของทุก attr ชิ้นส่วน", () => {
    const css = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    for (const a of CHROME_ATTRS) expect(css.includes(`[data-${a}`), a).toBe(true);
  });
});

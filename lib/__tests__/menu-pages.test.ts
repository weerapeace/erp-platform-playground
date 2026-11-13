import { describe, it, expect } from "vitest";
import { findMenuPage, isAppKey, isErpPageHref, menuPageGroups, NO_APP, NO_APP_TH, type MenuAppRow, type MenuPageRow } from "../menu-pages";

const apps: MenuAppRow[] = [
  { key: "tasks", label: "จัดการงาน", icon: "✅", sort_order: 1 },
  { key: "design", label: "ออกแบบ", icon: "🎨", sort_order: 9 },
  { key: "master", label: "Master Data", icon: "📦", sort_order: 2 },
];
const menus: MenuPageRow[] = [
  { href: "/master/design-dashboard", label: "Design Dashboard", icon: "📋", app_keys: ["design", "tasks"], is_active: true, sort_order: 5 },
  { href: "/master/skus", label: "SKUs", icon: "🏷️", app_keys: ["master"], is_active: true, sort_order: 2, app_overrides: { master: { label: "สินค้า (SKU)", sort: 1 } } },
  { href: "/master/assets", label: "คลังไฟล์กลาง", icon: null, app_keys: ["master"], is_active: true, sort_order: 3 },
  { href: "/tasks/old", label: "หน้าเก่าที่ปิดแล้ว", app_keys: ["tasks"], is_active: false, sort_order: 1 },
  { href: "https://example.com", label: "ลิงก์นอก", app_keys: ["tasks"], is_active: true, sort_order: 1 },
  { href: "/misc/loose", label: "ไม่อยู่แอปไหน", app_keys: [], is_active: true, sort_order: 1 },
];

describe("isErpPageHref / isAppKey", () => {
  it("รับเฉพาะลิงก์หน้าในระบบ", () => {
    expect(isErpPageHref("/master/design-dashboard")).toBe(true);
    expect(isErpPageHref("/master/x?tab=a#b")).toBe(true);
    for (const bad of ["", "master/x", "//evil.example", "https://evil.example", "javascript:alert(1)", "/a b", "/a\b", "/a\nb", "/" + "x".repeat(300), 5, null]) {
      expect(isErpPageHref(bad)).toBe(false);
    }
  });
  it("รหัสแอป: ตัวเล็ก/ตัวเลข/ขีด", () => {
    expect(isAppKey("china-pay")).toBe(true);
    expect(isAppKey("Design")).toBe(false);
    expect(isAppKey("")).toBe(false);
    expect(isAppKey("a b")).toBe(false);
  });
});

describe("menuPageGroups", () => {
  it("จัดกลุ่มตามลำดับแอป · หน้าที่อยู่หลายแอปโผล่ทุกแอป · ไม่เอาเมนูที่ปิด/ลิงก์นอก · ไม่อยู่แอปไหน = ท้ายสุด", () => {
    const g = menuPageGroups(menus, apps);
    expect(g.map((x) => x.app)).toEqual(["tasks", "master", "design", NO_APP]);
    expect(g[0].pages.map((p) => p.href)).toEqual(["/master/design-dashboard"]);
    expect(g[2].pages[0]).toEqual({ href: "/master/design-dashboard", label: "Design Dashboard", icon: "📋", app: "design", appName: "ออกแบบ", appIcon: "🎨" });
    expect(g[3].appName).toBe(NO_APP_TH);
    expect(g.flatMap((x) => x.pages).some((p) => p.href === "/tasks/old" || p.href.startsWith("http"))).toBe(false);
  });
  it("ใช้ชื่อ/ลำดับเฉพาะแอป (app_overrides)", () => {
    const master = menuPageGroups(menus, apps).find((x) => x.app === "master")!;
    expect(master.pages.map((p) => p.label)).toEqual(["สินค้า (SKU)", "คลังไฟล์กลาง"]);
  });
  it("ค้นหา: ชื่อหน้า (ชื่อเฉพาะแอปหรือชื่อหลัก) / ลิงก์ / ชื่อแอป · ไม่สนตัวพิมพ์", () => {
    expect(menuPageGroups(menus, apps, "design dash").flatMap((x) => x.pages.map((p) => p.app))).toEqual(["tasks", "design"]);
    expect(menuPageGroups(menus, apps, "skus").flatMap((x) => x.pages.map((p) => p.href))).toEqual(["/master/skus"]);
    expect(menuPageGroups(menus, apps, "ออกแบบ").map((x) => x.app)).toEqual(["design"]);
    expect(menuPageGroups(menus, apps, "ไม่มีแน่นอน")).toEqual([]);
  });
  it("แอปที่ไม่มีในรายชื่อแอป = ใช้รหัสเป็นชื่อ ไว้ท้ายแอปที่รู้จัก", () => {
    const g = menuPageGroups([{ href: "/x", label: "X", app_keys: ["ghost"], is_active: true }], apps);
    expect(g[0]).toMatchObject({ app: "ghost", appName: "ghost", appIcon: null });
  });
});

describe("findMenuPage", () => {
  it("เจอตามแอปที่เลือก · แอปนั้นไม่มีแล้ว = แอปแรกที่อยู่ · ไม่อยู่ในเมนู = null", () => {
    expect(findMenuPage(menus, apps, "/master/design-dashboard", "design")?.appName).toBe("ออกแบบ");
    expect(findMenuPage(menus, apps, "/master/design-dashboard", "sales")?.app).toBe("tasks");
    expect(findMenuPage(menus, apps, "/tasks/old", "tasks")).toBeNull();
    expect(findMenuPage(menus, apps, "/nope")).toBeNull();
    expect(findMenuPage(menus, apps, "/misc/loose")?.app).toBe(NO_APP);
  });
});

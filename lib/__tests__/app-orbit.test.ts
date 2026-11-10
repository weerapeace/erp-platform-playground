import { describe, it, expect } from "vitest";
import { APP_PICK_TTL_MS, appHomeHref, appPickState, buildOrbitApps, choosePageApp, gallerySlot, orbitAppMatches, orbitPoint, searchOrbit, snapRotation, topIndex, visibleAppMenus, type OrbitAppRow, type OrbitMenuRow } from "@/lib/app-orbit";

const row = (id: string, href: string, app_keys: string[], extra: Partial<OrbitMenuRow> = {}): OrbitMenuRow => ({
  id, href, label: id, icon: "📄", sort_order: 10, is_active: true, show_in_sidebar: true, permission_key: null, app_keys, ...extra,
});
const app = (key: string, sort_order: number, extra: Partial<OrbitAppRow> = {}): OrbitAppRow => ({
  key, label: key, icon: "📦", sort_order, permission_key: null, is_active: true, ...extra,
});
const admin = { can: () => true, user: { id: "u1", role: "admin" } };
const staff = (perms: string[]) => ({ can: (p: string) => perms.includes(p), user: { id: "u2", role: "staff" } });

describe("วงแอป — แอป/เมนูที่โชว์ใช้กฎเดียวกับแถบเมนู", () => {
  const rows = [
    row("dash", "/purchasing", ["purchasing"], { sort_order: 10 }),
    row("po", "/purchase-orders", ["purchasing"], { sort_order: 20, permission_key: "po.view" }),
    row("pay", "/payroll/dashboard", ["payroll"]),
    row("launcher", "/apps", ["home"]),
    row("cal", "/calendar", ["home"], { sort_order: 20 }),
  ];
  const apps = [app("payroll", 30, { permission_key: "app.payroll" }), app("purchasing", 20), app("home", 10)];

  it("แอปล็อกที่ไม่มีสิทธิ์ = ไม่โชว์ · เมนูไม่มีสิทธิ์ = ไม่โชว์ · เรียงตามลำดับแอป", () => {
    const out = buildOrbitApps(rows, apps, staff([]));
    expect(out.map((a) => a.key)).toEqual(["home", "purchasing"]);
    expect(out[1].menus.map((m) => m.href)).toEqual(["/purchasing"]);
    expect(buildOrbitApps(rows, apps, admin).map((a) => a.key)).toEqual(["home", "purchasing", "payroll"]);
  });

  it("ไม่เอาการ์ดหน้า /apps เอง · แอปที่ไม่มีเมนูเหลือ = ไม่โชว์", () => {
    const home = buildOrbitApps(rows, apps, admin).find((a) => a.key === "home")!;
    expect(home.menus.map((m) => m.href)).toEqual(["/calendar"]);
    expect(home.homeHref).toBe("/calendar");   // เมนูแรกคือ /apps → ข้ามไปเมนูถัดไป ไม่วนกลับหน้าเดิม
    expect(buildOrbitApps([row("launcher", "/apps", ["home"])], [app("home", 10)], admin)).toEqual([]);
  });

  it("👁 ใครเห็นเมนูไหน + ซ่อนในแอป (ลูกหายตาม) + ชื่อที่แอปตั้งเอง", () => {
    const rs = [
      row("a", "/a", ["tasks"], { audience: { hide_users: ["u2"] } }),
      row("b", "/b", ["tasks"], { app_overrides: { tasks: { place: "hidden" } } }),
      row("b1", "/b1", ["tasks"], { parent_id: "b" }),
      row("c", "/c", ["tasks"], { app_overrides: { tasks: { label: "ซีพิเศษ" } } }),
    ];
    expect(visibleAppMenus(rs, "tasks", staff([])).map((r) => r.label)).toEqual(["ซีพิเศษ"]);
  });

  it("เมนูย่อย (มีแม่อยู่ในแอป) ไม่โชว์ซ้ำในแผงกลาง", () => {
    const rs = [row("p", "/p", ["x"]), row("k", "/k", ["x"], { parent_id: "p", sort_order: 20 })];
    expect(buildOrbitApps(rs, [app("x", 1)], admin)[0].menus.map((m) => m.href)).toEqual(["/p"]);
  });
});

describe("หน้าแรกของแอป", () => {
  const menus = [{ href: "/skus" }, { href: "/purchasing" }];
  it("ใช้หน้าแรกที่ตั้งไว้ถ้าผู้ใช้เห็น ไม่งั้นเมนูตัวบนสุด", () => {
    expect(appHomeHref(menus, { key: "purchasing", default_href: "/purchasing" })).toBe("/purchasing");
    expect(appHomeHref(menus, { key: "purchasing", default_href: "/secret" })).toBe("/skus");
    expect(appHomeHref([{ href: "/a" }, { href: "/master/manufacturing-orders" }], { key: "production" })).toBe("/master/manufacturing-orders");
    expect(appHomeHref([], { key: "x" })).toBeNull();
  });
});

describe("ค้นหา", () => {
  const apps = buildOrbitApps([
    row("ใบสั่งซื้อ (PO)", "/po", ["purchasing", "loan"], { search_keywords: ["purchase order"] }),
    row("ขอซื้อ", "/pr", ["purchasing"]),
  ], [app("purchasing", 1), app("loan", 2)], admin);
  it("เจอจากชื่อ/คำค้นเพิ่ม · href ซ้ำหลายแอปโชว์ครั้งเดียว", () => {
    expect(searchOrbit(apps, "po").map((h) => h.menu.href)).toEqual(["/po"]);
    expect(searchOrbit(apps, "purchase order").map((h) => h.menu.href)).toEqual(["/po"]);
    expect(searchOrbit(apps, "")).toEqual([]);
    expect(orbitAppMatches(apps[0], "ขอซื้อ")).toBe(true);
    expect(orbitAppMatches(apps[1], "ขอซื้อ")).toBe(false);
  });
});

describe("ตำแหน่งการ์ด", () => {
  it("ใบแรกอยู่บนสุด · snap หมุนทางสั้น · topIndex ตรงกับที่ snap", () => {
    const p = orbitPoint(0, 4, 0, 100, 50);
    expect(Math.round(p.x)).toBe(0);
    expect(Math.round(p.y)).toBe(-50);
    const r = snapRotation(0, 3, 4);           // ใบสุดท้าย → หมุนไปทางเดียว 90° ไม่ใช่ 270°
    expect(Math.abs(r)).toBeCloseTo(Math.PI / 2);
    expect(topIndex(r, 4)).toBe(3);
    expect(topIndex(snapRotation(r, 1, 4), 4)).toBe(1);
  });
  it("แถบมือถือวนรอบ: ใบก่อนใบแรกคือใบสุดท้าย", () => {
    expect(gallerySlot(0, 0, 5)).toBe(0);
    expect(gallerySlot(4, 0, 5)).toBe(-1);
    expect(gallerySlot(1, 0, 5)).toBe(1);
  });
});

describe("แถบแอปด้านบน: หน้าที่อยู่หลายแอปไฮไลต์แอปไหน", () => {
  // SKUs อยู่ทั้ง Master Data + จัดซื้อ + จัดการงาน · หน้าแรกของ Master Data = SKUs · จัดซื้อ = แดชบอร์ด
  const homes: Record<string, string> = { master: "/master/skus", purchasing: "/purchasing", tasks: "/tasks" };
  const base = { keys: ["purchasing", "master", "tasks"], pageHref: "/master/skus", canOpen: () => true, homeOf: (k: string) => homes[k] ?? null };

  it("เพิ่งกดแท็บ Master Data ขณะอยู่จัดซื้อ → Master Data (บั๊กเดิมไฮไลต์จัดซื้อ)", () => {
    expect(choosePageApp({ ...base, current: "purchasing", picked: "master" })).toBe("master");
  });
  it("กด SKUs จากเมนูของจัดซื้อ → ยังอยู่จัดซื้อ", () => {
    expect(choosePageApp({ ...base, current: "purchasing" })).toBe("purchasing");
  });
  it("มาจากแอปอื่น/เปิดลิงก์ตรง → แอปเจ้าของหน้า (ตั้งหน้านี้เป็นหน้าแรก) ไม่ใช่ตัวแรกในรายการ", () => {
    expect(choosePageApp({ ...base, current: "sales" })).toBe("master");
    expect(choosePageApp({ ...base, current: null })).toBe("master");
    expect(choosePageApp({ ...base, pageHref: "/master/skus?view=tags", current: null })).toBe("master");
  });
  it("เจ้าของหน้าเข้าไม่ได้ → แอปที่เข้าได้ตัวแรก · เข้าไม่ได้เลย → ตัวแรก (ให้ตัวกันสิทธิ์บอกเหตุผล)", () => {
    expect(choosePageApp({ ...base, current: null, canOpen: (k) => k !== "master" })).toBe("purchasing");
    expect(choosePageApp({ ...base, current: null, canOpen: (k) => k === "tasks" })).toBe("tasks");
    expect(choosePageApp({ ...base, current: null, canOpen: () => false })).toBe("master");
  });
  it("กดแท็บแอปที่ไม่มีหน้านี้ → ไม่เชื่อแท็บที่กด ใช้กฎปกติ · ไม่มีแอปเลย = undefined", () => {
    expect(choosePageApp({ ...base, current: "sales", picked: "sales" })).toBe("master");
    expect(choosePageApp({ ...base, keys: [] })).toBeUndefined();
  });
});

describe("แถบแอปด้านบน: สถานะ 'เพิ่งกดแท็บ'", () => {
  const pick = { app: "master", from: "/purchasing", to: "/master/skus", at: 1000 };
  it("หน้าเก่ายังไม่เปลี่ยน → รอ (ห้ามดึงแอปกลับ)", () => {
    expect(appPickState(pick, "/purchasing", 1500)).toBe("wait");
  });
  it("ถึงหน้าใหม่ (หรือถูกพาไปหน้าอื่น) → ใช้", () => {
    expect(appPickState(pick, "/master/skus", 1500)).toBe("use");
    expect(appPickState(pick, "/purchasing/dashboard", 1500)).toBe("use");
  });
  it("กดแอปที่หน้าแรกคือหน้าเดิม → ใช้ทันที · หมดเวลา/ไม่มี → none", () => {
    expect(appPickState({ ...pick, from: "/master/skus" }, "/master/skus", 1500)).toBe("use");
    expect(appPickState(pick, "/purchasing", 1000 + APP_PICK_TTL_MS + 1)).toBe("none");
    expect(appPickState(null, "/purchasing", 1500)).toBe("none");
  });
});

import { describe, it, expect } from "vitest";
import {
  cleanLock, lockIncludes, isViewPerm, computeAllowedPerms, computeAllowedHrefs, pathAllowed, pathReadOnly, BASE_PERMS, type MyLock,
} from "@/lib/app-lock";
import { cleanDraft } from "@/lib/staff-apps";

const catalog = [
  { key: "products.view" }, { key: "products.edit" }, { key: "products.delete" }, { key: "products.cost.view" },
  { key: "payroll.view" }, { key: "payroll.edit" }, { key: "app.production" }, { key: "app.master" }, { key: "app.payroll" },
  { key: "mo.view" }, { key: "mo.edit" }, { key: "notifications.view" },
];
const apps = [
  { key: "production", permission_key: "app.production" },
  { key: "master", permission_key: "app.master" },
  { key: "payroll", permission_key: "app.payroll" },
  { key: "staff-x", permission_key: null, kind: "staff" },
];
const menus = [
  { id: "mo", href: "/mo", permission_key: "mo.view", app_keys: ["production", "staff-x"] },
  { id: "sku", href: "/master/skus", permission_key: "products.view", app_keys: ["master"] },
  { id: "pay", href: "/payroll", permission_key: "payroll.view", app_keys: ["payroll"] },
];

describe("cleanLock / lockIncludes", () => {
  it("never locks admins and drops the admin role", () => {
    expect(cleanLock({ roles: ["admin"] })).toBeNull();
    expect(lockIncludes({ roles: ["staff"] }, { id: "a", role: "admin" })).toBe(false);
  });
  it("matches by role or by person", () => {
    expect(lockIncludes({ roles: ["staff"] }, { id: "u1", role: "staff" })).toBe(true);
    expect(lockIncludes({ users: ["u2"] }, { id: "u1", role: "staff" })).toBe(false);
    expect(lockIncludes({ users: ["u1"] }, { id: "u1", role: "manager" })).toBe(true);
    expect(lockIncludes(null, { id: "u1", role: "staff" })).toBe(false);
  });
});

describe("isViewPerm", () => {
  it("recognises view-type permissions", () => {
    expect(isViewPerm("products.view")).toBe(true);
    expect(isViewPerm("products.cost.view")).toBe(true);
    expect(isViewPerm("notifications.view_team")).toBe(true);
    expect(isViewPerm("products.edit")).toBe(false);
    expect(isViewPerm("review.do")).toBe(false);
  });
});

describe("computeAllowedPerms", () => {
  // กฎเมนูทดสอบ: /master/skus ใช้สิทธิ์ products.* (เหมือนของจริง)
  const rules = [{ href: "/master/skus", prefixes: ["products."] }];
  it("allows the app's menus, their sub-permissions and the module app access", () => {
    const p = computeAllowedPerms({ menuIds: ["mo"] }, menus, catalog, apps, rules);
    expect(p).toContain("mo.view");
    expect(p).toContain("mo.edit");          // เดาจาก permission_key mo.view → mo.*
    expect(p).toContain("app.production");
    for (const b of BASE_PERMS) expect(p).toContain(b);
    expect(p).not.toContain("payroll.view");
    expect(p).not.toContain("app.payroll");
  });
  it("read-only exceptions only add view permissions", () => {
    const p = computeAllowedPerms({ menuIds: ["mo"], readOnlyIds: ["sku"] }, menus, catalog, apps, rules);
    expect(p).toContain("products.view");
    expect(p).toContain("products.cost.view");
    expect(p).not.toContain("products.edit");
    expect(p).not.toContain("products.delete");
  });
  it("a menu in the app wins over the same menu as read-only", () => {
    const p = computeAllowedPerms({ menuIds: ["sku"], readOnlyIds: ["sku"] }, menus, catalog, apps, rules);
    expect(p).toContain("products.edit");
  });
  it("extra permissions must exist in the catalog", () => {
    const p = computeAllowedPerms({ menuIds: [], extraPerms: ["payroll.view", "nope.x"] }, menus, catalog, apps, rules);
    expect(p).toContain("payroll.view");
    expect(p).not.toContain("nope.x");
  });
});

describe("pathAllowed — the page lock", () => {
  const lock: MyLock = {
    locked: true,
    apps: [{ key: "staff-x", label: "แอปผลิต" }],
    hrefs: computeAllowedHrefs({ menuIds: ["mo"], readOnlyIds: ["sku"] }, menus),
  };
  it("not locked = everything open", () => {
    expect(pathAllowed("/payroll", null)).toBe(true);
    expect(pathAllowed("/payroll", { locked: false, apps: [], hrefs: [] })).toBe(true);
  });
  it("opens the app, its menus and deep pages under them", () => {
    expect(pathAllowed("/app/staff-x", lock)).toBe(true);
    expect(pathAllowed("/mo", lock)).toBe(true);
    expect(pathAllowed("/mo/123?embed=1", lock)).toBe(true);
    expect(pathAllowed("/login", lock)).toBe(true);
  });
  it("blocks pages outside the app (payroll from the production app)", () => {
    expect(pathAllowed("/payroll", lock)).toBe(false);
    expect(pathAllowed("/payroll/slips", lock)).toBe(false);
    expect(pathAllowed("/app/payroll", lock)).toBe(false);
    expect(pathAllowed("/", lock)).toBe(false);
    expect(pathAllowed("/apps", lock)).toBe(false);
    expect(pathAllowed("/solo/payroll", lock)).toBe(false);
    expect(pathAllowed("/mobile", lock)).toBe(false);   // ขึ้นต้นเหมือน /mo แต่ไม่ใช่หน้าใต้เมนู
  });
  it("marks read-only exception pages", () => {
    expect(pathAllowed("/master/skus/abc", lock)).toBe(true);
    expect(pathReadOnly("/master/skus/abc", lock)).toBe(true);
    expect(pathReadOnly("/mo", lock)).toBe(false);
  });
});

describe("draft keeps lock settings", () => {
  it("cleans lock, exceptions (not already in app) and extra perms", () => {
    const d = cleanDraft({ label: "a", menus: [{ menu_id: "mo" }], lock: { roles: ["staff", "admin"] }, exceptions: ["sku", "mo", "sku"], extra_perms: ["x.view"] });
    expect(d.lock).toEqual({ roles: ["staff"] });
    expect(d.exceptions).toEqual(["sku"]);
    expect(d.extra_perms).toEqual(["x.view"]);
  });
});

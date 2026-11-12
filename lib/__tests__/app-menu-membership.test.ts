import { describe, it, expect } from "vitest";
import { addToAppPatch, removeFromAppPatch, otherAppsOf, isInAppBar, checkNewMenuLink, trashReason, canHardDelete, type MembershipMenu } from "@/lib/app-menu-membership";
import { appMenuRows } from "@/lib/app-menu-layout";

const sku: MembershipMenu = { id: "1", label: "SKUs", href: "/master/skus", app_keys: ["master", "purchasing", "tasks"], is_active: true, show_in_sidebar: true };

describe("เพิ่มเมนูเข้าแอป", () => {
  it("เมนูที่มีอยู่แล้ว = เติม app_keys ไม่สร้างใหม่ · อยู่ครบแล้ว = ไม่ต้องแก้", () => {
    expect(addToAppPatch(sku, "sales")).toEqual({ app_keys: ["master", "purchasing", "tasks", "sales"] });
    expect(addToAppPatch(sku, "tasks")).toEqual({});
  });
  it("ปิดทั้งระบบอยู่ / ไม่โชว์ในเมนู → เปิดกลับให้ด้วย", () => {
    expect(addToAppPatch({ ...sku, is_active: false }, "tasks")).toEqual({ is_active: true });
    expect(addToAppPatch({ ...sku, show_in_sidebar: false, app_keys: null }, "tasks")).toEqual({ app_keys: ["tasks"], show_in_sidebar: true });
  });
  it("เพิ่มแล้วต้องอยู่ในแถบของแอปนั้นเสมอ", () => {
    const cases: MembershipMenu[] = [sku, { ...sku, is_active: false }, { ...sku, show_in_sidebar: false }, { ...sku, app_keys: [] }, { ...sku, app_keys: null, is_active: false, show_in_sidebar: false }];
    for (const m of cases) for (const app of ["tasks", "sales"]) expect(isInAppBar({ ...m, ...addToAppPatch(m, app) }, app)).toBe(true);
  });
});

describe("เอาเมนูออก (ไม่ลบแถวจริง)", () => {
  it("เอาออกจากแอปนี้ = ถอดเฉพาะแอปนี้ แอปอื่นยังอยู่", () => {
    const p = removeFromAppPatch(sku, "tasks", "app");
    expect(p).toEqual({ app_keys: ["master", "purchasing"] });
    const after = { ...sku, ...p };
    expect(isInAppBar(after, "tasks")).toBe(false);
    expect(isInAppBar(after, "master")).toBe(true);
    expect(isInAppBar(after, "purchasing")).toBe(true);
  });
  it("ปิดทั้งระบบ = is_active false (app_keys ไม่เปลี่ยน → เปิดกลับแล้วอยู่แอปเดิมครบ)", () => {
    const p = removeFromAppPatch(sku, "tasks", "off");
    expect(p).toEqual({ is_active: false });
    expect(otherAppsOf({ ...sku, ...p }, "tasks")).toEqual(["master", "purchasing"]);
    expect(isInAppBar({ ...sku, ...p, ...addToAppPatch({ ...sku, ...p }, "tasks") }, "master")).toBe(true);
  });
  it("ไม่มีอะไรต้องแก้ = {}", () => {
    expect(removeFromAppPatch(sku, "sales", "app")).toEqual({});
    expect(removeFromAppPatch({ ...sku, is_active: false }, "tasks", "off")).toEqual({});
  });
});

describe("ตรวจลิงก์ใหม่", () => {
  it("ต้องมีชื่อ + ลิงก์ที่ถูกรูปแบบ", () => {
    expect(checkNewMenuLink({ label: " ", href: "/x" })).toMatchObject({ ok: false, field: "label" });
    expect(checkNewMenuLink({ label: "ก", href: "" })).toMatchObject({ ok: false, field: "href" });
    expect(checkNewMenuLink({ label: "ก", href: "tasks/daily" })).toMatchObject({ ok: false, field: "href" });
    expect(checkNewMenuLink({ label: "ก", href: "//evil.com" })).toMatchObject({ ok: false, field: "href" });
    expect(checkNewMenuLink({ label: "ก", href: "/tasks/a b" })).toMatchObject({ ok: false, field: "href" });
    expect(checkNewMenuLink({ label: " สรุปงาน ", href: " /tasks/daily " })).toEqual({ ok: true, label: "สรุปงาน", href: "/tasks/daily" });
    expect(checkNewMenuLink({ label: "Docs", href: "https://example.com/a" })).toMatchObject({ ok: true });
  });
  it("ลิงก์ซ้ำเมนูเดิม → บอกเมนูเดิมให้ใช้แทน (ไม่สนตัวพิมพ์/ทับขวาท้าย)", () => {
    const r = checkNewMenuLink({ label: "สินค้า", href: "/Master/SKUs/" }, [sku]);
    expect(r).toMatchObject({ ok: false, field: "href", existing: { id: "1" } });
    expect(checkNewMenuLink({ label: "ก", href: "/tasks/daily" }, [], ["/tasks/daily"])).toMatchObject({ ok: false, field: "href" });
  });
});


describe("ถังขยะ + ลบถาวร", () => {
  it("ปิดทั้งระบบ / ไม่อยู่แอปไหน = อยู่ในถังขยะ ลบถาวรได้ · ยังใช้อยู่ = ลบถาวรไม่ได้", () => {
    expect(trashReason({ ...sku, is_active: false })).toBe("off");
    expect(trashReason({ ...sku, app_keys: [] })).toBe("no_app");
    expect(trashReason({ ...sku, app_keys: null })).toBe("no_app");
    expect(trashReason(sku)).toBeNull();
    expect(canHardDelete(sku)).toBe(false);
    expect(canHardDelete({ ...sku, is_active: false })).toBe(true);
  });
  it("เอาออกจากทุกแอป หรือปิดทั้งระบบ แล้วถึงลบถาวรได้", () => {
    let m: MembershipMenu = { ...sku };
    for (const app of ["master", "purchasing"]) m = { ...m, ...removeFromAppPatch(m, app, "app") };
    expect(canHardDelete(m)).toBe(false);   // ยังอยู่ tasks
    m = { ...m, ...removeFromAppPatch(m, "tasks", "app") };
    expect(canHardDelete(m)).toBe(true);
    expect(canHardDelete({ ...sku, ...removeFromAppPatch(sku, "tasks", "off") })).toBe(true);
  });
  it("กู้คืนจากถังขยะเข้าแอปไหนก็ได้ → ไม่อยู่ในถังขยะแล้ว", () => {
    for (const m of [{ ...sku, is_active: false }, { ...sku, app_keys: [] }]) expect(trashReason({ ...m, ...addToAppPatch(m, "sales") })).toBeNull();
  });
});

describe("เมนูของแอป (กฎเดียวกับแถบแอปเดี่ยว)", () => {
  it("เอาเฉพาะเปิดอยู่ + โชว์ในเมนู + มีแอปนี้ แล้วเรียงตามลำดับของแอป", () => {
    const rows = [
      { id: "a", label: "A", sort_order: 30, is_active: true, show_in_sidebar: true, app_keys: ["tasks"] },
      { id: "b", label: "B", sort_order: 10, is_active: true, show_in_sidebar: true, app_keys: ["tasks"], app_overrides: { tasks: { sort: 40, label: "B2" } } },
      { id: "c", label: "C", sort_order: 20, is_active: false, show_in_sidebar: true, app_keys: ["tasks"] },
      { id: "d", label: "D", sort_order: 5, is_active: true, show_in_sidebar: false, app_keys: ["tasks"] },
      { id: "e", label: "E", sort_order: 1, is_active: true, show_in_sidebar: true, app_keys: ["master"] },
    ];
    expect(appMenuRows(rows, "tasks").map((r) => `${r.id}:${r.label}`)).toEqual(["a:A", "b:B2"]);
  });
});

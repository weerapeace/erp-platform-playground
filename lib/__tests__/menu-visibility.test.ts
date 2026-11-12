import { describe, it, expect } from "vitest";
import { menuVisibilityFor, previewMenusFor, hiddenReasonText, type MenuViewer } from "@/lib/menu-visibility";
import { menuVisibleTo, type MenuAudience } from "@/lib/menu-audience";
import { menuPlace } from "@/lib/app-menu-layout";

type M = { id: string; permission_key?: string | null; parent_id?: string | null; audience?: unknown; app_overrides?: unknown };
const APP = "tasks";
const staffA: MenuViewer = { id: "a", role: "staff", perms: new Set(["tasks.view"]) };
const admin: MenuViewer = { id: "z", role: "admin", perms: new Set() };

describe("ดูแบบคนนี้ — เห็นเมนูไหม เพราะอะไร", () => {
  it("ซ่อนในแอปนี้ = ซ่อนจากทุกคน รวมแอดมิน · ยังเข้าได้ถ้ามีลิงก์เมื่อมีสิทธิ์", () => {
    const m: M = { id: "1", app_overrides: { tasks: { place: "hidden" } } };
    expect(menuVisibilityFor(m, APP, admin)).toMatchObject({ visible: false, reason: "app_hidden", reachableByLink: true });
    expect(menuVisibilityFor(m, APP, staffA)).toMatchObject({ visible: false, reason: "app_hidden" });
    // ซ่อนในแอปอื่น ไม่กระทบแอปนี้
    expect(menuVisibilityFor({ id: "2", app_overrides: { master: { place: "hidden" } } }, APP, staffA).visible).toBe(true);
  });

  it("เมนูย่อยหายตามเมนูแม่ที่ถูกซ่อน และใช้ที่อยู่ของเมนูแม่", () => {
    const p: M = { id: "p", app_overrides: { tasks: { place: "more" } } };
    const k: M = { id: "k", parent_id: "p" };
    const byId = new Map([[p.id, p], [k.id, k]]);
    expect(menuVisibilityFor(k, APP, staffA, { byId })).toMatchObject({ visible: true, place: "more" });
    const hp: M = { id: "p", app_overrides: { tasks: { place: "hidden" } } };
    expect(menuVisibilityFor(k, APP, staffA, { byId: new Map([[hp.id, hp], [k.id, k]]) }).reason).toBe("parent_hidden");
  });

  it("ใครเห็นเมนู: ตำแหน่ง / รายชื่อ / ซ่อนรายคน + ซ่อนแต่มีสิทธิ์ = เข้าได้ด้วยลิงก์", () => {
    expect(menuVisibilityFor({ id: "1", audience: { roles: ["manager"] } }, APP, staffA)).toMatchObject({ reason: "role_no", reachableByLink: true });
    expect(menuVisibilityFor({ id: "1", audience: { users: ["c"] } }, APP, staffA).reason).toBe("list_only");
    expect(menuVisibilityFor({ id: "1", audience: { hide_users: ["a"] } }, APP, staffA).reason).toBe("user_hide");
    expect(menuVisibilityFor({ id: "1", audience: { roles: ["manager"], users: ["a"] } }, APP, staffA).visible).toBe(true);
    // ซ่อนตามใครเห็น + ไม่มีสิทธิ์ = เข้าลิงก์ไม่ได้
    expect(menuVisibilityFor({ id: "1", permission_key: "x", audience: { roles: ["manager"] } }, APP, staffA).reachableByLink).toBe(false);
  });

  it("ดูแทนทั้งตำแหน่ง (ไม่มี id) — รายชื่อรายคนไม่นับ", () => {
    const role: MenuViewer = { id: null, role: "staff", perms: null };
    expect(menuVisibilityFor({ id: "1", audience: { users: ["a"] } }, APP, role).reason).toBe("list_only");
    expect(menuVisibilityFor({ id: "1", audience: { roles: ["staff"], hide_users: ["a"] } }, APP, role).visible).toBe(true);
  });

  it("ไม่มีสิทธิ์ของเมนู = ไม่เห็น บอกชื่อสิทธิ์ · แอดมินมีทุกสิทธิ์ · ยังไม่รู้สิทธิ์ = ข้ามไว้ก่อน", () => {
    const m: M = { id: "1", permission_key: "nesting.view" };
    const v = menuVisibilityFor(m, APP, staffA);
    expect(v).toMatchObject({ visible: false, reason: "no_perm", missingPerm: "nesting.view", reachableByLink: false });
    expect(hiddenReasonText(v, () => "จัดเรียงงานพิมพ์")).toContain("จัดเรียงงานพิมพ์");
    expect(menuVisibilityFor(m, APP, admin).visible).toBe(true);
    expect(menuVisibilityFor(m, APP, { ...staffA, perms: null }).visible).toBe(true);
  });

  it("ใช้ค่าร่าง (ยังไม่บันทึก) แทนค่าในฐานข้อมูลได้", () => {
    const m: M = { id: "1" };
    expect(menuVisibilityFor(m, APP, staffA, { audienceOf: () => ({ roles: ["manager"] }) }).visible).toBe(false);
    expect(menuVisibilityFor(m, APP, staffA, { placeOf: () => "hidden" }).reason).toBe("app_hidden");
  });

  it("ตรงกับแถบเมนูจริงของแอปเดี่ยวทุกกรณี (ซ่อนในแอป + ใครเห็น + สิทธิ์)", () => {
    const auds: (MenuAudience | null)[] = [null, { roles: ["staff"] }, { roles: ["manager"] }, { users: ["a"] }, { hide_users: ["a"] }, { roles: ["manager"], users: ["a"] }];
    const places = [undefined, { tasks: { place: "more" } }, { tasks: { place: "hidden" } }];
    const perms = [null, "tasks.view", "nesting.view"];
    const people = [{ id: "a", role: "staff", perms: new Set(["tasks.view"]) }, { id: "c", role: "manager", perms: new Set(["nesting.view"]) }, { id: "z", role: "admin", perms: new Set<string>() }];
    for (const audience of auds) for (const app_overrides of places) for (const permission_key of perms) for (const p of people) {
      const m: M = { id: "m", audience, app_overrides, permission_key };
      // กฎเดียวกับ app/app/[appKey]/page.tsx: ไม่ถูกซ่อนในแอป && มีสิทธิ์ (แอดมินมีทุกสิทธิ์) && menuVisibleTo
      const real = menuPlace(m, APP) !== "hidden" && (!permission_key || p.role === "admin" || p.perms.has(permission_key)) && menuVisibleTo(audience, p);
      expect(menuVisibilityFor(m, APP, p).visible).toBe(real);
    }
  });
});

describe("แถบเมนูแบบที่คนนี้เห็น", () => {
  it("แยกบนแถบ / เพิ่มเติม / ไม่เห็น ตามลำดับแอป + นับเมนูย่อย", () => {
    const items: M[] = [
      { id: "a" },
      { id: "b", app_overrides: { tasks: { place: "more" } } },
      { id: "c", permission_key: "nesting.view" },
      { id: "d", audience: { roles: ["manager"] } },
      { id: "a1", parent_id: "a" },
      { id: "a2", parent_id: "a", audience: { hide_users: ["a"] } },
    ];
    const top = items.filter((i) => !i.parent_id);
    const p = previewMenusFor(items, top, APP, staffA);
    expect(p.bar.map((i) => i.id)).toEqual(["a"]);
    expect(p.more.map((i) => i.id)).toEqual(["b"]);
    expect(p.hidden.map((h) => h.item.id)).toEqual(["a2", "c", "d"]);
    expect(p.kidsShown).toEqual({ a: 1 });
    expect(p).toMatchObject({ shown: 3, total: 6 });
  });
});

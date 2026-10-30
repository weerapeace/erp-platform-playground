import { describe, it, expect } from "vitest";
import { explainMenuFor, menuVisibleTo, resetMenuFor, setMenuVisibleFor, type MenuAudience } from "@/lib/menu-audience";

const A = { id: "a", role: "staff" };
const B = { id: "b", role: "staff" };
const C = { id: "c", role: "manager" };
const ADMIN = { id: "z", role: "admin" };
const PEOPLE = [A, B, C, ADMIN];

// ทุกแบบที่ audience เป็นได้ — ทุกคนเห็น · ตามตำแหน่ง · เฉพาะรายชื่อ · มีรายชื่อซ่อน · ผสม
const CASES: (MenuAudience | null)[] = [
  null,
  { hide_users: ["b"] },
  { roles: ["staff"] },
  { roles: ["manager"] },
  { roles: ["manager"], users: ["a"] },
  { users: ["a"] },
  { users: ["a", "c"] },
  { roles: ["staff"], hide_users: ["a"] },
];

describe("ตั้งเมนูรายคน (มุมมองตามพนักงาน)", () => {
  it("ตั้งเห็น/ไม่เห็นให้คนนี้ได้ตามนั้นเสมอ และคนอื่นเห็นเหมือนเดิม", () => {
    for (const a of CASES) for (const who of [A, B, C]) for (const v of [true, false]) {
      const next = setMenuVisibleFor(a, who, v);
      expect(menuVisibleTo(next, who), JSON.stringify({ a, who, v })).toBe(v);
      for (const other of PEOPLE.filter((p) => p !== who)) {
        expect(menuVisibleTo(next, other), JSON.stringify({ a, who, v, other })).toBe(menuVisibleTo(a, other));
      }
    }
  });

  it("ตั้งตรงกับตำแหน่ง = ไม่ต้องเก็บรายคน", () => {
    expect(setMenuVisibleFor(null, A, true)).toBeNull();
    expect(setMenuVisibleFor({ roles: ["staff"] }, A, true)).toEqual({ roles: ["staff"] });
    expect(setMenuVisibleFor({ roles: ["staff"], hide_users: ["a"] }, A, true)).toEqual({ roles: ["staff"] });
  });

  it("เอาคนสุดท้ายออกจากเมนูที่เห็นเฉพาะรายชื่อ = ยังจำกัดไว้ (ไม่กลายเป็นทุกคนเห็น)", () => {
    const next = setMenuVisibleFor({ users: ["a"] }, A, false);
    expect(menuVisibleTo(next, B)).toBe(false);
    expect(menuVisibleTo(next, ADMIN)).toBe(true);
    expect(resetMenuFor({ users: ["a"] }, A)).toEqual({ roles: ["admin"] });
  });

  it("ตั้งกลับตามตำแหน่ง = ล้างเฉพาะคนนี้", () => {
    expect(resetMenuFor({ roles: ["manager"], users: ["a", "b"], hide_users: ["c"] }, A)).toEqual({ roles: ["manager"], users: ["b"], hide_users: ["c"] });
    expect(resetMenuFor({ hide_users: ["a"] }, A)).toBeNull();
  });

  it("บอกเหตุผลที่เห็น/ไม่เห็น", () => {
    expect(explainMenuFor(null, A)).toEqual({ visible: true, reason: "everyone" });
    expect(explainMenuFor({ roles: ["staff"] }, A)).toEqual({ visible: true, reason: "role" });
    expect(explainMenuFor({ roles: ["manager"] }, A)).toEqual({ visible: false, reason: "role_no" });
    expect(explainMenuFor({ users: ["c"] }, A)).toEqual({ visible: false, reason: "list_only" });
    expect(explainMenuFor({ roles: ["manager"], users: ["a"] }, A)).toEqual({ visible: true, reason: "user_show" });
    expect(explainMenuFor({ hide_users: ["a"] }, A)).toEqual({ visible: false, reason: "user_hide" });
    expect(explainMenuFor({ hide_users: ["z"], roles: ["staff"] }, ADMIN)).toEqual({ visible: true, reason: "admin" });
  });
});

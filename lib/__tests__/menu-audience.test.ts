import { describe, it, expect } from "vitest";
import { cleanAudience, describeAudience, menuVisibleTo } from "@/lib/menu-audience";

const staff = { id: "u-staff", role: "staff" };
const mgr = { id: "u-mgr", role: "manager" };
const admin = { id: "u-admin", role: "admin" };

describe("ใครเห็นเมนูไหน", () => {
  it("ไม่ตั้ง = ทุกคนเห็น", () => {
    expect(menuVisibleTo(null, staff)).toBe(true);
    expect(menuVisibleTo({}, staff)).toBe(true);
    expect(menuVisibleTo({ roles: [] }, staff)).toBe(true);
  });
  it("ติ๊กตำแหน่ง = เห็นเฉพาะตำแหน่งนั้น (+ คนที่เพิ่มรายคน)", () => {
    const a = { roles: ["manager"], users: ["u-staff"] };
    expect(menuVisibleTo(a, mgr)).toBe(true);
    expect(menuVisibleTo(a, staff)).toBe(true);   // เพิ่มรายคน
    expect(menuVisibleTo(a, { id: "u-other", role: "staff" })).toBe(false);
  });
  it("ซ่อนรายคนชนะ · admin เห็นทุกเมนู · ยังไม่รู้ว่าใคร = โชว์ไว้ก่อน", () => {
    expect(menuVisibleTo({ hide_users: ["u-staff"] }, staff)).toBe(false);
    expect(menuVisibleTo({ hide_users: ["u-staff"] }, mgr)).toBe(true);
    expect(menuVisibleTo({ roles: ["staff"], hide_users: ["u-admin"] }, admin)).toBe(true);
    expect(menuVisibleTo({ roles: ["staff"] }, null)).toBe(true);
  });
  it("ล้างค่า: ซ้ำ/ว่างทิ้ง · คนที่อยู่ทั้งเห็นและซ่อน = เห็น · ไม่มีอะไร = null", () => {
    expect(cleanAudience({ roles: ["staff", "staff", ""], users: ["a"], hide_users: ["a", "b"] })).toEqual({ roles: ["staff"], users: ["a"], hide_users: ["b"] });
    expect(cleanAudience({ roles: [], users: [], hide_users: [] })).toBeNull();
  });
  it("สรุปภาษาคน", () => {
    expect(describeAudience(null)).toBe("ทุกคน");
    expect(describeAudience({ roles: ["staff"], users: ["x", "y"], hide_users: ["z"] }, (k) => (k === "staff" ? "พนักงาน" : k))).toBe("เฉพาะ พนักงาน + 2 คน · ซ่อนจาก 1 คน");
  });
});

import { describe, expect, it } from "vitest";
import { crewFields, crewList, crewIdsOf, lastCrewIds } from "./crew-pick";

const people = [
  { id: "a", name: "ภิรมย์ ชัยดี (ลม)" },
  { id: "b", name: "โสภา สุริโย (แพง)" },
  { id: "c", name: "สมชัย พรมแก้ว (โด่ง)" },
];

describe("crewFields", () => {
  it("ไม่เลือกใคร = ทั้งโต๊ะ", () => {
    expect(crewFields([], "โต๊ะขาล")).toEqual({ assignee_type: "department", assignee_id: null, assignee_name: "โต๊ะขาล", assignees: [] });
  });
  it("หลายคน = ชื่อต่อกัน + คนแรกเป็น assignee_id (รูปแบบเดียวกับบอร์ดแผน)", () => {
    const f = crewFields(crewList(["b", "a"], people), "โต๊ะขาล");
    expect(f.assignee_type).toBe("craftsman");
    expect(f.assignee_id).toBe("b");
    expect(f.assignee_name).toBe("โสภา สุริโย (แพง), ภิรมย์ ชัยดี (ลม)");
    expect(f.assignees).toHaveLength(2);
  });
});

describe("crewList", () => {
  it("ตัดคนที่ไม่อยู่ในรายชื่อแล้ว (ย้ายโต๊ะ/เปลี่ยนโต๊ะในป๊อป)", () => {
    expect(crewList(["a", "zz", "c"], people).map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("crewIdsOf", () => {
  it("อ่านหลายคนจาก assignees", () => {
    expect(crewIdsOf({ assignees: [{ id: "a", name: "x" }, { id: "b", name: "y" }], assignee_type: "craftsman", assignee_id: "a" })).toEqual(["a", "b"]);
  });
  it("ของเก่าช่างเดี่ยว (ไม่มี assignees) ก็อ่านได้", () => {
    expect(crewIdsOf({ assignees: [], assignee_type: "craftsman", assignee_id: "c" })).toEqual(["c"]);
  });
  it("ทั้งโต๊ะ = ไม่มีใคร", () => {
    expect(crewIdsOf({ assignees: [], assignee_type: "department", assignee_id: null })).toEqual([]);
  });
});

describe("lastCrewIds", () => {
  const wos = [
    { department_id: "d1", created_at: "2026-10-01T00:00:00Z", assignees: [{ id: "c", name: "" }], assignee_type: "craftsman", assignee_id: "c" },
    { department_id: "d1", created_at: "2026-10-20T00:00:00Z", assignees: [{ id: "a", name: "" }, { id: "b", name: "" }], assignee_type: "craftsman", assignee_id: "a" },
    { department_id: "d1", created_at: "2026-10-25T00:00:00Z", assignees: [], assignee_type: "department", assignee_id: null },
    { department_id: "d2", created_at: "2026-10-27T00:00:00Z", assignees: [{ id: "c", name: "" }], assignee_type: "craftsman", assignee_id: "c" },
  ];
  it("เอาใบล่าสุดของโต๊ะนี้ที่ระบุคน (ข้ามใบที่เป็นทั้งโต๊ะ)", () => {
    expect(lastCrewIds(wos, "d1", people)).toEqual(["a", "b"]);
  });
  it("คนที่ไม่อยู่ในโต๊ะแล้วไม่เอา", () => {
    expect(lastCrewIds(wos, "d1", people.filter((p) => p.id !== "b"))).toEqual(["a"]);
  });
  it("ยังไม่เลือกโต๊ะ = ว่าง", () => {
    expect(lastCrewIds(wos, null, people)).toEqual([]);
  });
});

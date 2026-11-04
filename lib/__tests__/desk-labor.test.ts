import { describe, expect, it } from "vitest";
import { splitDeskLabor, type LaborMember } from "@/lib/desk-labor";

const members: LaborMember[] = [
  { id: "a", name: "ลำใย", aliases: ["ลำใย สุดดี", "ลำใย สุดดี (ลำใย)"] },
  { id: "b", name: "เสถียร", aliases: ["เสถียร นาไชย (เสถียร)"] },
  { id: "c", name: "โบโบ้" },
];
const sum = (r: ReturnType<typeof splitDeskLabor>) => r.people.reduce((a, p) => a + p.total, 0) + r.unassigned;

describe("splitDeskLabor — แบ่งค่าแรงทั้งโต๊ะ", () => {
  it("งานทั้งโต๊ะ แบ่งเท่ากันทุกคนประจำโต๊ะ", () => {
    const r = splitDeskLabor([{ assignee_type: "department", assignee_name: "โต๊ะเสถียร", plan: 300, got: 30 }], members);
    expect(r.people.map((p) => [p.name, p.desk])).toEqual(expect.arrayContaining([["ลำใย", 100], ["เสถียร", 100], ["โบโบ้", 100]]));
    expect(r.deskJobs).toBe(1);
    expect(r.people.find((p) => p.key === "a")?.got).toBe(10);
    expect(sum(r)).toBe(300);
  });

  it("งานหลายคน แบ่งตามจำนวนคนที่รับ · คนที่ไม่ได้รับ = 0", () => {
    const r = splitDeskLabor([{ assignee_type: "craftsman", assignee_id: "a", assignee_name: "ลำใย สุดดี (ลำใย), เสถียร นาไชย (เสถียร)",
      assignees: [{ id: "a", name: "ลำใย สุดดี (ลำใย)" }, { id: "b", name: "เสถียร นาไชย (เสถียร)" }], plan: 1000, got: 0 }], members);
    expect(r.people.find((p) => p.key === "a")?.shared).toBe(500);
    expect(r.people.find((p) => p.key === "b")?.shared).toBe(500);
    expect(r.people.find((p) => p.key === "c")?.total).toBe(0);
    expect(r.people).toHaveLength(3);   // คนในโต๊ะโชว์ครบ แม้ยังไม่มีงาน
  });

  it("งานคนเดียว (ไม่มี assignees[]) จับคู่ด้วยชื่อเต็มได้", () => {
    const r = splitDeskLabor([{ assignee_type: "craftsman", assignee_id: null, assignee_name: "ลำใย สุดดี", plan: 250, got: 50 }], members);
    const a = r.people.find((p) => p.key === "a");
    expect(a?.solo).toBe(250);
    expect(a?.member).toBe(true);
  });

  it("คนนอกโต๊ะ = แยกแถว member=false", () => {
    const r = splitDeskLabor([{ assignee_type: "craftsman", assignee_id: "zz", assignee_name: "แพง", plan: 90, got: 0 }], members);
    const x = r.people.find((p) => p.name === "แพง");
    expect(x?.member).toBe(false);
    expect(x?.solo).toBe(90);
    expect(sum(r)).toBe(90);
  });

  it("โต๊ะไม่มีคนประจำ + งานทั้งโต๊ะ → ก้อนยังไม่มีคนรับ (ยอดไม่หาย)", () => {
    const r = splitDeskLabor([{ assignee_type: "department", plan: 400, got: 100 }, { assignee_type: "craftsman", assignee_id: "p", assignee_name: "ลม", plan: 100, got: 0 }], []);
    expect(r.unassigned).toBe(400);
    expect(r.unassignedGot).toBe(100);
    expect(r.total).toBe(500);
    expect(sum(r)).toBe(500);
  });

  it("ผลรวมทุกคน = ค่าแรงรวมทั้งโต๊ะ (ผสมทุกแบบ)", () => {
    const r = splitDeskLabor([
      { assignee_type: "department", plan: 700, got: 0 },
      { assignee_type: "craftsman", assignees: [{ id: "a", name: "ลำใย" }, { id: "b", name: "เสถียร" }], plan: 333, got: 0 },
      { assignee_type: "craftsman", assignee_id: "c", assignee_name: "โบโบ้", plan: 120, got: 60 },
    ], members);
    expect(sum(r)).toBeCloseTo(1153, 6);
    expect(r.total).toBe(1153);
  });
});

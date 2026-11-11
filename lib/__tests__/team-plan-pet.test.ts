import { describe, it, expect } from "vitest";
import { groupMyPlan, isMine, planPetCount, planPetNews, shiftToTomorrow } from "@/lib/team-plan-pet";
import { normalizePlanMeta, type PlanItem } from "@/lib/team-plan";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
// 2026-11-11 15:00 เวลาไทย
const NOW = new Date("2026-11-11T08:00:00Z");
const item = (id: string, o: Partial<PlanItem> & { planRaw?: Record<string, unknown> } = {}): PlanItem & { snooze_until?: string | null } => {
  const { planRaw, ...rest } = o;
  return {
    id, title: id, note: null, status: "open", priority: "normal", due_at: null, assigned_to: ME, assigned_name: null,
    created_by: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", resolved_by: null, resolved_at: null,
    links: [], plan: normalizePlanMeta({ created_by_id: ME, ...(planRaw ?? {}) }), ...rest,
  };
};

describe("งานของฉัน", () => {
  it("ผู้รับผิดชอบคือฉัน หรือไม่มีผู้รับผิดชอบแต่ฉันสร้าง", () => {
    expect(isMine(item("a"), ME)).toBe(true);
    expect(isMine(item("b", { assigned_to: OTHER }), ME)).toBe(false);
    expect(isMine(item("c", { assigned_to: null }), ME)).toBe(true);
    expect(isMine(item("d", { assigned_to: null, planRaw: { created_by_id: OTHER } }), ME)).toBe(false);
  });
});

describe("groupMyPlan", () => {
  it("แบ่งกลุ่ม เกินกำหนด / ครบวันนี้ / ถัดไป / รอคนอื่น / ไม่กำหนด / เสร็จวันนี้", () => {
    const g = groupMyPlan([
      item("over", { due_at: "2026-11-10T11:00:00Z" }),
      item("today", { due_at: "2026-11-11T11:00:00Z" }),       // วันนี้ 18:00
      item("soon", { due_at: "2026-11-12T11:00:00Z" }),
      item("far", { due_at: "2026-12-01T11:00:00Z" }),
      item("wait", { due_at: "2026-11-12T11:00:00Z", planRaw: { created_by_id: ME, waiting: { note: "ราคา", since: "2026-11-09T00:00:00Z" } } }),
      item("none"),
      item("doneToday", { status: "resolved", resolved_at: "2026-11-11T03:00:00Z" }),
      item("doneOld", { status: "resolved", resolved_at: "2026-11-09T03:00:00Z" }),
      item("others", { assigned_to: OTHER, due_at: "2026-11-10T11:00:00Z" }),
    ], ME, NOW);
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((x) => x.id)]))).toEqual({
      over: ["over"], today: ["today"], soon: ["soon"], wait: ["wait"], later: ["far", "none"], done: ["doneToday"],
    });
    expect(planPetCount(g)).toBe(2);
    expect(planPetCount(null)).toBe(0);
  });
  it("งานเกินกำหนดที่รอคนอื่น ยังอยู่กลุ่มเกินกำหนด", () => {
    const g = groupMyPlan([item("x", { due_at: "2026-11-10T11:00:00Z", planRaw: { created_by_id: ME, waiting: { note: "", since: "2026-11-09T00:00:00Z" } } })], ME, NOW);
    expect(g.over.map((x) => x.id)).toEqual(["x"]);
  });
});

describe("planPetNews — ตัว Pet พูดอะไร", () => {
  it("เลยกำหนด / เตือนก่อน 1 ชม. / เตือนที่เลื่อนไว้ / มีคนมอบงาน", () => {
    const n = planPetNews([
      item("late", { due_at: "2026-11-11T07:00:00Z" }),
      item("soon1h", { due_at: "2026-11-11T08:30:00Z", planRaw: { created_by_id: ME, remind: "before_1h" } }),
      item("notyet", { due_at: "2026-11-11T11:00:00Z", planRaw: { created_by_id: ME, remind: "before_1h" } }),
      item("snz", { snooze_until: "2026-11-11T07:30:00Z" }),
      item("snzFuture", { snooze_until: "2026-11-11T09:30:00Z" }),
      item("given", { planRaw: { created_by_id: OTHER }, updated_at: "2026-11-11T06:00:00Z" }),
      item("givenOld", { planRaw: { created_by_id: OTHER }, updated_at: "2026-11-05T06:00:00Z" }),
      item("notMine", { assigned_to: OTHER, due_at: "2026-11-11T07:00:00Z" }),
    ], ME, NOW);
    expect(n.map((x) => x.key)).toEqual([
      "overdue:late:2026-11-11T07:00:00Z", "snooze:snz:2026-11-11T07:30:00Z", "remind:soon1h:2026-11-11T08:30:00Z", `assigned:given:${ME}`,
    ]);
    expect(n[0].text).toBe("เลยกำหนดแล้ว: late");
    expect(n[2].text).toContain("ใกล้ถึงกำหนด");
  });
  it("สรุปเช้าเฉพาะช่วง 9:00–11:59 และมีเรื่องให้บอก", () => {
    const morning = new Date("2026-11-11T02:30:00Z");   // 09:30 ไทย
    const items = [item("t", { due_at: "2026-11-11T11:00:00Z" })];
    expect(planPetNews(items, ME, morning).map((x) => x.kind)).toEqual(["morning"]);
    expect(planPetNews(items, ME, NOW).map((x) => x.kind)).toEqual([]);
  });
});

describe("shiftToTomorrow", () => {
  it("พรุ่งนี้เวลาเดิม · ไม่มีกำหนด = 18:00", () => {
    expect(shiftToTomorrow("2026-11-09T11:00:00Z", NOW)).toBe("2026-11-12T11:00:00.000Z");
    expect(shiftToTomorrow(null, NOW)).toBe("2026-11-12T11:00:00.000Z");
    expect(shiftToTomorrow("2026-11-11T02:15:00Z", NOW)).toBe("2026-11-12T02:15:00.000Z");
  });
});

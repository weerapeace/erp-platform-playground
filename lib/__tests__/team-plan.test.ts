import { describe, it, expect } from "vitest";
import {
  dueLabel, isSummaryWindow, nextDue, normalizePlanMeta, normalizePlanSent, planMorningSummary, planReminders, remindAt, quadrantOf, quadrantPatch, quickDue, sortPlanItems, starCountFor, waitingDays,
  dueOnDate, dueYmd, type PlanMeta,
} from "@/lib/team-plan";

// พุธ 4 พ.ย. 2026 10:00 เวลาไทย
const NOW = new Date("2026-11-04T10:00:00+07:00");
const meta = (p: Partial<PlanMeta> = {}): PlanMeta => ({ ...normalizePlanMeta({}, NOW), ...p });

describe("แผนงานทีม — กฎกลาง", () => {
  it("ล้างค่า metadata: ค่าเริ่มต้น · ค่าแปลกทิ้ง · ลิงก์นอกเว็บไม่รับ", () => {
    expect(normalizePlanMeta(null, NOW)).toEqual({ important: true, star_date: null, waiting: null, repeat: null, remind: "none", source: null, created_by_id: null, tags: [], watchers: [], estimate_min: null });
    const m = normalizePlanMeta({ important: false, star_date: "x", repeat: { every: "week", n: 99 }, remind: "boom", source: { href: "https://evil", label: "x" }, waiting: { note: "รอลูกค้า" } }, NOW);
    expect(m.important).toBe(false);
    expect(m.star_date).toBeNull();
    expect(m.repeat).toEqual({ every: "week", n: 30 });
    expect(m.remind).toBe("none");
    expect(m.source).toBeNull();
    expect(m.waiting).toEqual({ note: "รอลูกค้า", since: NOW.toISOString() });
    expect(normalizePlanMeta({ source: { href: "/master/design-dashboard?open=1", label: "DS-1" } }).source).toEqual({ href: "/master/design-dashboard?open=1", label: "DS-1" });
  });

  it("ป้ายกำหนด: วันนี้ / พรุ่งนี้ / วันในสัปดาห์ / เกินกำหนด", () => {
    expect(dueLabel(null, NOW)).toBe("");
    expect(dueLabel("2026-11-04T07:00:00Z", NOW)).toBe("วันนี้ 14:00");
    expect(dueLabel("2026-11-05T11:00:00Z", NOW)).toBe("พรุ่งนี้ 18:00");
    expect(dueLabel("2026-11-06T17:00:00Z", NOW)).toBe("ส. 7 พ.ย.");   // เที่ยงคืนไทย = ทั้งวัน ไม่โชว์เวลา
    expect(dueLabel("2026-11-02T11:00:00Z", NOW)).toBe("เกินกำหนด 2 วัน");
    expect(dueLabel("2026-11-04T01:00:00Z", NOW)).toBe("เลยเวลา 08:00");
  });

  it("กำหนดด่วน: วันนี้/พรุ่งนี้/ศุกร์นี้ 18:00 เวลาไทย", () => {
    expect(quickDue("today", NOW)).toBe("2026-11-04T11:00:00.000Z");
    expect(quickDue("tomorrow", NOW)).toBe("2026-11-05T11:00:00.000Z");
    expect(quickDue("friday", NOW)).toBe("2026-11-06T11:00:00.000Z");
    expect(quickDue("none", NOW)).toBeNull();
  });

  it("งานทำซ้ำ: รอบถัดไปคงเวลาเดิม · เลยตอนนี้เสมอ · สิ้นเดือนไม่ล้น", () => {
    expect(nextDue("2026-11-02T02:00:00Z", { every: "week", n: 1 }, NOW)).toBe("2026-11-09T02:00:00.000Z");
    expect(nextDue("2026-10-01T02:00:00Z", { every: "day", n: 1 }, NOW)).toBe("2026-11-05T02:00:00.000Z");   // ค้างนาน = ข้ามไปรอบที่ยังไม่ถึง
    expect(nextDue("2026-10-31T03:00:00Z", { every: "month", n: 1 }, NOW)).toBe("2026-11-30T03:00:00.000Z");
    expect(nextDue(null, { every: "day", n: 2 }, NOW)).toBe("2026-11-06T11:00:00.000Z");
  });

  it("ตาราง 4 ช่อง: จัดช่อง + ลากเข้าช่องแล้วได้ค่าใหม่", () => {
    expect(quadrantOf("urgent", true)).toBe("do");
    expect(quadrantOf("normal", true)).toBe("schedule");
    expect(quadrantOf("high", false)).toBe("delegate");
    expect(quadrantOf("low", false)).toBe("later");
    expect(quadrantPatch("do", "low")).toEqual({ priority: "high", important: true });
    expect(quadrantPatch("do", "urgent")).toEqual({ priority: "urgent", important: true });
    expect(quadrantPatch("later", "urgent")).toEqual({ priority: "normal", important: false });
    expect(quadrantPatch("schedule", "low")).toEqual({ priority: "low", important: true });
  });

  it("⭐ นับดาววันนี้ต่อคน (ไม่มีผู้รับผิดชอบ = คนสร้าง) · ดาวเมื่อวานไม่นับ · งานเสร็จไม่นับ", () => {
    const items = [
      { assigned_to: "u1", status: "open", plan: meta({ star_date: "2026-11-04" }) },
      { assigned_to: null, status: "open", plan: meta({ star_date: "2026-11-04", created_by_id: "u1" }) },
      { assigned_to: "u1", status: "open", plan: meta({ star_date: "2026-11-03" }) },
      { assigned_to: "u1", status: "resolved", plan: meta({ star_date: "2026-11-04" }) },
      { assigned_to: "u2", status: "open", plan: meta({ star_date: "2026-11-04" }) },
    ];
    expect(starCountFor(items, "u1", NOW)).toBe(2);
  });

  it("เรียง: ดาววันนี้ → กำหนดใกล้ → ไม่มีกำหนด", () => {
    const a = { id: "a", due_at: null, created_at: "2026-11-01T00:00:00Z", plan: meta() };
    const b = { id: "b", due_at: "2026-11-06T00:00:00Z", created_at: "2026-11-01T00:00:00Z", plan: meta() };
    const c = { id: "c", due_at: "2026-11-05T00:00:00Z", created_at: "2026-11-01T00:00:00Z", plan: meta() };
    const d = { id: "d", due_at: null, created_at: "2026-11-02T00:00:00Z", plan: meta({ star_date: "2026-11-04" }) };
    expect(sortPlanItems([a, b, c, d], NOW).map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("รอมากี่วัน", () => {
    expect(waitingDays("2026-11-02T09:00:00+07:00", NOW)).toBe(2);
  });
});


describe("แผนงานทีม — รอบแจ้งเตือน", () => {
  const item = (p: Record<string, unknown> = {}) => ({
    id: "t1", title: "สั่งผ้า", status: "open", priority: "normal" as const, due_at: null as string | null,
    assigned_to: "u1" as string | null, plan: meta(), sent: normalizePlanSent(null), ...p,
  });

  it("เวลาเตือนก่อนกำหนด", () => {
    expect(remindAt("2026-11-04T11:00:00Z", "before_1h")?.toISOString()).toBe("2026-11-04T10:00:00.000Z");
    expect(remindAt("2026-11-04T11:00:00Z", "morning")?.toISOString()).toBe("2026-11-04T02:00:00.000Z");   // 09:00 ไทย
    expect(remindAt("2026-11-04T00:30:00Z", "morning")?.toISOString()).toBe("2026-11-03T23:30:00.000Z");   // กำหนด 07:30 → ก่อน 1 ชม.
    expect(remindAt("2026-11-04T11:00:00Z", "none")).toBeNull();
  });

  it("เตือนก่อนกำหนดครั้งเดียว · เปลี่ยนกำหนด = เตือนใหม่", () => {
    const due = "2026-11-04T03:30:00Z";   // 10:30 ไทย · เตือน before_1h = 09:30 ≤ 10:00
    const r1 = planReminders([item({ due_at: due, plan: meta({ remind: "before_1h", created_by_id: "u1" }) })], NOW);
    expect(r1.notes.map((n) => n.kind)).toEqual(["before"]);
    expect(r1.patches[0].sent.remind_for).toBe(due);
    const again = planReminders([item({ due_at: due, plan: meta({ remind: "before_1h" }), sent: r1.patches[0].sent })], NOW);
    expect(again.notes).toEqual([]);
  });

  it("เลยกำหนด: แจ้งครั้งเดียว + ปกติเลื่อนเป็นด่วน · ด่วนมากไม่ลดลง", () => {
    const due = "2026-11-03T11:00:00Z";
    const r = planReminders([item({ due_at: due }), item({ id: "t2", due_at: due, priority: "urgent" })], NOW);
    expect(r.notes.map((n) => [n.item_id, n.kind])).toEqual([["t1", "overdue"], ["t2", "overdue"]]);
    expect(r.patches.find((p) => p.id === "t1")?.priority).toBe("high");
    expect(r.patches.find((p) => p.id === "t2")?.priority).toBeUndefined();
    const again = planReminders([item({ due_at: due, priority: "high", sent: r.patches[0].sent })], NOW);
    expect(again.notes).toEqual([]);
  });

  it("รอคนอื่นเกิน 2 วัน: ตามทุก 2 วัน · ผู้รับ = ผู้รับผิดชอบ หรือคนสร้าง", () => {
    const w = meta({ waiting: { note: "ลูกค้าตอบ", since: "2026-11-01T10:00:00+07:00" }, created_by_id: "u9" });
    const r = planReminders([item({ assigned_to: null, plan: w })], NOW);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ kind: "waiting", user_id: "u9" });
    expect(planReminders([item({ plan: w, sent: { waiting_on: "2026-11-03" } })], NOW).notes).toEqual([]);
    expect(planReminders([item({ plan: w, sent: { waiting_on: "2026-11-02" } })], NOW).notes).toHaveLength(1);
  });

  it("เลื่อนเตือนจากมือถือ: ถึงเวลาแล้วเตือนอีกครั้ง 1 ครั้ง", () => {
    const s = { snooze_until: "2026-11-04T02:30:00Z" };
    const r = planReminders([item({ sent: s })], NOW);
    expect(r.notes.map((n) => n.kind)).toEqual(["snooze"]);
    expect(planReminders([item({ sent: { ...s, snooze_sent: s.snooze_until } })], NOW).notes).toEqual([]);
    expect(planReminders([item({ sent: { snooze_until: "2026-11-04T05:00:00Z" } })], NOW).notes).toEqual([]);   // ยังไม่ถึง
  });

  it("สรุปเช้า: ช่วง 9–12 โมง · มีงานหลัก/ครบวันนี้/เกินกำหนด ถึงส่ง", () => {
    expect(isSummaryWindow(NOW)).toBe(true);
    expect(isSummaryWindow(new Date("2026-11-04T13:00:00+07:00"))).toBe(false);
    const s = planMorningSummary([
      { title: "A", status: "open", due_at: "2026-11-04T11:00:00Z", assigned_to: "u1", plan: meta() },
      { title: "B", status: "open", due_at: "2026-11-02T11:00:00Z", assigned_to: "u1", plan: meta() },
      { title: "C", status: "open", due_at: null, assigned_to: "u1", plan: meta({ star_date: "2026-11-04" }) },
      { title: "D", status: "open", due_at: null, assigned_to: "u2", plan: meta() },
    ], "u1", NOW);
    expect(s?.title).toBe("สรุปงานวันนี้ของคุณ (3 งานค้าง)");
    expect(s?.body.split("\n")[0]).toBe("⭐ งานหลัก 1 · ครบกำหนดวันนี้ 1 · เกินกำหนด 1");
    expect(planMorningSummary([{ title: "D", status: "open", due_at: null, assigned_to: "u2", plan: meta() }], "u2", NOW)).toBeNull();
  });
});

describe("ปฏิทิน: ลากงานลงวัน", () => {
  it("คงเวลาเดิม · ไม่มีเวลาเดิม = 18:00 · วางกลับกล่อง = ไม่มีกำหนด", () => {
    expect(dueOnDate("2026-11-03T07:30:00.000Z", "2026-11-06")).toBe("2026-11-06T07:30:00.000Z");   // 14:30 ไทย
    expect(dueOnDate(null, "2026-11-06")).toBe("2026-11-06T11:00:00.000Z");                         // 18:00 ไทย
    expect(dueOnDate("2026-11-02T17:00:00.000Z", "2026-11-06")).toBe("2026-11-06T11:00:00.000Z");   // เที่ยงคืนไทย = ไม่มีเวลา
    expect(dueOnDate("2026-11-03T07:30:00.000Z", null)).toBeNull();
    expect(dueOnDate(null, "6/11/2026")).toBeNull();
  });
  it("วันที่ตามเวลาไทย (ไม่ร่นเพราะ UTC)", () => {
    expect(dueYmd("2026-11-05T18:30:00.000Z")).toBe("2026-11-06");   // 01:30 ไทยของวันที่ 6
    expect(dueYmd(null)).toBeNull();
  });
});

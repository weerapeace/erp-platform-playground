import { describe, it, expect } from "vitest";
import {
  dueLabel, nextDue, normalizePlanMeta, quadrantOf, quadrantPatch, quickDue, sortPlanItems, starCountFor, waitingDays,
  type PlanMeta,
} from "@/lib/team-plan";

// พุธ 4 พ.ย. 2026 10:00 เวลาไทย
const NOW = new Date("2026-11-04T10:00:00+07:00");
const meta = (p: Partial<PlanMeta> = {}): PlanMeta => ({ ...normalizePlanMeta({}, NOW), ...p });

describe("แผนงานทีม — กฎกลาง", () => {
  it("ล้างค่า metadata: ค่าเริ่มต้น · ค่าแปลกทิ้ง · ลิงก์นอกเว็บไม่รับ", () => {
    expect(normalizePlanMeta(null, NOW)).toEqual({ important: true, star_date: null, waiting: null, repeat: null, remind: "none", source: null, created_by_id: null });
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

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ชื่อคน — ไม่ต่อฐานข้อมูลจริง
vi.mock("@/lib/record-tasks-server", () => ({
  userNames: async () => new Map([["u-mint", "Mint"], ["u-toey", "Toey"]]),
}));

import { teamPlanWeekly } from "@/lib/email-report/source-team-plan";
import { renderReportEmail } from "@/lib/email-report/render";
import { normalizeReportOptions } from "@/lib/email-report/shared";

// ศุกร์ 6 พ.ย. 2026 17:00 เวลาไทย
const NOW = new Date("2026-11-06T17:00:00+07:00");
const iso = (h: number) => new Date(NOW.getTime() + h * 3600e3).toISOString();
const row = (p: Record<string, unknown>) => ({
  module_key: "team_plan", record_id: "", description: null, status: "open", priority: "normal", assigned_to: null, created_by: "Gogo",
  due_at: null, resolved_by: null, resolved_at: null, metadata: { plan: {} }, created_at: iso(-100), updated_at: iso(-2), ...p,
});
const ROWS = [
  row({ id: "a", title: "ส่งแบบ CPN", priority: "urgent", assigned_to: "u-mint", due_at: iso(-30) }),                                   // เกินกำหนด
  row({ id: "b", title: "ถ่ายรูป Tote", assigned_to: "u-toey", metadata: { plan: { waiting: { note: "รอของ", since: iso(-72) } } } }),   // รอ 3 วัน
  row({ id: "c", title: "สั่งผ้า", assigned_to: "u-mint", due_at: iso(20) }),                                                             // ใกล้กำหนด
  row({ id: "d", title: "เช็กสต๊อก", status: "resolved", resolved_at: iso(-24), resolved_by: "Mint" }),                                   // เสร็จสัปดาห์นี้
];

let orArg = "";
const admin = {
  from: () => {
    const q = {
      select: () => q, eq: () => q,
      or: (s: string) => { orArg = s; return q; },
      limit: async () => ({ data: ROWS, error: null }),
    };
    return q;
  },
} as never;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

describe("อีเมลสรุปแผนงานทีมรายสัปดาห์", () => {
  it("ดึงงานค้าง + เสร็จใน 7 วัน · แยกกลุ่มเกิน/รอ/ค้าง/เสร็จ · ตัวเลขสรุปถูก", async () => {
    const built = await teamPlanWeekly(admin, {}, normalizeReportOptions("team_plan_weekly", {}));
    expect(orArg).toContain("status.in.(open,in_progress)");
    expect(orArg).toContain("resolved_at.gte.2026-10-30T10:00:00.000Z");
    expect(built.sections.map((s) => [s.key, s.rows.map((r) => r.id)])).toEqual([
      ["overdue", ["a"]], ["waiting", ["b"]], ["open", ["c"]], ["done", ["d"]],
    ]);
    expect(built.stats.map((s) => [s.label, s.value])).toEqual([["เสร็จใน 7 วัน", 1], ["ค้างทั้งหมด", 3], ["เกินกำหนด", 1], ["รอคนอื่น", 1]]);
    expect(built.breakdown).toEqual([{ label: "Mint ค้าง", color: "#7c3aed", count: 2 }, { label: "Toey ค้าง", color: "#7c3aed", count: 1 }]);
    expect(built.total).toBe(4);
    expect(built.overdue).toBe(1);
    expect(built.sections[1].rows[0].flag).toEqual({ text: "รอ 3 วัน", tone: "warn" });
    expect(built.sections[3].rows[0].flag?.tone).toBe("good");
  });

  it("จัดกลุ่มตามคน · ส่งเฉพาะงานมีป้าย", async () => {
    const built = await teamPlanWeekly(admin, {}, normalizeReportOptions("team_plan_weekly", { group_by: "person", only_flagged: true }));
    expect(built.sections.map((s) => s.label)).toEqual(["Mint", "Toey", "เสร็จใน 7 วันที่ผ่านมา"]);
  });

  it("ประกอบเป็นอีเมลได้ (หัวเรื่อง + ลิงก์เปิดงาน)", async () => {
    const built = await teamPlanWeekly(admin, {}, normalizeReportOptions("team_plan_weekly", {}));
    const mail = renderReportEmail(built, { reportName: "สรุปแผนงานทีม", scheduleLabel: "ศ · 17:00 น.", manageUrl: null, now: NOW });
    expect(mail.subject).toContain("เสร็จ 1 · ค้าง 3 · เกินกำหนด 1");
    expect(mail.html).toContain("/tasks/plan?item=a");
    expect(mail.text).toContain("ส่งแบบ CPN");
  });
});

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key-for-hmac"; });

const ITEM = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

describe("แผนงานทีม — ปุ่มบนแจ้งเตือนมือถือ", () => {
  it("รหัสลับ: ถอดได้ตรงงาน+คน · แก้แม้ตัวเดียว = ใช้ไม่ได้ · หมดอายุ 7 วัน", async () => {
    const { signPlanAction, verifyPlanAction } = await import("@/lib/team-plan-server");
    const now = 1_800_000_000;
    const t = signPlanAction(ITEM, USER, now);
    expect(verifyPlanAction(t, now + 60)).toEqual({ itemId: ITEM, userId: USER });
    expect(verifyPlanAction(`${t.slice(0, -2)}xx`, now)).toBeNull();
    expect(verifyPlanAction(t, now + 8 * 86400)).toBeNull();
    expect(verifyPlanAction("nope", now)).toBeNull();
  });

  it("ข้อความ push: งานในแผนงานมีปุ่ม 3 ปุ่ม · สรุปเช้า/เรื่องอื่นไม่มี", async () => {
    const { buildPayloads, PLAN_PUSH_ACTIONS } = await import("@/lib/push-server");
    const row = (event_type: string, extra: Record<string, unknown> = {}) => ({
      id: "00000000-0000-0000-0000-000000000001", user_id: USER, event_type, title: "ใกล้ถึงกำหนด: สั่งผ้า", body: "กำหนด วันนี้ 14:00",
      link_url: "/tasks/plan?item=x", priority: "normal", created_at: "2026-11-04T03:00:00Z", entity_type: "team_plan", entity_id: ITEM, ...extra,
    });
    const token = (n: { event_type: string; entity_id?: string | null }) => (n.event_type.startsWith("team_plan.") && n.event_type !== "team_plan.summary" && n.entity_id ? "tok" : null);
    const [a, b, c] = buildPayloads([row("team_plan.remind"), row("team_plan.summary", { entity_id: null }), row("task_assigned")], 3, token);
    expect(a.actions).toEqual(PLAN_PUSH_ACTIONS);
    expect(a.act).toBe("tok");
    expect(b.actions).toBeUndefined();
    expect(c.actions).toBeUndefined();
  });

  it("ประเภทแจ้งเตือนมือถือ: team_plan.* = แผนงานทีม", async () => {
    const { pushCategoryOf } = await import("@/lib/push-categories");
    expect(pushCategoryOf("team_plan.overdue")).toBe("team_plan");
    expect(pushCategoryOf("team_plan.summary")).toBe("team_plan");
    expect(pushCategoryOf("task_assigned")).toBe("tasks");
  });
});

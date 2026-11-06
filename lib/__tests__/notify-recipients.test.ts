import { describe, expect, it } from "vitest";
import { splitRuleRecipients } from "@/lib/notify-recipients";
import { NOTIFY_TOPICS } from "@/lib/flow-map-notify";

describe("notify-recipients — คนรับกระดิ่งตามกฎ (เรื่องที่โค้ดสร้างข้อความเอง)", () => {
  it("รวม role + user จากกฎที่เปิดอยู่ · ไม่ซ้ำ · ข้ามแบบที่ใช้กับเอกสาร", () => {
    const r = splitRuleRecipients([
      { active: true, recipients: [{ type: "role", value: "admin" }, { type: "user", value: "u1" }, { type: "requester" }] },
      { active: true, recipients: [{ type: "role", value: "admin" }, { type: "role", value: "accounting" }] },
      { active: false, recipients: [{ type: "role", value: "staff" }] },
    ]);
    expect(r.roles.sort()).toEqual(["accounting", "admin"]);
    expect(r.users).toEqual(["u1"]);
    expect(r.anyActive).toBe(true);
  });
  it("ปิดทุกกฎ = anyActive false (ไม่ส่ง) · recipients ไม่ใช่ array ไม่พัง", () => {
    expect(splitRuleRecipients([{ active: false, recipients: [{ type: "role", value: "admin" }] }]).anyActive).toBe(false);
    expect(splitRuleRecipients([{ active: true, recipients: null }])).toEqual({ roles: [], users: [], anyActive: true });
  });
  it("2 เรื่องที่ย้ายมาใช้กฎ ผูก event_type ตรงกับที่โค้ดส่ง", () => {
    const rule = (id: string) => NOTIFY_TOPICS.find((t) => t.id === id)?.send.find((s) => s.kind === "bell");
    expect(rule("cashflow_low_cash")).toMatchObject({ kind: "bell", rule: "cashflow.low_cash" });
    expect(rule("subscription_renewal")).toMatchObject({ kind: "bell", rule: "subscription.renewal_soon" });
  });
});

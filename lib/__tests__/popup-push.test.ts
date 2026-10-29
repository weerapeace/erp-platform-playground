import { describe, expect, it } from "vitest";
import { popupPushText } from "@/lib/email-report/popup-push";
import { subscriptionAccepts } from "@/lib/push-server";

const mine = (n: number) => Array.from({ length: n }, (_, i) => ({ tasks: [{ id: `t${i}` }] })) as never;

describe("popupPushText", () => {
  it("ป๊อปทั้งทีม: ค้าง · เกิน · ของรอ · ของคุณ (ข้ามช่องที่เป็น 0)", () => {
    expect(popupPushText({ audience: "all", heading: "งานออกแบบที่ค้างอยู่", stats: { total: 13, overdue: 0, due_soon: 0, waiting: 5 }, mine: mine(2) }))
      .toEqual({ title: "🔔 งานออกแบบที่ค้างอยู่", body: "ค้าง 13 · มีของรอ 5 ใบ · ของคุณ 2 ข้อ" });
    expect(popupPushText({ audience: "all", heading: "X", stats: { total: 4, overdue: 1, due_soon: 0, waiting: 0 }, mine: [] }).body).toBe("ค้าง 4 · เกินกำหนด 1");
  });
  it("ป๊อปเฉพาะงานของตัวเอง", () => {
    expect(popupPushText({ audience: "mine", heading: "X", stats: { total: 0, overdue: 0, due_soon: 0, waiting: 0 }, mine: mine(3) }))
      .toEqual({ title: "🔔 งานที่รอคุณอยู่", body: "ของคุณ 3 ข้อ · กดเพื่อดู" });
  });
});

describe("subscriptionAccepts (เครื่องเลือกรับเฉพาะเรื่อง)", () => {
  it("null = ทุกเรื่อง · เด้งที่เบราว์เซอร์ = ป๊อปอย่างเดียว · ทดสอบผ่านเสมอ", () => {
    expect(subscriptionAccepts(null, "task_assigned")).toBe(true);
    expect(subscriptionAccepts(["report.popup"], "report.popup")).toBe(true);
    expect(subscriptionAccepts(["report.popup"], "task_assigned")).toBe(false);
    expect(subscriptionAccepts(["report.popup"], "report.popup_later")).toBe(false);
    expect(subscriptionAccepts(["report.popup"], "push.test")).toBe(true);
  });
});

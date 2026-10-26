import { describe, expect, it } from "vitest";
import { buildPayloads } from "@/lib/push-server";

const row = (i: number, extra: Partial<{ priority: string; body: string | null; link_url: string | null }> = {}) => ({
  id: `00000000-0000-0000-0000-00000000000${i}`, user_id: "u", event_type: "task_assigned",
  title: `งานที่ ${i}`, body: "รายละเอียด", link_url: `/tasks?task=${i}`, priority: "normal",
  created_at: `2026-10-26T0${i}:00:00Z`, ...extra,
});

describe("buildPayloads", () => {
  it("ไม่เกิน 3 เรื่อง = ส่งแยกทีละเรื่อง พร้อมลิงก์และตัวเลขยังไม่อ่าน", () => {
    const out = buildPayloads([row(1), row(2)], 7);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: row(1).id, title: "งานที่ 1", body: "รายละเอียด", url: "/tasks?task=1", priority: "normal", unread: 7 });
  });
  it("เกิน 3 เรื่องพร้อมกัน = สรุปเป็นข้อความเดียว (กันมือถือสั่นรัว)", () => {
    const out = buildPayloads([row(1), row(2), row(3), row(4, { priority: "high" }), row(5)], 12);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBeNull();
    expect(out[0].url).toBeNull();
    expect(out[0].title).toBe("มีแจ้งเตือนใหม่ 5 เรื่อง");
    expect(out[0].body).toBe("• งานที่ 1\n• งานที่ 2\n• งานที่ 3\nและอีก 2 เรื่อง");
    expect(out[0].priority).toBe("high");
  });
  it("ตัดข้อความยาว + หัวเรื่องว่างใช้คำกลาง", () => {
    const out = buildPayloads([{ ...row(1), title: "", body: "ก".repeat(500) }], null);
    expect(out[0].title).toBe("แจ้งเตือนใหม่");
    expect(out[0].body.length).toBe(300);
    expect(out[0].body.endsWith("…")).toBe(true);
  });
});

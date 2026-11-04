import { describe, expect, it } from "vitest";
import { emailContactLabel, normalizeEmailContacts, removeEmailContact, upsertEmailContact, EMAIL_CONTACTS_MAX } from "@/lib/email-contacts";
import { normalizeReportInput } from "@/lib/email-report/shared";

// 📇 สมุดอีเมลที่บันทึกไว้ (ของกลาง) — กรอง/เพิ่ม/แก้ชื่อ/ลบ
describe("email contacts", () => {
  const now = new Date("2026-11-04T13:00:00Z");

  it("กรองอีเมลผิด · ตัวเล็ก · ไม่ซ้ำ · เรียงตามชื่อ", () => {
    const list = normalizeEmailContacts([
      { email: "B@Gmail.com", name: "ฝ่ายบัญชี" }, { email: "bad-email" }, { email: "b@gmail.com", name: "ซ้ำ" }, { email: "a@x.co", name: "" }, null,
    ]);
    expect(list).toHaveLength(2);
    expect(list.map((c) => [c.email, c.name])).toEqual(expect.arrayContaining([["a@x.co", null], ["b@gmail.com", "ฝ่ายบัญชี"]]));
  });

  it("เพิ่มใหม่ / อีเมลเดิม = แก้ชื่อ / อีเมลผิด = error", () => {
    const a = upsertEmailContact([], { email: " Owner@Gmail.com ", name: "เจ้าของ" }, "Gogo", now);
    expect(a).toMatchObject({ added: true, error: null });
    expect(a.list[0]).toMatchObject({ email: "owner@gmail.com", name: "เจ้าของ", added_by: "Gogo", added_at: now.toISOString() });
    const b = upsertEmailContact(a.list, { email: "owner@gmail.com", name: "เจ้าของร้าน" }, "Gogo", now);
    expect(b).toMatchObject({ added: false, error: null });
    expect(b.list).toHaveLength(1);
    expect(b.list[0].name).toBe("เจ้าของร้าน");
    const c = upsertEmailContact(b.list, { email: "owner@gmail.com" }, "Gogo", now);
    expect(c.list[0].name).toBe("เจ้าของร้าน");   // ไม่ใส่ชื่อ = คงชื่อเดิม
    expect(upsertEmailContact(c.list, { email: "nope" }, null).error).toContain("อีเมลไม่ถูกต้อง");
  });

  it("ไม่เกินจำนวนสูงสุด · ลบได้ · ป้ายโชว์", () => {
    const full = normalizeEmailContacts(Array.from({ length: EMAIL_CONTACTS_MAX }, (_, i) => ({ email: `u${i}@x.co` })));
    expect(upsertEmailContact(full, { email: "new@x.co" }, null).error).toContain("ไม่เกิน");
    expect(removeEmailContact(full, "U0@X.CO")).toHaveLength(EMAIL_CONTACTS_MAX - 1);
    expect(emailContactLabel({ email: "a@x.co", name: "บัญชี" })).toBe("บัญชี (a@x.co)");
    expect(emailContactLabel({ email: "a@x.co" })).toBe("a@x.co");
  });

  it("ผู้รับรายงาน: อีเมลนอกระบบเก็บชื่อเรียกได้ (ตัดอักขระควบคุม)", () => {
    const r = normalizeReportInput({
      name: "ยอดขาย", source_key: "platform_sales_daily", days: [1], send_time: "09:00", email_enabled: true,
      recipients: [{ type: "email", email: "A@x.co", name: "  บัญชี\n " }, { type: "email", email: "b@x.co" }],
    });
    expect("value" in r && r.value.recipients).toEqual([{ type: "email", email: "a@x.co", name: "บัญชี" }, { type: "email", email: "b@x.co" }]);
  });
});

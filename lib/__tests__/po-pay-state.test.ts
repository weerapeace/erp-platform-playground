import { describe, it, expect } from "vitest";
import { poPayState, hasCredit } from "@/lib/po-pay-state";

const T = "2026-11-04";

describe("สถานะจ่ายเงินใบสั่งซื้อ (สีป้าย)", () => {
  it("ร้านไม่มีเครดิต ยังไม่จ่าย = แดง", () => {
    expect(poPayState({ payment_status: "unpaid", order_date: "2026-11-01" }, T)).toMatchObject({ state: "unpaid", label: "ยังไม่จ่ายเงิน" });
  });
  it("ร้านตั้ง 'จ่ายทันที' = ไม่มีเครดิต", () => {
    expect(hasCredit("immediate")).toBe(false);
    expect(poPayState({ credit_term: "immediate", order_date: "2026-11-01" }, T).state).toBe("unpaid");
  });
  it("จ่ายแล้ว = เขียว (ทั้งร้านเครดิตและไม่มีเครดิต)", () => {
    expect(poPayState({ payment_status: "paid", paid_date: "2026-11-03" }, T).state).toBe("paid");
    expect(poPayState({ payment_status: "paid", credit_term: "days:30" }, T).state).toBe("paid");
  });
  it("ร้านเครดิต 30 วัน ยังไม่ถึงกำหนด = ส้ม พร้อมวันครบ", () => {
    const s = poPayState({ credit_term: "days:30", order_date: "2026-11-01" }, T);
    expect(s).toMatchObject({ state: "credit_due", due: "2026-12-01" });
    expect(s.label).toContain("ค้างจ่าย");
  });
  it("ร้านเครดิต เลยกำหนด = แดงเข้ม บอกจำนวนวัน", () => {
    expect(poPayState({ credit_term: "days:30", order_date: "2026-09-25" }, T)).toMatchObject({ state: "overdue", overdue_days: 10 });
  });
  it("ใบตั้งวันครบกำหนดเอง ชนะเครดิตร้าน", () => {
    expect(poPayState({ credit_term: "days:30", order_date: "2026-11-01", payment_due_date: "2026-11-10" }, T).due).toBe("2026-11-10");
  });
  it("ผูกบิลแอปโอนเงินจีนแล้ว ยังไม่จ่าย = ลงบิลแล้ว รอโอน (เหลือง)", () => {
    expect(poPayState({ china_bill_id: "b1", order_date: "2026-11-01" }, T).state).toBe("billed");
  });
  it("ร้านส่งก่อนจ่าย ไม่ได้ตั้งเครดิต = ค้างจ่าย (ส้ม)", () => {
    expect(poPayState({ ship_before_pay: true, order_date: "2026-11-01" }, T)).toMatchObject({ state: "credit_due", label: "ส่งก่อนจ่าย (ค้างจ่าย)" });
  });
});

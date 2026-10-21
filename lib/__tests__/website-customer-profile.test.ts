import { describe, it, expect } from "vitest";
import { phoneVariants, samePhone, summarizeCustomer, type ProfileOrderRow } from "../website-customer-profile";

/** 👤 ประวัติลูกค้าหน้าเดียว (ชุด 8b · 2026-10-22) */
describe("📞 จับคู่เบอร์", () => {
  it("เบอร์หลายรูปแบบ → ทุกแบบที่อาจเก็บไว้ · สั้นเกิน = ไม่ค้น", () => {
    expect(phoneVariants("081-234-5678")).toEqual(["0812345678", "66812345678", "+66812345678"]);
    expect(phoneVariants("+66 81 234 5678")).toEqual(["66812345678", "0812345678", "+66812345678"]);
    expect(phoneVariants("1234")).toEqual([]);
    expect(phoneVariants(null)).toEqual([]);
  });
  it("เทียบ 9 หลักท้าย", () => {
    expect(samePhone("0812345678", "+66812345678")).toBe(true);
    expect(samePhone("0812345678", "0812345679")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });
});

describe("📊 สรุปลูกค้า", () => {
  const o = (id: string, at: string, total: number, extra: Partial<ProfileOrderRow> = {}): ProfileOrderRow => ({
    id,
    order_no: `LM-${id}`,
    status: "completed",
    payment_status: "paid",
    grand_total: total,
    created_at: at,
    source: null,
    customer_name: "Anna",
    ship_address_line: "99/9 สุขุมวิท",
    ship_subdistrict: null,
    ship_district: "วัฒนา",
    ship_province: "กรุงเทพฯ",
    ship_postal: "10110",
    ...extra,
  });
  it("ยอด/เฉลี่ย ไม่นับยกเลิก · ของที่ซื้อบ่อย · ที่อยู่รวมซ้ำ · แหล่งของออเดอร์แรก · ชื่อที่เคยใช้", () => {
    const orders = [
      o("1", "2026-09-01T03:00:00Z", 1000, { source: "google" }),
      o("2", "2026-10-01T03:00:00Z", 500.5, { source: "facebook", customer_name: "Anna K." }),
      o("3", "2026-10-10T03:00:00Z", 9999, { status: "cancelled" }),
      o("4", "2026-10-20T03:00:00Z", 300, { ship_address_line: "1 สีลม", ship_district: "บางรัก", ship_postal: "10500" }),
    ];
    const items = [
      { order_id: "1", parent_code: "roar01", name: "ROAR", qty: 1 },
      { order_id: "2", parent_code: "ROAR01", name: "ROAR", qty: 2 },
      { order_id: "3", parent_code: "BIG99", name: "ยกเลิกแล้ว", qty: 50 },
      { order_id: "4", parent_code: "TTM127", name: "กระเป๋าสตางค์", qty: 1 },
    ];
    const s = summarizeCustomer(orders, items);
    expect(s).toMatchObject({ orders: 3, cancelled: 1, spent: 1800.5, avg: 600.17, firstAt: "2026-09-01T03:00:00Z", lastAt: "2026-10-20T03:00:00Z", firstSource: "google" });
    expect(s.topItems).toEqual([{ code: "ROAR01", name: "ROAR", qty: 3 }, { code: "TTM127", name: "กระเป๋าสตางค์", qty: 1 }]);
    expect(s.addresses).toEqual([
      { text: "1 สีลม บางรัก กรุงเทพฯ 10500", count: 1, lastAt: "2026-10-20T03:00:00Z" },
      { text: "99/9 สุขุมวิท วัฒนา กรุงเทพฯ 10110", count: 3, lastAt: "2026-10-10T03:00:00Z" },
    ]);
    expect(s.names).toEqual(["Anna", "Anna K."]);
  });
  it("ไม่มีออเดอร์ = ศูนย์ทั้งหมด", () => {
    expect(summarizeCustomer([], [])).toMatchObject({ orders: 0, spent: 0, avg: 0, firstAt: null, lastAt: null, firstSource: null, topItems: [], addresses: [] });
  });
});

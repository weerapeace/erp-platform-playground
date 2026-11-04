import { describe, it, expect } from "vitest";
import { canConfirm, nextSteps, voucherChecklist, type ChecklistInput } from "@/lib/purchase-voucher-checklist";

const base: ChecklistInput = {
  line_count: 1, foreign: false, currency_label: "฿", fx_rate: 0, missing_price_count: 0,
  any_ship: false, ship_total_thb: 0, missing_basis_count: 0, missing_rate_count: 0, dirty: false,
};

describe("purchase-voucher-checklist", () => {
  it("ใบบาทราคาครบ ไม่คิดค่าส่ง = ยืนยันได้", () => {
    const c = voucherChecklist(base);
    expect(canConfirm(c)).toBe(true);
    expect(c.find((x) => x.key === "ship")?.level).toBe("info");
  });
  it("ไม่มีราคา / ไม่มีรายการ / ใบหยวนไม่มีเรท = ยืนยันไม่ได้ (ตรงกับ API)", () => {
    expect(canConfirm(voucherChecklist({ ...base, missing_price_count: 2 }))).toBe(false);
    expect(canConfirm(voucherChecklist({ ...base, line_count: 0 }))).toBe(false);
    expect(canConfirm(voucherChecklist({ ...base, foreign: true, currency_label: "¥", fx_rate: 0 }))).toBe(false);
    expect(canConfirm(voucherChecklist({ ...base, foreign: true, currency_label: "¥", fx_rate: 5.2 }))).toBe(true);
  });
  it("ค่าส่งขาดคิว/กก. = เตือน แต่ยืนยันได้", () => {
    const c = voucherChecklist({ ...base, any_ship: true, ship_total_thb: 0, missing_basis_count: 1 });
    expect(c.find((x) => x.key === "ship")?.level).toBe("warn");
    expect(canConfirm(c)).toBe(true);
  });
  it("งานถัดไป: จ่ายครบ / ลงบิลจีนรอโอน / ยังไม่จ่าย / ไม่มีค่าส่ง", () => {
    expect(nextSteps([{ po_no: "A", payment_status: "paid" }], 0, false)).toEqual({ goods: "done", shipping: "none" });
    expect(nextSteps([{ po_no: "A", payment_status: "unpaid", china_bill_id: "b" }], 100, false)).toEqual({ goods: "billed", shipping: "todo" });
    expect(nextSteps([{ po_no: "A", payment_status: "unpaid" }, { po_no: "B", payment_status: "paid" }], 100, true)).toEqual({ goods: "todo", shipping: "done" });
    expect(nextSteps([], 0, false).goods).toBe("none");
  });
});

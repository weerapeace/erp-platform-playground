import { describe, it, expect } from "vitest";
import { canConfirm, fxAbnormal, fxDeviationPct, nextSteps, voucherChecklist, type ChecklistInput } from "@/lib/purchase-voucher-checklist";

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
  it("เรทต่างจากเรทวันที่ใบเกิน 10% = เตือน (ยืนยันได้) · ไม่เกิน / ไม่มีเรทอ้างอิง = ผ่าน", () => {
    const cny = { ...base, foreign: true, currency_label: "¥" };
    const hi = voucherChecklist({ ...cny, fx_rate: 8.333333, ref_fx_rate: 5.21 }).find((x) => x.key === "fx");
    expect(hi?.level).toBe("warn");
    expect(hi?.label).toContain("สูงกว่าเรทวันที่ใบ (5.21) 60%");
    expect(canConfirm(voucherChecklist({ ...cny, fx_rate: 8.333333, ref_fx_rate: 5.21 }))).toBe(true);
    expect(voucherChecklist({ ...cny, fx_rate: 4.5, ref_fx_rate: 5.21 }).find((x) => x.key === "fx")?.label).toContain("ต่ำกว่า");
    expect(voucherChecklist({ ...cny, fx_rate: 5.6, ref_fx_rate: 5.21 }).find((x) => x.key === "fx")?.level).toBe("ok");   // 7.5%
    expect(voucherChecklist({ ...cny, fx_rate: 8.3, ref_fx_rate: null }).find((x) => x.key === "fx")?.level).toBe("ok");
  });
  it("fxDeviationPct / fxAbnormal", () => {
    expect(Math.round(fxDeviationPct(5.731, 5.21) ?? 0)).toBe(10);
    expect(fxAbnormal(fxDeviationPct(5.73, 5.21))).toBe(false);   // 9.98%
    expect(fxAbnormal(fxDeviationPct(5.74, 5.21))).toBe(true);
    expect(fxDeviationPct(0, 5.21)).toBeNull();
    expect(fxAbnormal(null)).toBe(false);
  });
  it("งานถัดไป: จ่ายครบ / ลงบิลจีนรอโอน / ยังไม่จ่าย / ไม่มีค่าส่ง", () => {
    expect(nextSteps([{ po_no: "A", payment_status: "paid" }], 0, false)).toEqual({ goods: "done", shipping: "none" });
    expect(nextSteps([{ po_no: "A", payment_status: "unpaid", china_bill_id: "b" }], 100, false)).toEqual({ goods: "billed", shipping: "todo" });
    expect(nextSteps([{ po_no: "A", payment_status: "unpaid" }, { po_no: "B", payment_status: "paid" }], 100, true)).toEqual({ goods: "todo", shipping: "done" });
    expect(nextSteps([], 0, false).goods).toBe("none");
  });
});

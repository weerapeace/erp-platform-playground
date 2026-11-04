import { describe, it, expect } from "vitest";
import { checkLink, defaultAmount, isRmbCurrency, poBlockReason, validateBillLinks, type BillPoCandidate } from "@/lib/china-bill-po";

const po = (o: Partial<BillPoCandidate> = {}): BillPoCandidate => ({
  po_id: "p1", po_no: "PO-2026-00273", order_date: "2026-11-03", currency: "YUAN", is_rmb: true, grand_total: 135,
  partner_id: "s1", partner_name: "ร้านซิป ISG", status: "draft", payment_status: "unpaid", paid_via: null,
  line_count: 1, items: "ซิป", linked_other_rmb: 0, settled_by_other: false, remaining_rmb: 135,
  this_amount_rmb: null, this_settles: null, this_currency_confirmed: null, ...o,
});

describe("china-bill-po", () => {
  it("รู้จักสกุลหยวนทั้ง RMB / YUAN / CNY (ข้อมูลจริงใช้ 2 แบบ)", () => {
    expect(isRmbCurrency("RMB")).toBe(true);
    expect(isRmbCurrency("yuan")).toBe(true);
    expect(isRmbCurrency("THB")).toBe(false);
    expect(isRmbCurrency(null)).toBe(false);
  });

  it("ใบหยวน: ยอดตั้งต้น = ที่เหลือ · ใส่ครบ = ครบใบ · ใส่น้อย = บางส่วน · ใส่เกิน = เกิน", () => {
    const c = po({ remaining_rmb: 100, linked_other_rmb: 35 });
    expect(defaultAmount(c)).toBe(100);
    expect(checkLink(c, { amount_rmb: 100 }).kind).toBe("ok");
    expect(checkLink(c, { amount_rmb: 100 }).settles).toBe(true);
    const part = checkLink(c, { amount_rmb: "40" });
    expect(part.kind).toBe("partial");
    expect(part.left_rmb).toBe(60);
    expect(part.settles).toBe(false);
    expect(checkLink(c, { amount_rmb: 100.5 }).kind).toBe("over");
  });

  it("ใบหยวนไม่มีราคา (¥0): ไม่มียอดตั้งต้น · ใส่ยอดเองแล้วเลือกปิดยอดได้", () => {
    const c = po({ grand_total: 0, remaining_rmb: null });
    expect(defaultAmount(c)).toBeNull();
    expect(checkLink(c, { amount_rmb: "" }).kind).toBe("need_amount");
    expect(checkLink(c, { amount_rmb: 50 }).settles).toBe(true);
    expect(checkLink(c, { amount_rmb: 50, settles_po: false }).settles).toBe(false);
  });

  it("ใบสกุลบาท: ไม่รวมยอดอัตโนมัติ ต้องติ๊กยืนยันก่อน", () => {
    const c = po({ currency: "THB", is_rmb: false, remaining_rmb: null });
    expect(defaultAmount(c)).toBeNull();
    expect(checkLink(c, { amount_rmb: 135 }).kind).toBe("need_confirm");
    expect(checkLink(c, { amount_rmb: 135, currency_confirmed: true }).kind).toBe("no_price");
  });

  it("ใบที่จ่ายแล้ว/บิลอื่นปิดยอด ผูกไม่ได้ — แต่ใบที่อยู่ในบิลนี้อยู่แล้วแก้ได้", () => {
    expect(poBlockReason(po({ payment_status: "paid" }))).toBe("ใบนี้กดจ่ายแล้ว");
    expect(poBlockReason(po({ settled_by_other: true }))).toBe("จ่ายครบแล้วด้วยบิลอื่น");
    expect(poBlockReason(po({ remaining_rmb: 0, linked_other_rmb: 135 }))).toBe("ผูกบิลอื่นครบยอดแล้ว");
    expect(poBlockReason(po({ payment_status: "paid", paid_via: "china_bill", this_amount_rmb: 135 }))).toBeNull();
  });

  it("ทั้งชุด: ยอดรวมเกินยอดบิล = ไม่ผ่าน · บิลบาทผูกไม่ได้ · เลือกซ้ำไม่ได้", () => {
    const a = po({ po_id: "a", po_no: "PO-A" }), b = po({ po_id: "b", po_no: "PO-B", remaining_rmb: 220, grand_total: 220 });
    const map = new Map([[a.po_id, a], [b.po_id, b]]);
    const ok = validateBillLinks(400, [{ po_id: "a", amount_rmb: 135 }, { po_id: "b", amount_rmb: 220 }], map);
    expect(ok.ok).toBe(true);
    expect(ok.sum_rmb).toBe(355);
    expect(ok.links.every((l) => l.settles_po)).toBe(true);
    expect(validateBillLinks(300, [{ po_id: "a", amount_rmb: 135 }, { po_id: "b", amount_rmb: 220 }], map).ok).toBe(false);
    expect(validateBillLinks(null, [{ po_id: "a", amount_rmb: 135 }], map).errors[0]).toContain("ค่าส่ง/VAT");
    expect(validateBillLinks(400, [{ po_id: "a", amount_rmb: 10 }, { po_id: "a", amount_rmb: 10 }], map).ok).toBe(false);
    expect(validateBillLinks(400, [], map).ok).toBe(true);
  });
});

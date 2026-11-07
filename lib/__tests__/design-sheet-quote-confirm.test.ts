import { describe, expect, it } from "vitest";
import { quoteChosenReason, quoteConfirmPlan, quoteConfirmSteps, quoteOrderPayload, type SheetQuotation } from "@/lib/design-sheet-quotations";

const Q = (id: string, status: string, x: Partial<SheetQuotation> = {}): SheetQuotation => ({
  quotation_id: id, quote_number: `QT-${id}`, status, customer_id: "c1", customer_name: "ลูกค้า", customer_code: null,
  grand_total: 100, quote_date: "2026-11-01", valid_until: null, reject_reason: null, created_at: null,
  replaces_quotation_id: null, replaces_quote_number: null, replaced_by_quote_number: null,
  source: "send", linked_at: "2026-11-01", linked_by_name: null, other_sheets: [], ...x,
});

describe("quoteConfirmSteps", () => {
  it("ร่าง = ส่ง + ตอบรับ · ส่งแล้ว = ตอบรับ · ตอบรับ/แปลงแล้ว = ไม่ต้องกด · ปิดไปแล้ว = ไม่ได้", () => {
    expect(quoteConfirmSteps("draft")).toEqual(["send", "accept"]);
    expect(quoteConfirmSteps("sent")).toEqual(["accept"]);
    expect(quoteConfirmSteps("accepted")).toEqual([]);
    expect(quoteConfirmSteps("converted")).toEqual([]);
    expect(quoteConfirmSteps("rejected")).toBeNull();
    expect(quoteConfirmSteps("cancelled")).toBeNull();
  });
});

describe("quoteConfirmPlan", () => {
  it("ใบอื่นที่ยังเปิด: ร่าง = ยกเลิก · ส่งแล้ว = ปฏิเสธ · ใบที่มีงานอื่นร่วม = ไม่ติ๊กให้ · ใบที่ปิดแล้วไม่โชว์", () => {
    const list = [
      Q("a", "draft"), Q("b", "sent"), Q("c", "draft", { other_sheets: [{ id: "s2", code: "DS-2026-0079", name: null }] }), Q("d", "cancelled"),
    ];
    const p = quoteConfirmPlan(list, "a")!;
    expect(p.steps).toEqual(["send", "accept"]);
    expect(p.existingOrder).toBeNull();
    expect(p.close).toEqual([
      { quotation_id: "b", quote_number: "QT-b", status: "sent", action: "reject", shared: [], defaultOn: true },
      { quotation_id: "c", quote_number: "QT-c", status: "draft", action: "cancel", shared: ["DS-2026-0079"], defaultOn: false },
    ]);
  });
  it("งานนี้มีใบสั่งขายแล้ว (จากใบไหนก็ได้) = ไม่เปิดใหม่ · ใบที่ปิดแล้ว = ยืนยันไม่ได้", () => {
    const list = [Q("a", "sent"), Q("b", "converted", { order_id: "o1", order_no: "SO-0098" })];
    expect(quoteConfirmPlan(list, "a")!.existingOrder).toEqual({ id: "o1", no: "SO-0098", fromQuote: "QT-b" });
    expect(quoteConfirmPlan([Q("x", "rejected")], "x")).toBeNull();
    expect(quoteConfirmPlan(list, "zzz")).toBeNull();
  });
});

describe("quoteOrderPayload", () => {
  it("ลูกค้า/ส่วนลด/ภาษีตามใบ · ทุกบรรทัดอ้างใบเสนอราคา · บรรทัดว่างตัดทิ้ง", () => {
    const p = quoteOrderPayload({
      id: "q1", quote_number: "QT-202609-0001", customer_id: "c1", customer_name: "เซ็นทรัลทำ", customer_code: "C01", sale_person_name: "Patty",
      currency: "THB", header_discount_type: "percent", header_discount_value: 5, shipping_fee: 0, vat_rate: 7, vat_included: false, wht_rate: 0,
      lines: [
        { sku: "CTL115-01", product_name: "Tote แดง", qty: 1000, unit: "ใบ", unit_price: 119, discount_type: "amount", discount_value: 0 },
        { sku: null, product_name: "  ", qty: 0, unit_price: 0 },
      ],
    }, "2026-11-07");
    expect(p.header).toMatchObject({ customer_id: "c1", order_date: "2026-11-07", header_discount_type: "percent", header_discount_value: 5, vat_rate: 7, note: "จากใบเสนอราคา QT-202609-0001" });
    expect(p.lines).toEqual([{ sku: "CTL115-01", product_name: "Tote แดง", qty: 1000, unit: "ใบ", unit_price: 119, discount_type: "amount", discount_value: 0, note: null, source: "quote", quote_id: "q1", quote_no: "QT-202609-0001" }]);
    expect(quoteChosenReason("QT-1")).toBe("ลูกค้าเลือก QT-1");
  });
});

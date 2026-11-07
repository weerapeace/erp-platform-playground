import { describe, it, expect } from "vitest";
import { quoteFailAction, isQuoteOpen, latestOpenDraft, duplicateQuoteWarning, sortSheetQuotations, type SheetQuotation } from "@/lib/design-sheet-quotations";
import { quoteCopyPayload } from "@/lib/quote-copy";
import type { QuoteDetail } from "@/app/api/quotations/route";

const q = (id: string, status: string, created_at: string, no = id): SheetQuotation => ({
  quotation_id: id, quote_number: no, status, customer_id: null, customer_name: null, customer_code: null,
  grand_total: 0, quote_date: created_at.slice(0, 10), valid_until: null, reject_reason: null, created_at,
  replaces_quotation_id: null, replaces_quote_number: null, replaced_by_quote_number: null,
  source: "send", linked_at: created_at, linked_by_name: null, other_sheets: [],
});

describe("ใบงานออกแบบ ↔ ใบเสนอราคา — กติกา", () => {
  it("ไม่ผ่าน: ร่าง = ยกเลิก · ส่งแล้ว/ตอบรับ = ปฏิเสธ (ต้องมีเหตุผล) · ปิดแล้ว = ทำไม่ได้ (สะกดตรงกับฐานข้อมูล)", () => {
    expect(quoteFailAction("draft")).toEqual({ action: "cancel", needReason: false, perm: "qt.cancel" });
    expect(quoteFailAction("sent")).toEqual({ action: "reject", needReason: true, perm: "qt.reject" });
    expect(quoteFailAction("accepted")?.action).toBe("reject");
    for (const s of ["converted", "cancelled", "rejected", "expired", "", null]) expect(quoteFailAction(s)).toBeNull();
  });
  it("ใบที่ยังเปิด = ร่าง/ส่งแล้ว/ตอบรับ", () => {
    expect(["draft", "sent", "accepted"].every(isQuoteOpen)).toBe(true);
    expect(["converted", "cancelled", "rejected", "expired"].some(isQuoteOpen)).toBe(false);
  });
  it("เลือกใบร่างล่าสุดของงาน + เรียงใบเปิดก่อน", () => {
    const list = [q("a", "cancelled", "2026-11-06T00:00:00Z"), q("b", "draft", "2026-10-01T00:00:00Z"), q("c", "draft", "2026-11-01T00:00:00Z"), q("d", "sent", "2026-09-01T00:00:00Z")];
    expect(latestOpenDraft(list)?.quotation_id).toBe("c");
    expect(sortSheetQuotations(list).map((x) => x.quotation_id)).toEqual(["c", "b", "d", "a"]);
    expect(latestOpenDraft([q("x", "sent", "2026-11-01T00:00:00Z")])).toBeNull();
  });
  it("เตือนเปิดซ้ำเฉพาะเมื่อมีใบที่ยังเปิด", () => {
    expect(duplicateQuoteWarning([q("a", "cancelled", "2026-11-06T00:00:00Z")])).toBeNull();
    expect(duplicateQuoteWarning([])).toBeNull();
    const w = duplicateQuoteWarning([q("a", "draft", "2026-11-06T00:00:00Z", "QT-1"), q("b", "sent", "2026-11-05T00:00:00Z", "QT-2")]);
    expect(w).toContain("2 ใบ");
    expect(w).toContain("QT-1 (ร่าง)");
    expect(w).toContain("QT-2 (ส่งแล้ว)");
  });
  it("คัดลอกใบ: ใบใหม่วันนี้ · ยืนราคาตามช่วงเดิม · บรรทัด/รูปติดไป · ไม่ก๊อปเลขที่/สถานะ", () => {
    const src = {
      id: "x", quote_number: "QT-9", status: "sent", customer_id: "c1", customer_name: "ลูกค้า", customer_code: "C1", sale_person_name: null,
      currency: "THB", exchange_rate: 1, header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0, vat_rate: 7, vat_included: false, wht_rate: 0,
      quote_date: "2026-10-01", valid_until: "2026-10-15", note: "n",
      lines: [{ sku: "S1", product_name: "กระเป๋า", qty: 2, unit: "ชิ้น", unit_price: 100, image_key: "k1" }],
    } as unknown as QuoteDetail;
    const { header, lines } = quoteCopyPayload(src, new Date("2026-11-07T03:00:00Z"));
    expect(header.quote_date).toBe("2026-11-07");
    expect(header.valid_until).toBe("2026-11-21");
    expect(header).not.toHaveProperty("status");
    expect(header).not.toHaveProperty("quote_number");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ sku: "S1", qty: 2, unit_price: 100, image_key: "k1", discount_type: "percent" });
  });
});

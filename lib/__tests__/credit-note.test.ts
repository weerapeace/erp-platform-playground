import { describe, it, expect } from "vitest";
import { computeCreditNote, validateBeforeIssue, type CreditNoteLine } from "@/lib/credit-note";

const line = (p: Partial<CreditNoteLine>): CreditNoteLine => ({
  sku: "SKU-1", product_name: "สินค้า", unit_price: 0, qty_original: 0, qty_correct: 0, ...p,
});

describe("ใบลดหนี้ — คิดยอด", () => {
  // ตัวเลขจากใบจริงที่เจ้าของส่งมา: 120,672.80 − 28,823.55 = 91,849.25 · VAT 7% = 2,017.65 · รวม 30,841.20
  it("ตรงกับใบจริง (ยอดทั้งหมดเป็นก่อน VAT)", () => {
    const { totals } = computeCreditNote(
      [line({ unit_price: 28823.55, qty_original: 1, qty_correct: 0 })],
      120672.80, 7,
    );
    expect(totals.original_amount).toBe(120672.80);
    expect(totals.diff_amount).toBe(28823.55);
    expect(totals.correct_amount).toBe(91849.25);
    expect(totals.vat_amount).toBe(2017.65);
    expect(totals.grand_total).toBe(30841.20);
  });

  it("ผลต่างคิดจาก (จำนวนเดิม − จำนวนที่ถูกต้อง) × ราคา ของทุกบรรทัด", () => {
    const { rows, totals } = computeCreditNote([
      line({ unit_price: 493.35, qty_original: 2, qty_correct: 0 }),   // 986.70
      line({ unit_price: 1423.50, qty_original: 2, qty_correct: 1 }),  // 1423.50
      line({ unit_price: 100, qty_original: 5, qty_correct: 5 }),      // 0 — ไม่ลด
    ], 10000, 7);
    expect(rows.map(r => r.amount_diff)).toEqual([986.70, 1423.50, 0]);
    expect(totals.diff_amount).toBe(2410.20);
    expect(totals.correct_amount).toBe(7589.80);
  });

  it("ข้ามบรรทัดว่าง (ยังไม่ได้เลือกสินค้า)", () => {
    const { rows } = computeCreditNote(
      [line({ sku: null, product_name: "", unit_price: 100, qty_original: 5, qty_correct: 0 })], 1000, 7,
    );
    expect(rows).toHaveLength(0);
  });

  it("ปัดเศษสตางค์ ไม่ทิ้งทศนิยมลอย", () => {
    const { totals } = computeCreditNote([line({ unit_price: 33.333, qty_original: 3, qty_correct: 0 })], 1000, 7);
    expect(totals.diff_amount).toBe(100);
    expect(totals.vat_amount).toBe(7);
  });
});

describe("ใบลดหนี้ — ตรวจก่อนออกเอกสาร", () => {
  const ok = { ref_invoice_no: "LM2569-08-001", reason: "ส่งของไม่ครบ", diff_amount: 100, original_amount: 1000 };

  it("ครบถ้วน = ผ่าน", () => expect(validateBeforeIssue(ok)).toBeNull());

  it("ไม่มีเลขใบกำกับเดิม = ไม่ผ่าน", () =>
    expect(validateBeforeIssue({ ...ok, ref_invoice_no: "" })).toContain("ใบกำกับภาษีเดิม"));

  // เหตุผลเป็นข้อบังคับตามกฎหมาย (ต้องพิมพ์บนใบลดหนี้)
  it("ไม่ใส่เหตุผล = ไม่ผ่าน", () =>
    expect(validateBeforeIssue({ ...ok, reason: "  " })).toContain("เหตุผล"));

  it("ยอดลดเป็น 0 = ไม่ผ่าน", () =>
    expect(validateBeforeIssue({ ...ok, diff_amount: 0 })).toContain("มากกว่า 0"));

  it("ลดเกินมูลค่าใบเดิม = ไม่ผ่าน", () =>
    expect(validateBeforeIssue({ ...ok, diff_amount: 2000 })).toContain("มากกว่ามูลค่าตามเอกสารเดิม"));
});

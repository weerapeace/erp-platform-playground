/**
 * ของกลาง — ตรรกะคำนวณ "ใบลดหนี้" (ใช้ทั้งฝั่ง API และหน้าจอ จะได้ไม่คิดเลขคนละแบบ)
 *
 * ทุกยอดเป็น "ก่อน VAT" ตามรูปแบบใบลดหนี้ของสรรพากร:
 *   บรรทัด: ผลต่าง = (จำนวนเดิม − จำนวนที่ถูกต้อง) × ราคา/หน่วย
 *   หัวใบ : มูลค่าที่ถูกต้อง = มูลค่าตามเอกสารเดิม − ผลต่างรวม
 *           VAT = ผลต่างรวม × อัตราภาษี   ·   ยอดลดหนี้รวม = ผลต่างรวม + VAT
 *
 * "มูลค่าตามเอกสารเดิม" = ยอดก่อน VAT ของใบกำกับภาษีใบเดิมทั้งใบ
 * (ดึงจากใบในระบบ หรือพิมพ์เองถ้าใบเดิมออกนอกระบบ) — จึงลงรายการเฉพาะตัวที่ลดก็ได้
 */

export type CreditNoteLine = {
  id?: string;
  product_id?: string | null;
  sku: string | null;
  product_name: string;
  /** สี/ตัวเลือก — พิมพ์ใต้ชื่อสินค้าบนเอกสาร */
  note?: string | null;
  unit?: string | null;
  unit_price: number;
  qty_original: number;
  qty_correct: number;
  qty_diff?: number;
  amount_original?: number;
  amount_correct?: number;
  amount_diff?: number;
  sort_order?: number;
};

export type CreditNoteTotals = {
  original_amount: number;
  correct_amount: number;
  diff_amount: number;
  vat_amount: number;
  grand_total: number;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** บรรทัดที่กรอกจริง (มีชื่อสินค้าหรือรหัส) เท่านั้นที่ถูกนับ */
export const isFilledLine = (l: CreditNoteLine) =>
  String(l.product_name ?? "").trim() !== "" || String(l.sku ?? "").trim() !== "";

/** บรรทัดที่คิดยอดเสร็จแล้ว — ช่องคำนวณทุกช่องมีค่าแน่นอน */
export type ComputedCreditNoteLine = CreditNoteLine & {
  qty_diff: number; amount_original: number; amount_correct: number; amount_diff: number; sort_order: number;
};

export function computeCreditNote(
  lines: CreditNoteLine[],
  originalAmount: number,
  vatRate: number,
): { rows: ComputedCreditNoteLine[]; totals: CreditNoteTotals } {
  const rows = lines.filter(isFilledLine).map((l, i) => {
    const price = num(l.unit_price);
    const qtyO = num(l.qty_original);
    const qtyC = num(l.qty_correct);
    return {
      ...l,
      sort_order: i,
      unit_price: price,
      qty_original: qtyO,
      qty_correct: qtyC,
      qty_diff: round2(qtyO - qtyC),
      amount_original: round2(qtyO * price),
      amount_correct: round2(qtyC * price),
      amount_diff: round2((qtyO - qtyC) * price),
    };
  });

  const diff = round2(rows.reduce((s, r) => s + r.amount_diff, 0));
  const original = round2(num(originalAmount));
  const vat = round2(diff * (num(vatRate) / 100));

  return {
    rows,
    totals: {
      original_amount: original,
      correct_amount: round2(original - diff),
      diff_amount: diff,
      vat_amount: vat,
      grand_total: round2(diff + vat),
    },
  };
}

/** ตรวจก่อน "ออกเอกสาร" — คืนข้อความภาษาคนถ้ายังไม่ผ่าน (null = ผ่าน) */
export function validateBeforeIssue(input: {
  ref_invoice_no?: string | null;
  reason?: string | null;
  diff_amount: number;
  original_amount: number;
}): string | null {
  if (!String(input.ref_invoice_no ?? "").trim()) return "ต้องระบุเลขที่ใบกำกับภาษีเดิมที่อ้างอิง";
  if (!String(input.reason ?? "").trim()) return "ต้องระบุเหตุผลที่ลดหนี้ (สรรพากรบังคับให้มีบนเอกสาร)";
  if (input.diff_amount <= 0) return "ยอดที่ลดต้องมากกว่า 0 — ตรวจช่อง จำนวนที่ถูกต้อง อีกครั้ง";
  if (input.original_amount > 0 && input.diff_amount > input.original_amount) {
    return "ยอดที่ลดมากกว่ามูลค่าตามเอกสารเดิม — ตรวจตัวเลขอีกครั้ง";
  }
  return null;
}

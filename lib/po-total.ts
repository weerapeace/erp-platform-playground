/**
 * ของกลาง — สูตรคิดยอดใบสั่งซื้อ (รวมภาษีมูลค่าเพิ่ม)
 *
 * ทำไมต้องมีที่เดียว: ยอดใบถูกคำนวณหลายที่ (ตอนสร้าง PO / ตอนใส่ราคาในปฏิทิน / ตอนแก้ใบ)
 * ถ้าแต่ละที่คิดเองจะเพี้ยนกันเมื่อใบมี VAT — โดยเฉพาะกรณี "ราคารวม VAT แล้ว"
 *
 * นิยาม:
 *   lineSum   = ผลรวม line_total ของทุกบรรทัด (qty × ราคาต่อหน่วย ตามที่กรอก)
 *   vatIncluded = true  → ราคาที่กรอก "รวม VAT แล้ว"  → ยอดจ่าย = lineSum (ถอด VAT ออกมาโชว์)
 *   vatIncluded = false → ราคาที่กรอก "ยังไม่รวม VAT" → ยอดจ่าย = lineSum + VAT
 *
 * grand_total ที่เก็บใน DB = "ยอดที่ต้องจ่ายจริง" (รวม VAT แล้ว)
 * เพื่อให้แดชบอร์ด/ยอดค้างจ่าย/ปฏิทินจ่ายเงิน ใช้ตัวเลขเดียวกันได้เลยโดยไม่ต้องคิดซ้ำ
 */

export type PoTotals = {
  /** ยอดก่อนภาษี */
  subtotal: number;
  /** ภาษีมูลค่าเพิ่ม */
  vat: number;
  /** ยอดที่ต้องจ่ายจริง (เก็บลง grand_total) */
  total: number;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computePoTotals(lineSum: number, vatRate: number, vatIncluded: boolean): PoTotals {
  const sum = Number(lineSum) || 0;
  const rate = Number(vatRate) || 0;

  if (rate <= 0) return { subtotal: r2(sum), vat: 0, total: r2(sum) };

  if (vatIncluded) {
    const subtotal = sum / (1 + rate / 100);
    return { subtotal: r2(subtotal), vat: r2(sum - subtotal), total: r2(sum) };
  }
  const vat = sum * (rate / 100);
  return { subtotal: r2(sum), vat: r2(vat), total: r2(sum + vat) };
}

/** แถวบรรทัดเท่าที่ต้องใช้คิดยอด */
type LineLike = { line_total?: number | string | null; is_active?: boolean | null };

export const sumActiveLines = (lines: readonly LineLike[]): number =>
  lines.filter((l) => l.is_active !== false).reduce((a, l) => a + (Number(l.line_total) || 0), 0);

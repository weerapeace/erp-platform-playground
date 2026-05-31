/**
 * Tax / Total Calculation Service กลาง
 *
 * **Rule**: ทุกการคำนวณยอดเอกสาร (PR/PO/Invoice/SO) ต้องใช้ service นี้
 *
 * รองรับ:
 *   - VAT (Value Added Tax) — included หรือ excluded
 *   - WHT (Withholding Tax) — แยกออกจาก payment
 *   - Line discount (% หรือ จำนวน)
 *   - Document-level discount + shipping
 *   - Multi-currency (ทุก line ต้องสกุลเดียวกัน)
 *
 * Convention:
 *   subtotal     = qty × unit_price
 *   net          = subtotal − discount
 *   tax_amount   = net × tax_rate / 100   (ถ้า tax excluded)
 *                  net × tax_rate / (100 + tax_rate)   (ถ้า tax included)
 *   line_total   = net + tax_amount       (ถ้า excluded)
 *                  net                     (ถ้า included)
 *   wht_amount   = net × wht_rate / 100
 *   amount_due   = grand_total − Σ wht_amount
 */

import {
  type Money, type CurrencyCode, type RoundingMode,
  money, zero, add, subtract, multiply, sum, percent,
  DEFAULT_CURRENCY,
} from "@/lib/money";

// ============================================================
// Types
// ============================================================

export type DiscountInput = {
  /** ประเภท: 'percent' = % | 'amount' = จำนวนเงิน */
  type:   "percent" | "amount";
  value:  number;
};

export type TaxConfig = {
  /** อัตรา VAT % */
  vat_rate?:     number;
  /** ราคาที่กรอกรวม VAT หรือยัง */
  vat_included?: boolean;
  /** อัตรา WHT % (หัก ณ ที่จ่าย) */
  wht_rate?:     number;
};

export type LineInput = {
  qty:        number;
  unit_price: number;
  /** ส่วนลด line-level */
  discount?:  DiscountInput;
  /** override TaxConfig ของ document (ถ้ามี) */
  tax?:       TaxConfig;
};

export type LineResult = {
  qty:           number;
  unit_price:    Money;
  subtotal:      Money;     // qty × price
  discount:      Money;     // จำนวนส่วนลด
  net:           Money;     // subtotal − discount
  vat_amount:    Money;
  wht_amount:    Money;
  /** ยอดที่แสดงในเอกสาร (รวม VAT) */
  line_total:    Money;
};

export type DocumentInput = {
  currency?: CurrencyCode;
  lines:     LineInput[];
  /** ส่วนลดท้ายเอกสาร */
  header_discount?: DiscountInput;
  /** ค่าจัดส่ง */
  shipping_fee?:    number;
  /** ภาษีเริ่มต้น (line override ได้) */
  tax?:             TaxConfig;
  /** rounding mode (default half-up) */
  rounding?:        RoundingMode;
};

export type DocumentResult = {
  lines:            LineResult[];
  subtotal:         Money;     // Σ line.subtotal
  total_line_discount: Money;  // Σ line.discount
  net_before_header_disc: Money; // Σ line.net
  header_discount:  Money;
  shipping:         Money;
  taxable:          Money;     // net + shipping − header_discount
  total_vat:        Money;
  total_wht:        Money;
  grand_total:      Money;     // taxable + VAT (ถ้า excluded)
  amount_due:       Money;     // grand_total − WHT (ผู้ขายได้รับจริง)
};

// ============================================================
// Helpers
// ============================================================

function discountToMoney(disc: DiscountInput | undefined, base: Money): Money {
  if (!disc) return zero(base.currency);
  if (disc.type === "percent") return percent(base, disc.value);
  return money(disc.value, base.currency);
}

// ============================================================
// Calculate single line
// ============================================================

export function calculateLine(
  line: LineInput,
  defaultTax: TaxConfig = {},
  currency: CurrencyCode = DEFAULT_CURRENCY,
  mode: RoundingMode = "half-up",
): LineResult {
  const unit     = money(line.unit_price, currency, mode);
  const subtotal = multiply(unit, line.qty, mode);

  const discount = discountToMoney(line.discount, subtotal);
  const net      = subtract(subtotal, discount);

  const tax = { ...defaultTax, ...line.tax };
  const vat_rate     = tax.vat_rate ?? 0;
  const vat_included = tax.vat_included ?? false;
  const wht_rate     = tax.wht_rate ?? 0;

  let vat_amount: Money;
  let line_total: Money;

  if (vat_rate === 0) {
    vat_amount = zero(currency);
    line_total = net;
  } else if (vat_included) {
    // ราคารวม VAT → แกะออก: vat = net × rate / (100 + rate)
    vat_amount = {
      amount: Math.round(net.amount * vat_rate / (100 + vat_rate)),
      currency: net.currency,
    };
    line_total = net;   // total = net (เพราะรวมแล้ว)
  } else {
    // ราคา excluded → บวก: vat = net × rate / 100
    vat_amount = percent(net, vat_rate);
    line_total = add(net, vat_amount);
  }

  const wht_base   = vat_included
    ? subtract(net, vat_amount)   // WHT คำนวณจากยอดก่อน VAT
    : net;
  const wht_amount = wht_rate > 0 ? percent(wht_base, wht_rate) : zero(currency);

  return {
    qty:        line.qty,
    unit_price: unit,
    subtotal,
    discount,
    net,
    vat_amount,
    wht_amount,
    line_total,
  };
}

// ============================================================
// Calculate document
// ============================================================

export function calculateDocument(doc: DocumentInput): DocumentResult {
  const currency = doc.currency ?? DEFAULT_CURRENCY;
  const mode     = doc.rounding ?? "half-up";
  const tax      = doc.tax ?? {};

  const lineResults = doc.lines.map(l => calculateLine(l, tax, currency, mode));

  const subtotal           = sum(lineResults.map(l => l.subtotal), currency);
  const total_line_discount = sum(lineResults.map(l => l.discount), currency);
  const net_before_header   = sum(lineResults.map(l => l.net), currency);
  const lines_vat           = sum(lineResults.map(l => l.vat_amount), currency);

  // Header-level adjustments
  const header_discount = discountToMoney(doc.header_discount, net_before_header);
  const shipping        = money(doc.shipping_fee ?? 0, currency, mode);
  const taxable         = add(subtract(net_before_header, header_discount), shipping);

  // VAT — ถ้า document level + ไม่มี line tax → คำนวณบน taxable
  // ถ้า line มี tax อยู่แล้ว → ใช้ Σ line.vat
  const useDocVat = (tax.vat_rate ?? 0) > 0 && lineResults.every(l => l.vat_amount.amount === 0);
  const total_vat = useDocVat
    ? percent(taxable, tax.vat_rate ?? 0)
    : lines_vat;

  const grand_total = tax.vat_included
    ? taxable                                  // included → grand = taxable
    : add(taxable, total_vat);                 // excluded → grand = taxable + VAT

  const wht_lines = sum(lineResults.map(l => l.wht_amount), currency);
  // WHT document level — คำนวณบน taxable ก่อน VAT
  const doc_wht_rate = tax.wht_rate ?? 0;
  const total_wht = wht_lines.amount > 0
    ? wht_lines
    : (doc_wht_rate > 0 ? percent(taxable, doc_wht_rate) : zero(currency));

  const amount_due = subtract(grand_total, total_wht);

  return {
    lines:            lineResults,
    subtotal,
    total_line_discount,
    net_before_header_disc: net_before_header,
    header_discount,
    shipping,
    taxable,
    total_vat,
    total_wht,
    grand_total,
    amount_due,
  };
}

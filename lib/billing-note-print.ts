/**
 * ใบวางบิล → ข้อมูลสำหรับแม่แบบพิมพ์ (ของกลาง ไม่แตะ DB)
 * ใช้ร่วมกัน: หน้าพิมพ์ทีละใบ /print/billing-note/[id] · (ต่อไป) หน้าพิมพ์หลายใบ
 *
 * ตารางรายการ: แม่แบบที่มี {{{lines_table}}} → สร้างจากค่าตั้งการพิมพ์กลาง (lib/doc-print-prefs, entity "billing_note")
 *               แม่แบบเก่าที่วนลูป {{#lines}} เอง → ยังใช้ได้เหมือนเดิม (ส่ง lines ให้ด้วยเสมอ)
 */
import { thaiBahtText } from "@/lib/quotation-print";
import { renderDocTable, type DocPrintPrefs } from "@/lib/doc-print-prefs";
import type { BillingNoteDetail } from "@/app/api/billing-notes/route";

export type BillingNotePrintDoc = BillingNoteDetail & {
  customer_address?: string | null;
  customer_phone?:   string | null;
  customer_tax_id?:  string | null;
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-11-03" → "03-พ.ย.-69" (แบบที่ใบวางบิลใช้) */
export const thaiShort = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const be2 = String((d.getFullYear() + 543) % 100).padStart(2, "0");
  return `${String(d.getDate()).padStart(2, "0")}-${TH_MON[d.getMonth()]}-${be2}`;
};

export function buildBillingNoteData(b: BillingNotePrintDoc, prefs: DocPrintPrefs): Record<string, unknown> {
  // ใบลดหนี้ → แสดงเป็น "บรรทัดติดลบ" ต่อท้ายรายการบิล แล้วรวมเข้ายอดสรุปเลย
  // (เจ้าของสั่ง: ให้ขึ้นเป็นลำดับในตาราง + รวมยอดให้เสร็จ ไม่ต้องมีบรรทัดหักแยกท้ายใบ)
  const credits = b.credit_notes ?? [];
  const creditSub   = credits.reduce((sum, c) => sum + c.diff_amount, 0);
  const creditVat   = credits.reduce((sum, c) => sum + c.vat_amount, 0);
  const creditTotal = credits.reduce((sum, c) => sum + c.grand_total, 0);
  const netSubtotal = Math.round((b.subtotal - creditSub) * 100) / 100;
  const netVat      = Math.round((b.total_vat - creditVat) * 100) / 100;
  const netGrand    = Math.round((b.grand_total - creditTotal) * 100) / 100;
  const netDue      = Math.round((b.amount_due - creditTotal) * 100) / 100;

  const lines = [
    ...b.lines.map((l, i) => ({
      idx:          i + 1,
      so_number:    l.so_number ?? "",
      bill_date:    thaiShort(l.bill_date),
      due_date:     thaiShort(l.due_date),
      amount:       baht(l.amount),
      vat_amount:   baht(l.vat_amount),
      total_amount: baht(l.total_amount),
      note:         l.note ?? "",
    })),
    // บรรทัดใบลดหนี้ (ยอดติดลบ) — ต่อลำดับจากรายการบิล
    ...credits.map((c, i) => ({
      idx:          b.lines.length + i + 1,
      so_number:    c.cn_number ?? "ใบลดหนี้",
      bill_date:    thaiShort(c.cn_date),
      due_date:     "",
      amount:       baht(-c.diff_amount),
      vat_amount:   baht(-c.vat_amount),
      total_amount: baht(-c.grand_total),
      note:         c.ref_invoice_no ? `ลดหนี้ ${c.ref_invoice_no}` : "ใบลดหนี้",
    })),
  ];

  return {
    bill_number:      b.bill_number ?? "(ยังไม่ออกเลข)",
    bill_date:        thaiShort(b.bill_date),
    due_date:         thaiShort(b.due_date),
    customer_name:    b.customer_name ?? "—",
    customer_address: b.customer_address ?? "",
    customer_tax_id:  b.customer_tax_id ?? "",
    // ยอดสรุปหักใบลดหนี้ไปแล้วทุกบรรทัด (ตัวเลขจึงตรงกับรายการในตาราง)
    subtotal:         baht(netSubtotal),
    total_vat:        baht(netVat),
    total_wht:        baht(b.total_wht),
    has_wht:          b.total_wht > 0 ? "1" : "",
    grand_total:      baht(netGrand),
    amount_due:       baht(netDue),
    net_amount_due:   baht(netDue),
    amount_in_words:  thaiBahtText(netDue),
    lines,
    lines_table:      renderDocTable("billing_note", prefs, lines, { filler: true }),
  };
}

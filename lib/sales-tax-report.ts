/**
 * รายงานภาษีขาย (Output VAT Report) — ตรรกะกลาง ไม่แตะ DB
 * ใช้ร่วมกันระหว่าง API (/api/sales/tax-report) · หน้าจอ (/sales/tax-report) · ใบพิมพ์ · เทสต์
 *
 * รูปแบบตามแบบรายงานภาษีขายของกรมสรรพากร (ยื่นพร้อม ภ.พ.30 รายเดือน):
 *   ลำดับ · วัน/เดือน/ปี · เลขที่ใบกำกับภาษี · ชื่อผู้ซื้อสินค้า/ผู้รับบริการ · เลขประจำตัวผู้เสียภาษี
 *   · สถานประกอบการ (สำนักงานใหญ่/สาขาที่) · มูลค่าสินค้าหรือบริการ (ก่อน VAT) · จำนวนเงินภาษีมูลค่าเพิ่ม · หมายเหตุ
 *
 * กติกาที่ฝังไว้ (ธรรมเนียมบัญชี):
 *   - ใบกำกับที่ "ยกเลิก" ยังต้องอยู่ในรายงาน (ยอด 0 + หมายเหตุ "ยกเลิก") เพื่อให้เลขที่เรียงครบ ไม่ขาดช่วง
 *   - ใบลดหนี้ = บรรทัดติดลบ (ลดทั้งมูลค่าและ VAT) ต่อท้ายใบกำกับของเดือนนั้น
 *   - บิลไม่มี VAT (ชุดเลข BILL-…) ไม่มีเลขใบกำกับ → ไม่อยู่ในรายงาน แต่นับแยกไว้ให้รู้ว่ามีกี่ใบ
 *   - ใบ "ร่าง" ที่มีเลขใบกำกับแล้ว: นับรวมในยอด แต่ติดธงเตือน — ควรยืนยันหรือยกเลิกก่อนยื่นภาษี
 */

export type SalesTaxRow = {
  kind: "invoice" | "credit_note";
  id: string;
  /** เลขที่ใบกำกับภาษี หรือเลขที่ใบลดหนี้ */
  doc_no: string;
  doc_date: string | null;
  /** ใบกำกับ: เลข SO ถ้าต่างจากเลขใบกำกับ · ใบลดหนี้: เลขใบกำกับที่อ้างถึง */
  ref_no: string | null;
  customer_name: string;
  customer_tax_id: string;
  /** "สำนักงานใหญ่" / "สาขา 00005" / "" */
  customer_branch: string;
  /** มูลค่าก่อน VAT — ใบลดหนี้ติดลบ · ใบยกเลิก = 0 */
  taxable: number;
  vat: number;
  total: number;
  status: string;
  cancelled: boolean;
  draft: boolean;
  remark: string;
};

export type SalesTaxSummary = {
  /** ใบกำกับที่ไม่ยกเลิก (รวมใบร่างที่มีเลขแล้ว) */
  invoice_n: number; invoice_taxable: number; invoice_vat: number; invoice_total: number;
  cancelled_n: number;
  draft_n: number; draft_taxable: number; draft_vat: number;
  /** ใบลดหนี้ — เก็บเป็นค่าบวก (เอาไปหัก) */
  cn_n: number; cn_taxable: number; cn_vat: number; cn_total: number;
  net_taxable: number; net_vat: number; net_total: number;
  /** บิลไม่มี VAT ของเดือนเดียวกัน (ไม่อยู่ในรายงาน — บอกให้รู้เฉย ๆ) */
  no_vat_n: number; no_vat_total: number;
  /** ใบกำกับ (ไม่ยกเลิก) ที่ลูกค้าไม่มีเลขผู้เสียภาษีในทะเบียน */
  missing_tax_id_n: number;
};

export type SalesTaxIssues = {
  /** เลขที่หายไประหว่างเลขต่ำสุด-สูงสุดของเดือน (คำนำหน้าเดียวกัน) */
  gaps: string[];
  /** เลขที่ซ้ำกันมากกว่า 1 ใบ */
  duplicates: string[];
};

export type SalesTaxCompany = {
  id: string; code: string; name_th: string; tax_id: string; tax_branch: string; address: string;
};

export type SalesTaxReport = {
  month: string;
  company: SalesTaxCompany | null;
  /** บริษัทที่เลือกได้ (หัวบิล) */
  companies: { id: string; code: string; name_th: string }[];
  rows: SalesTaxRow[];
  summary: SalesTaxSummary;
  issues: SalesTaxIssues;
};

export type CustomerTax = { tax_id: string; branch: string };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ป้ายสถานประกอบการของลูกค้าจากช่อง tax_branch ในทะเบียน: ""/"00000"/"สำนักงานใหญ่" → สำนักงานใหญ่ · "5" → สาขา 00005 */
export function branchLabel(branch: unknown, hasTaxId = true): string {
  const b = String(branch ?? "").trim();
  if (!b && !hasTaxId) return "";
  if (!b || /^0+$/.test(b) || /สำนักงานใหญ่|head\s*office/i.test(b)) return "สำนักงานใหญ่";
  if (/^\d{1,5}$/.test(b)) return `สาขา ${b.padStart(5, "0")}`;
  // ค่าที่ไม่เข้ารูปแบบ (เช่น ใส่เลขผู้เสียภาษีผิดช่อง) — โชว์ตามจริงให้คนเห็นแล้วไปแก้ในทะเบียนคู่ค้า
  return b;
}

/** แยกเลขผู้เสียภาษี 13 หลัก + สาขา ออกจากข้อความที่เคยถูก format แล้ว เช่น "0105561095357 (สาขา 00005)" */
export function splitTaxId(text: unknown): CustomerTax {
  const s = String(text ?? "").trim();
  const id = (s.match(/\d{13}/) ?? [""])[0];
  const branch = (s.match(/สาขา\s*(\d{1,5})/) ?? ["", ""])[1];
  return { tax_id: id || s.replace(/\s*\(.*\)\s*$/, ""), branch };
}

export type InvoiceSource = {
  id: string; tax_invoice_no: string; so_number?: string | null; order_date?: string | null;
  customer_name?: string | null; status?: string | null; taxable?: unknown; total_vat?: unknown;
};

/** ใบขายที่มีเลขใบกำกับ → บรรทัดรายงาน (ยกเลิก = ยอด 0 แต่ยังอยู่ในรายงาน) */
export function invoiceRow(src: InvoiceSource, cust: CustomerTax | null): SalesTaxRow {
  const status = String(src.status ?? "draft");
  const cancelled = status === "cancelled";
  const draft = status === "draft";
  const taxable = cancelled ? 0 : round2(num(src.taxable));
  const vat = cancelled ? 0 : round2(num(src.total_vat));
  const origTotal = round2(num(src.taxable) + num(src.total_vat));
  const taxId = cust?.tax_id ?? "";
  const soNo = String(src.so_number ?? "").trim();
  return {
    kind: "invoice", id: src.id,
    doc_no: src.tax_invoice_no,
    doc_date: src.order_date ?? null,
    ref_no: soNo && soNo !== src.tax_invoice_no ? soNo : null,
    customer_name: String(src.customer_name ?? "").trim() || "—",
    customer_tax_id: taxId,
    customer_branch: branchLabel(cust?.branch, !!taxId),
    taxable, vat, total: round2(taxable + vat),
    status, cancelled, draft,
    remark: cancelled ? `ยกเลิก (เดิม ฿${money(origTotal)})` : draft ? "ร่าง — ยังไม่ยืนยัน" : "",
  };
}

export type CreditNoteSource = {
  id: string; cn_number: string; status?: string | null; ref_invoice_no?: string | null; cn_date?: string | null;
  customer_name?: string | null; customer_tax_id?: string | null; diff_amount?: unknown; vat_amount?: unknown;
};

/** ใบลดหนี้ → บรรทัดติดลบ (ยกเลิก = 0) · เลขผู้เสียภาษีเอาจากทะเบียนก่อน ไม่มีค่อยแกะจากข้อความบนใบ */
export function creditNoteRow(src: CreditNoteSource, cust: CustomerTax | null): SalesTaxRow {
  const status = String(src.status ?? "issued");
  const cancelled = status === "cancelled";
  const taxable = cancelled ? 0 : round2(-num(src.diff_amount));
  const vat = cancelled ? 0 : round2(-num(src.vat_amount));
  const tax = cust?.tax_id ? cust : splitTaxId(src.customer_tax_id);
  const ref = String(src.ref_invoice_no ?? "").trim();
  return {
    kind: "credit_note", id: src.id,
    doc_no: src.cn_number,
    doc_date: src.cn_date ?? null,
    ref_no: ref || null,
    customer_name: String(src.customer_name ?? "").trim() || "—",
    customer_tax_id: tax.tax_id,
    customer_branch: branchLabel(tax.branch, !!tax.tax_id),
    taxable, vat, total: round2(taxable + vat),
    status, cancelled, draft: false,
    remark: cancelled ? "ยกเลิก" : `ใบลดหนี้${ref ? ` อ้างอิงใบกำกับ ${ref}` : ""}`,
  };
}

/** เรียงตามธรรมเนียมรายงาน: ใบกำกับก่อน (ตามเลขที่ → วันที่) แล้วค่อยใบลดหนี้ (ตามเลขที่) */
export function sortSalesTaxRows(rows: SalesTaxRow[]): SalesTaxRow[] {
  const rank = (r: SalesTaxRow) => (r.kind === "invoice" ? 0 : 1);
  return [...rows].sort((a, b) =>
    rank(a) - rank(b) || a.doc_no.localeCompare(b.doc_no) || (a.doc_date ?? "").localeCompare(b.doc_date ?? ""));
}

/** ตรวจลำดับเลขใบกำกับ: เลขขาดหาย (ระหว่างต่ำสุด-สูงสุดของคำนำหน้าเดียวกัน) + เลขซ้ำ */
export function analyzeInvoiceSequence(numbers: string[]): SalesTaxIssues {
  const byPrefix = new Map<string, { width: number; nums: Set<number> }>();
  const count = new Map<string, number>();
  for (const raw of numbers) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    count.set(s, (count.get(s) ?? 0) + 1);
    const m = s.match(/^(.*?)(\d+)$/);
    if (!m) continue;
    const e = byPrefix.get(m[1]) ?? { width: m[2].length, nums: new Set<number>() };
    byPrefix.set(m[1], e);
    e.nums.add(Number(m[2]));
  }
  const gaps: string[] = [];
  for (const [prefix, e] of byPrefix) {
    const list = [...e.nums];
    const min = Math.min(...list), max = Math.max(...list);
    if (max - min > 5000) continue; // เลขผิดปกติ (เช่นพิมพ์เองผิด) — ไม่ไล่หาช่องว่างเป็นพัน ๆ เลข
    for (let i = min; i <= max; i++) if (!e.nums.has(i)) gaps.push(prefix + String(i).padStart(e.width, "0"));
  }
  const duplicates = [...count].filter(([, n]) => n > 1).map(([k]) => k).sort();
  return { gaps: gaps.sort(), duplicates };
}

/** สรุปยอดทั้งเดือน: ใบกำกับ (ไม่ยกเลิก) − ใบลดหนี้ = สุทธิ · แยกยอดใบร่างให้เห็น */
export function summarizeSalesTax(rows: SalesTaxRow[], noVat: { n: number; total: number } = { n: 0, total: 0 }): SalesTaxSummary {
  const sum = (list: SalesTaxRow[], f: (r: SalesTaxRow) => number) => round2(list.reduce((a, r) => a + f(r), 0));
  const invoices = rows.filter(r => r.kind === "invoice");
  const live = invoices.filter(r => !r.cancelled);
  const drafts = live.filter(r => r.draft);
  const cns = rows.filter(r => r.kind === "credit_note" && !r.cancelled);
  const invoice_taxable = sum(live, r => r.taxable);
  const invoice_vat = sum(live, r => r.vat);
  const cn_taxable = round2(-sum(cns, r => r.taxable));
  const cn_vat = round2(-sum(cns, r => r.vat));
  return {
    invoice_n: live.length, invoice_taxable, invoice_vat, invoice_total: round2(invoice_taxable + invoice_vat),
    cancelled_n: invoices.length - live.length,
    draft_n: drafts.length, draft_taxable: sum(drafts, r => r.taxable), draft_vat: sum(drafts, r => r.vat),
    cn_n: cns.length, cn_taxable, cn_vat, cn_total: round2(cn_taxable + cn_vat),
    net_taxable: round2(invoice_taxable - cn_taxable),
    net_vat: round2(invoice_vat - cn_vat),
    net_total: round2(invoice_taxable + invoice_vat - cn_taxable - cn_vat),
    no_vat_n: noVat.n, no_vat_total: round2(noVat.total),
    missing_tax_id_n: live.filter(r => !r.customer_tax_id).length,
  };
}

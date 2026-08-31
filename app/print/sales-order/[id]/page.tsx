"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { columnTokens } from "@/lib/doc-print-prefs";
import { DocPrintSettings, useDocPrintPrefs } from "@/components/doc-print-settings";
import { thaiBahtText } from "@/lib/quotation-print";
import type { SODetail } from "@/app/api/sales-orders/route";

export type SODetailExt = SODetail & {
  subtotal?:         number;
  customer_address?: string;
  customer_phone?:   string;
  customer_tax_id?:  string;
  company_name_th?:  string;
  company_name_en?:  string;
  company_address?:  string;
  company_phone?:    string;
  company_fax?:      string;
  company_tax_id?:   string;
  payment_terms?:    string;
  customer_po_no?:   string;
};
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_production: "กำลังผลิต",
  ready: "พร้อมส่ง", shipped: "จัดส่งแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** ตัวเลขล้วน ไม่มีสัญลักษณ์เงิน — ตารางแบบที่ 2 ใส่หน่วยไว้ที่หัวคอลัมน์แล้ว */
const plain = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * วันครบกำหนดชำระ = วันที่ออกเอกสาร + จำนวนวันเครดิตที่อ่านได้จากข้อความ
 * (เก็บเป็นข้อความอิสระ เช่น "เครดิต 30 วัน" / "เงินสด") — ไม่เจอตัวเลข = ไม่มีกำหนด
 */
function dueDateIso(orderDate: string | null | undefined, terms: string | null | undefined): string {
  if (!orderDate) return "-";
  const m = /(\d+)/.exec(String(terms ?? ""));
  if (!m) return "-";
  const d = new Date(orderDate);
  d.setDate(d.getDate() + Number(m[1]));
  return d.toISOString().slice(0, 10);
}

export function buildSoData(so: SODetailExt): Record<string, unknown> {
  const isoDate = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : "—");
  return {
    so_number:        so.so_number ?? "(ยังไม่ออกเลข)",
    total_qty:        so.lines.reduce((s, l) => s + Number(l.qty ?? 0), 0).toLocaleString("th-TH"),
    tax_invoice_no:   so.tax_invoice_no ?? so.so_number ?? "",
    status_label:     STATUS_LABELS[so.status] ?? so.status,
    customer_name:    so.customer_name ?? "—",
    customer_code:    so.customer_code ?? "",
    customer_address: so.customer_address ?? "",
    customer_phone:   so.customer_phone ?? "",
    customer_tax_id:  so.customer_tax_id ?? "",
    // หัวบิลบริษัทผู้ขาย — ดึงจากทะเบียนบริษัท (เดิมพิมพ์ฝังตายในแม่แบบ เปลี่ยนไม่ได้)
    company_name_th:  so.company_name_th ?? "",
    company_name_en:  so.company_name_en ?? "",
    company_address:  so.company_address ?? "",
    company_phone:    so.company_phone ?? "",
    company_fax:      so.company_fax ?? "",
    company_tax_id:   so.company_tax_id ?? "",
    company_tel_line: [so.company_phone && `โทร/Tel: ${so.company_phone}`, so.company_fax && `แฟกซ์/Fax: ${so.company_fax}`].filter(Boolean).join(" "),
    sale_person_name: so.sale_person_name ?? "—",
    order_date_th:    thaiDate(so.order_date),
    order_date_iso:   isoDate(so.order_date),
    ship_date_th:     thaiDate(so.expected_ship_date),
    note:             so.note ?? "",
    payment_terms:    so.payment_terms ?? "",
    customer_po_no:   so.customer_po_no ?? "",
    vat_rate:         so.vat_rate,
    vat_rate_label:   so.vat_included ? `${so.vat_rate}% รวมแล้ว` : `${so.vat_rate}%`,
    // บิลที่ไม่มี VAT (เช่น ออกในนามบุคคลที่ไม่ได้จดทะเบียน VAT) — ห้ามพิมพ์ว่า "ใบกำกับภาษี"
    has_vat:          Number(so.vat_rate ?? 0) > 0 ? "1" : "",
    no_vat:           Number(so.vat_rate ?? 0) > 0 ? "" : "1",
    doc_title_th:     Number(so.vat_rate ?? 0) > 0 ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน/ใบส่งของ",
    doc_title_en:     Number(so.vat_rate ?? 0) > 0 ? "Receipt/Tax Invoice" : "Receipt/Delivery Note",
    subtotal:         baht(so.subtotal ?? so.taxable),
    taxable:          baht(so.taxable),
    total_vat:        baht(so.total_vat),
    total_wht:        baht(so.total_wht),
    has_wht:          so.total_wht > 0 ? "1" : "",
    grand_total:      baht(so.grand_total),
    amount_due:       baht(so.amount_due),
    amount_in_words:  thaiBahtText(so.grand_total),
    // ---- ใช้ในแม่แบบ "ใบส่งของ/ใบส่งมอบงาน" (แบบที่ 2) ----
    page_label:       "1 / 1",
    credit_label:     so.payment_terms ?? "-",
    due_date_iso:     dueDateIso(so.order_date, so.payment_terms),
    reference:        so.customer_po_no ?? "-",
    lines: so.lines.map((l, i) => ({
      idx:             i + 1,
      sku:             l.sku ?? "",
      product_name:    l.product_name,
      // บรรทัดที่ 2 ใต้ชื่อสินค้า (แม่แบบแบบที่ 2) — ใช้หมายเหตุบรรทัดถ้ามี
      desc2:           l.note ?? "",
      qty:             Number(l.qty).toLocaleString("th-TH"),
      unit:            l.unit,
      unit_price:      baht(l.unit_price),
      // ราคา/ส่วนลด แบบไม่มีสัญลักษณ์เงิน (ตารางแบบที่ 2 ใส่หน่วยไว้หัวคอลัมน์แล้ว)
      price_plain:     plain(l.unit_price),
      discount_plain:  plain(l.discount_amount ?? 0),
      net_plain:       plain(l.net_amount ?? l.line_total ?? 0),
      vat_pct:         String(so.vat_rate ?? 7),
      discount_amount: baht(l.discount_amount ?? 0),
      // ส่วนลด/VAT รายบรรทัด — โชว์เฉพาะเมื่อติ๊กเปิดคอลัมน์ · เว้นว่างถ้าไม่มี จะได้ไม่รกด้วย 0.00
      discount_text:   Number(l.discount_amount ?? 0) > 0 ? baht(l.discount_amount) : "",
      vat_text:        Number(l.vat_amount ?? 0) > 0 ? baht(l.vat_amount) : "",
      // คอลัมน์ AMOUNT = ยอดก่อน VAT (net) เพื่อให้รวมกันได้ = "รวมราคาทั้งสิ้น" แล้วบวก VAT แยกด้านล่าง
      // (เดิมใช้ line_total ที่รวม VAT แล้ว → ไม่ตรงกับยอดรวม)
      line_total:      baht(l.net_amount ?? l.line_total ?? 0),
    })),
  };
}

export default function PrintSOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [so,        setSo]        = useState<SODetail | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([]);
  const { prefs, setPrefs } = useDocPrintPrefs("so");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/sales-orders/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=so").then(r => r.json()),
    ])
      .then(([soRes, tplRes]) => {
        if (soRes.error) throw new Error(soRes.error);
        setSo(soRes.data as SODetail);
        setTemplates((tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  // แม่แบบที่ใช้: ตัวที่เลือกไว้ > ตัวตั้งต้นของระบบ > ตัวแรก
  const template = useMemo(
    () => templates.find((t) => t.id === prefs?.template_id) ?? templates.find((t) => t.is_default) ?? templates[0] ?? null,
    [templates, prefs?.template_id],
  );

  const html = useMemo(() => {
    if (!so || !template || !prefs) return "";
    return buildReportHtml(
      {
        paper_size:  template.paper_size,
        orientation: template.orientation,
        header_html: template.header_html,
        body_html:   template.body_html,
        footer_html: template.footer_html,
        custom_css:  template.custom_css,
      },
      // คอลัมน์ที่ติ๊กเปิด → token col_<key> ให้แม่แบบซ่อน/โชว์ + colspan ของแถวสรุปยอด
      { ...buildSoData(so), ...columnTokens("so", prefs) },
    );
  }, [so, template, prefs]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={docFileName("ใบกำกับภาษี", so?.tax_invoice_no || so?.so_number)} />
      {prefs && templates.length > 0 && (
        <DocPrintSettings entityType="so" templates={templates} prefs={prefs} onChange={setPrefs} />
      )}
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !so ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มี template สำหรับ SO — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <PrintFrame html={html} fileName={docFileName("ใบกำกับภาษี", so?.tax_invoice_no || so?.so_number)} />
        )}
      </div>
    </div>
  );
}

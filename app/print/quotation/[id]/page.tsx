"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { QuoteDetail, QuoteLine } from "@/app/api/quotations/route";

type QuoteLinePrint = QuoteLine & {
  image_url?: string | null;
  image_key?: string | null;
};

type QuotePrintDetail = Omit<QuoteDetail, "lines"> & {
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_tax_id?: string | null;
  lines: QuoteLinePrint[];
};

type SkuPickerItem = {
  code?: string | null;
  image_url?: string | null;
  image_key?: string | null;
};

const COMPANY_NAME = "หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)";
const COMPANY_ADDRESS = "41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพฯ 10160";

const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "-";

const ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;",
};

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ESCAPE_LOOKUP[ch] ?? ch);

function thaiIntegerText(num: number): string {
  if (num === 0) return "ศูนย์";
  const digits = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

  if (num >= 1_000_000) {
    const millions = Math.floor(num / 1_000_000);
    const rest = num % 1_000_000;
    return `${thaiIntegerText(millions)}ล้าน${rest ? thaiIntegerText(rest) : ""}`;
  }

  const chars = String(num).split("").map(Number);
  return chars.map((digit, index) => {
    if (digit === 0) return "";
    const pos = chars.length - index - 1;
    if (pos === 1) {
      if (digit === 1) return "สิบ";
      if (digit === 2) return "ยี่สิบ";
      return `${digits[digit]}สิบ`;
    }
    if (pos === 0 && digit === 1 && chars.length > 1) return "เอ็ด";
    return `${digits[digit]}${units[pos]}`;
  }).join("");
}

function thaiBahtText(amount: number | null | undefined): string {
  const satangTotal = Math.round(Number(amount ?? 0) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  return `${thaiIntegerText(baht)}บาท${satang ? `${thaiIntegerText(satang)}สตางค์` : "ถ้วน"}`;
}

function lineAmount(line: QuoteLinePrint): number {
  if (typeof line.line_total === "number") return line.line_total;
  if (typeof line.net_amount === "number") return line.net_amount;
  const gross = Number(line.qty ?? 0) * Number(line.unit_price ?? 0);
  const discount = Number(line.discount_amount ?? 0);
  return Math.max(0, gross - discount);
}

function imageSrc(line: QuoteLinePrint, origin: string): string {
  const raw = line.image_url || (line.image_key ? `/api/r2-image?key=${encodeURIComponent(line.image_key)}` : "");
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (!origin) return raw;
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

async function enrichQuoteImages(q: QuoteDetail): Promise<QuotePrintDetail> {
  const skuCodes = Array.from(new Set(q.lines.map(line => line.sku).filter(Boolean))) as string[];
  const imageBySku = new Map<string, Pick<QuoteLinePrint, "image_url" | "image_key">>();

  await Promise.all(skuCodes.map(async (code) => {
    const params = new URLSearchParams({ search: code, limit: "8", sales_only: "false" });
    const res = await apiFetch(`/api/pickers/skus?${params.toString()}`);
    const json = await res.json().catch(() => ({ data: [] }));
    const items = (json.data ?? []) as SkuPickerItem[];
    const match = items.find(item => item.code === code) ?? items[0];
    if (match) {
      imageBySku.set(code, {
        image_url: match.image_url ?? null,
        image_key: match.image_key ?? null,
      });
    }
  }));

  return {
    ...(q as QuotePrintDetail),
    lines: q.lines.map(line => ({
      ...line,
      ...(line.sku ? imageBySku.get(line.sku) : undefined),
    })),
  };
}

function buildQuotationHtml(quote: QuotePrintDetail, origin: string): string {
  const rows = quote.lines.map((line, index) => {
    const src = imageSrc(line, origin);
    return `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="center code">${esc(line.sku || "")}</td>
        <td>${esc(line.product_name)}</td>
        <td class="photo-cell">${src ? `<img src="${esc(src)}" alt="${esc(line.product_name)}">` : `<span class="no-photo">ไม่มีรูป</span>`}</td>
        <td class="right">${qty(line.qty)}</td>
        <td class="center">${esc(line.unit)}</td>
        <td class="right">${money(line.unit_price)}</td>
        <td class="right">${money(lineAmount(line))}</td>
      </tr>
    `;
  }).join("");

  const subtotal = quote.subtotal || quote.lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const vatLabel = quote.vat_included ? `ภาษีมูลค่าเพิ่ม ${quote.vat_rate}% (รวมแล้ว)` : `ภาษีมูลค่าเพิ่ม ${quote.vat_rate}%`;
  const note = quote.note || "";

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <base href="${esc(origin || "/")}">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #000; font-family: Tahoma, "Sarabun", Arial, sans-serif; font-size: 11px; }
    .page { width: 210mm; min-height: 297mm; padding: 13mm 12mm 11mm; margin: 0 auto; background: #fff; }
    .company { text-align: center; line-height: 1.25; }
    .company-name { font-size: 15px; font-weight: 700; }
    .company-address { font-size: 10px; }
    h1 { text-align: center; font-size: 22px; margin: 12px 0 22px; }
    .header-box { display: grid; grid-template-columns: 1.4fr 1fr; border: 1px solid #000; min-height: 30mm; margin-bottom: 2mm; }
    .header-left, .header-right { padding: 4mm; }
    .header-right { border-left: 1px solid #000; text-align: right; display: flex; flex-direction: column; justify-content: center; }
    .label { font-weight: 700; }
    .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .items th, .items td { border: 1px solid #000; padding: 2mm 1.5mm; vertical-align: middle; }
    .items th { text-align: center; font-weight: 700; line-height: 1.1; }
    .items tbody tr { height: 24mm; }
    .center { text-align: center; }
    .right { text-align: right; }
    .code { font-size: 10px; }
    .photo-cell { padding: 1mm !important; text-align: center; }
    .photo-cell img { width: 100%; height: 22mm; object-fit: contain; display: block; }
    .no-photo { color: #777; font-size: 10px; }
    .summary-row td { height: auto !important; padding: 1.5mm; }
    .bottom { display: grid; grid-template-columns: 1.95fr 1fr; border-left: 1px solid #000; border-right: 1px solid #000; border-bottom: 1px solid #000; }
    .note { border-right: 1px solid #000; min-height: 18mm; padding: 2mm; }
    .totals { width: 100%; border-collapse: collapse; }
    .totals td { border-bottom: 1px solid #000; padding: 2mm; }
    .totals tr:last-child td { border-bottom: 0; font-weight: 700; }
    .amount-text { text-align: center; font-weight: 700; padding: 3mm 0 1mm; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28mm; margin-top: 22mm; padding: 0 18mm; }
    .signature { text-align: center; }
    .sig-line { border-top: 1px solid #000; padding-top: 2mm; font-weight: 700; }
    .sig-date { font-size: 10px; margin-top: 1mm; }
    @media print {
      body { background: #fff; }
      .page { box-shadow: none; margin: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="company">
      <div class="company-name">${esc(COMPANY_NAME)}</div>
      <div class="company-address">${esc(COMPANY_ADDRESS)}</div>
    </div>
    <h1>ใบเสนอราคา</h1>

    <section class="header-box">
      <div class="header-left">
        <div><span class="label">ลูกค้า / Customer</span></div>
        <div><span class="label">ชื่อ:</span> ${esc(quote.customer_name || "-")}</div>
        <div><span class="label">ที่อยู่:</span> ${esc(quote.customer_address || "")}</div>
        <div><span class="label">เบอร์โทร:</span> ${esc(quote.customer_phone || "")}</div>
      </div>
      <div class="header-right">
        <div><span class="label">วันที่:</span> ${esc(thaiDate(quote.quote_date))}</div>
        <div><span class="label">เลขที่ใบเสนอราคา:</span> ${esc(quote.quote_number || "-")}</div>
        <div><span class="label">ผู้รับผิดชอบ:</span> ${esc(quote.sale_person_name || "-")}</div>
      </div>
    </section>

    <table class="items">
      <colgroup>
        <col style="width: 6%">
        <col style="width: 13%">
        <col style="width: 29%">
        <col style="width: 17%">
        <col style="width: 9%">
        <col style="width: 7%">
        <col style="width: 9%">
        <col style="width: 10%">
      </colgroup>
      <thead>
        <tr>
          <th>ลำดับ</th>
          <th>รหัสสินค้า</th>
          <th>รายการ</th>
          <th>ภาพ</th>
          <th>จำนวน</th>
          <th>หน่วย</th>
          <th>ราคาต่อ<br>หน่วย</th>
          <th>จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="8" class="center">ไม่มีรายการสินค้า</td></tr>`}
        <tr class="summary-row">
          <td></td>
          <td colspan="2" class="center">รวม</td>
          <td></td>
          <td class="right">${qty(quote.lines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0))}</td>
          <td></td>
          <td class="right">${money(quote.lines.reduce((sum, line) => sum + Number(line.unit_price ?? 0), 0))}</td>
          <td class="right">${money(subtotal)}</td>
        </tr>
      </tbody>
    </table>

    <section class="bottom">
      <div class="note"><span class="label">หมายเหตุ :</span><br>${esc(note)}</div>
      <table class="totals">
        <tr><td class="label">รวมเงิน</td><td class="right">${money(subtotal)}</td></tr>
        <tr><td class="label">${esc(vatLabel)}</td><td class="right">${money(quote.total_vat)}</td></tr>
        <tr><td class="label">จำนวนเงินทั้งสิ้น</td><td class="right">${money(quote.grand_total)}</td></tr>
      </table>
    </section>

    <div class="amount-text">(${esc(thaiBahtText(quote.grand_total))})</div>

    <section class="signatures">
      <div class="signature">
        <div class="sig-line">ลูกค้าอนุมัติ</div>
      </div>
      <div class="signature">
        <div class="sig-line">ลายเซ็นผู้มีอำนาจ</div>
        <div class="sig-date">${esc(thaiDate(quote.quote_date))}</div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildQuoteTemplateData(quote: QuotePrintDetail, origin: string): Record<string, unknown> {
  const subtotal = quote.subtotal || quote.lines.reduce((sum, line) => sum + lineAmount(line), 0);
  return {
    quote_number: quote.quote_number || "-",
    quote_date_th: thaiDate(quote.quote_date),
    valid_until_th: thaiDate(quote.valid_until),
    customer_name: quote.customer_name || "-",
    customer_code: quote.customer_code || "",
    customer_address: quote.customer_address || "",
    customer_phone: quote.customer_phone || "",
    sale_person_name: quote.sale_person_name || "-",
    note: quote.note || "",
    subtotal: money(subtotal),
    vat_rate: String(quote.vat_rate ?? 0),
    total_vat: money(quote.total_vat),
    grand_total: money(quote.grand_total),
    grand_total_text: thaiBahtText(quote.grand_total),
    lines: quote.lines.map((line, index) => {
      const src = imageSrc(line, origin);
      return {
        idx: index + 1,
        sku: line.sku || "",
        product_name: line.product_name,
        image_url: src,
        image_html: src ? `<img src="${esc(src)}" alt="${esc(line.product_name)}">` : "",
        qty: qty(line.qty),
        unit: line.unit,
        unit_price: money(line.unit_price),
        line_total: money(lineAmount(line)),
      };
    }),
  };
}

export default function PrintQuotationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [quote, setQuote] = useState<QuotePrintDetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/api/quotations/${id}`).then(res => res.json()),
      apiFetch("/api/admin/report-templates?entity_type=qt").then(res => res.json()).catch(() => ({ data: [] })),
    ])
      .then(async ([quoteJson, templateJson]) => {
        if (quoteJson.error) throw new Error(quoteJson.error);
        const enriched = await enrichQuoteImages(quoteJson.data as QuoteDetail);
        const templates = ((templateJson as ReportTemplatesResponse).data ?? []).filter(item => item.active);
        const published = templates.find(item => item.is_default) ?? templates[0] ?? null;
        if (alive) setQuote(enriched);
        if (alive) setTemplate(published);
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : "โหลดเอกสารไม่ได้");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [id]);

  const html = useMemo(() => {
    if (!quote) return "";
    if (template) {
      return buildReportHtml({
        paper_size: template.paper_size,
        orientation: template.orientation,
        header_html: template.header_html,
        body_html: template.body_html,
        footer_html: template.footer_html,
        custom_css: template.custom_css,
      }, buildQuoteTemplateData(quote, origin));
    }
    return buildQuotationHtml(quote, origin);
  }, [origin, quote, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !quote ? (
          <div className="text-center py-20 text-red-500">⚠ {error ?? "ไม่พบเอกสาร"}</div>
        ) : (
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}

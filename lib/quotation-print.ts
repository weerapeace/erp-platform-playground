import { normalizeReportLayout, type ReportLayoutSettings } from "@/lib/report-layout";

export type QuoteLinePrint = {
  sku?: string | null;
  product_name: string;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  discount_amount?: number | null;
  net_amount?: number | null;
  line_total?: number | null;
  image_url?: string | null;
  image_key?: string | null;
  note?: string | null;
};

export type QuotePrintDetail = {
  quote_number?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  sale_person_name?: string | null;
  quote_date?: string | null;
  valid_until?: string | null;
  subtotal?: number | null;
  vat_rate?: number | null;
  vat_included?: boolean | null;
  total_vat?: number | null;
  grand_total?: number | null;
  note?: string | null;
  lines: QuoteLinePrint[];
};

const COMPANY_NAME = "หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)";
const COMPANY_ADDRESS = "41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพมหานคร 10160";

const ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;",
};

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, ch => ESCAPE_LOOKUP[ch] ?? ch);

export const formatMoney = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatQty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "-";

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

export function thaiBahtText(amount: number | null | undefined): string {
  const satangTotal = Math.round(Number(amount ?? 0) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  return `${thaiIntegerText(baht)}บาท${satang ? `${thaiIntegerText(satang)}สตางค์` : "ถ้วน"}`;
}

export function quoteLinePrintAmount(line: QuoteLinePrint): number {
  if (typeof line.net_amount === "number") return line.net_amount;

  const gross = Number(line.qty ?? 0) * Number(line.unit_price ?? 0);
  if (gross > 0 || typeof line.discount_amount === "number") {
    return Math.max(0, gross - Number(line.discount_amount ?? 0));
  }

  return Math.max(0, Number(line.line_total ?? 0));
}

export function printableSku(rawSku: string | null | undefined): string {
  const sku = String(rawSku ?? "").trim();
  return /^DS-\d{4}-\d+/i.test(sku) ? "" : sku;
}

export function imageSrc(line: QuoteLinePrint, origin: string): string {
  const raw = line.image_url || (line.image_key ? `/api/r2-image?key=${encodeURIComponent(line.image_key)}` : "");
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (!origin) return raw;
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function quoteSubtotalBeforeVat(quote: QuotePrintDetail): number {
  if (typeof quote.subtotal === "number" && Number.isFinite(quote.subtotal)) return quote.subtotal;
  return quote.lines.reduce((sum, line) => sum + quoteLinePrintAmount(line), 0);
}

export function buildQuoteTemplateData(quote: QuotePrintDetail, origin: string): Record<string, unknown> {
  const subtotal = quoteSubtotalBeforeVat(quote);
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
    subtotal: formatMoney(subtotal),
    vat_rate: String(quote.vat_rate ?? 0),
    total_vat: formatMoney(quote.total_vat),
    grand_total: formatMoney(quote.grand_total),
    grand_total_text: thaiBahtText(quote.grand_total),
    lines: quote.lines.map((line, index) => {
      const src = imageSrc(line, origin);
      return {
        idx: index + 1,
        sku: printableSku(line.sku),
        product_name: line.product_name,
        image_url: src,
        image_html: src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(line.product_name)}">` : "",
        qty: formatQty(line.qty),
        unit: line.unit || "",
        unit_price: formatMoney(line.unit_price),
        line_total: formatMoney(quoteLinePrintAmount(line)),
      };
    }),
  };
}

export function buildQuotationHtml(
  quote: QuotePrintDetail,
  origin: string,
  layoutInput: Partial<ReportLayoutSettings> = {},
): string {
  const layout = normalizeReportLayout(layoutInput);
  const rows = quote.lines.map((line, index) => {
    const src = imageSrc(line, origin);
    return `
      <tr>
        <td class="center">${index + 1}</td>
        ${layout.showSku ? `<td class="center">${escapeHtml(printableSku(line.sku))}</td>` : ""}
        <td>${escapeHtml(line.product_name)}</td>
        ${layout.showImage ? `<td class="photo-cell">${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(line.product_name)}">` : ""}</td>` : ""}
        <td class="right">${formatQty(line.qty)}</td>
        <td class="center">${escapeHtml(line.unit || "")}</td>
        <td class="right">${formatMoney(line.unit_price)}</td>
        <td class="right">${formatMoney(quoteLinePrintAmount(line))}</td>
      </tr>
    `;
  }).join("");

  const subtotal = quoteSubtotalBeforeVat(quote);
  const vatLabel = quote.vat_included
    ? `ภาษีมูลค่าเพิ่ม ${quote.vat_rate}% (รวมแล้ว)`
    : `ภาษีมูลค่าเพิ่ม ${quote.vat_rate}%`;
  const totalQty = quote.lines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0);
  const unitPriceTotal = quote.lines.reduce((sum, line) => sum + Number(line.unit_price ?? 0), 0);
  const visibleColumnCount = 6 + (layout.showSku ? 1 : 0) + (layout.showImage ? 1 : 0);
  const summaryLabelColspan = 1 + (layout.showSku ? 1 : 0) + (layout.showImage ? 1 : 0);
  const signatureMarginTop = layout.signatureToBottom ? "auto" : `${layout.signatureGapMm}mm`;
  const authorizedSignatureImage = layout.showAuthorizedSignature && layout.authorizedSignatureUrl
    ? `<img class="signature-image" src="${escapeHtml(layout.authorizedSignatureUrl)}" alt="authorized signature" style="width: ${layout.authorizedSignatureWidthMm}mm; transform: translate(calc(-50% + ${layout.authorizedSignatureOffsetXMm}mm), ${layout.authorizedSignatureOffsetYMm}mm);">`
    : "";
  const companyStampImage = layout.showCompanyStamp && layout.companyStampUrl
    ? `<img class="stamp-image" src="${escapeHtml(layout.companyStampUrl)}" alt="company stamp" style="width: ${layout.companyStampWidthMm}mm; transform: translate(calc(-50% + ${layout.companyStampOffsetXMm}mm), ${layout.companyStampOffsetYMm}mm);">`
    : "";

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <base href="${escapeHtml(origin || "/")}">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #000; font-family: Tahoma, "Sarabun", Arial, sans-serif; font-size: ${layout.fontSizePx}px; }
    .page { width: 210mm; min-height: 297mm; padding: ${layout.topMarginMm}mm ${layout.horizontalMarginMm}mm ${layout.bottomMarginMm}mm; margin: 0 auto; background: #fff; display: flex; flex-direction: column; }
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
    .items tbody tr { height: ${layout.rowHeightMm}mm; }
    .center { text-align: center; }
    .right { text-align: right; }
    .code { font-size: 10px; }
    ${layout.showImage ? `.photo-cell { padding: 1mm !important; text-align: center; }
    .photo-cell img { width: 100%; height: 22mm; object-fit: contain; display: block; }` : ""}
    .summary-row td { height: auto !important; padding: 1.5mm; }
    .bottom { display: grid; grid-template-columns: 1.95fr 1fr; border-left: 1px solid #000; border-right: 1px solid #000; border-bottom: 1px solid #000; }
    .bottom-no-note { width: 42%; margin-left: auto; grid-template-columns: 1fr; border-top: 1px solid #000; }
    .note { border-right: 1px solid #000; min-height: 18mm; padding: 2mm; }
    .totals { width: 100%; border-collapse: collapse; }
    .totals td { border-bottom: 1px solid #000; padding: 2mm; }
    .totals tr:last-child td { border-bottom: 0; font-weight: 700; }
    .amount-text { text-align: center; font-weight: 700; padding: 3mm 0 1mm; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28mm; margin-top: ${signatureMarginTop}; padding: ${layout.signatureGapMm}mm 18mm 0; }
    .signature { text-align: center; position: relative; min-height: 24mm; }
    .signature-assets { position: absolute; left: 50%; bottom: 7mm; width: 0; height: 0; pointer-events: none; }
    .signature-image, .stamp-image { position: absolute; bottom: 0; left: 0; max-height: 24mm; object-fit: contain; }
    .stamp-image { opacity: 0.9; }
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
      <div class="company-name">${escapeHtml(COMPANY_NAME)}</div>
      <div class="company-address">${escapeHtml(COMPANY_ADDRESS)}</div>
    </div>
    <h1>ใบเสนอราคา</h1>

    <section class="header-box">
      <div class="header-left">
        <div><span class="label">ลูกค้า / Customer</span></div>
        <div><span class="label">ชื่อ:</span> ${escapeHtml(quote.customer_name || "-")}</div>
        <div><span class="label">ที่อยู่:</span> ${escapeHtml(quote.customer_address || "")}</div>
        ${layout.showPhone ? `<div><span class="label">เบอร์โทร:</span> ${escapeHtml(quote.customer_phone || "")}</div>` : ""}
      </div>
      <div class="header-right">
        <div><span class="label">วันที่:</span> ${escapeHtml(thaiDate(quote.quote_date))}</div>
        <div><span class="label">เลขที่ใบเสนอราคา:</span> ${escapeHtml(quote.quote_number || "-")}</div>
        ${layout.showResponsible ? `<div><span class="label">ผู้รับผิดชอบ:</span> ${escapeHtml(quote.sale_person_name || "-")}</div>` : ""}
      </div>
    </section>

    <table class="items">
      <colgroup>
        <col style="width: 6%">
        ${layout.showSku ? `<col style="width: 13%">` : ""}
        <col style="width: ${layout.showSku || layout.showImage ? 29 : 45}%">
        ${layout.showImage ? `<col style="width: 17%">` : ""}
        <col style="width: 9%">
        <col style="width: 7%">
        <col style="width: 9%">
        <col style="width: 10%">
      </colgroup>
      <thead>
        <tr>
          <th>ลำดับ</th>
          ${layout.showSku ? `<th>รหัสสินค้า</th>` : ""}
          <th>รายการ</th>
          ${layout.showImage ? `<th>ภาพ</th>` : ""}
          <th>จำนวน</th>
          <th>หน่วย</th>
          <th>ราคาต่อ<br>หน่วย</th>
          <th>จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="${visibleColumnCount}" class="center">ไม่มีรายการสินค้า</td></tr>`}
        <tr class="summary-row">
          <td></td>
          <td colspan="${summaryLabelColspan}" class="center">รวม</td>
          <td class="right">${formatQty(totalQty)}</td>
          <td></td>
          <td class="right">${formatMoney(unitPriceTotal)}</td>
          <td class="right">${formatMoney(subtotal)}</td>
        </tr>
      </tbody>
    </table>

    <section class="bottom${layout.showNote ? "" : " bottom-no-note"}">
      ${layout.showNote ? `<div class="note"><span class="label">หมายเหตุ :</span><br>${escapeHtml(quote.note || "")}</div>` : ""}
      <table class="totals">
        <tr><td class="label">รวมเงิน</td><td class="right">${formatMoney(subtotal)}</td></tr>
        <tr><td class="label">${escapeHtml(vatLabel)}</td><td class="right">${formatMoney(quote.total_vat)}</td></tr>
        <tr><td class="label">จำนวนเงินทั้งสิ้น</td><td class="right">${formatMoney(quote.grand_total)}</td></tr>
      </table>
    </section>

    <div class="amount-text">(${escapeHtml(thaiBahtText(quote.grand_total))})</div>

    <section class="signatures">
      <div class="signature">
        <div class="sig-line">ลูกค้าอนุมัติ</div>
      </div>
      <div class="signature authorized-signature">
        ${(authorizedSignatureImage || companyStampImage) ? `<div class="signature-assets">${authorizedSignatureImage}${companyStampImage}</div>` : ""}
        <div class="sig-line">ลายเซ็นผู้มีอำนาจ</div>
        <div class="sig-date">${escapeHtml(thaiDate(quote.quote_date))}</div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

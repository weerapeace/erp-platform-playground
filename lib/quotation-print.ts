import { normalizeReportLayout, type ReportLayoutSettings } from "@/lib/report-layout";
import { docFileName } from "@/lib/print-filename";
import { printPartCss, printPartFontLinks, QUOTE_CARD_PARTS } from "@/lib/print-part-style";
import { cardFieldValue, fillPagePlaceholders, normalizeCardOrder, PAGE_SLOTS, pageFieldRows, printBlockPartDefs, type PageBlockSlot, type PageFieldOption } from "@/lib/print-blocks";

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
  /** ข้อมูลจาก SKU ที่ผูก (วัสดุ ซิป …) — ช่องที่เพิ่มในการ์ด (lib/print-blocks) */
  sku_fields?: Record<string, unknown> | null;
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

/** ช่องของใบเสนอราคาที่เลือกใส่ "กล่องข้อมูลจากใบ" / แทรกในข้อความ {ลูกค้า} ได้ (lib/print-blocks) */
export const QUOTE_PAGE_FIELDS: PageFieldOption[] = [
  { key: "customer_name", label: "ลูกค้า" },
  { key: "customer_code", label: "รหัสลูกค้า" },
  { key: "customer_phone", label: "เบอร์ลูกค้า" },
  { key: "customer_address", label: "ที่อยู่ลูกค้า" },
  { key: "quote_number", label: "เลขที่ใบ" },
  { key: "quote_date", label: "วันที่" },
  { key: "valid_until", label: "ยืนราคาถึง" },
  { key: "sale_person_name", label: "พนักงานขาย" },
  { key: "grand_total", label: "ยอดรวม" },
  { key: "grand_total_text", label: "ยอดรวม (ตัวอักษร)" },
  { key: "note", label: "หมายเหตุใบ" },
  { key: "company_name", label: "ชื่อบริษัทเรา" },
];

/** ค่าจริงของช่องในใบนี้ — ว่าง = null (ไม่พิมพ์) */
export function quotePageValues(quote: QuotePrintDetail): Record<string, string | null> {
  const s = (v: string | null | undefined) => (v ?? "").trim() || null;
  return {
    customer_name: s(quote.customer_name),
    customer_code: s(quote.customer_code),
    customer_phone: s(quote.customer_phone),
    customer_address: s(quote.customer_address),
    quote_number: s(quote.quote_number),
    quote_date: quote.quote_date ? thaiDate(quote.quote_date) : null,
    valid_until: quote.valid_until ? thaiDate(quote.valid_until) : null,
    sale_person_name: s(quote.sale_person_name),
    grand_total: quote.grand_total != null ? `${formatMoney(quote.grand_total)} บาท` : null,
    grand_total_text: quote.grand_total != null ? thaiBahtText(quote.grand_total) : null,
    note: s(quote.note),
    company_name: COMPANY_NAME,
  };
}

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

/**
 * ลำดับที่ลากสลับเอง (เลขตำแหน่งเดิม) — ใช้ได้เฉพาะเมื่อครบทุกบรรทัดพอดี
 * ถ้าจำนวนบรรทัดเปลี่ยน (เพิ่ม/ลบรายการในใบ) → ทิ้งลำดับที่ลากไว้ กลับไปใช้ลำดับที่บันทึก (ไม่เดา)
 */
export function applyManualOrder<T>(lines: T[], order: number[] | null | undefined): T[] {
  if (!order || order.length !== lines.length) return lines;
  const seen = new Set<number>();
  for (const i of order) { if (!Number.isInteger(i) || i < 0 || i >= lines.length || seen.has(i)) return lines; seen.add(i); }
  return order.map(i => lines[i]);
}

/**
 * เรียงบรรทัดสำหรับพิมพ์ (ไม่แตะข้อมูลจริง) — ค่าเท่ากันคงลำดับเดิม
 * sortGroupByNote: จัดกลุ่มตามตัวเลือก (note) ก่อน กลุ่มเรียงตามที่เจอก่อน แล้วค่อยเรียงในกลุ่ม
 */
export function sortQuoteLines<T extends QuoteLinePrint>(lines: T[], layoutInput: Partial<ReportLayoutSettings> = {}): T[] {
  const layout = normalizeReportLayout(layoutInput);
  if (layout.sortBy === "none") return applyManualOrder(lines, layout.manualOrder);
  const dir = layout.sortDesc ? -1 : 1;
  const groupOrder = new Map<string, number>();
  for (const line of lines) {
    const g = (line.note ?? "").trim();
    if (!groupOrder.has(g)) groupOrder.set(g, groupOrder.size);
  }
  const keyOf = (line: T): number | string => layout.sortBy === "qty" ? Number(line.qty ?? 0)
    : layout.sortBy === "price" ? Number(line.unit_price ?? 0)
    : String(line.sku ?? "").trim();
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      if (layout.sortGroupByNote) {
        const ga = groupOrder.get((a.line.note ?? "").trim()) ?? 0;
        const gb = groupOrder.get((b.line.note ?? "").trim()) ?? 0;
        if (ga !== gb) return ga - gb;
      }
      const ka = keyOf(a.line), kb = keyOf(b.line);
      const c = typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb), "th", { numeric: true });
      return c !== 0 ? c * dir : a.index - b.index;
    })
    .map(x => x.line);
}

export function quoteSubtotalBeforeVat(quote: QuotePrintDetail): number {
  if (typeof quote.subtotal === "number" && Number.isFinite(quote.subtotal)) return quote.subtotal;
  return quote.lines.reduce((sum, line) => sum + quoteLinePrintAmount(line), 0);
}

export function buildQuoteTemplateData(quote: QuotePrintDetail, origin: string, layoutInput: Partial<ReportLayoutSettings> = {}): Record<string, unknown> {
  const sortedLines = sortQuoteLines(quote.lines, layoutInput);
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
    lines: sortedLines.map((line, index) => {
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

/** จำนวนแบบอ่านง่าย — จำนวนเต็มไม่ต้องมีทศนิยม (3,800 ไม่ใช่ 3,800.00) */
export const formatQtyPlain = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** ขนาดในการ์ดตามจำนวนต่อแถว — ยิ่งน้อยต่อแถว ยิ่งใหญ่ (ตัวอักษร px · รูปสูง mm) */
const CARD_SIZES: Record<number, { price: number; name: number; sub: number; imgMm: number }> = {
  1: { price: 34, name: 22, sub: 16, imgMm: 62 },
  2: { price: 26, name: 17, sub: 14, imgMm: 66 },
  3: { price: 20, name: 14, sub: 12, imgMm: 46 },
  4: { price: 17, name: 12, sub: 11, imgMm: 34 },
};

/** ความสูงรูปในการ์ดตอนยังไม่ปรับ (mm) — ตั้งแถบเลื่อนในตัวแก้ทีละกล่อง */
export const quoteCardImgMm = (cardsPerRow: number) => (CARD_SIZES[cardsPerRow] ?? CARD_SIZES[2]).imgMm;

/** แบบการ์ดรูปใหญ่ — แต่ละรายการเป็นการ์ด รูปใหญ่ ราคาตัวใหญ่ (ผู้ใหญ่อ่านง่าย · เจ้าของขอ 2026-11-19) */
export function buildQuoteCards(quote: QuotePrintDetail, origin: string, layout: ReportLayoutSettings): string {
  const n = layout.cardsPerRow;
  const base = CARD_SIZES[n] ?? CARD_SIZES[2];
  // ขนาดตัวหนังสือแยกส่วน = ขนาดอัตโนมัติตามจำนวนต่อแถว + ที่ผู้ใช้ปรับ (2026-11-19)
  const z = {
    ...base,
    name: Math.max(8, base.name + layout.cardNameAdjPx),
    sub: Math.max(8, base.sub + layout.cardNoteAdjPx),
    price: Math.max(9, base.price + layout.cardPriceAdjPx),
  };
  const lines = sortQuoteLines(quote.lines, layout);
  if (!lines.length) return `<div class="center" style="border:1px solid #000;padding:6mm">ไม่มีรายการสินค้า</div>`;
  // ลำดับช่องในการ์ด (ช่องพื้นฐาน + ช่องที่เพิ่ม · lib/print-blocks) — ยังไม่เคยจัด = ลำดับเดิม
  const order = normalizeCardOrder(layout.cardOrder, layout.cardFields);
  const cards = lines.map((line, index) => {
    const src = layout.showImage ? imageSrc(line, origin) : "";
    const sku = layout.showSku ? printableSku(line.sku) : "";
    const unit = escapeHtml(line.unit || "ชิ้น");
    const qtyHtml = layout.showQty ? `<span>จำนวน <b>${formatQtyPlain(line.qty)}</b> ${unit}</span>` : "<span></span>";
    const totalHtml = layout.showLineTotal ? `<span class="qc-total">รวม ${formatMoney(quoteLinePrintAmount(line))} บาท</span>` : "";
    const img = !layout.showImage ? ""
      : `<div class="qc-img" data-pp="img">${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(line.product_name)}">` : `<span class="qc-noimg">ไม่มีรูป</span>`}</div>`;
    // ราคา: เอา "/ ชิ้น" ออกตามที่เจ้าของขอ (2026-11-19) — เหลือ "850.00 บาท" ชิดขวา มีเส้นคั่นด้านบน
    // data-pp = กล่องที่กดแก้หน้าตาได้ · data-ci = ลำดับการ์ด (ซ่อนเฉพาะการ์ด) — lib/print-part-style
    const amount = quoteLinePrintAmount(line);
    const baseHtml: Record<string, string> = {
      sku: sku ? `<div class="qc-sku" data-pp="sku">${escapeHtml(sku)}</div>` : "",
      name: `<div class="qc-name" data-pp="name">${escapeHtml(line.product_name)}</div>`,
      note: line.note ? `<div class="qc-note" data-pp="note">${escapeHtml(line.note)}</div>` : "",
      price: `<div class="qc-price" data-pp="price"><span class="qc-price-label">ราคา</span><span><b>${formatMoney(line.unit_price)}</b> <small>บาท</small></span></div>`,
      foot: (layout.showQty || layout.showLineTotal) ? `<div class="qc-foot" data-pp="foot">${qtyHtml}${totalHtml}</div>` : "",
    };
    // ช่องที่เพิ่ม: ค่าว่าง = ไม่วาดแถว (SKU ไม่มีวัสดุ ก็ไม่มีแถว "วัสดุ")
    const fieldHtml = (id: string) => {
      const f = layout.cardFields.find((x) => x.id === id); if (!f) return "";
      const v = cardFieldValue(f, line, line.sku_fields, amount); if (!v) return "";
      if (f.kind === "text") return `<div class="qc-text" data-pp="f-${f.id}">${escapeHtml(v).replace(/\n/g, "<br>")}</div>`;
      return `<div class="qc-field" data-pp="f-${f.id}">${f.label ? `<span class="qc-fl">${escapeHtml(f.label)}</span>` : ""}<span class="qc-fv">${escapeHtml(v)}</span></div>`;
    };
    const body = order.map((k) => (k.startsWith("base:") ? baseHtml[k.slice(5)] ?? "" : fieldHtml(k.slice(2)))).join("");
    return `<div class="qc" data-pp="card" data-ci="${index}">
      ${layout.showCardNo ? `<span class="qc-no" data-pp="no">${index + 1}</span>` : ""}
      ${img}
      <div class="qc-body">${body}</div>
    </div>`;
  }).join("");
  // 1 ต่อแถว = รูปซ้าย ข้อความขวา (การ์ดแนวนอน) · 2-4 = รูปบน ข้อความล่าง
  const wide = n === 1;
  const css = `<style>
    .qc-grid { display: grid; grid-template-columns: repeat(${n}, minmax(0, 1fr)); gap: 4mm; }
    .qc { position: relative; border: 0.3mm solid #d4d4d4; border-radius: 3mm; padding: 2.5mm; display: flex; ${wide ? "flex-direction: row; gap: 5mm; align-items: center;" : "flex-direction: column; gap: 2mm;"} break-inside: avoid; page-break-inside: avoid; }
    .qc-no { position: absolute; top: 2mm; left: 2mm; z-index: 1; background: #111; color: #fff; border-radius: 99px; min-width: 6mm; padding: 0.3mm 1.8mm; text-align: center; font-size: ${Math.max(10, base.sub - 2)}px; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .qc-img { ${wide ? `width: ${z.imgMm}mm; flex: none;` : ""} height: ${z.imgMm}mm; display: flex; align-items: center; justify-content: center; background: #f4f4f4; border-radius: 2mm; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .qc-img img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .qc-noimg { color: #999; font-size: ${z.sub}px; }
    .qc-body { display: flex; flex-direction: column; gap: 0.8mm; min-width: 0; flex: 1; padding: 0 0.5mm; }
    .qc-sku { font-size: ${Math.max(9, z.sub - 2)}px; color: #666; }
    .qc-name { font-size: ${z.name}px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
    .qc-note { font-size: ${z.sub}px; color: #555; }
    .qc-price { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; border-top: 0.3mm solid #e5e5e5; padding-top: 1.5mm; margin-top: auto; }
    .qc-price b { font-size: ${z.price}px; font-weight: 700; line-height: 1.15; }
    .qc-price small, .qc-price-label { font-size: ${Math.max(9, z.sub - 1)}px; font-weight: 400; color: #666; }
    .qc-foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1mm 3mm; font-size: ${z.sub}px; border-top: 0.3mm dashed #bbb; padding-top: 1.5mm; }
    .qc-total { font-weight: 700; }
    .qc-field { display: flex; justify-content: space-between; gap: 2mm; font-size: ${z.sub}px; line-height: 1.35; }
    .qc-fl { color: #777; flex: none; }
    .qc-fv { text-align: right; overflow-wrap: anywhere; }
    .qc-text { font-size: ${z.sub}px; color: #333; line-height: 1.4; }
  </style>`;
  return `${css}<div class="qc-grid">${cards}</div>`;
}

/** กล่องบนหน้าตามจุดวาง + จุดกด "เพิ่มกล่องตรงนี้" (โชว์เฉพาะตอนแก้บนจอ · lib/print-blocks) */
function pageSlotHtml(layout: ReportLayoutSettings, origin: string, slot: PageBlockSlot, values: Record<string, string | null>): string {
  const blocks = layout.pageBlocks.filter((b) => b.slot === slot).map((b) => {
    if (b.kind === "fields") {
      const rows = pageFieldRows(b, values, QUOTE_PAGE_FIELDS);
      if (!rows.length) return `<div class="pb pb-empty" data-pp="b-${b.id}">(กล่องข้อมูลจากใบ — ช่องที่เลือกยังว่าง)</div>`;
      const cell = (r: { label: string; value: string }) => `<span class="pbf">${r.label ? `<span class="pbf-l">${escapeHtml(r.label)}:</span> ` : ""}<span class="pbf-v">${escapeHtml(r.value).replace(/\n/g, "<br>")}</span></span>`;
      return `<div class="pb pb-fields pb-${b.layout ?? "inline"}" data-pp="b-${b.id}">${rows.map(cell).join(b.layout === "inline" || !b.layout ? '<span class="pbf-sep"> · </span>' : "")}</div>`;
    }
    if (b.kind === "divider") return `<hr class="pb pb-hr" data-pp="b-${b.id}">`;
    if (b.kind === "image") {
      const src = `${origin}/api/r2-image?key=${encodeURIComponent(b.imageKey ?? "")}`;
      return `<div class="pb pb-img" data-pp="b-${b.id}" style="height:${b.imageMm ?? 24}mm"><img src="${escapeHtml(src)}" alt=""></div>`;
    }
    return `<div class="pb pb-text" data-pp="b-${b.id}">${escapeHtml(fillPagePlaceholders(b.text ?? "", values, QUOTE_PAGE_FIELDS)).replace(/\n/g, "<br>")}</div>`;
  }).join("");
  const label = PAGE_SLOTS.find((x) => x.key === slot)?.label ?? "";
  return `${blocks}<div class="pp-slot" data-slot="${slot}">+ เพิ่มกล่องตรงนี้ (${escapeHtml(label)})</div>`;
}

export function buildQuotationHtml(
  quote: QuotePrintDetail,
  origin: string,
  layoutInput: Partial<ReportLayoutSettings> = {},
): string {
  const layout = normalizeReportLayout(layoutInput);
  const pageValues = quotePageValues(quote);
  const rows = sortQuoteLines(quote.lines, layout).map((line, index) => {
    const src = imageSrc(line, origin);
    return `
      <tr>
        <td class="center">${index + 1}</td>
        ${layout.showSku ? `<td class="center">${escapeHtml(printableSku(line.sku))}</td>` : ""}
        <td>${escapeHtml(line.product_name)}${line.note ? `<div style="font-size:0.85em;color:#555;margin-top:1px">สี/ตัวเลือก: ${escapeHtml(line.note)}</div>` : ""}</td>
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
  // คอลัมน์ "ภาพ" กว้างตามขนาดรูป (22mm = 17% เท่าเดิม) — ส่วนต่างยืม/คืนจากคอลัมน์ "รายการ"
  const imageColPct = Math.round((17 * layout.imageSizeMm / 22) * 10) / 10;
  const nameColPct = Math.max(12, (layout.showSku || layout.showImage ? 29 : 45) - (layout.showImage ? imageColPct - 17 : 0));
  const visibleColumnCount = 6 + (layout.showSku ? 1 : 0) + (layout.showImage ? 1 : 0);
  const summaryLabelColspan = 1 + (layout.showSku ? 1 : 0) + (layout.showImage ? 1 : 0);
  const isCards = layout.lineStyle === "cards";
  // แบบการ์ด: หมายเหตุ + กล่องยอดรวมตัวใหญ่ท้ายใบ (แทนตารางรวมเงินเล็ก)
  const cardsNote = layout.showNote && quote.note
    ? `<div class="card-note" data-pp="cardnote"><span class="label">หมายเหตุ :</span> ${escapeHtml(quote.note)}</div>` : "";
  const cardsGrand = layout.showTotals ? `<section class="grand-box" data-pp="grand">
      <div class="grand-sub"><span>รวมเงิน ${formatMoney(subtotal)}</span><span>${escapeHtml(vatLabel)} ${formatMoney(quote.total_vat)}</span></div>
      <div class="grand-main"><span class="g-label">จำนวนเงินทั้งสิ้น</span><span class="g-amount">${formatMoney(quote.grand_total)} บาท</span></div>
      <div class="grand-text">(${escapeHtml(thaiBahtText(quote.grand_total))})</div>
    </section>` : "";
  // กล่องเงื่อนไขท้ายใบ (ข้อความแก้เองได้ · ขึ้นบรรทัดใหม่ได้)
  const termsHtml = layout.showTerms && layout.termsText.trim()
    ? `<div class="terms-box"${isCards ? ` data-pp="terms"` : ""}><div class="label">เงื่อนไข</div>${layout.termsText.trim().split(/\r?\n/).filter(Boolean).map(t => `<div>• ${escapeHtml(t)}</div>`).join("")}</div>` : "";
  // หัวกระดาษแบบ A (เฉพาะแบบการ์ด · เจ้าของเลือก 2026-11-19): ชื่อบริษัท+"ใบเสนอราคา" ซ้าย · กล่องเลขที่/วันที่ขวา ป้ายกับค่าตรงกันทุกบรรทัด
  const h = layout.headerAdjPx;
  const cardsHeader = `<header class="qh">
      <div class="qh-left">
        <div class="qh-company" data-pp="company">${escapeHtml(COMPANY_NAME)}</div>
        <div class="qh-address" data-pp="address">${escapeHtml(COMPANY_ADDRESS)}</div>
        <div class="qh-title" data-pp="title">ใบเสนอราคา</div>
      </div>
      <table class="qh-meta" data-pp="meta">
        <tr><td>เลขที่</td><td>${escapeHtml(quote.quote_number || "-")}</td></tr>
        <tr><td>วันที่</td><td>${escapeHtml(thaiDate(quote.quote_date))}</td></tr>
        ${layout.showResponsible ? `<tr><td>ผู้รับผิดชอบ</td><td>${escapeHtml(quote.sale_person_name || "-")}</td></tr>` : ""}
      </table>
    </header>
    @@SLOT_TOP@@
    ${layout.showCustomer ? `<section class="qh-customer" data-pp="customer">
      <div><span class="label">ลูกค้า:</span> ${escapeHtml(quote.customer_name || "-")}</div>
      ${quote.customer_address ? `<div><span class="label">ที่อยู่:</span> ${escapeHtml(quote.customer_address)}</div>` : ""}
      ${layout.showPhone && quote.customer_phone ? `<div><span class="label">เบอร์โทร:</span> ${escapeHtml(quote.customer_phone)}</div>` : ""}
    </section>` : ""}`;
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
  <title>${escapeHtml(docFileName("ใบเสนอราคา", quote.quote_number))}</title>
  <base href="${escapeHtml(origin || "/")}">
  ${isCards ? printPartFontLinks(layout.partStyles) : ""}
  <style>
    /* ขอบกระดาษอยู่ "ในตัวเอกสาร" (padding ของ .page) ไม่ใช่ที่ @page — เพราะ Chrome จำค่า Margins ล่าสุดไว้
       ถ้าผู้ใช้เคยตั้ง None (เช่น ตอนพิมพ์สติกเกอร์/บาร์โค้ด) ค่าขอบใน @page จะถูกทิ้ง → เนื้อหาชิดขอบกระดาษ เส้นกรอบซ้าย-ขวาหาย
       box-decoration-break: clone = เว้นขอบบน/ล่างซ้ำทุกหน้ากระดาษ (เอกสารยาวหลายหน้าไม่ชิดขอบ) */
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #000; font-family: Tahoma, "Sarabun", Arial, sans-serif; font-size: ${layout.fontSizePx}px; }
    .page { width: 210mm; min-height: 297mm; padding: ${layout.topMarginMm}mm ${layout.horizontalMarginMm}mm ${layout.bottomMarginMm}mm; margin: 0 auto; background: #fff; display: flex; flex-direction: column; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
    .company { text-align: center; line-height: 1.25; }
    .company-name { font-size: 15px; font-weight: 700; }
    .company-address { font-size: 10px; }
    h1 { text-align: center; font-size: 22px; margin: 12px 0 22px; }
    .header-box { display: grid; grid-template-columns: 1.4fr 1fr; border: 1px solid #000; min-height: 30mm; margin-bottom: 2mm; }
    .header-left, .header-right { padding: 4mm; }
    .header-right { border-left: 1px solid #000; text-align: right; display: flex; flex-direction: column; justify-content: center; }
    .header-no-customer { grid-template-columns: 1fr; min-height: 0; width: 50%; margin-left: auto; }
    .header-no-customer .header-right { border-left: 0; }
    .label { font-weight: 700; }
    .grand-box { margin-top: 4mm; border: 0.6mm solid #000; border-radius: 3mm; padding: 3mm 5mm; break-inside: avoid; page-break-inside: avoid; }
    .grand-sub { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 1mm 8mm; font-size: 13px; color: #333; }
    .grand-main { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4mm; margin-top: 1mm; }
    .grand-main .g-label { font-size: 18px; font-weight: 700; }
    .grand-main .g-amount { font-size: 28px; font-weight: 700; }
    .grand-text { text-align: right; font-size: 13px; margin-top: 1mm; }
    .card-note { margin-top: 4mm; border: 1px solid #000; padding: 2mm; min-height: 12mm; break-inside: avoid; page-break-inside: avoid; }
    .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .items th, .items td { border: 1px solid #000; padding: 2mm 1.5mm; vertical-align: middle; }
    .items th { text-align: center; font-weight: 700; line-height: 1.1; }
    .items tbody tr { height: ${layout.rowHeightMm}mm; }
    .items thead { display: table-header-group; }
    .items tr { break-inside: avoid; page-break-inside: avoid; }
    .center { text-align: center; }
    .right { text-align: right; }
    .code { font-size: 10px; }
    ${layout.showImage ? `.photo-cell { padding: 1mm !important; text-align: center; }
    .photo-cell img { width: 100%; height: ${layout.imageSizeMm}mm; object-fit: contain; display: block; }` : ""}
    .items tbody tr.summary-row { height: auto; }
    .summary-row td { height: auto !important; padding: 1.5mm; }
    .bottom { display: grid; grid-template-columns: 1.95fr 1fr; border: 1px solid #000; margin-top: -1px; break-inside: avoid; page-break-inside: avoid; }
    .bottom-no-note { width: 42%; margin-left: auto; grid-template-columns: 1fr; border-top: 1px solid #000; }
    .note { border-right: 1px solid #000; min-height: 18mm; padding: 2mm; }
    .bottom-note-only { grid-template-columns: 1fr; }
    .bottom-note-only .note { border-right: 0; }
    .totals { width: 100%; border-collapse: collapse; }
    .totals td { border-bottom: 1px solid #000; padding: 2mm; }
    .totals tr:last-child td { border-bottom: 0; font-weight: 700; }
    .amount-text { text-align: center; font-weight: 700; padding: 3mm 0 1mm; }
    .closing { margin-top: ${signatureMarginTop}; display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; }
    .signatures { break-inside: avoid; page-break-inside: avoid; display: grid; grid-template-columns: 1fr 1fr; gap: 28mm; padding: ${layout.signatureGapMm}mm 18mm 0; }
    .signature { text-align: center; position: relative; min-height: 24mm; }
    .signature-assets { position: absolute; left: 50%; bottom: 7mm; width: 0; height: 0; pointer-events: none; }
    .signature-image, .stamp-image { position: absolute; bottom: 0; left: 0; max-height: 24mm; object-fit: contain; }
    .stamp-image { opacity: 0.9; }
    .sig-line { border-top: 1px solid #000; padding-top: 2mm; font-weight: 700; }
    .sig-date { font-size: 10px; margin-top: 1mm; }
    .signatures-single { grid-template-columns: minmax(0, 0.5fr); justify-content: end; }
    .terms-box { margin-top: 4mm; border: 1px solid #bbb; border-radius: 2mm; padding: 2mm 3mm; font-size: 11px; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; }
    .qh { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; border-bottom: 0.6mm solid #111; padding-bottom: 3mm; margin-bottom: 4mm; }
    .qh-left { min-width: 0; }
    .qh-company { font-size: ${15 + h}px; font-weight: 700; line-height: 1.25; }
    .qh-address { font-size: ${Math.max(8, 10 + h)}px; color: #444; }
    .qh-title { font-size: ${24 + h}px; font-weight: 700; margin-top: 2mm; }
    .qh-meta { flex: none; border: 0.3mm solid #ccc; border-radius: 2mm; border-collapse: separate; padding: 1.5mm 3mm; font-size: ${12 + h}px; }
    .qh-meta td { padding: 0.6mm 0; white-space: nowrap; }
    .qh-meta td:first-child { color: #666; padding-right: 6mm; }
    .qh-meta td:last-child { font-weight: 700; text-align: right; }
    .qh-customer { border: 0.3mm solid #ccc; border-radius: 2mm; padding: 2mm 3mm; margin-bottom: 4mm; line-height: 1.5; }
    .pb { margin: 0 0 3mm; break-inside: avoid; page-break-inside: avoid; }
    .pb-text { font-size: 12px; line-height: 1.5; }
    .pb-img { display: flex; align-items: center; justify-content: flex-start; overflow: hidden; }
    .pb-img img { height: 100%; width: auto; max-width: 100%; object-fit: contain; }
    .pb-hr { border: 0; border-top: 0.4mm solid #bbb; margin: 3mm 0; }
    .pb-fields { font-size: 12px; line-height: 1.5; }
    .pb-fields .pbf-l { color: #666; }
    .pb-stack .pbf { display: block; }
    .pb-cols2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6mm; }
    .pb-empty { display: none; }
    @media screen { .pb-empty { display: block; font-size: 11px; color: #999; border: 1px dashed #ccc; padding: 2mm; } }
    .pp-slot { display: none; }
    ${isCards ? printPartCss(layout.partStyles, [...QUOTE_CARD_PARTS, ...printBlockPartDefs(layout.cardFields, layout.pageBlocks)]) : ""}
    @media print {
      body { background: #fff; }
      /* ขอบกระดาษ = padding ของ .page (ดู @page ข้างบน) → หน้าเอกสารสูงเกือบเท่ากระดาษ (ลายเซ็นชิดล่างในหน้าเดียว, ยาวกว่านั้นขึ้นหน้าใหม่เอง) */
      .page { box-shadow: none; margin: 0; width: auto; min-height: calc(297mm - 1mm); }
    }
  </style>
</head>
<body>
  <main class="page">
    ${isCards ? cardsHeader.replace("@@SLOT_TOP@@", () => pageSlotHtml(layout, origin, "top", pageValues)) + pageSlotHtml(layout, origin, "before", pageValues) : `<div class="company">
      <div class="company-name">${escapeHtml(COMPANY_NAME)}</div>
      <div class="company-address">${escapeHtml(COMPANY_ADDRESS)}</div>
    </div>
    <h1>ใบเสนอราคา</h1>

    <section class="header-box${layout.showCustomer ? "" : " header-no-customer"}">
      ${layout.showCustomer ? `<div class="header-left">
        <div><span class="label">ลูกค้า / Customer</span></div>
        <div><span class="label">ชื่อ:</span> ${escapeHtml(quote.customer_name || "-")}</div>
        <div><span class="label">ที่อยู่:</span> ${escapeHtml(quote.customer_address || "")}</div>
        ${layout.showPhone ? `<div><span class="label">เบอร์โทร:</span> ${escapeHtml(quote.customer_phone || "")}</div>` : ""}
      </div>` : ""}
      <div class="header-right">
        <div><span class="label">วันที่:</span> ${escapeHtml(thaiDate(quote.quote_date))}</div>
        <div><span class="label">เลขที่ใบเสนอราคา:</span> ${escapeHtml(quote.quote_number || "-")}</div>
        ${layout.showResponsible ? `<div><span class="label">ผู้รับผิดชอบ:</span> ${escapeHtml(quote.sale_person_name || "-")}</div>` : ""}
      </div>
    </section>`}

    ${isCards ? buildQuoteCards(quote, origin, layout) : `<table class="items">
      <colgroup>
        <col style="width: 6%">
        ${layout.showSku ? `<col style="width: 13%">` : ""}
        <col style="width: ${nameColPct}%">
        ${layout.showImage ? `<col style="width: ${imageColPct}%">` : ""}
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
        ${layout.showTotals ? `<tr class="summary-row">
          <td></td>
          <td colspan="${summaryLabelColspan}" class="center">รวม</td>
          <td class="right">${formatQty(totalQty)}</td>
          <td></td>
          <td></td>
          <td class="right">${formatMoney(subtotal)}</td>
        </tr>` : ""}
      </tbody>
    </table>`}

    ${isCards ? `${pageSlotHtml(layout, origin, "after", pageValues)}${cardsNote}${cardsGrand}` : layout.showTotals ? `<section class="bottom${layout.showNote ? "" : " bottom-no-note"}">
      ${layout.showNote ? `<div class="note"><span class="label">หมายเหตุ :</span><br>${escapeHtml(quote.note || "")}</div>` : ""}
      <table class="totals">
        <tr><td class="label">รวมเงิน</td><td class="right">${formatMoney(subtotal)}</td></tr>
        <tr><td class="label">${escapeHtml(vatLabel)}</td><td class="right">${formatMoney(quote.total_vat)}</td></tr>
        <tr><td class="label">จำนวนเงินทั้งสิ้น</td><td class="right">${formatMoney(quote.grand_total)}</td></tr>
      </table>
    </section>

    <div class="amount-text">(${escapeHtml(thaiBahtText(quote.grand_total))})</div>`
    : layout.showNote ? `<section class="bottom bottom-note-only"><div class="note"><span class="label">หมายเหตุ :</span><br>${escapeHtml(quote.note || "")}</div></section>` : ""}
    ${termsHtml}
    ${isCards ? pageSlotHtml(layout, origin, "end", pageValues) : ""}

    <div class="closing"${isCards ? ` data-pp="sign"` : ""}>
    <section class="signatures${layout.showCustomerApproval ? "" : " signatures-single"}">
      ${layout.showCustomerApproval ? `<div class="signature">
        <div class="sig-line">ลูกค้าอนุมัติ</div>
      </div>` : ""}
      <div class="signature authorized-signature">
        ${(authorizedSignatureImage || companyStampImage) ? `<div class="signature-assets">${authorizedSignatureImage}${companyStampImage}</div>` : ""}
        <div class="sig-line">ลายเซ็นผู้มีอำนาจ</div>
        <div class="sig-date">${escapeHtml(thaiDate(quote.quote_date))}</div>
      </div>
    </section>
    </div>
  </main>
</body>
</html>`;
}

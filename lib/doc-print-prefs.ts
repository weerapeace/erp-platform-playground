/**
 * ของกลาง — "ตั้งค่าการพิมพ์เอกสาร" (เลือกแม่แบบ + เลือกคอลัมน์ที่จะโชว์)
 *
 * ใช้กับเอกสารชนิดไหนก็ได้ แยกด้วย entity_type (so / po / qt / billing_note …)
 * เก็บเป็นค่ากลางของระบบใน ui_config key `doc_print_<entity_type>`
 * → ตั้งครั้งเดียว ทุกคนพิมพ์ได้หน้าตาเดียวกัน (ไม่ใช่ต่างคนต่างตั้ง)
 *
 * วิธีที่แม่แบบเอาไปใช้ (2 แบบ):
 *   1) ห่อ <th>/<td> ด้วย {{#col_<key>}}…{{/col_<key>}} และใช้ {{totals_colspan}} ในแถวสรุปยอด (เปิด/ปิดคอลัมน์อย่างเดียว)
 *   2) ตาราง "ปรับได้เต็มที่" — แม่แบบวาง {{{lines_table}}} แล้วหน้าพิมพ์สร้างตารางด้วย renderDocTable()
 *      ได้ ความกว้าง (มม.) · ชื่อหัวคอลัมน์ · ลำดับ · ขนาดตัวอักษร · ระยะในแถว · เส้นตาราง (เอกสารที่อยู่ใน DOC_TABLE_SETUP)
 */

export type DocColumn = {
  key: string;
  label: string;
  /** เปิดไว้ตั้งแต่แรกไหม */
  on: boolean;
  /** ปิดไม่ได้ (เอกสารขาดไม่ได้ เช่น ชื่อสินค้า/จำนวนเงิน) */
  locked?: boolean;
  /** (ตารางปรับได้) จัดชิด: c = กลาง · r = ขวา */
  align?: "c" | "r";
  /** (ตารางปรับได้) ห้ามตัดบรรทัดตอนยังไม่ตั้งความกว้าง — กันเลขเอกสาร/วันที่ตกเป็น 2 บรรทัด */
  nowrap?: boolean;
  /** (ตารางปรับได้) คอลัมน์ "ที่เหลือ" — ไม่เก็บความกว้าง ได้พื้นที่ที่เหลือทั้งหมด */
  flex?: boolean;
};

/**
 * คอลัมน์ที่เลือกเปิด-ปิดได้ ของเอกสารแต่ละชนิด
 * เพิ่มชนิดใหม่ = เพิ่ม key ตรงนี้ที่เดียว แล้วห่อ section ในแม่แบบให้ตรงกัน
 */
export const DOC_COLUMNS: Record<string, DocColumn[]> = {
  so: [
    { key: "idx",          label: "ลำดับ",           on: true },
    { key: "sku",          label: "รหัสสินค้า",       on: true },
    { key: "product_name", label: "รายการสินค้า",     on: true, locked: true },
    { key: "qty",          label: "จำนวน",            on: true },
    { key: "unit",         label: "หน่วย",            on: false },
    { key: "unit_price",   label: "ราคาต่อหน่วย",     on: true },
    { key: "discount",     label: "ส่วนลด",           on: false },
    { key: "vat",          label: "VAT รายบรรทัด",    on: false },
    { key: "line_total",   label: "จำนวนเงิน",        on: true, locked: true },
  ],
  billing_note: [
    { key: "idx",          label: "ลำดับ",            on: true, align: "c", nowrap: true },
    { key: "so_number",    label: "เลขที่บิล",         on: true, locked: true, nowrap: true },
    { key: "bill_date",    label: "วันที่บิล",          on: true, align: "c", nowrap: true },
    { key: "due_date",     label: "วันที่ครบกำหนด",    on: true, align: "c", nowrap: true },
    { key: "amount",       label: "จำนวนเงิน",        on: true, align: "r", nowrap: true },
    { key: "vat_amount",   label: "ภาษี",             on: true, align: "r", nowrap: true },
    { key: "total_amount", label: "จำนวนเงิน",        on: true, locked: true, align: "r", nowrap: true },
    { key: "note",         label: "หมายเหตุ",         on: true, flex: true },
  ],
};

/**
 * เอกสารที่ใช้ "ตารางปรับได้" (renderDocTable) + สิทธิ์อ่าน/บันทึกค่ากลาง + พื้นที่กว้างของกระดาษ (มม.)
 * ไม่อยู่ในนี้ = ใช้แบบเปิด/ปิดคอลัมน์อย่างเดียว · บันทึกค่ากลางด้วยสิทธิ์ products.edit (แบบเดิม)
 */
export const DOC_TABLE_SETUP: Record<string, { view: string; edit: string; contentMm: number; tableClass: string }> = {
  // A4 แนวตั้ง 210 − ขอบซ้ายขวา 12+12 มม. (custom_css ของแม่แบบ) · เจ้าของเลือกให้ "คนที่แก้ใบขายได้" บันทึกค่าเริ่มต้น
  billing_note: { view: "so.view", edit: "so.edit", contentMm: 186, tableClass: "bn-lines" },
};

/** สิทธิ์อ่าน/บันทึกค่าตั้งการพิมพ์ ตาม key ใน ui_config (null = ไม่ใช่ key ตั้งค่าการพิมพ์ที่มีสิทธิ์เฉพาะ) */
export function docPrintPerms(uiConfigKey: string): { view: string; edit: string } | null {
  const m = /^doc_print_(.+)$/.exec(uiConfigKey);
  const setup = m ? DOC_TABLE_SETUP[m[1]] : undefined;
  return setup ? { view: setup.view, edit: setup.edit } : null;
}

/** เส้นตาราง: "" = ตามแม่แบบ · all = ทุกเส้น · h = เส้นนอนอย่างเดียว · none = ไม่มีเส้น */
export type DocBorder = "" | "all" | "h" | "none";

export type DocPrintStyle = {
  /** ขนาดตัวอักษรในตาราง (pt) — ไม่ตั้ง = ตามแม่แบบ */
  font_pt?: number;
  /** ระยะบน-ล่างในแถว (มม.) — ไม่ตั้ง = ตามแม่แบบ */
  row_pad_mm?: number;
  border?: DocBorder;
  /** ความหนาเส้น (มม. — ห้ามใช้ px: จอ/กระดาษวาดบางกว่า 1px ต่างกัน) */
  border_mm?: number;
};

export type DocPrintPrefs = {
  /** id ของแม่แบบที่เลือกไว้ (ว่าง = ใช้ตัวตั้งต้นของระบบ) */
  template_id: string;
  /** คอลัมน์ที่เปิดอยู่ { key: true/false } */
  columns: Record<string, boolean>;
  /** (ตารางปรับได้) ลำดับคอลัมน์ */
  order?: string[];
  /** (ตารางปรับได้) ความกว้าง มม. — ไม่มี key = อัตโนมัติ */
  widths?: Record<string, number>;
  /** (ตารางปรับได้) ชื่อหัวคอลัมน์ที่ตั้งเอง */
  labels?: Record<string, string>;
  style?: DocPrintStyle;
  /** พิมพ์ต้นฉบับ + สำเนา (แต่ละใบ = 2 หน้า) — ช่อง {{copy_label}} ในแม่แบบ (เจ้าของ 2026-11-10) */
  copies?: boolean;
};

export const DOC_WIDTH_MIN_MM = 6;
export const DOC_WIDTH_MAX_MM = 150;
export const DOC_FONT_PT = { min: 8, max: 20 };
export const DOC_ROW_PAD_MM = { min: 0.3, max: 5 };
export const DOC_BORDER_MM = { min: 0.05, max: 1, def: 0.12 };

export const defaultPrefs = (entityType: string): DocPrintPrefs => ({
  template_id: "",
  columns: Object.fromEntries((DOC_COLUMNS[entityType] ?? []).map((c) => [c.key, c.on])),
});

export const prefsKey = (entityType: string) => `doc_print_${entityType}`;

const clampNum = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};

/** ลำดับคอลัมน์: คงลำดับที่บันทึกไว้ · คอลัมน์ที่เพิ่มใหม่ทีหลังแทรกตรงตำแหน่งค่าเริ่มต้นของมัน (ไม่ไปกองท้าย) */
function normalizeOrder(entityType: string, raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const defs = (DOC_COLUMNS[entityType] ?? []).map((c) => c.key);
  const out = [...new Set(raw.map(String))].filter((k) => defs.includes(k));
  defs.forEach((k, i) => {
    if (out.includes(k)) return;
    const prev = defs.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
  });
  return out;
}

/** รวมค่าที่บันทึกไว้กับค่าเริ่มต้น — คอลัมน์ที่เพิ่มใหม่ทีหลังจะได้ค่าเริ่มต้นเอง ไม่หายไป */
export function normalizePrefs(entityType: string, raw: unknown): DocPrintPrefs {
  const base = defaultPrefs(entityType);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DocPrintPrefs>;
  const defs = DOC_COLUMNS[entityType] ?? [];
  const cols = { ...base.columns };
  if (r.columns && typeof r.columns === "object") {
    for (const c of defs) {
      const v = (r.columns as Record<string, unknown>)[c.key];
      if (typeof v === "boolean") cols[c.key] = c.locked ? true : v;
    }
  }
  const out: DocPrintPrefs = { template_id: typeof r.template_id === "string" ? r.template_id : "", columns: cols };

  const order = normalizeOrder(entityType, r.order);
  if (order) out.order = order;
  if (r.widths && typeof r.widths === "object") {
    const widths: Record<string, number> = {};
    for (const c of defs) {
      if (c.flex) continue;
      const w = clampNum((r.widths as Record<string, unknown>)[c.key], DOC_WIDTH_MIN_MM, DOC_WIDTH_MAX_MM);
      if (w !== undefined) widths[c.key] = w;
    }
    if (Object.keys(widths).length) out.widths = widths;
  }
  if (r.labels && typeof r.labels === "object") {
    const labels: Record<string, string> = {};
    for (const c of defs) {
      const v = (r.labels as Record<string, unknown>)[c.key];
      if (typeof v === "string") labels[c.key] = v.slice(0, 40);
    }
    if (Object.keys(labels).length) out.labels = labels;
  }
  if (r.style && typeof r.style === "object") {
    const s = r.style as Record<string, unknown>;
    const style: DocPrintStyle = {};
    const font = clampNum(s.font_pt, DOC_FONT_PT.min, DOC_FONT_PT.max);
    const pad = clampNum(s.row_pad_mm, DOC_ROW_PAD_MM.min, DOC_ROW_PAD_MM.max);
    const bmm = clampNum(s.border_mm, DOC_BORDER_MM.min, DOC_BORDER_MM.max);
    if (font !== undefined) style.font_pt = font;
    if (pad !== undefined) style.row_pad_mm = pad;
    if (s.border === "all" || s.border === "h" || s.border === "none") style.border = s.border;
    if (bmm !== undefined) style.border_mm = bmm;
    if (Object.keys(style).length) out.style = style;
  }
  if (r.copies === true) out.copies = true;
  return out;
}

// ── ต้นฉบับ / สำเนา ─────────────────────────────────────────
/** คำในกล่องบนหัวกระดาษ — แม่แบบใส่ {{copy_label}} ตรงที่อยากให้ขึ้น (ว่าง = ปิดสวิตช์ → ซ่อนกล่องด้วย CSS :empty) */
export const COPY_LABELS = { original: "ต้นฉบับ", copy: "สำเนา" } as const;

/**
 * เปิด "ต้นฉบับ + สำเนา" → แต่ละใบกลายเป็น 2 หน้า เรียงทีละใบ (ต้นฉบับ A · สำเนา A · ต้นฉบับ B · สำเนา B — เจ้าของเลือก 2026-11-10)
 * ปิด → หน้าเดียวต่อใบ copy_label ว่าง · ใช้คู่กับ buildReportHtmlMulti (lib/template)
 */
export function withCopies<T extends Record<string, unknown>>(list: T[], prefs: Pick<DocPrintPrefs, "copies"> | null | undefined): (T & { copy_label: string })[] {
  if (!prefs?.copies) return list.map((d) => ({ ...d, copy_label: "" }));
  return list.flatMap((d) => [{ ...d, copy_label: COPY_LABELS.original }, { ...d, copy_label: COPY_LABELS.copy }]);
}

/** แม่แบบนี้มีช่องคำว่าต้นฉบับ/สำเนาไหม — ไม่มี = แผงตั้งค่าเตือน (เปิดสวิตช์ได้ แต่จะไม่เห็นคำบนกระดาษ) */
export function templateHasCopyLabel(tpl: { header_html?: string | null; body_html?: string | null; footer_html?: string | null } | null | undefined): boolean {
  if (!tpl) return false;
  return /\{\{\{?\s*copy_label\s*\}?\}\}/.test(`${tpl.header_html ?? ""}${tpl.body_html ?? ""}${tpl.footer_html ?? ""}`);
}

/**
 * แปลงเป็น token สำหรับแม่แบบ: col_<key> = "1" / ""
 * + totals_colspan = จำนวนคอลัมน์ที่เปิดอยู่ ลบคอลัมน์ยอดเงิน (แถวสรุปกินพื้นที่ที่เหลือ)
 */
export function columnTokens(entityType: string, prefs: DocPrintPrefs): Record<string, string> {
  const cols = DOC_COLUMNS[entityType] ?? [];
  const out: Record<string, string> = {};
  let shown = 0;
  for (const c of cols) {
    const on = c.locked ? true : prefs.columns[c.key] !== false;
    out[`col_${c.key}`] = on ? "1" : "";
    if (on) shown += 1;
  }
  out.totals_colspan = String(Math.max(1, shown - 1));
  out.line_colspan = String(Math.max(1, shown));
  return out;
}

/** คอลัมน์ตามลำดับที่ตั้ง + ชื่อหัวที่ตั้งเอง + เปิดอยู่ไหม (ใช้ทั้งแผงตั้งค่าและตัวสร้างตาราง) */
export function docColumnsOrdered(entityType: string, prefs: DocPrintPrefs): (DocColumn & { shown: boolean; widthMm?: number })[] {
  const defs = DOC_COLUMNS[entityType] ?? [];
  const order = prefs.order ?? defs.map((c) => c.key);
  return order.map((k) => defs.find((c) => c.key === k)).filter((c): c is DocColumn => !!c).map((c) => ({
    ...c,
    label: prefs.labels?.[c.key] ?? c.label,
    shown: c.locked ? true : prefs.columns[c.key] !== false,
    widthMm: c.flex ? undefined : prefs.widths?.[c.key],
  }));
}

/** ความกว้างที่ตั้งไว้รวมกัน (มม.) — ใช้เตือน "เกินกระดาษ" */
export function docWidthUsedMm(entityType: string, prefs: DocPrintPrefs): number {
  return docColumnsOrdered(entityType, prefs).filter((c) => c.shown && c.widthMm).reduce((s, c) => s + (c.widthMm ?? 0), 0);
}

// ข้อความจากข้อมูลลงตาราง — กัน HTML และ {{ }} ของแม่แบบ
const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"'{}]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * สร้างตารางรายการตามค่าตั้ง → วางในแม่แบบด้วย {{{lines_table}}}
 *   คง class ตารางของแม่แบบ (DOC_TABLE_SETUP.tableClass) → CSS เดิม (ฟอนต์/เส้น/แถวเติม) ยังใช้ได้
 *   ค่าที่ตั้งเพิ่มเขียนเป็น CSS ที่ specificity สูงกว่า (.doc-t.doc-t) → ชนะทั้งบนจอและตอนพิมพ์ ไม่ต้องแก้ CSS แม่แบบ
 *   th/col มี data-col → ลากขอบปรับความกว้างในพรีวิวได้ (attachColumnResize)
 */
export function renderDocTable(
  entityType: string,
  prefs: DocPrintPrefs,
  rows: Record<string, unknown>[],
  opts: { filler?: boolean } = {},
): string {
  const setup = DOC_TABLE_SETUP[entityType];
  const cols = docColumnsOrdered(entityType, prefs).filter((c) => c.shown);
  const fixed = cols.some((c) => c.widthMm);
  const s = prefs.style ?? {};
  const T = ".doc-t.doc-t";
  const css: string[] = [
    ".doc-t.fixed{table-layout:fixed;}",
    ".doc-t:not(.fixed) .nw{white-space:nowrap;}",
    ".doc-t td{overflow-wrap:anywhere;}",
  ];
  if (s.font_pt) css.push(`${T} th,${T} td{font-size:${s.font_pt}pt;}`);
  if (s.row_pad_mm) css.push(`${T} tbody td{padding-top:${s.row_pad_mm}mm;padding-bottom:${s.row_pad_mm}mm;}`);
  const bw = `${s.border_mm ?? DOC_BORDER_MM.def}mm`;
  if (s.border === "all") css.push(`${T} th,${T} td{border:${bw} solid #555;}`);
  else if (s.border === "h") css.push(`${T} th,${T} td{border:0;border-bottom:${bw} solid #888;}${T} thead th{border-top:${bw} solid #888;}`);
  else if (s.border === "none") css.push(`${T} th,${T} td{border:0;}`);
  else if (s.border_mm) css.push(`${T} th,${T} td{border-width:${bw};}`);

  const cls = (c: DocColumn) => [c.align ?? "", c.nowrap ? "nw" : ""].filter(Boolean).join(" ");
  const colgroup = cols.map((c) =>
    `<col data-col="${c.key}"${c.flex ? ' data-flex="1"' : ""}${c.widthMm ? ` style="width:${c.widthMm}mm"` : ""}>`).join("");
  const head = cols.map((c) => `<th data-col="${c.key}" class="${cls(c)}">${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${cls(c)}">${esc(r[c.key])}</td>`).join("")}</tr>`).join("");
  const filler = opts.filler ? `<tr class="filler">${cols.map((c) => `<td class="${cls(c)}"></td>`).join("")}</tr>` : "";
  return `<style>${css.join("")}</style>`
    + `<table class="${setup?.tableClass ?? ""} doc-t${fixed ? " fixed" : ""}" data-doc-table="${entityType}">`
    + `<colgroup>${colgroup}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}${filler}</tbody></table>`;
}

/**
 * 🖨 ตั้งค่าหน้าพิมพ์ "รายการ" (ของกลาง) — ใบพิมพ์แบบตาราง ปรับได้เองจากแผงข้างพรีวิว (components/report/list-print-panel)
 *   กระดาษ A4/A5 แนวตั้ง/นอน · ขนาดตัวอักษร · ขนาดรูป · ความแน่นแถว · แถวสลับสี
 *   คอลัมน์ (เปิด/ปิด · ลำดับ · ชื่อหัว · ช่องว่างให้เขียนมือ) · เรียง/จัดกลุ่ม/ขึ้นหน้าใหม่ทุกกลุ่ม
 *   หัว-ท้าย: ชื่อรายงาน · หัวบริษัท (โลโก้) · เลขหน้า · ช่องเซ็นท้ายใบ
 * pure ไม่มี "use client" — ใช้ได้ทั้งหน้าจอ/เทสต์ · ใช้ครั้งแรก: ใบพิมพ์บอร์ดจ่ายงาน (lib/work-board-print) · เอกสาร docs/list-print.md
 */

export type ListPrintPaper = "A4" | "A5";
export type ListPrintOrientation = "portrait" | "landscape";
export type ListPrintImage = "none" | "s" | "m" | "l";
export type ListPrintDensity = "compact" | "normal" | "airy";

/** คอลัมน์ที่รายงานนั้นมีให้เลือก */
export interface ListPrintColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** ตัวอักษรแบบรหัส (รหัส MO / SKU) */
  mono?: boolean;
  /** ช่องว่างให้เขียนมือ (หมายเหตุ / ตรวจแล้ว / ลายเซ็นรับ) */
  blank?: "line" | "box";
  /** ความกว้างแนะนำ (มม.) — ไม่ใส่ = ยืดตามเนื้อหา */
  widthMm?: number;
}
/** ค่าที่ผู้ใช้ตั้งต่อคอลัมน์ (ลำดับ = ลำดับในอาร์เรย์) */
export interface ListPrintColumnPref {
  key: string;
  on: boolean;
  /** ชื่อหัวคอลัมน์ที่แก้เอง (ว่าง = ชื่อเดิม) · ช่องที่เพิ่มเอง (c_…) ต้องมีชื่อ */
  label?: string;
  /** ช่องเขียนมือ: แบบช่อง (เส้นให้เขียน / ช่องติ๊ก) — ใช้กับช่องที่เพิ่มเอง + ช่องสำเร็จรูป */
  blank?: "line" | "box";
  /** ช่องเขียนมือ: ความกว้าง (มม.) */
  widthMm?: number;
}

export interface ListPrintSettings {
  paper: ListPrintPaper;
  orientation: ListPrintOrientation;
  fontPx: number;
  image: ListPrintImage;
  density: ListPrintDensity;
  zebra: boolean;
  columns: ListPrintColumnPref[];
  sortBy: string;
  groupBy: string;
  pageBreakPerGroup: boolean;
  /** ชื่อรายงาน (ว่าง = ชื่อตั้งต้นของรายงาน) */
  title: string;
  /** หัวบริษัท (โลโก้ + ชื่อ) — null = ไม่แสดง */
  companyId: string | null;
  pageNumbers: boolean;
  signature: boolean;
}

export interface ListPrintPreset {
  id: string;
  name: string;
  settings: Partial<ListPrintSettings>;
}

/** แบบของทีม (ui_config · แอดมินแก้ · ทุกคนที่ล็อกอินอ่านได้) = { [family]: ListPrintPreset[] } · แบบของฉัน = user_ui_prefs "print_presets:<family>" */
export const PRINT_TEAM_PRESETS_KEY = "admin_print_presets";

export const FONT_MIN = 9;
export const FONT_MAX = 14;
/** ขนาดรูปในกระดาษ (มม.) */
export const IMAGE_MM: Record<ListPrintImage, number> = { none: 0, s: 8, m: 13, l: 20 };
/** ระยะบน-ล่างในช่อง (มม.) */
export const DENSITY_MM: Record<ListPrintDensity, number> = { compact: 0.7, normal: 1.4, airy: 2.4 };
export const IMAGE_LABEL: Record<ListPrintImage, string> = { none: "ไม่แสดง", s: "เล็ก", m: "กลาง", l: "ใหญ่" };
export const DENSITY_LABEL: Record<ListPrintDensity, string> = { compact: "กระชับ", normal: "ปกติ", airy: "โปร่ง" };

/** ช่องว่างให้เขียนมือ — เพิ่มได้ทุกรายงาน */
export const EXTRA_COLUMNS: ListPrintColumn[] = [
  { key: "x_note", label: "หมายเหตุ", blank: "line", widthMm: 32 },
  { key: "x_check", label: "ตรวจแล้ว", blank: "box", widthMm: 13, align: "center" },
  { key: "x_sign", label: "ลายเซ็นรับ", blank: "line", widthMm: 26 },
];
const EXTRA_BY_KEY = new Map(EXTRA_COLUMNS.map((c) => [c.key, c]));
/** ช่องที่ผู้ใช้เพิ่มเองและตั้งชื่อเอง (key = "c_<รหัส>") — เพิ่มได้หลายช่อง */
export const isCustomColumn = (key: string) => /^c_[a-z0-9]{1,12}$/.test(key);
/** ช่องเขียนมือ (สำเร็จรูป หรือ เพิ่มเอง) — ลบออกจากรายการได้ */
export const isExtraColumn = (key: string) => EXTRA_BY_KEY.has(key) || isCustomColumn(key);
export const MAX_CUSTOM_COLUMNS = 8;
/** ความกว้างช่องเขียนมือให้เลือก (มม.) */
export const BLANK_WIDTHS: { mm: number; label: string }[] = [{ mm: 14, label: "แคบ" }, { mm: 25, label: "กลาง" }, { mm: 40, label: "กว้าง" }];
/** ช่องใหม่ที่ผู้ใช้ตั้งชื่อเอง */
export const newCustomColumn = (label: string): ListPrintColumnPref => ({
  key: `c_${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1296).toString(36)}`,
  on: true, label: label.trim().slice(0, 40), blank: "line", widthMm: 25,
});

const KEY_RE = /^[a-z0-9_]{1,24}$/;
const PAPERS: ListPrintPaper[] = ["A4", "A5"];
const IMAGES: ListPrintImage[] = ["none", "s", "m", "l"];
const DENSITIES: ListPrintDensity[] = ["compact", "normal", "airy"];

export function defaultListPrintSettings(available: ListPrintColumn[], over: Partial<ListPrintSettings> = {}): ListPrintSettings {
  return {
    paper: "A4", orientation: "portrait", fontPx: 11, image: "m", density: "normal", zebra: false,
    columns: available.map((c) => ({ key: c.key, on: true })),
    sortBy: "", groupBy: "", pageBreakPerGroup: false, title: "", companyId: null, pageNumbers: true, signature: false,
    ...over,
  };
}

/** ตรวจค่าที่อ่านจากที่เก็บ — ค่าแปลก ๆ ใช้ค่าตั้งต้นแทน · คอลัมน์ใหม่ที่รายงานเพิ่งมีต่อท้ายให้ (เปิดไว้) */
export function cleanListPrintSettings(raw: unknown, available: ListPrintColumn[], fallback: ListPrintSettings): ListPrintSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T,>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  const font = Number(o.fontPx);
  const seen = new Set<string>();
  const columns: ListPrintColumnPref[] = [];
  if (Array.isArray(o.columns))
    for (const c of o.columns.slice(0, 40)) {
      const x = (c ?? {}) as Record<string, unknown>;
      const key = String(x.key ?? "");
      if (!KEY_RE.test(key) || seen.has(key)) continue;
      if (!available.some((a) => a.key === key) && !isExtraColumn(key)) continue;
      const label = typeof x.label === "string" ? x.label.trim().slice(0, 40) : "";
      if (isCustomColumn(key) && !label) continue;   // ช่องที่เพิ่มเองต้องมีชื่อ
      seen.add(key);
      const pref: ListPrintColumnPref = { key, on: x.on !== false, ...(label ? { label } : {}) };
      if (isExtraColumn(key)) {
        if (x.blank === "line" || x.blank === "box") pref.blank = x.blank;
        const w = Number(x.widthMm);
        if (Number.isFinite(w) && w > 0) pref.widthMm = Math.min(80, Math.max(8, Math.round(w)));
      }
      columns.push(pref);
    }
  const base = Array.isArray(o.columns) ? columns : fallback.columns.map((c) => ({ ...c }));
  for (const a of available) if (!base.some((c) => c.key === a.key)) base.push({ key: a.key, on: true });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    paper: pick(o.paper, PAPERS, fallback.paper),
    orientation: pick(o.orientation, ["portrait", "landscape"] as const, fallback.orientation),
    fontPx: Number.isFinite(font) ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(font))) : fallback.fontPx,
    image: pick(o.image, IMAGES, fallback.image),
    density: pick(o.density, DENSITIES, fallback.density),
    zebra: typeof o.zebra === "boolean" ? o.zebra : fallback.zebra,
    columns: base,
    sortBy: typeof o.sortBy === "string" ? str(o.sortBy, 24) : fallback.sortBy,
    groupBy: typeof o.groupBy === "string" ? str(o.groupBy, 24) : fallback.groupBy,
    pageBreakPerGroup: typeof o.pageBreakPerGroup === "boolean" ? o.pageBreakPerGroup : fallback.pageBreakPerGroup,
    title: typeof o.title === "string" ? str(o.title, 80) : fallback.title,
    companyId: typeof o.companyId === "string" && o.companyId ? str(o.companyId, 64) : o.companyId === null ? null : fallback.companyId,
    pageNumbers: typeof o.pageNumbers === "boolean" ? o.pageNumbers : fallback.pageNumbers,
    signature: typeof o.signature === "boolean" ? o.signature : fallback.signature,
  };
}

/** ใช้ "แบบที่บันทึกไว้" — ค่าที่แบบระบุทับของเดิม · คอลัมน์ในแบบขึ้นก่อนตามลำดับ (ที่เหลือปิดไว้ท้าย) */
export function applyListPrintPreset(current: ListPrintSettings, preset: ListPrintPreset, available: ListPrintColumn[]): ListPrintSettings {
  const p = preset.settings;
  const merged = { ...current, ...p } as ListPrintSettings;
  if (p.columns) {
    const cols = p.columns.filter((c) => available.some((a) => a.key === c.key) || isExtraColumn(c.key)).map((c) => ({ ...c }));
    for (const c of current.columns) if (!cols.some((x) => x.key === c.key) && !isExtraColumn(c.key)) cols.push({ key: c.key, on: false });
    for (const a of available) if (!cols.some((x) => x.key === a.key)) cols.push({ key: a.key, on: false });
    merged.columns = cols;
  }
  return cleanListPrintSettings(merged, available, current);
}

/** คอลัมน์ที่จะพิมพ์จริง ตามลำดับ/ชื่อที่ตั้ง (กรองเหลือเฉพาะที่ส่วนนั้นมี · ปิดรูป = ไม่มีคอลัมน์รูป) */
export function resolveListColumns(s: ListPrintSettings, available: ListPrintColumn[]): ListPrintColumn[] {
  const out: ListPrintColumn[] = [];
  for (const pref of s.columns) {
    if (!pref.on) continue;
    const def = available.find((a) => a.key === pref.key) ?? EXTRA_BY_KEY.get(pref.key)
      ?? (isCustomColumn(pref.key) ? { key: pref.key, label: pref.label ?? "", blank: "line" as const, widthMm: 25 } : undefined);
    if (!def) continue;
    if (def.key === "img" && s.image === "none") continue;
    const col: ListPrintColumn = { ...def, label: pref.label || def.label };
    if (def.blank) {
      col.blank = pref.blank ?? def.blank;
      col.widthMm = pref.widthMm ?? def.widthMm;
      col.align = col.blank === "box" ? "center" : undefined;
    }
    out.push(col);
  }
  return out;
}

export const escapeHtml = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const cellClass = (c: ListPrintColumn) =>
  [c.key === "img" ? "img" : "", c.align === "right" ? "r" : c.align === "center" ? "c" : "", c.mono ? "mono" : "", c.blank ? "xb" : ""].filter(Boolean).join(" ");
const clsAttr = (c: ListPrintColumn) => { const k = cellClass(c); return k ? ` class="${k}"` : ""; };
const blankHtml = (c: ListPrintColumn) => (c.blank === "box" ? `<span class="chk"></span>` : "");

/**
 * ตาราง 1 ก้อน — rows = ค่า HTML ต่อคอลัมน์ (ผู้เรียก escape เอง) · ช่องเขียนมือเว้นว่างให้อัตโนมัติ
 * foot = แถวรวม: label กินช่องซ้ายจนถึงคอลัมน์แรกที่มีค่ารวม
 */
export function renderListTable(cols: ListPrintColumn[], rows: Record<string, string>[], foot?: { label: string; cells: Record<string, string> }): string {
  if (cols.length === 0) return `<div class="wb-empty">ยังไม่ได้เลือกคอลัมน์ที่จะพิมพ์</div>`;
  const colgroup = `<colgroup>${cols.map((c) => `<col${c.widthMm ? ` style="width:${c.widthMm}mm"` : c.key === "img" ? ` class="img"` : ""} />`).join("")}</colgroup>`;
  const thead = `<thead><tr>${cols.map((c) => `<th${clsAttr(c)}>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td${clsAttr(c)}>${c.blank ? blankHtml(c) : r[c.key] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  let tfoot = "";
  if (foot) {
    const first = cols.findIndex((c) => foot.cells[c.key] !== undefined);
    const span = first < 0 ? cols.length : Math.max(1, first);
    const rest = cols.slice(span).map((c) => `<td${clsAttr(c)}>${foot.cells[c.key] ?? ""}</td>`).join("");
    tfoot = `<tfoot><tr><td colspan="${span}">${escapeHtml(foot.label)}</td>${rest}</tr></tfoot>`;
  }
  return `<table class="wb-t${cols.some((c) => c.widthMm) ? " fixed" : ""}">${colgroup}${thead}${tbody}${tfoot}</table>`;
}

/** CSS จากค่าตั้ง — ต่อท้าย custom_css ของรายงาน (ชนะค่าในแม่แบบ) */
export function listPrintCss(s: ListPrintSettings): string {
  const f = s.fontPx;
  const pad = DENSITY_MM[s.density];
  const img = IMAGE_MM[s.image];
  return `
.doc { font-size: ${f}px; }
.wb-title { font-size: ${f + 7}px; }
.wb-t th, .wb-t td, .grp-rows th, .grp-rows td { font-size: ${f}px; padding: ${pad}mm 2mm; }
.wb-t.fixed { table-layout: fixed; }
td.img, th.img, col.img { width: ${img + 2}mm; }
.wb-t td.img { padding: ${Math.min(pad, 1)}mm 1mm; }
.thumb { width: ${img}mm; height: ${img}mm; }
.wb-t td.c, .wb-t th.c { text-align: center; }
.wb-t td.xb { background: transparent; }
.chk { display: inline-block; width: 3.6mm; height: 3.6mm; border: 1px solid #64748b; border-radius: 0.6mm; vertical-align: middle; }
${s.zebra ? ".wb-t tbody tr:nth-child(even) td { background: #f8fafc; }" : ""}
.grp-break { break-before: page; page-break-before: always; }
.wb-co { display: flex; align-items: center; gap: 3mm; }
.wb-logo { height: 11mm; max-width: 38mm; object-fit: contain; }
.wb-co-name { font-size: ${Math.max(9, f - 1)}px; color: #475569; }
.wb-sign { display: flex; justify-content: space-around; gap: 10mm; margin-top: 14mm; break-inside: avoid; page-break-inside: avoid; font-size: ${f}px; color: #334155; }
.wb-sign > div { text-align: center; min-width: 45mm; }
.wb-sign .line { border-bottom: 1px solid #64748b; height: 10mm; margin-bottom: 1.5mm; }
@media print { .doc { padding: 0 12mm !important; } }
@page { margin: 10mm 0 12mm;${s.pageNumbers ? ` @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-size: 9px; color: #64748b; margin-right: 12mm; }` : ""} }`;
}

/** ช่องเซ็นท้ายใบ */
export const signatureHtml = (labels: string[]): string =>
  `<div class="wb-sign">${labels.map((l) => `<div><div class="line"></div>${escapeHtml(l)}</div>`).join("")}</div>`;

/**
 * ประมาณจำนวนหน้า (ไว้บอกก่อนพิมพ์) — คิดจากความสูงแถว (ตัวอักษร/ความแน่น/รูป) · ชื่อยาวขึ้น 2 บรรทัดไม่ได้คิด จึงเป็นค่าประมาณ
 * groups = จำนวนแถวต่อกลุ่ม (มีกลุ่ม) · ไม่มีกลุ่ม = [จำนวนทั้งหมด]
 */
export function estimateListPages(groups: number[], s: ListPrintSettings): number {
  const H = { A4: { portrait: 297, landscape: 210 }, A5: { portrait: 210, landscape: 148 } }[s.paper][s.orientation];
  const usable = H - 22;
  const textRow = s.fontPx * 0.3528 * 1.45 + DENSITY_MM[s.density] * 2;
  const imgRow = s.image === "none" ? 0 : IMAGE_MM[s.image] + 2;
  const rowH = Math.max(textRow, imgRow);
  const headRow = textRow;
  const grouped = groups.length > 1;
  const groupHead = grouped ? 9 : 0;
  const header = 20;
  const sign = s.signature ? 28 : 0;
  if (grouped && s.pageBreakPerGroup) {
    return groups.reduce((acc, n, i) => acc + Math.max(1, Math.ceil(((i === 0 ? header : 0) + groupHead + headRow + n * rowH + (i === groups.length - 1 ? sign : 0)) / usable)), 0);
  }
  const total = header + groups.reduce((a, n) => a + groupHead + headRow + n * rowH, 0) + sign;
  return Math.max(1, Math.ceil(total / usable));
}

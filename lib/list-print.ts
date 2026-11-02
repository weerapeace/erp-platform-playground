/**
 * 🖨 ตั้งค่าหน้าพิมพ์ "รายการ" (ของกลาง) — ใบพิมพ์แบบตาราง ปรับได้เองจากแผงข้างพรีวิว (components/report/list-print-panel)
 *   กระดาษ A4/A5 แนวตั้ง/นอน · ขนาดตัวอักษร · ขนาดรูป · ความแน่นแถว · แถวสลับสี
 *   คอลัมน์ (เปิด/ปิด · ลำดับ · ชื่อหัว · ช่องว่างให้เขียนมือ) · เรียง/จัดกลุ่ม/ขึ้นหน้าใหม่ทุกกลุ่ม
 *   หัว-ท้าย: ชื่อรายงาน · หัวบริษัท (โลโก้) · เลขหน้า · ช่องเซ็นท้ายใบ
 *   คอลัมน์ล็อก (locked = บังคับพิมพ์ ปิดไม่ได้) · ช่อง "พิมพ์เอง" (blank text = พิมพ์ในพรีวิวได้ เก็บผ่าน print-notes) · ค่าเฉพาะใบ (opts)
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
  /** ช่องว่าง: line = เขียนมือ · box = ช่องติ๊ก · text = พิมพ์เองในพรีวิว (ค่ามาจาก rows ตาม LIST_ROW_KEY) */
  blank?: ListPrintBlank;
  /** ความกว้างแนะนำ (มม.) — ไม่ใส่ = ยืดตามเนื้อหา */
  widthMm?: number;
  /** ย่อให้พอดีกระดาษได้ต่ำสุด (มม.) — ไม่ใส่ = รหัส 28 · อื่น ๆ 12 (fitListColumns) */
  minMm?: number;
  /** บังคับพิมพ์ทุกใบ ปิดไม่ได้ (เช่น รูป/รหัส/ชื่อสินค้า) · คอลัมน์รูปที่ล็อก = เลือก "ไม่แสดงรูป" ไม่ได้ */
  locked?: boolean;
}
export type ListPrintBlank = "line" | "box" | "text";
/** ค่าที่ผู้ใช้ตั้งต่อคอลัมน์ (ลำดับ = ลำดับในอาร์เรย์) */
export interface ListPrintColumnPref {
  key: string;
  on: boolean;
  /** ชื่อหัวคอลัมน์ที่แก้เอง (ว่าง = ชื่อเดิม) · ช่องที่เพิ่มเอง (c_…) ต้องมีชื่อ */
  label?: string;
  /** ช่องเขียนมือ: แบบช่อง (เส้นให้เขียน / ช่องติ๊ก / พิมพ์เอง) — ใช้กับช่องที่เพิ่มเอง + ช่องสำเร็จรูป + คอลัมน์ที่มี blank */
  blank?: ListPrintBlank;
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
  /** ค่าเฉพาะของใบนั้น (รายงานตรวจค่าเอง) — ติดไปกับแบบที่บันทึกไว้ด้วย · JSON ล้วน ไม่เกิน OPTS_MAX_CHARS */
  opts: Record<string, unknown>;
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
/** ความกว้างคอลัมน์ที่ปรับได้ (มม.) */
export const MIN_COL_MM = 6;
export const MAX_COL_MM = 150;
export const clampColMm = (mm: number) => Math.min(MAX_COL_MM, Math.max(MIN_COL_MM, Math.round(mm)));
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
const BLANKS: ListPrintBlank[] = ["line", "box", "text"];
export const OPTS_MAX_CHARS = 4000;
/** ค่าเฉพาะใบ: ต้องเป็น object JSON ล้วน ขนาดไม่เกิน OPTS_MAX_CHARS — ไม่งั้นใช้ค่าเดิม */
function cleanOpts(v: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
  try {
    const json = JSON.stringify(v);
    return json.length <= OPTS_MAX_CHARS ? (JSON.parse(json) as Record<string, unknown>) : fallback;
  } catch { return fallback; }
}
const PAPERS: ListPrintPaper[] = ["A4", "A5"];
const IMAGES: ListPrintImage[] = ["none", "s", "m", "l"];
const DENSITIES: ListPrintDensity[] = ["compact", "normal", "airy"];

export function defaultListPrintSettings(available: ListPrintColumn[], over: Partial<ListPrintSettings> = {}): ListPrintSettings {
  return {
    paper: "A4", orientation: "portrait", fontPx: 11, image: "m", density: "normal", zebra: false,
    columns: available.map((c) => ({ key: c.key, on: true })),
    sortBy: "", groupBy: "", pageBreakPerGroup: false, title: "", companyId: null, pageNumbers: true, signature: false, opts: {},
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
      const def = available.find((a) => a.key === key);
      const pref: ListPrintColumnPref = { key, on: x.on !== false || !!def?.locked, ...(label ? { label } : {}) };
      if ((isExtraColumn(key) || def?.blank) && BLANKS.includes(x.blank as ListPrintBlank)) pref.blank = x.blank as ListPrintBlank;
      const w = Number(x.widthMm);
      if (x.widthMm != null && Number.isFinite(w) && w > 0) pref.widthMm = clampColMm(w);
      columns.push(pref);
    }
  const base = Array.isArray(o.columns) ? columns : fallback.columns.map((c) => ({ ...c }));
  for (const a of available) if (!base.some((c) => c.key === a.key)) base.push({ key: a.key, on: true });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  // รูปที่ล็อกไว้ (บังคับพิมพ์) เลือก "ไม่แสดง" ไม่ได้
  const imgLocked = available.some((a) => a.key === "img" && a.locked);
  const image = pick(o.image, IMAGES, fallback.image);
  return {
    paper: pick(o.paper, PAPERS, fallback.paper),
    orientation: pick(o.orientation, ["portrait", "landscape"] as const, fallback.orientation),
    fontPx: Number.isFinite(font) ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(font))) : fallback.fontPx,
    image: imgLocked && image === "none" ? (fallback.image === "none" ? "m" : fallback.image) : image,
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
    opts: cleanOpts(o.opts, fallback.opts ?? {}),
  };
}

/** ใช้ "แบบที่บันทึกไว้" — ค่าที่แบบระบุทับของเดิม · คอลัมน์ในแบบขึ้นก่อนตามลำดับ (ที่เหลือปิดไว้ท้าย) */
export function applyListPrintPreset(current: ListPrintSettings, preset: ListPrintPreset, available: ListPrintColumn[]): ListPrintSettings {
  const p = preset.settings;
  const merged = { ...current, ...p, opts: { ...current.opts, ...(p.opts ?? {}) } } as ListPrintSettings;
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
    const def = available.find((a) => a.key === pref.key) ?? EXTRA_BY_KEY.get(pref.key)
      ?? (isCustomColumn(pref.key) ? { key: pref.key, label: pref.label ?? "", blank: "line" as const, widthMm: 25 } : undefined);
    if (!def) continue;
    if (!pref.on && !def.locked) continue;
    if (def.key === "img" && s.image === "none" && !def.locked) continue;
    const col: ListPrintColumn = { ...def, label: pref.label || def.label };
    // ความกว้างที่ลากปรับเอง (รูป = ตามขนาดรูป ไม่ปรับ)
    if (def.key !== "img") col.widthMm = pref.widthMm ?? def.widthMm;
    if (def.blank) {
      col.blank = pref.blank ?? def.blank;
      col.align = col.blank === "box" ? "center" : undefined;
      // ช่องพิมพ์เองที่ไม่ได้กำหนดกว้าง = 30 มม.
      if (col.blank === "text" && !col.widthMm) col.widthMm = 30;
    }
    out.push(col);
  }
  return out;
}

/** กว้างกระดาษ (มม.) */
const PAPER_W: Record<ListPrintPaper, Record<ListPrintOrientation, number>> = { A4: { portrait: 210, landscape: 297 }, A5: { portrait: 148, landscape: 210 } };
/** ย่อได้ต่ำสุด (มม.) — ตั้งเองต่อคอลัมน์ (minMm) · รหัส (MO/ใบขาย ~14 ตัว) ยังอยู่บรรทัดเดียว · อื่น ๆ (ช่องติ๊ก/เขียน) 12 */
const fitMin = (c: ListPrintColumn) => Math.min(c.widthMm ?? Infinity, c.minMm ?? (c.mono ? 28 : 12));
/**
 * ย่อความกว้างคอลัมน์ให้พอดีหน้ากระดาษ — เปลี่ยนเป็นแนวตั้ง/A5 แล้วตารางเกินขอบ ช่องขวาสุดโดนตัด (เจ้าของเจอ 2026-11-02)
 * พื้นที่ = กว้างกระดาษ − ขอบซ้ายขวาบนจอ (16+16 มม.) · คอลัมน์รูปกว้างตามขนาดรูป (ไม่ย่อ) · คอลัมน์ที่ไม่กำหนดกว้างเผื่อไว้ 20 มม.
 * ย่อตามสัดส่วน ไม่ต่ำกว่าขั้นต่ำของแต่ละช่อง (ช่องที่ชนขั้นต่ำล็อกไว้ แล้วย่อที่เหลือต่อ) · พอดีอยู่แล้ว = ไม่แตะ (ไม่ขยาย)
 * เปิดคอลัมน์เยอะจนขั้นต่ำรวมยังเกิน → ย่อทุกช่องเท่า ๆ กันให้พอดี (ยอมให้ตัดบรรทัด ดีกว่าช่องขวาหลุดกระดาษ)
 */
export function fitListColumns(cols: ListPrintColumn[], s: Pick<ListPrintSettings, "paper" | "orientation" | "image">): ListPrintColumn[] {
  const flex = cols.filter((c) => c.key !== "img" && c.widthMm);
  const room = PAPER_W[s.paper][s.orientation] - 32
    - (cols.some((c) => c.key === "img") ? IMAGE_MM[s.image] + 2 : 0)
    - cols.filter((c) => c.key !== "img" && !c.widthMm).length * 20;
  if (flex.reduce((a, c) => a + c.widthMm!, 0) <= room) return cols;
  const locked = new Set<string>();
  const width = new Map<string, number>();
  for (let guard = 0; guard <= flex.length; guard++) {
    const free = flex.filter((c) => !locked.has(c.key));
    const avail = room - flex.filter((c) => locked.has(c.key)).reduce((a, c) => a + fitMin(c), 0);
    const factor = Math.max(0, avail) / Math.max(1, free.reduce((a, c) => a + c.widthMm!, 0));
    let changed = false;
    for (const c of free) {
      const w = c.widthMm! * factor;
      if (w < fitMin(c)) { locked.add(c.key); changed = true; } else width.set(c.key, Math.round(w * 10) / 10);
    }
    if (!changed) break;
  }
  const final = new Map(flex.map((c) => [c.key, locked.has(c.key) ? fitMin(c) : width.get(c.key) ?? c.widthMm!]));
  const total = [...final.values()].reduce((a, w) => a + w, 0);
  const squeeze = total > room && room > 0 ? room / total : 1;   // ขั้นต่ำรวมยังเกิน → ย่อทุกช่องให้พอดี
  return cols.map((c) => (final.has(c.key) ? { ...c, widthMm: Math.round(final.get(c.key)! * squeeze * 10) / 10 } : c));
}

export const escapeHtml = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const cellClass = (c: ListPrintColumn) =>
  [c.key === "img" ? "img" : "", c.align === "right" ? "r" : c.align === "center" ? "c" : "", c.mono ? "mono" : "", c.blank ? "xb" : ""].filter(Boolean).join(" ");
const clsAttr = (c: ListPrintColumn) => { const k = cellClass(c); return k ? ` class="${k}"` : ""; };
const blankHtml = (c: ListPrintColumn) => (c.blank === "box" ? `<span class="chk"></span>` : "");
const textCls = (c: ListPrintColumn) => { const k = cellClass(c); return ` class="${k ? k + " " : ""}xt"`; };

/** แถวที่มี key นี้ = แถวหัวกลุ่มกลางตาราง (กินทุกคอลัมน์ · ค่า = HTML ผู้เรียก escape เอง) — กลุ่มเยอะแต่แถวน้อย ใช้ตารางเดียว หัวคอลัมน์ครั้งเดียว */
export const LIST_GROUP_ROW = "__group";
/** แถวหัวกลุ่มย่อย (สีอ่อนกว่า) เช่น ร้าน → ใบสั่งซื้อ */
export const LIST_SUBGROUP_ROW = "__subgroup";
/** แถวรวมท้ายกลุ่ม (ชิดขวา กินทุกคอลัมน์ · ค่า = HTML) */
export const LIST_TOTAL_ROW = "__total";
/** รหัสแถว (ไม่พิมพ์) — ช่อง "พิมพ์เอง" ใช้เป็นที่อยู่ของข้อความ: data-note="<รหัสแถว>|<คอลัมน์>" */
export const LIST_ROW_KEY = "__key";
/** ที่อยู่ข้อความในช่องพิมพ์เอง */
export const listNoteKey = (rowKey: string, colKey: string) => `${rowKey}|${colKey}`;

/**
 * ตาราง 1 ก้อน — rows = ค่า HTML ต่อคอลัมน์ (ผู้เรียก escape เอง) · ช่องเขียนมือเว้นว่างให้อัตโนมัติ
 * foot = แถวรวม: label กินช่องซ้ายจนถึงคอลัมน์แรกที่มีค่ารวม · แถวที่มี LIST_GROUP_ROW = แถวหัวกลุ่ม
 */
export function renderListTable(cols: ListPrintColumn[], rows: Record<string, string>[], foot?: { label: string; cells: Record<string, string> }): string {
  if (cols.length === 0) return `<div class="wb-empty">ยังไม่ได้เลือกคอลัมน์ที่จะพิมพ์</div>`;
  // data-col = ให้พรีวิวรู้ว่าขอบไหนคือคอลัมน์ไหน (ลากปรับความกว้าง — components/report/list-print-resize)
  const colgroup = `<colgroup>${cols.map((c) => `<col data-col="${escapeHtml(c.key)}"${c.widthMm ? ` style="width:${c.widthMm}mm"` : c.key === "img" ? ` class="img"` : ""} />`).join("")}</colgroup>`;
  const thead = `<thead><tr>${cols.map((c) => `<th${clsAttr(c)} data-col="${escapeHtml(c.key)}">${escapeHtml(c.label)}</th>`).join("")}</tr></thead>`;
  const cellHtml = (r: Record<string, string>, c: ListPrintColumn) => {
    if (c.blank !== "text") return `<td${clsAttr(c)}>${c.blank ? blankHtml(c) : r[c.key] ?? ""}</td>`;
    const rk = r[LIST_ROW_KEY];
    return `<td${textCls(c)}${rk ? ` data-note="${escapeHtml(listNoteKey(rk, c.key))}"` : ""}>${r[c.key] ?? ""}</td>`;
  };
  const tbody = `<tbody>${rows.map((r) => (r[LIST_GROUP_ROW] !== undefined
    ? `<tr class="grp-row"><td colspan="${cols.length}">${r[LIST_GROUP_ROW]}</td></tr>`
    : r[LIST_SUBGROUP_ROW] !== undefined
      ? `<tr class="grp-row sub"><td colspan="${cols.length}">${r[LIST_SUBGROUP_ROW]}</td></tr>`
      : r[LIST_TOTAL_ROW] !== undefined
        ? `<tr class="grp-total"><td colspan="${cols.length}">${r[LIST_TOTAL_ROW]}</td></tr>`
        : `<tr>${cols.map((c) => cellHtml(r, c)).join("")}</tr>`)).join("")}</tbody>`;
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
.wb-t.fixed th, .wb-t.fixed td { overflow-wrap: anywhere; }
.wb-t.fixed .mono, .wb-t.fixed td.r, .wb-t.fixed th.r { white-space: normal; }
td.img, th.img, col.img { width: ${img + 2}mm; }
.wb-t td.img { padding: ${Math.min(pad, 1)}mm 1mm; }
.thumb { width: ${img}mm; height: ${img}mm; }
.wb-t td.c, .wb-t th.c { text-align: center; }
.wb-t td.xb { background: transparent; }
.chk { display: inline-block; width: 3.6mm; height: 3.6mm; border: 1px solid #64748b; border-radius: 0.6mm; vertical-align: middle; }
${s.zebra ? ".wb-t tbody tr:nth-child(even) td { background: #f8fafc; }" : ""}
.wb-t tbody tr.grp-row td { background: #e2e8f0; font-weight: 700; color: #1e293b; }
.wb-t tbody tr.grp-row.sub td { background: #f1f5f9; font-weight: 600; }
.wb-t tbody tr.grp-total td { text-align: right; font-weight: 600; color: #334155; background: transparent; }
.wb-t td.xt { overflow-wrap: anywhere; white-space: pre-wrap; }
@media screen { .wb-t td.xt { background: #eff6ff; } .wb-t td.xt[contenteditable]:empty::before { content: "คลิกพิมพ์"; color: #94a3b8; } .wb-t td.xt[contenteditable]:focus { outline: 2px solid #93c5fd; outline-offset: -2px; background: #dbeafe; } }
.wb-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(32mm, 1fr)); gap: 2mm; margin: 0 0 3mm; break-inside: avoid; }
.wb-sum > div { border: 1px solid #cbd5e1; border-radius: 1mm; padding: 1.2mm 2mm; }
.wb-sum .l { font-size: ${Math.max(9, f - 1)}px; color: #64748b; }
.wb-sum .v { font-size: ${f + 3}px; font-weight: 700; color: #0f172a; }
.wb-sum .v.danger { color: #b91c1c; }
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

/** กล่องตัวเลขสรุปบนหัวใบ (ค่า value = HTML ผู้เรียก escape เอง) */
export const listSummaryHtml = (cards: { label: string; value: string; tone?: "danger" }[]): string =>
  cards.length ? `<div class="wb-sum">${cards.map((c) => `<div><div class="l">${escapeHtml(c.label)}</div><div class="v${c.tone === "danger" ? " danger" : ""}">${c.value}</div></div>`).join("")}</div>` : "";

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

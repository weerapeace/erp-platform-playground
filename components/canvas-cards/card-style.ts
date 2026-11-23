/**
 * 🎨 ตั้งค่าหน้าตาการ์ดบนกระดาน (เจ้าของสั่ง 2026-11-22) — ของกลาง pure (มีเทสต์)
 *   ต่อชนิดการ์ด: บรรทัดไหนโชว์ · เรียงลำดับ · ฟอนต์/ขนาด/สี ต่อบรรทัด · จัดชิด · ระยะบรรทัด · จุดนำหน้า · ความกว้าง · สีการ์ด
 *   ที่เก็บ: ของฉัน = /api/user-prefs key CARD_STYLE_PREF · ของกระดาน (ทีม) = /api/ui-config key cardStyleTeamKey(board)
 *   แบบที่บันทึกเอง = /api/user-prefs key CARD_STYLE_PRESETS_PREF
 * หน้าตาตัวอักษรต่อบรรทัด = TextStyle กลาง (lib/text-style · ตัวตั้งค่า components/text-style-control) — px 6-25 · สีใดก็ได้ · หนา/ขีดเส้น/ไฮไลต์/bullets
 * ฟอนต์ = ฟอนต์ของกระดาน (Excalidraw) ที่ thai-fonts.css ผูกฟอนต์ไทยไว้ · ตัวเอียง: กระดานวาดทำไม่ได้ (เก็บค่าไว้ ใช้ได้ที่อื่น)
 */

import { applyListPrefix, clampTextSize, type TextAlign, type TextList, type TextStyle } from "@/lib/text-style";

export const CARD_STYLE_PREF = "board_card_style";
export const CARD_STYLE_PRESETS_PREF = "board_card_style_presets";
export const cardStyleTeamKey = (boardKey: string) => `board_card_style:${boardKey}`;

export type StyledCardType = "content" | "task" | "sku" | "parent_sku" | "trend" | "design_sheet";
export const STYLED_TYPES: { type: StyledCardType; th: string; en: string }[] = [
  { type: "content", th: "คอนเทนต์", en: "Content" },
  { type: "task", th: "งาน", en: "Task" },
  { type: "sku", th: "SKU", en: "SKU" },
  { type: "parent_sku", th: "Parent SKU", en: "Parent SKU" },
  { type: "trend", th: "เทรนด์", en: "Trend" },
  { type: "design_sheet", th: "ใบงานออกแบบ", en: "Design sheet" },
];

/** ฟอนต์กระดาน (เลข fontFamily ของ Excalidraw) → ชื่อ CSS (ตัวอย่างในป๊อป) + ฟอนต์ไทยที่ผูกไว้ */
export const CARD_FONTS: { id: number; css: string; th: string; en: string }[] = [
  { id: 6, css: "Nunito", th: "ปกติ (Sarabun)", en: "Regular (Sarabun)" },
  { id: 7, css: "Lilita One", th: "หัวหนา (Kanit)", en: "Bold heading (Kanit)" },
  { id: 5, css: "Excalifont", th: "ลายมือ (Itim)", en: "Handwriting (Itim)" },
  { id: 2, css: "Helvetica", th: "ทันสมัย (Prompt)", en: "Modern (Prompt)" },
  { id: 1, css: "Virgil", th: "มีหัว (Pridi)", en: "Serif (Pridi)" },
  { id: 8, css: "Comic Shanns", th: "เหลี่ยม (Chakra)", en: "Square (Chakra)" },
  { id: 3, css: "Cascadia", th: "เรียบ (IBM Plex)", en: "Plain (IBM Plex)" },
];
/** ขนาดแบบเดิม (S/M/L/XL) → px — ใช้แปลงค่าที่ตั้งไว้ก่อนมีตัวตั้งค่าตัวอักษรกลาง (การ์ดเดิมหน้าตาไม่เพี้ยน) */
export const LEGACY_CARD_SIZES = { S: 12, M: 14, L: 18, XL: 22 } as const;
export const CARD_COLORS = ["#1e293b", "#633806", "#26215C", "#0C447C", "#085041", "#791F1F", "#64748b"] as const;
/** สีงานย่อยที่เสร็จแล้ว (ขีดฆ่า + จาง) */
export const CARD_DONE_COLOR = "#94a3b8";

/** หนึ่งบรรทัดบนการ์ด — ส่วนหน้าตาตัวอักษรตรงกับ TextStyle กลาง (lib/text-style) */
export type CardField = {
  key: string; on: boolean; font: number; size: number; color: string;
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  align: TextAlign; highlight?: string; list?: TextList; maxLines?: number;
};
/** doneFade = งานย่อยที่ติ๊กเสร็จ (☑) ขีดฆ่า + จางอัตโนมัติ */
export type CardStyle = { fields: CardField[]; gap: number; width: number; bg: "status" | "plain"; doneFade: boolean };
export type CardStyleMap = Partial<Record<StyledCardType, CardStyle>>;

/** บรรทัดที่ตั้งได้ต่อชนิดการ์ด (ลำดับ = ค่าเริ่มต้น · on = โชว์ตั้งต้น) */
export const CARD_FIELDS: Record<StyledCardType, { key: string; th: string; en: string; on: boolean; maxLines?: number }[]> = {
  content: [
    { key: "title", th: "ชื่อ", en: "Title", on: true }, { key: "no", th: "เลข + สถานะ", en: "No. + status", on: true },
    { key: "sched", th: "วันเวลาโพสต์", en: "Post time", on: true }, { key: "plat", th: "แพลตฟอร์ม", en: "Platforms", on: true },
    { key: "brief", th: "รายการงานที่ต้องการ (บรีฟ)", en: "Brief", on: true, maxLines: 5 }, { key: "ref", th: "จำนวน Ref", en: "Ref count", on: true },
    { key: "cap", th: "แคปชั่น", en: "Caption", on: false, maxLines: 3 },
  ],
  task: [
    { key: "title", th: "ชื่องาน", en: "Title", on: true }, { key: "no", th: "เลขงาน", en: "Task no.", on: true },
    { key: "count", th: "จำนวนงานย่อย", en: "Subtask count", on: true }, { key: "subs", th: "รายการงานย่อย", en: "Subtasks", on: true, maxLines: 6 },
  ],
  sku: [
    { key: "code", th: "รหัส", en: "Code", on: true }, { key: "name", th: "ชื่อ", en: "Name", on: true },
    { key: "color", th: "สี", en: "Color", on: true }, { key: "price", th: "ราคา", en: "Price", on: false },
  ],
  parent_sku: [{ key: "code", th: "รหัส", en: "Code", on: true }, { key: "name", th: "ชื่อ", en: "Name", on: true }],
  trend: [{ key: "title", th: "หัวข้อ", en: "Title", on: true }, { key: "heat", th: "ความแรง (hot/rising)", en: "Heat", on: true }],
  design_sheet: [
    { key: "code", th: "เลขใบงาน", en: "Code", on: true }, { key: "name", th: "ชื่อ", en: "Name", on: true },
    { key: "brand", th: "แบรนด์", en: "Brand", on: false }, { key: "status", th: "สถานะ", en: "Status", on: true },
  ],
};

const HEX = /^#[0-9a-f]{6}$/i;
const TITLE_KEYS = new Set(["title", "code"]);
export function defaultCardStyle(type: StyledCardType): CardStyle {
  return {
    fields: CARD_FIELDS[type].map((f, i) => ({ key: f.key, on: f.on, font: i === 0 && TITLE_KEYS.has(f.key) ? 7 : 6, size: i === 0 ? 18 : 14, color: i === 0 ? CARD_COLORS[1] : CARD_COLORS[0], align: "left" as const, ...(f.maxLines ? { maxLines: f.maxLines } : {}) })),
    gap: 4, width: type === "task" || type === "content" ? 260 : 240, bg: "status", doneFade: true,
  };
}
/** ค่าเริ่มของบรรทัดเดียว (ปุ่ม "ค่าเริ่มต้น" ต่อบรรทัด) — คงการโชว์/จำนวนบรรทัดที่ตั้งไว้ */
export function defaultCardField(type: StyledCardType, key: string, keep?: CardField): CardField | null {
  const d = defaultCardStyle(type).fields.find((f) => f.key === key);
  if (!d) return null;
  return keep ? { ...d, on: keep.on, ...(keep.maxLines ? { maxLines: keep.maxLines } : {}) } : d;
}

/** บรรทัดการ์ด ↔ TextStyle กลาง (ตัวตั้งค่าตัวอักษร) */
export function cardFieldTextStyle(f: CardField): TextStyle {
  return { font: String(f.font), size: f.size, color: f.color, bold: f.bold, italic: f.italic, underline: f.underline, strike: f.strike, align: f.align, highlight: f.highlight, list: f.list };
}
export function applyTextStyleToField(f: CardField, s: TextStyle): CardField {
  const fonts = new Set(CARD_FONTS.map((x) => x.id));
  const font = Number(s.font);
  const out: CardField = {
    key: f.key, on: f.on, font: fonts.has(font) ? font : f.font, size: s.size != null ? clampTextSize(s.size, f.size) : f.size,
    color: s.color && HEX.test(s.color) ? s.color : f.color, align: s.align ?? "left",
  };
  if (s.bold) out.bold = true;
  if (s.italic) out.italic = true;
  if (s.underline) out.underline = true;
  if (s.strike) out.strike = true;
  if (s.highlight && HEX.test(s.highlight)) out.highlight = s.highlight;
  if (s.list === "bullet" || s.list === "number") out.list = s.list;
  if (f.maxLines) out.maxLines = f.maxLines;
  return out;
}
/** แปรงก๊อปสไตล์: เอาหน้าตาตัวอักษรของ from ไปใส่ to (ไม่แตะ โชว์/จำนวนบรรทัด) */
export function copyFieldLook(from: CardField, to: CardField): CardField {
  return applyTextStyleToField(to, cardFieldTextStyle(from));
}

/** แบบสำเร็จรูป (ใช้กับชนิดการ์ดที่เปิดอยู่) */
export const CARD_PRESETS: { key: string; th: string; en: string; apply: (s: CardStyle, type: StyledCardType) => CardStyle }[] = [
  { key: "std", th: "มาตรฐาน", en: "Standard", apply: (_s, type) => defaultCardStyle(type) },
  { key: "big", th: "หัวใหญ่", en: "Big title", apply: (s) => ({ ...s, gap: 6, fields: s.fields.map((f, i) => ({ ...f, font: i === 0 ? 7 : 2, size: i === 0 ? 22 : 12 })) }) },
  { key: "mini", th: "ย่อ", en: "Compact", apply: (s) => ({ ...s, gap: 2, fields: s.fields.map((f, i) => ({ ...f, on: i < 3, size: i === 0 ? 14 : 12 })) }) },
  { key: "hand", th: "ลายมือ", en: "Handwritten", apply: (s) => ({ ...s, gap: 4, fields: s.fields.map((f, i) => ({ ...f, font: 5, size: i === 0 ? 18 : 14 })) }) },
];

const clampNum = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
/** ค่าที่อ่านจากที่เก็บ → รูปแบบถูกต้องเสมอ (บรรทัดใหม่ที่เพิ่มทีหลัง = ต่อท้ายตามค่าเริ่ม · บรรทัดที่เลิกมี = ทิ้ง)
 *  ค่าแบบเก่า: size "S/M/L/XL" → px · align ทั้งการ์ด → ทุกบรรทัด · lead "dot" → bullets ทุกบรรทัดยกเว้นบรรทัดแรก */
export function normalizeCardStyle(type: StyledCardType, raw: unknown): CardStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const def = defaultCardStyle(type);
  const known = new Map(def.fields.map((f) => [f.key, f]));
  const fonts = new Set(CARD_FONTS.map((f) => f.id));
  const cardAlign: TextAlign = r.align === "center" || r.align === "right" ? r.align : "left";
  const legacyDot = r.lead === "dot";
  const seen = new Set<string>();
  const fields: CardField[] = [];
  for (const f of Array.isArray(r.fields) ? (r.fields as Record<string, unknown>[]) : []) {
    const k = String(f?.key ?? ""); const base = known.get(k);
    if (!base || seen.has(k)) continue;
    seen.add(k);
    const sz = f.size;
    const size = typeof sz === "string" && sz in LEGACY_CARD_SIZES ? LEGACY_CARD_SIZES[sz as keyof typeof LEGACY_CARD_SIZES]
      : typeof sz === "number" ? clampTextSize(sz, base.size) : base.size;
    const out: CardField = {
      key: k, on: f.on !== false, font: fonts.has(Number(f.font)) ? Number(f.font) : base.font, size,
      color: typeof f.color === "string" && HEX.test(f.color) ? f.color : base.color,
      align: f.align === "left" || f.align === "center" || f.align === "right" ? f.align : cardAlign,
    };
    for (const b of ["bold", "italic", "underline", "strike"] as const) if (f[b] === true) out[b] = true;
    if (typeof f.highlight === "string" && HEX.test(f.highlight)) out.highlight = f.highlight;
    if (f.list === "bullet" || f.list === "number") out.list = f.list;
    else if (f.list === undefined && legacyDot && fields.length > 0) out.list = "bullet";
    if (base.maxLines) out.maxLines = clampNum(f.maxLines, 1, 20, base.maxLines);
    fields.push(out);
  }
  for (const f of def.fields) if (!seen.has(f.key)) fields.push({ ...f, align: cardAlign });
  return {
    fields, gap: clampNum(r.gap, 0, 16, def.gap), width: clampNum(r.width, 180, 400, def.width), bg: r.bg === "plain" ? "plain" : "status",
    doneFade: r.doneFade !== false,
  };
}
export function normalizeCardStyleMap(raw: unknown): CardStyleMap {
  const out: CardStyleMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const { type } of STYLED_TYPES) { const s = normalizeCardStyle(type, (raw as Record<string, unknown>)[type]); if (s) out[type] = s; }
  return out;
}

/** ข้อความแต่ละบรรทัดของการ์ด (ค่าว่าง = ไม่โชว์บรรทัดนั้น) */
export type CardValues = Record<string, string | null | undefined>;
/** หนึ่งบรรทัดที่จะวาด · cont = บรรทัดต่อของช่องเดียวกัน (ไม่เว้นระยะระหว่างช่อง) */
export type StyledText = {
  key: string; text: string; fontSize: number; fontFamily: number; strokeColor: string; align: TextAlign;
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; highlight?: string; cont?: boolean;
};
const DONE_RE = /^(?:•\s|\d+\.\s)?☑/;
export function styledTexts(style: CardStyle, values: CardValues): StyledText[] {
  const out: StyledText[] = [];
  for (const f of style.fields) {
    if (!f.on) continue;
    const v = String(values[f.key] ?? "").trim();
    if (!v) continue;
    let lines = v.split("\n");
    const extra = f.maxLines && lines.length > f.maxLines ? lines.length - f.maxLines : 0;
    if (extra) lines = lines.slice(0, f.maxLines);
    lines = applyListPrefix(lines.join("\n"), f.list).split("\n");
    if (extra) lines.push(`… +${extra}`);
    lines.forEach((text, i) => {
      const done = style.doneFade && DONE_RE.test(text);
      out.push({
        key: f.key, text, fontSize: f.size, fontFamily: f.font, strokeColor: done ? CARD_DONE_COLOR : f.color, align: f.align,
        ...(f.bold ? { bold: true } : {}), ...(f.italic ? { italic: true } : {}), ...(f.underline ? { underline: true } : {}),
        ...(f.strike || done ? { strike: true } : {}), ...(f.highlight ? { highlight: f.highlight } : {}), ...(i ? { cont: true } : {}),
      });
    });
  }
  return out;
}

/** ค่าบรรทัดจาก snapshot (customData) ของการ์ด — ใช้กับการ์ดที่ยังไม่มีค่าจากรอบซิงก์ */
export function valuesFromSnapshot(type: StyledCardType, d: Record<string, unknown>): CardValues {
  const s = (k: string) => (d[k] == null ? "" : String(d[k]));
  switch (type) {
    case "content": return { title: `📱 ${s("title")}`, no: s("content_no"), plat: Array.isArray(d.platforms) ? (d.platforms as string[]).join(" · ") : "" };
    case "task": return { title: `✅ ${s("title")}`, no: s("task_no"), subs: Array.isArray(d.subtasks) ? (d.subtasks as { title?: string }[]).map((x) => `☐ ${x.title ?? ""}`).join("\n") : "" };
    case "sku": return { code: s("code"), name: s("name"), color: s("color"), price: d.price != null && d.price !== "" ? `฿${Number(d.price).toLocaleString("th-TH")}` : "" };
    case "parent_sku": return { code: s("code"), name: s("name") };
    case "trend": return { title: s("title"), heat: s("heat") };
    case "design_sheet": return { code: s("code"), name: s("name"), brand: s("brand_name"), status: s("status") };
  }
}

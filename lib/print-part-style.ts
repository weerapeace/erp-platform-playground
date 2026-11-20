/**
 * ปรับหน้าตาทีละกล่องในเอกสารพิมพ์ (ของกลาง · เจ้าของขอ 2026-11-20) — กดกล่องในพรีวิว → ป๊อปแก้ ซ่อน/ขนาด/ตัวอักษร/ตำแหน่ง/สี
 *
 * - เอกสารประกาศกล่องด้วย data-pp="คีย์" (การ์ดแต่ละใบมี data-ci="ลำดับ" ไว้ซ่อนเฉพาะการ์ด)
 * - ค่าเก็บเป็น PrintPartStyles = { คีย์: ค่า } · "คีย์#ลำดับ" = เฉพาะการ์ดนั้น (ตอนนี้ใช้แค่ซ่อน)
 * - printPartCss() แปลงค่าเป็น CSS ใส่ท้าย <style> ของเอกสาร (ไม่ตั้ง = หน้าตาเดิม) · printPartFontLinks() โหลดฟอนต์ที่เลือก
 * - ตัวแก้บนจอ: components/print-part-style (usePrintPartEditor) · ใช้ครั้งแรก: ใบเสนอราคาแบบการ์ด (lib/quotation-print)
 * - ไม่เกี่ยวกับ PartStyleEditor ของเว็บร้าน (lib/website-page-parts) — ตัวนั้นผูกธีม/สีร้าน/พรีวิวเว็บ ใช้กับกระดาษไม่ได้
 */

export type PrintPartAlign = "left" | "center" | "right";
export type PrintPartFit = "contain" | "cover";

export type PrintPartStyle = {
  hide?: boolean;
  /** ขนาดตัวอักษร (px) */
  sizePx?: number;
  /** ชื่อฟอนต์ (จาก PRINT_FONTS) */
  font?: string;
  bold?: boolean;
  align?: PrintPartAlign;
  /** สีตัวอักษร #rrggbb */
  color?: string;
  /** สีพื้น #rrggbb (กล่อง/การ์ด) */
  bg?: string;
  /** (รูป) ความสูง mm */
  imgMm?: number;
  /** (รูป) พอดีกรอบ / เต็มกรอบ */
  fit?: PrintPartFit;
};
export type PrintPartStyles = Record<string, PrintPartStyle>;

export type PrintPartKind = "text" | "box" | "image" | "badge";
export type PrintPartDef = {
  key: string;
  label: string;
  kind: PrintPartKind;
  /** อยู่ในการ์ดแต่ละใบ → ซ่อนเฉพาะการ์ดได้ */
  perCard?: boolean;
  /** ขนาดตัวอักษรไปลงที่ลูกตัวนี้ (เช่น ตัวเลขราคา " b") — ไม่ใส่ = ตัวกล่องเอง */
  sizeSel?: string;
  /** กล่องเรียงแบบ flex (จัดตำแหน่งด้วย justify-content) */
  flex?: boolean;
  /** ขนาดตัวอักษรตั้งต้นโดยประมาณ (ไว้ตั้งแถบเลื่อนตอนยังไม่ปรับ) */
  baseSizePx?: number;
};

/** กล่องในใบเสนอราคาแบบการ์ดรูปใหญ่ */
export const QUOTE_CARD_PARTS: PrintPartDef[] = [
  { key: "company", label: "ชื่อบริษัท", kind: "text", baseSizePx: 15 },
  { key: "address", label: "ที่อยู่บริษัท", kind: "text", baseSizePx: 10 },
  { key: "title", label: "หัวเรื่อง \"ใบเสนอราคา\"", kind: "text", baseSizePx: 24 },
  { key: "meta", label: "กล่องเลขที่ / วันที่", kind: "box", sizeSel: " td", baseSizePx: 12 },
  { key: "customer", label: "กล่องลูกค้า", kind: "box", baseSizePx: 11 },
  { key: "card", label: "กรอบการ์ด", kind: "box", perCard: true },
  { key: "no", label: "เลขลำดับมุมการ์ด", kind: "badge", perCard: true, baseSizePx: 12 },
  { key: "img", label: "รูปสินค้า", kind: "image", perCard: true },
  { key: "sku", label: "รหัสสินค้า", kind: "text", perCard: true, baseSizePx: 12 },
  { key: "name", label: "ชื่อสินค้า", kind: "text", perCard: true, baseSizePx: 17 },
  { key: "note", label: "สี / ตัวเลือก", kind: "text", perCard: true, baseSizePx: 14 },
  { key: "price", label: "ราคา", kind: "text", perCard: true, sizeSel: " b", flex: true, baseSizePx: 26 },
  { key: "foot", label: "จำนวน / รวม", kind: "text", perCard: true, flex: true, baseSizePx: 14 },
  { key: "cardnote", label: "หมายเหตุ", kind: "box", baseSizePx: 11 },
  { key: "grand", label: "กล่องยอดรวม", kind: "box", sizeSel: " .g-amount", baseSizePx: 28 },
  { key: "terms", label: "กล่องเงื่อนไข", kind: "box", baseSizePx: 11 },
  { key: "sign", label: "ช่องเซ็นชื่อ", kind: "box", baseSizePx: 11 },
];

/** ฟอนต์ที่เลือกได้ (Google Fonts มีภาษาไทย) — "" = ค่าเดิมของเอกสาร */
export const PRINT_FONTS = ["Sarabun", "Prompt", "Kanit", "Noto Sans Thai", "IBM Plex Sans Thai", "Mitr", "Chakra Petch"] as const;

/** สีที่กดเลือกเร็ว (ยังเลือกสีอื่นเองได้) */
export const PRINT_QUICK_COLORS = ["#111111", "#555555", "#185FA5", "#A32D2D", "#3B6D11", "#854F0B"];

export const PRINT_SIZE_MIN = 6;
export const PRINT_SIZE_MAX = 60;
export const PRINT_IMG_MIN_MM = 15;
export const PRINT_IMG_MAX_MM = 140;

const KEY_RE = /^[a-z][a-z0-9-]{0,30}(#\d{1,3})?$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

/** ทำความสะอาดค่า 1 กล่อง — ช่องที่ไม่ถูกต้องทิ้ง · ไม่เหลืออะไร = null */
export function normalizePrintPartStyle(v: unknown): PrintPartStyle | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const out: PrintPartStyle = {};
  if (r.hide === true) out.hide = true;
  const size = num(r.sizePx, PRINT_SIZE_MIN, PRINT_SIZE_MAX); if (size != null) out.sizePx = size;
  if (typeof r.font === "string" && (PRINT_FONTS as readonly string[]).includes(r.font)) out.font = r.font;
  if (typeof r.bold === "boolean") out.bold = r.bold;
  if (r.align === "left" || r.align === "center" || r.align === "right") out.align = r.align;
  if (typeof r.color === "string" && COLOR_RE.test(r.color)) out.color = r.color.toLowerCase();
  if (typeof r.bg === "string" && COLOR_RE.test(r.bg)) out.bg = r.bg.toLowerCase();
  const img = num(r.imgMm, PRINT_IMG_MIN_MM, PRINT_IMG_MAX_MM); if (img != null) out.imgMm = img;
  if (r.fit === "contain" || r.fit === "cover") out.fit = r.fit;
  return Object.keys(out).length ? out : null;
}

/** ทำความสะอาดค่าทั้งชุด — คีย์ต้องตัวเล็ก/ขีด (+ "#ลำดับ") · สูงสุด 200 กล่อง */
export function normalizePrintPartStyles(v: unknown): PrintPartStyles {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: PrintPartStyles = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
    if (!KEY_RE.test(k)) continue;
    const s = normalizePrintPartStyle(raw);
    if (!s) continue;
    // เฉพาะการ์ด: เก็บแค่ซ่อน
    if (k.includes("#")) { if (s.hide) out[k] = { hide: true }; continue; }
    out[k] = s;
  }
  return out;
}

/** ตัดค่าเฉพาะการ์ด (คีย์#ลำดับ) ออก — ตอนบันทึกเป็นค่าเริ่มต้นให้ใบอื่น (ลำดับการ์ดของแต่ละใบไม่เหมือนกัน) */
export const stripPerCardStyles = (v: PrintPartStyles): PrintPartStyles =>
  Object.fromEntries(Object.entries(v).filter(([k]) => !k.includes("#")));

/** ค่าเฉพาะการ์ดยังใช้ได้ไหม — ลำดับการ์ดเกินจำนวนจริง = ทิ้ง (เหมือนลำดับที่ลากเอง) */
export const dropPerCardBeyond = (v: PrintPartStyles, cardCount: number): PrintPartStyles =>
  Object.fromEntries(Object.entries(v).filter(([k]) => { const i = k.split("#")[1]; return i == null || Number(i) < cardCount; }));

const JUSTIFY: Record<PrintPartAlign, string> = { left: "flex-start", center: "center", right: "flex-end" };

/** ค่าที่ตั้ง → CSS (ใส่ท้าย <style> ของเอกสาร) · ไม่ตั้งอะไร = สตริงว่าง */
export function printPartCss(styles: PrintPartStyles, defs: PrintPartDef[]): string {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const rules: string[] = [];
  for (const [rawKey, s] of Object.entries(normalizePrintPartStyles(styles))) {
    const [key, ci] = rawKey.split("#");
    const def = byKey.get(key);
    if (!def) continue;
    const sel = `.page [data-pp="${key}"]`;
    if (ci != null) {
      if (s.hide) rules.push(`.page [data-ci="${ci}"] [data-pp="${key}"], .page [data-ci="${ci}"][data-pp="${key}"] { display: none !important; }`);
      continue;
    }
    if (s.hide) { rules.push(`${sel} { display: none !important; }`); continue; }
    const own: string[] = [];
    if (s.font) own.push(`font-family: "${s.font}", Tahoma, sans-serif`);
    if (s.bold != null) own.push(`font-weight: ${s.bold ? 700 : 400}`);
    if (s.color) own.push(`color: ${s.color}`);
    if (s.bg) own.push(`background: ${s.bg}`, "-webkit-print-color-adjust: exact", "print-color-adjust: exact");
    if (s.align) { own.push(`text-align: ${s.align}`); if (def.flex) own.push(`justify-content: ${JUSTIFY[s.align]}`); }
    if (def.kind === "image" && s.imgMm != null) own.push(`height: ${s.imgMm}mm`);
    if (own.length) rules.push(`${sel} { ${own.map((d) => `${d} !important`).join("; ")}; }`);
    if (s.sizePx != null) rules.push(`${sel}${def.sizeSel ?? ""} { font-size: ${s.sizePx}px !important; }`);
    if (s.bold != null && def.sizeSel) rules.push(`${sel}${def.sizeSel} { font-weight: ${s.bold ? 700 : 400} !important; }`);
    if (def.kind === "image" && s.fit) rules.push(`${sel} img { object-fit: ${s.fit} !important; }`);
  }
  return rules.join("\n");
}

/** ลิงก์โหลดฟอนต์ที่เลือกใช้ (Google Fonts) — ไม่ได้เลือก = สตริงว่าง */
export function printPartFontLinks(styles: PrintPartStyles): string {
  const fonts = [...new Set(Object.values(styles).map((s) => s.font).filter((f): f is string => !!f && (PRINT_FONTS as readonly string[]).includes(f)))];
  if (!fonts.length) return "";
  const q = fonts.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`).join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}

/** สไตล์ที่คัดลอกได้ (ไม่รวมซ่อน) */
export const copyablePartStyle = (s: PrintPartStyle | undefined): PrintPartStyle => {
  const { hide: _hide, ...rest } = s ?? {};
  return rest;
};

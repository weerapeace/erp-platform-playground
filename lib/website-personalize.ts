/**
 * ของกลาง — "ปั๊มชื่อ" (Personalize) บนสินค้าเว็บร้าน
 *
 *   - ตั้งค่าต่อรุ่น/ร้าน เก็บที่ store_listings.web_personalize (แท็บ 🛍 เว็บไซต์ ของ Parent SKU → 🔤 ปั๊มชื่อ)
 *     { enabled, maxChars, styles[], imageKey, positions[{key,label,enabled,x,y,size,rotate,align}], letterSpacing, charset, autoUpper, symbols[] }
 *     x/y = % ของรูป (จุดยึดข้อความ — align บอกว่าข้อความเริ่ม/กลาง/จบที่จุดนี้) · size = ขนาดตัวอักษรเป็น % ของความกว้างรูป · rotate = องศา
 *   - ลูกค้าเลือกได้แค่: ข้อความ + แบบปั๊ม + ตำแหน่ง (จากที่แอดมินเปิดไว้) → PersonalizeChoice เก็บที่ store_order_items.personalize
 *   - ตัวที่ปั๊มได้ตั้งต่อรุ่น (charset + ตัวพิเศษ symbols) — ตัวกรองเดียวกันทั้งตอนพิมพ์ (เว็บร้าน) และตอนสั่ง (ERP ตรวจซ้ำ)
 *     storefront มิเรอร์ใน src/lib/personalize.ts
 *   - ฟอนต์ Times New Roman ตายตัว (ตามที่เจ้าของร้านกำหนด) · นับความยาวเป็น "ตัว" (♥ = 1 ตัว)
 */
export type PersonalizeStyle = "emboss" | "silver" | "gold";
export type PersonalizePositionKey = "center" | "right";
/** ข้อความเริ่มที่จุด (left) · กลางจุด (center) · จบที่จุด (right — ยาวขึ้นแล้วงอกไปทางซ้าย) */
export type PersonalizeAlign = "left" | "center" | "right";

export interface PersonalizePosition {
  key: PersonalizePositionKey;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  size: number;
  rotate: number;
  align: PersonalizeAlign;
}
/** กลุ่มตัวอักษรที่ปั๊มได้ (ตามบล็อกตัวปั๊มที่โรงงานมี) */
export interface PersonalizeCharset {
  upper: boolean;
  lower: boolean;
  digits: boolean;
  space: boolean;
  punct: boolean;
}
export interface PersonalizeConfig {
  enabled: boolean;
  maxChars: number;
  styles: PersonalizeStyle[];
  /** รูปที่ใช้เป็นฉากปั๊ม (r2 key) — null = รูปแรกของสินค้า */
  imageKey: string | null;
  positions: PersonalizePosition[];
  /** ความห่างตัวอักษร (em) */
  letterSpacing: number;
  charset: PersonalizeCharset;
  /** เปลี่ยนตัวเล็กเป็นตัวใหญ่ให้อัตโนมัติ */
  autoUpper: boolean;
  /** ตัวพิเศษ (ตัวละ 1 ตัวอักษร เช่น ♥ ★) — ลูกค้ากดเลือกจากปุ่ม "ตัวพิเศษ" */
  symbols: string[];
}
export interface PersonalizeChoice {
  text: string;
  style: PersonalizeStyle;
  position: PersonalizePositionKey;
}
/** ส่วนของค่าตั้งที่ตัวกรองข้อความใช้ */
export type PersonalizeCharRules = Pick<PersonalizeConfig, "maxChars" | "charset" | "autoUpper" | "symbols">;

export const PERSONALIZE_STYLES: { value: PersonalizeStyle; label: string }[] = [
  { value: "emboss", label: "พิมพ์จม" },
  { value: "silver", label: "พิมพ์เงิน" },
  { value: "gold", label: "พิมพ์ทอง" },
];
export const PERSONALIZE_POSITIONS: { key: PersonalizePositionKey; label: string }[] = [
  { key: "center", label: "ตรงกลาง" },
  { key: "right", label: "มุมขวาล่าง" },
];
export const PERSONALIZE_ALIGNS: { value: PersonalizeAlign; label: string }[] = [
  { value: "left", label: "ชิดซ้าย" },
  { value: "center", label: "กลาง" },
  { value: "right", label: "ชิดขวา" },
];
/** เครื่องหมายในกลุ่ม punct */
export const PERSONALIZE_PUNCT = "&_-.,/";
export const PERSONALIZE_CHARSETS: { key: keyof PersonalizeCharset; label: string; labelEn: string }[] = [
  { key: "upper", label: "A–Z", labelEn: "A–Z" },
  { key: "lower", label: "a–z", labelEn: "a–z" },
  { key: "digits", label: "0–9", labelEn: "0–9" },
  { key: "space", label: "เว้นวรรค", labelEn: "spaces" },
  { key: "punct", label: "& _ - . , /", labelEn: "& _ - . , /" },
];
export const PERSONALIZE_MAX_SYMBOLS = 24;
/** ตำแหน่ง x ของจุดยึดเทียบกับความกว้างข้อความ (ใช้ขยับจุดตอนเปลี่ยนการจัด ไม่ให้ตัวหนังสือกระโดด) */
export const PERSONALIZE_ALIGN_OFFSET: Record<PersonalizeAlign, number> = { left: 0, center: 0.5, right: 1 };

export const DEFAULT_PERSONALIZE: PersonalizeConfig = {
  enabled: false,
  maxChars: 10,
  styles: ["emboss", "silver", "gold"],
  imageKey: null,
  positions: [
    { key: "center", label: "ตรงกลาง", enabled: true, x: 50, y: 52, size: 5, rotate: 0, align: "center" },
    { key: "right", label: "มุมขวาล่าง", enabled: true, x: 80, y: 74, size: 4.5, rotate: 0, align: "right" },
  ],
  letterSpacing: 0.08,
  charset: { upper: true, lower: true, digits: true, space: true, punct: true },
  autoUpper: false,
  symbols: [],
};

const KEY_RE = /^[\w\-./%()]+$/;
const ALIGNS = new Set<string>(["left", "center", "right"]);
const num = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)) : fb;
};

/** ตัวพิเศษจากช่องที่แอดมินพิมพ์/วาง (ติดกันหรือเว้นวรรคก็ได้) → รายการตัวละ 1 ตัวอักษร ไม่ซ้ำ · ตัด A–Z a–z 0–9 (อยู่ในกลุ่มตัวอักษรอยู่แล้ว) และตัวควบคุม */
export function parsePersonalizeSymbols(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String).join("") : typeof raw === "string" ? raw : "";
  const out: string[] = [];
  for (const ch of Array.from(list.replace(/[\s︎️‍]/g, ""))) {
    if (/[A-Za-z0-9\u0000-\u001F\u007F-\u009F]/.test(ch) || out.includes(ch)) continue;
    out.push(ch);
    if (out.length >= PERSONALIZE_MAX_SYMBOLS) break;
  }
  return out;
}

/** อ่านค่าจาก DB ให้ครบทุกช่อง (ตำแหน่งมี 2 จุดเสมอ) — raw ว่าง = ค่าเริ่มต้น (ปิดอยู่)
 *  ค่าเก่าที่ยังไม่มี align = "center" (ตำแหน่งเดิมไม่ขยับ — แอดมินกดเปลี่ยนเองในหลังบ้าน) */
export function normalizePersonalize(raw: unknown): PersonalizeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const styles = (Array.isArray(r.styles) ? r.styles : DEFAULT_PERSONALIZE.styles).filter((s): s is PersonalizeStyle =>
    PERSONALIZE_STYLES.some((d) => d.value === s)
  );
  const rawPos = Array.isArray(r.positions) ? (r.positions as Record<string, unknown>[]) : [];
  const positions = DEFAULT_PERSONALIZE.positions.map((d) => {
    const p = rawPos.find((x) => x && typeof x === "object" && x.key === d.key);
    const q = p ?? {};
    return {
      key: d.key,
      label: typeof q.label === "string" && q.label.trim() ? q.label.trim().slice(0, 40) : d.label,
      enabled: q.enabled !== false,
      x: num(q.x, d.x, 0, 100),
      y: num(q.y, d.y, 0, 100),
      size: num(q.size, d.size, 1, 30),
      rotate: num(q.rotate, d.rotate, -45, 45),
      align: (typeof q.align === "string" && ALIGNS.has(q.align) ? q.align : p ? "center" : d.align) as PersonalizeAlign,
    };
  });
  const cs = (r.charset && typeof r.charset === "object" ? r.charset : {}) as Record<string, unknown>;
  const charset = Object.fromEntries(
    PERSONALIZE_CHARSETS.map(({ key }) => [key, typeof cs[key] === "boolean" ? cs[key] : DEFAULT_PERSONALIZE.charset[key]])
  ) as unknown as PersonalizeCharset;
  const ls = typeof r.letterSpacing === "number" ? r.letterSpacing : NaN;
  return {
    enabled: r.enabled === true,
    maxChars: Math.round(num(r.maxChars, DEFAULT_PERSONALIZE.maxChars, 1, 30)),
    styles: styles.length ? [...new Set(styles)] : [...DEFAULT_PERSONALIZE.styles],
    imageKey: typeof r.imageKey === "string" && KEY_RE.test(r.imageKey) ? r.imageKey : null,
    positions,
    letterSpacing: Number.isFinite(ls) ? Math.min(0.5, Math.max(0, Math.round(ls * 100) / 100)) : DEFAULT_PERSONALIZE.letterSpacing,
    charset,
    autoUpper: r.autoUpper === true,
    symbols: parsePersonalizeSymbols(r.symbols),
  };
}

/** ตำแหน่งข้อความบนรูป: จุดยึด x/y + การจัด → transform (หมุนรอบจุดยึด) — ใช้ทั้งพรีวิว ERP และเว็บร้าน */
export function personalizeTextPlacement(p: Pick<PersonalizePosition, "x" | "y" | "rotate" | "align">): { left: string; top: string; transform: string; transformOrigin: string } {
  const off = PERSONALIZE_ALIGN_OFFSET[p.align] ?? 0.5;
  return { left: `${p.x}%`, top: `${p.y}%`, transform: `translate(${-off * 100}%, -50%) rotate(${p.rotate}deg)`, transformOrigin: `${off * 100}% 50%` };
}

/** แยกตัวสุดท้ายออก (ไม่ใส่ความห่างหลังตัวสุดท้าย → ชิดซ้าย/ขวาตรงจุดพอดี) */
export function personalizeSplitLast(text: string): [string, string] {
  const chars = Array.from(text);
  return [chars.slice(0, -1).join(""), chars.slice(-1).join("")];
}

/** ตัวนี้ปั๊มได้ไหม (ตามกลุ่มตัวอักษร + ตัวพิเศษของรุ่น) */
export function personalizeCharOk(ch: string, rules: Pick<PersonalizeCharRules, "charset" | "symbols">): boolean {
  const c = rules.charset;
  if (c.upper && /^[A-Z]$/.test(ch)) return true;
  if (c.lower && /^[a-z]$/.test(ch)) return true;
  if (c.digits && /^[0-9]$/.test(ch)) return true;
  if (c.space && ch === " ") return true;
  if (c.punct && ch.length === 1 && PERSONALIZE_PUNCT.includes(ch)) return true;
  return rules.symbols.includes(ch);
}

/** ข้อความที่ลูกค้าพิมพ์ → (ตัวใหญ่อัตโนมัติ) ตัดตัวที่ปั๊มไม่ได้ + จำกัดความยาว (ว่าง = null) — ตรวจฝั่งเซิร์ฟเวอร์ตอนสั่ง */
export function cleanPersonalizeText(text: unknown, rules: PersonalizeCharRules = DEFAULT_PERSONALIZE): string | null {
  if (typeof text !== "string") return null;
  const src = rules.autoUpper ? text.toUpperCase() : text;
  const kept = Array.from(src.replace(/\s+/g, " ")).filter((ch) => personalizeCharOk(ch, rules));
  const t = kept.join("").trim();
  const capped = Array.from(t).slice(0, Math.max(1, rules.maxChars)).join("").trim();
  return capped || null;
}

/** ค่าที่ลูกค้าเลือก (จากตะกร้า) → ตรวจกับค่าที่ตั้งไว้ของรุ่น — ไม่ผ่าน = null */
export function normalizePersonalizeChoice(raw: unknown, cfg: PersonalizeConfig | null): PersonalizeChoice | null {
  if (!raw || typeof raw !== "object" || !cfg || !cfg.enabled) return null;
  const r = raw as Record<string, unknown>;
  const text = cleanPersonalizeText(r.text, cfg);
  if (!text) return null;
  const style = cfg.styles.includes(r.style as PersonalizeStyle) ? (r.style as PersonalizeStyle) : cfg.styles[0];
  const pos = cfg.positions.find((p) => p.enabled && p.key === r.position) ?? cfg.positions.find((p) => p.enabled);
  if (!style || !pos) return null;
  return { text, style, position: pos.key };
}

const STYLE_EN: Record<string, string> = { emboss: "Debossed", silver: "Silver foil", gold: "Gold foil" };
const POSITION_EN: Record<string, string> = { center: "Center", right: "Bottom right" };

/** ป้ายสั้น ๆ ไว้โชว์ในตะกร้า/ออเดอร์: ปั๊ม "ANN" · พิมพ์ทอง · มุมขวาล่าง · 🌐 lang "en" = Name stamp "ANN" · Gold foil · Bottom right */
export function personalizeLabel(c: PersonalizeChoice, cfg?: PersonalizeConfig | null, lang: "th" | "en" = "th"): string {
  if (lang === "en") return `Name stamp "${c.text}" · ${STYLE_EN[c.style] ?? c.style} · ${POSITION_EN[c.position] ?? c.position}`;
  const style = PERSONALIZE_STYLES.find((s) => s.value === c.style)?.label ?? c.style;
  const pos = cfg?.positions.find((p) => p.key === c.position)?.label ?? PERSONALIZE_POSITIONS.find((p) => p.key === c.position)?.label ?? c.position;
  return `ปั๊ม "${c.text}" · ${style} · ${pos}`;
}

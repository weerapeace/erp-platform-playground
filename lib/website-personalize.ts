/**
 * ของกลาง — "ปั๊มชื่อ" (Personalize) บนสินค้าเว็บร้าน
 *
 *   - ตั้งค่าต่อรุ่น/ร้าน เก็บที่ store_listings.web_personalize (แท็บ 🛍 เว็บไซต์ ของ Parent SKU → 🔤 ปั๊มชื่อ)
 *     { enabled, maxChars, styles[], imageKey, positions[{key,label,enabled,x,y,size,rotate}] }
 *     x/y = % ของรูป (จุดกึ่งกลางข้อความ) · size = ขนาดตัวอักษรเป็น % ของความกว้างรูป · rotate = องศา
 *   - ลูกค้าเลือกได้แค่: ข้อความ + แบบปั๊ม + ตำแหน่ง (จากที่แอดมินเปิดไว้) → PersonalizeChoice เก็บที่ store_order_items.personalize
 *   - ตัวอักษรที่รับ: A–Z a–z 0–9 เว้นวรรค และ & _ - . , / (แก้ที่ ALLOWED ที่เดียว — storefront มิเรอร์ใน src/lib/personalize.ts)
 *   - ฟอนต์ Times New Roman ตายตัว (ตามที่เจ้าของร้านกำหนด)
 */
export type PersonalizeStyle = "emboss" | "silver" | "gold";
export type PersonalizePositionKey = "center" | "right";

export interface PersonalizePosition {
  key: PersonalizePositionKey;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  size: number;
  rotate: number;
}
export interface PersonalizeConfig {
  enabled: boolean;
  maxChars: number;
  styles: PersonalizeStyle[];
  /** รูปที่ใช้เป็นฉากปั๊ม (r2 key) — null = รูปแรกของสินค้า */
  imageKey: string | null;
  positions: PersonalizePosition[];
}
export interface PersonalizeChoice {
  text: string;
  style: PersonalizeStyle;
  position: PersonalizePositionKey;
}

export const PERSONALIZE_STYLES: { value: PersonalizeStyle; label: string }[] = [
  { value: "emboss", label: "พิมพ์จม" },
  { value: "silver", label: "พิมพ์เงิน" },
  { value: "gold", label: "พิมพ์ทอง" },
];
export const PERSONALIZE_POSITIONS: { key: PersonalizePositionKey; label: string }[] = [
  { key: "center", label: "ตรงกลาง" },
  { key: "right", label: "มุมขวาล่าง" },
];
/** ตัวอักษรที่ยอมรับ (ทั้งสตริง) */
export const PERSONALIZE_ALLOWED = /^[A-Za-z0-9 &_\-.,/]*$/;
const NOT_ALLOWED_G = /[^A-Za-z0-9 &_\-.,/]/g;

export const DEFAULT_PERSONALIZE: PersonalizeConfig = {
  enabled: false,
  maxChars: 10,
  styles: ["emboss", "silver", "gold"],
  imageKey: null,
  positions: [
    { key: "center", label: "ตรงกลาง", enabled: true, x: 50, y: 52, size: 5, rotate: 0 },
    { key: "right", label: "มุมขวาล่าง", enabled: true, x: 72, y: 74, size: 4.5, rotate: 0 },
  ],
};

const KEY_RE = /^[\w\-./%()]+$/;
const num = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)) : fb;
};

/** อ่านค่าจาก DB ให้ครบทุกช่อง (ตำแหน่งมี 2 จุดเสมอ) — raw ว่าง = ค่าเริ่มต้น (ปิดอยู่) */
export function normalizePersonalize(raw: unknown): PersonalizeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const styles = (Array.isArray(r.styles) ? r.styles : DEFAULT_PERSONALIZE.styles).filter((s): s is PersonalizeStyle =>
    PERSONALIZE_STYLES.some((d) => d.value === s)
  );
  const rawPos = Array.isArray(r.positions) ? (r.positions as Record<string, unknown>[]) : [];
  const positions = DEFAULT_PERSONALIZE.positions.map((d) => {
    const p = rawPos.find((x) => x && typeof x === "object" && x.key === d.key) ?? {};
    return {
      key: d.key,
      label: typeof p.label === "string" && p.label.trim() ? p.label.trim().slice(0, 40) : d.label,
      enabled: p.enabled !== false,
      x: num(p.x, d.x, 0, 100),
      y: num(p.y, d.y, 0, 100),
      size: num(p.size, d.size, 1, 30),
      rotate: num(p.rotate, d.rotate, -45, 45),
    };
  });
  return {
    enabled: r.enabled === true,
    maxChars: Math.round(num(r.maxChars, DEFAULT_PERSONALIZE.maxChars, 1, 30)),
    styles: styles.length ? [...new Set(styles)] : [...DEFAULT_PERSONALIZE.styles],
    imageKey: typeof r.imageKey === "string" && KEY_RE.test(r.imageKey) ? r.imageKey : null,
    positions,
  };
}

/** ข้อความที่ลูกค้าพิมพ์ → ตัดตัวที่ไม่รับ + จำกัดความยาว (ว่าง = null) */
export function cleanPersonalizeText(text: unknown, maxChars = DEFAULT_PERSONALIZE.maxChars): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(NOT_ALLOWED_G, "").replace(/\s+/g, " ").trim().slice(0, Math.max(1, maxChars));
  return t || null;
}

/** ค่าที่ลูกค้าเลือก (จากตะกร้า) → ตรวจกับค่าที่ตั้งไว้ของรุ่น — ไม่ผ่าน = null */
export function normalizePersonalizeChoice(raw: unknown, cfg: PersonalizeConfig | null): PersonalizeChoice | null {
  if (!raw || typeof raw !== "object" || !cfg || !cfg.enabled) return null;
  const r = raw as Record<string, unknown>;
  const text = cleanPersonalizeText(r.text, cfg.maxChars);
  if (!text) return null;
  const style = cfg.styles.includes(r.style as PersonalizeStyle) ? (r.style as PersonalizeStyle) : cfg.styles[0];
  const pos = cfg.positions.find((p) => p.enabled && p.key === r.position) ?? cfg.positions.find((p) => p.enabled);
  if (!style || !pos) return null;
  return { text, style, position: pos.key };
}

/** ป้ายสั้น ๆ ไว้โชว์ในตะกร้า/ออเดอร์: ปั๊ม "ANN" · พิมพ์ทอง · มุมขวาล่าง */
export function personalizeLabel(c: PersonalizeChoice, cfg?: PersonalizeConfig | null): string {
  const style = PERSONALIZE_STYLES.find((s) => s.value === c.style)?.label ?? c.style;
  const pos = cfg?.positions.find((p) => p.key === c.position)?.label ?? PERSONALIZE_POSITIONS.find((p) => p.key === c.position)?.label ?? c.position;
  return `ปั๊ม "${c.text}" · ${style} · ${pos}`;
}

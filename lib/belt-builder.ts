/**
 * Belt Builder (Louis Montini) — กฎกลางของ "ออกแบบเข็มขัดเอง" (pure · ไม่มี React/DB)
 *
 * ใช้ร่วมกัน 2 ฝั่ง:
 *  - API  app/api/belt-builder/*  → ตรวจค่าก่อนบันทึก (validatePart / validateSizeRule)
 *  - UI   components/belt-builder/* + หน้าเว็บลูกค้า (ก้อน 3) → วาดพรีวิวซ้อนชั้น + คิดความยาวหนัง
 *
 * พรีวิว = รูปถ่ายจริง PNG พื้นโปร่ง ซ้อนเป็นชั้นบนผืนผ้าใบคงที่ 1600×600
 *   ชั้น 1 สายหนัง (strap) · ชั้น 2 หู (keeper) · ชั้น 3 หัว (buckle) · ชั้น 4 สลักชื่อ (ตัวอักษรพิมพ์สด)
 *   แต่ละชิ้นมี anchor {x,y,w,h} = ตำแหน่ง/ขนาดบนผืนผ้าใบ (px) — แอดมินปรับได้จากหลังบ้าน
 */

export const BELT_CANVAS = { w: 1600, h: 600 } as const;

export const PART_TYPES = ["strap", "buckle", "keeper"] as const;
export type PartType = (typeof PART_TYPES)[number];

export const PART_TYPE_LABEL: Record<PartType, { th: string; en: string; icon: string }> = {
  strap:  { th: "สายหนัง",  en: "Strap",  icon: "〰️" },
  buckle: { th: "หัวเข็มขัด", en: "Buckle", icon: "🔲" },
  keeper: { th: "หูเข็มขัด", en: "Keeper", icon: "🔗" },
};

/** ลำดับชั้นตอนวาด (ล่าง → บน) */
export const LAYER_ORDER: PartType[] = ["strap", "keeper", "buckle"];

export type Anchor = { x: number; y: number; w: number; h: number };

/** จุดยึดเริ่มต้นต่อประเภท (ตามที่เจ้าของตัดสินใจ) */
export const DEFAULT_ANCHOR: Record<PartType, Anchor> = {
  strap:  { x: 0,   y: 300, w: 1600, h: 150 },
  buckle: { x: 0,   y: 225, w: 200,  h: 300 },
  keeper: { x: 235, y: 255, w: 65,   h: 210 },
};

/** ตำแหน่งสลักชื่อเริ่มต้น (ชั้น 4 · ตัวอักษรพิมพ์สด) — วางบนสายหนังฝั่งปลาย */
export const DEFAULT_ENGRAVING_BOX: Anchor = { x: 1150, y: 330, w: 380, h: 90 };

export const GENDERS = ["men", "women"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, { th: string; en: string }> = {
  men:   { th: "ผู้ชาย", en: "Men" },
  women: { th: "ผู้หญิง", en: "Women" },
};

export type StrapFormula = { mult: number; add_cm: number };
export const DEFAULT_STRAP_FORMULA: StrapFormula = { mult: 2.54, add_cm: 24 };

export const DESIGN_STATUSES = ["saved", "in_cart", "ordered"] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** แปลงค่าที่รับมา (string/number/object) → Anchor ที่ใช้ได้ · คืน null ถ้าไม่ครบ 4 ค่า */
export function parseAnchor(v: unknown): Anchor | null {
  let o: unknown = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const out: Partial<Anchor> = {};
  for (const k of ["x", "y", "w", "h"] as const) {
    const n = Number(r[k]);
    if (!Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out as Anchor;
}

export function parseStrapFormula(v: unknown): StrapFormula | null {
  let o: unknown = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const mult = Number(r.mult), add_cm = Number(r.add_cm);
  if (!Number.isFinite(mult) || !Number.isFinite(add_cm)) return null;
  return { mult, add_cm };
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

/**
 * ตรวจชิ้นส่วนก่อนบันทึก (ใช้ทั้ง client + API)
 * กฎ: part_type อยู่ใน enum · anchor ครบ 4 ค่า และ w/h > 0 · price_delta ≥ 0 · ต้องมีชื่อ
 * `partial=true` = PATCH (ตรวจเฉพาะคีย์ที่ส่งมา)
 */
export function validatePart(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const has = (k: string) => !opts.partial || k in input;

  if (has("part_type")) {
    if (!PART_TYPES.includes(input.part_type as PartType)) errors.push(`ประเภทชิ้นส่วนต้องเป็น ${PART_TYPES.join(" / ")}`);
  }
  if (has("name_th")) {
    const s = String(input.name_th ?? "").trim();
    if (!s) errors.push("ต้องใส่ชื่อ (ไทย)");
  }
  if (has("anchor")) {
    const a = parseAnchor(input.anchor);
    if (!a) errors.push("จุดยึด (anchor) ต้องมีครบ 4 ค่า x, y, w, h");
    else {
      if (a.w <= 0 || a.h <= 0) errors.push("ความกว้าง/สูงของจุดยึดต้องมากกว่า 0");
      if (a.x < -BELT_CANVAS.w || a.x > BELT_CANVAS.w * 2 || a.y < -BELT_CANVAS.h || a.y > BELT_CANVAS.h * 2) errors.push("ตำแหน่งจุดยึดอยู่นอกผืนผ้าใบไกลเกินไป");
    }
  }
  if (has("price_delta")) {
    const n = Number(input.price_delta ?? 0);
    if (!Number.isFinite(n)) errors.push("ราคาเพิ่มต้องเป็นตัวเลข");
    else if (n < 0) errors.push("ราคาเพิ่มต้องไม่ติดลบ (ใส่ 0 ถ้าไม่บวกราคา)");
  }
  if (has("sort_order") && input.sort_order != null && input.sort_order !== "") {
    if (!Number.isFinite(Number(input.sort_order))) errors.push("ลำดับต้องเป็นตัวเลข");
  }
  if (has("attrs") && input.attrs != null && input.attrs !== "") {
    let o: unknown = input.attrs;
    if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = null; } }
    if (!o || typeof o !== "object" || Array.isArray(o)) errors.push("คุณสมบัติ (attrs) ต้องเป็น JSON แบบ {\"สี\":\"ดำ\"}");
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** ตรวจกติกาไซซ์: gender ใน enum · เอว min < max และ > 0 · สูตร mult/add_cm ตัวเลข · จำนวนรู ≥ 1 · ระยะรู > 0 */
export function validateSizeRule(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const has = (k: string) => !opts.partial || k in input;

  if (has("gender") && !GENDERS.includes(input.gender as Gender)) errors.push(`เพศต้องเป็น ${GENDERS.join(" / ")}`);
  const min = Number(input.waist_min_in), max = Number(input.waist_max_in);
  if (has("waist_min_in") && (!Number.isFinite(min) || min <= 0)) errors.push("เอวต่ำสุด (นิ้ว) ต้องมากกว่า 0");
  if (has("waist_max_in") && (!Number.isFinite(max) || max <= 0)) errors.push("เอวสูงสุด (นิ้ว) ต้องมากกว่า 0");
  if (!opts.partial || ("waist_min_in" in input && "waist_max_in" in input)) {
    if (Number.isFinite(min) && Number.isFinite(max) && min >= max) errors.push("เอวต่ำสุดต้องน้อยกว่าเอวสูงสุด");
  }
  if (has("strap_formula")) {
    const f = parseStrapFormula(input.strap_formula);
    if (!f) errors.push("สูตรตัดหนังต้องมี mult และ add_cm เป็นตัวเลข");
    else if (f.mult <= 0) errors.push("ตัวคูณ (mult) ต้องมากกว่า 0");
  }
  if (has("hole_count")) {
    const n = Number(input.hole_count);
    if (!Number.isInteger(n) || n < 1) errors.push("จำนวนรูต้องเป็นจำนวนเต็มอย่างน้อย 1");
  }
  if (has("hole_spacing_cm")) {
    const n = Number(input.hole_spacing_cm);
    if (!Number.isFinite(n) || n <= 0) errors.push("ระยะห่างรู (ซม.) ต้องมากกว่า 0");
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** ความยาวหนังที่ต้องตัด (ซม.) จากรอบเอว (นิ้ว) ตามสูตร — ปัดทศนิยม 1 ตำแหน่ง */
export function strapLengthCm(waistIn: number, formula: StrapFormula = DEFAULT_STRAP_FORMULA): number {
  if (!isNum(waistIn) || waistIn <= 0) return 0;
  return Math.round((waistIn * formula.mult + formula.add_cm) * 10) / 10;
}

/** ตำแหน่งรู (ซม. จากปลายสาย) — รูกลางตรงกับรอบเอว ที่เหลือเรียงซ้าย/ขวาตามระยะห่าง */
export function holePositionsCm(waistIn: number, formula: StrapFormula, holeCount: number, spacingCm: number): number[] {
  const center = Math.round(waistIn * formula.mult * 10) / 10;
  const n = Math.max(1, Math.floor(holeCount));
  const mid = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => Math.round((center + (i - mid) * spacingCm) * 10) / 10);
}

/** กติกาไซซ์ที่ตรงกับเพศ+รอบเอว (รายการต้องกรอง is_active มาแล้ว) */
export function pickSizeRule<T extends { gender: string; waist_min_in: number; waist_max_in: number }>(rules: T[], gender: Gender, waistIn: number): T | null {
  return rules.find((r) => r.gender === gender && waistIn >= Number(r.waist_min_in) && waistIn <= Number(r.waist_max_in)) ?? null;
}

/** รวมราคา = ราคาฐาน + price_delta ของทุกชิ้นที่เลือก + ค่าสลักชื่อ (ถ้ามี) */
export function totalPrice(basePrice: number, parts: Array<{ price_delta?: number | string | null } | null | undefined>, engravingFee = 0): number {
  const sum = parts.reduce((acc, p) => acc + (p ? Number(p.price_delta ?? 0) || 0 : 0), 0);
  return Math.round((Number(basePrice) || 0) + sum + (engravingFee || 0));
}

/** กล่องซ้อนชั้นที่วาดจริง: ย่อ anchor ตามสเกลผืนผ้าใบ (เช่น พรีวิวกว้าง 800 → scale 0.5) */
export function scaleAnchor(a: Anchor, scale: number): Anchor {
  return { x: a.x * scale, y: a.y * scale, w: a.w * scale, h: a.h * scale };
}

/* ───────────── จับคู่ชื่อไฟล์รูป ↔ code ชิ้นส่วน (ใช้ใน "อัปโหลดหลายรูป" ของสตูดิโอ) ───────────── */

/** ทำชื่อไฟล์/รหัสให้เทียบกันได้: ตัดนามสกุล · ตัวพิมพ์เล็ก · "_"/ช่องว่าง → "-" · ยุบ "--" */
export function normalizeCodeKey(s: string): string {
  return s.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
}

/**
 * หาชิ้นที่ code ตรงกับชื่อไฟล์ (STRAP-DBR-35.png → strap-dbr-35) · ไม่ตรงเป๊ะ ลองตัดท้าย "-1" / "(1)" / "-copy" / "-final" / "-new"
 * ไม่เจอ = null (ให้ผู้ใช้เลือกเอง)
 */
export function matchFileToPart<T extends { code: string | null }>(fileName: string, parts: T[]): T | null {
  const key = normalizeCodeKey(fileName);
  if (!key) return null;
  const byCode = new Map<string, T>();
  for (const p of parts) if (p.code) byCode.set(normalizeCodeKey(p.code), p);
  if (byCode.has(key)) return byCode.get(key) ?? null;
  const stripped = key.replace(/(-?\(\d+\)|-\d+|-copy|-final|-new)$/i, "");
  if (stripped !== key && byCode.has(stripped)) return byCode.get(stripped) ?? null;
  return null;
}

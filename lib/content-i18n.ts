/**
 * ของกลาง — เนื้อหา 2 ภาษา (ไทย / อังกฤษ) สำหรับข้อความที่ "ลูกค้าเห็น"
 *
 * กฎเดียวทั้งระบบ (เว็บไซต์ · ต่อไปใช้กับเมนู/หมวด/คอลเลกชัน ฯลฯ):
 *   ช่องเดิม        = ภาษาไทย (ไม่ย้าย ไม่เปลี่ยนชนิด → ข้อมูลเก่า/เว็บรุ่นเก่าไม่พัง)
 *   ช่องคู่ `<key>_en` = ภาษาอังกฤษ — ว่าง = ใช้ภาษาไทยแทน (ลูกค้าไม่เจอช่องว่าง)
 *   `_i18n`          = สถานะการแปลต่อช่อง { [key]: { h, ai? } }
 *       h  = ลายนิ้วมือของข้อความไทย "ตอนที่แปล/ตรวจ" → ไทยเปลี่ยนทีหลัง = รู้ว่าคำแปลอาจค้าง
 *       ai = แปลโดย AI ยังไม่มีคนตรวจ
 *   ภาษาที่ 3 ในอนาคต (เช่น จีน) ใช้กฎเดียวกัน `<key>_zh`
 *
 * ไฟล์นี้ไม่ผูก React — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์ (ทำความสะอาดข้อมูล) และหน้าจอ
 * เอกสาร: docs/bilingual-content.md
 */

export type ContentLang = "th" | "en";
export const CONTENT_LANGS: readonly ContentLang[] = ["th", "en"];

export const EN_SUFFIX = "_en";
export const I18N_META_KEY = "_i18n";

/** ชื่อช่องภาษาอังกฤษที่คู่กับช่องไทย เช่น "title" → "title_en" */
export const enKey = (key: string): string => `${key}${EN_SUFFIX}`;

/**
 * สถานะคำแปลของ 1 ช่อง
 *   empty = ยังไม่มีอังกฤษ · ai = AI แปลแล้ว รอคนตรวจ · ok = มีอังกฤษแล้ว · stale = ไทยถูกแก้หลังแปล
 */
export type TranslationStatus = "empty" | "ai" | "ok" | "stale";

export interface I18nMetaEntry {
  /** ลายนิ้วมือข้อความไทยตอนแปล/ตรวจ (8 ตัวอักษร hex) */
  h: string;
  /** true = แปลโดย AI ยังไม่มีคนตรวจ */
  ai?: boolean;
}
export type I18nMeta = Record<string, I18nMetaEntry>;

/** ข้อความของช่อง (รายการ string[] รวมเป็นบรรทัด) — ค่าอื่นที่ไม่ใช่ข้อความ = "" */
export function textOf(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join("\n");
  return typeof v === "string" ? v : "";
}

export const hasText = (v: unknown): boolean => textOf(v).trim() !== "";

/** ลายนิ้วมือสั้น ๆ ของข้อความ (FNV-1a 32 บิต) — ใช้เทียบว่าไทยเปลี่ยนไหม โดยไม่ต้องเก็บข้อความซ้ำ */
export function textFingerprint(v: unknown): string {
  const s = textOf(v).trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** บันทึกสถานะตอนแปล/ตรวจ (เก็บลายนิ้วมือของไทย ณ ตอนนั้น) */
export const metaFor = (th: unknown, ai: boolean): I18nMetaEntry => (ai ? { h: textFingerprint(th), ai: true } : { h: textFingerprint(th) });

/** อ่านสถานะการแปลทั้งก้อน (ค่าเพี้ยน = ไม่มี) */
export function readMeta(obj: Record<string, unknown> | null | undefined): I18nMeta {
  const raw = obj?.[I18N_META_KEY];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as I18nMeta) : {};
}

/** สถานะคำแปลของ 1 ช่อง */
export function translationStatus(th: unknown, en: unknown, meta?: I18nMetaEntry | null): TranslationStatus {
  if (!hasText(en)) return "empty";
  if (meta && hasText(th) && meta.h !== textFingerprint(th)) return "stale";
  if (meta?.ai) return "ai";
  return "ok";
}

/** ทำความสะอาด `_i18n` — เก็บเฉพาะช่องที่รู้จัก · ไม่มีอะไรเลย = null (ไม่ต้องเก็บ) */
export function sanitizeI18nMeta(raw: unknown, allowedKeys: Iterable<string>): I18nMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: I18nMeta = {};
  for (const k of allowedKeys) {
    const e = src[k] as Record<string, unknown> | undefined;
    if (!e || typeof e !== "object" || typeof e.h !== "string" || !/^[0-9a-f]{8}$/.test(e.h)) continue;
    out[k] = e.ai === true ? { h: e.h, ai: true } : { h: e.h };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * แพตช์สำหรับ "ใส่คำแปล" ให้ 1 ช่อง — เขียนช่อง `_en` + สถานะใน `_i18n` พร้อมกัน
 * en ว่าง = ลบสถานะของช่องนั้นทิ้ง (กลับเป็น "ยังไม่มี EN")
 */
export function translationPatch(
  obj: Record<string, unknown>,
  key: string,
  th: unknown,
  en: string | string[],
  ai: boolean,
): Record<string, unknown> {
  const meta = { ...readMeta(obj) };
  if (hasText(en)) meta[key] = metaFor(th, ai);
  else delete meta[key];
  return { [enKey(key)]: en, [I18N_META_KEY]: meta };
}

/** แพตช์ "ตรวจแล้ว" — คำแปลเดิมถูกต้อง (เอาป้าย AI ออก + จำว่าตรวจกับไทยฉบับนี้) */
export function confirmPatch(obj: Record<string, unknown>, key: string, th: unknown): Record<string, unknown> {
  return { [I18N_META_KEY]: { ...readMeta(obj), [key]: metaFor(th, false) } };
}

/** เลือกข้อความตามภาษา — อังกฤษว่าง = ใช้ไทยแทน (ลูกค้าไม่เจอช่องว่าง) */
export function pickText(obj: Record<string, unknown> | null | undefined, key: string, lang: ContentLang): string {
  const th = textOf(obj?.[key]);
  if (lang !== "en") return th;
  const en = obj?.[enKey(key)];
  return typeof en === "string" && en.trim() ? en : th;
}

/** เลือกรายการตามภาษา — เทียบทีละบรรทัด บรรทัดที่ยังไม่แปลใช้ไทยแทน */
export function pickList(obj: Record<string, unknown> | null | undefined, key: string, lang: ContentLang): string[] {
  const th = Array.isArray(obj?.[key]) ? (obj![key] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (lang !== "en") return th;
  const en = Array.isArray(obj?.[enKey(key)]) ? (obj![enKey(key)] as unknown[]) : [];
  return th.map((t, i) => (typeof en[i] === "string" && (en[i] as string).trim() ? (en[i] as string) : t));
}

/** นับความครบของคำแปล (ข้ามช่องที่ภาษาไทยว่าง — ไม่มีอะไรให้แปล) */
export interface TranslationCoverage {
  /** ช่องที่มีภาษาไทย */
  total: number;
  /** มีอังกฤษแล้ว (รวมที่ AI แปลรอตรวจ) */
  ready: number;
  /** ยังไม่มีอังกฤษ หรือไทยเปลี่ยนหลังแปล */
  missing: number;
  /** AI แปลแล้ว รอคนตรวจ */
  aiPending: number;
}

export function coverageOf(statuses: { th: unknown; status: TranslationStatus }[]): TranslationCoverage {
  const withTh = statuses.filter((s) => hasText(s.th));
  return {
    total: withTh.length,
    ready: withTh.filter((s) => s.status === "ok" || s.status === "ai").length,
    missing: withTh.filter((s) => s.status === "empty" || s.status === "stale").length,
    aiPending: withTh.filter((s) => s.status === "ai").length,
  };
}

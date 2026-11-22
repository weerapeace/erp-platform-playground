/**
 * คำแปลภาษาอื่น (นอกจากไทย/อังกฤษ) ของระเบียน — เก็บรวมในคอลัมน์ `translations` (jsonb) ช่องเดียว
 *   รูปแบบ: { ja: { name_th: "…", introduction: "…", description: "…" }, ko: { … } }
 *   เจ้าของเลือก 2026-11-22 "ช่องรวมภาษาอื่นช่องเดียว" — เพิ่มภาษาใหม่ไม่ต้องแก้ฐานข้อมูลอีก (ไทย/อังกฤษอยู่ช่องเดิม ไม่ย้าย)
 *
 * ฟอร์มกลาง (MasterCRUD) มองคำแปลเป็น "ช่องเสมือน" ชื่อ i18n_<ภาษา>_<ช่องไทย> เช่น i18n_ja_description
 *   - อ่าน: API แตก translations เป็นช่องเสมือน (flattenTranslations) → ฟอร์ม/สูตรข้อความเห็นเหมือนช่องปกติ
 *   - บันทึก: ฟอร์มส่งช่องเสมือนมา → API รวมกลับเข้า translations ของเดิม (foldTranslationPatch) ไม่ทับภาษา/ช่องอื่น
 *   - ทะเบียนฟิลด์: ช่องไทยตั้ง ui_style.lang_<ภาษา> = ชื่อช่องเสมือน (แบบเดียวกับ lang_en)
 * pure — ใช้ได้ทั้ง server/client/เทสต์ (lib/__tests__/record-translations.test.ts) · doc: docs/record-translations.md
 */

/** ภาษาเพิ่มเติมที่ระบบรู้จัก (ไทย/อังกฤษ เก็บคอลัมน์เดิม ไม่อยู่ในนี้) */
export const EXTRA_LANGS = [
  { code: "ja", label: "日本語", labelTh: "ญี่ปุ่น", aiTarget: "Japanese" },
] as const;
export type ExtraLang = (typeof EXTRA_LANGS)[number]["code"];
export const isExtraLang = (s: unknown): s is ExtraLang => EXTRA_LANGS.some((l) => l.code === s);
export const extraLangLabel = (code: string): string => EXTRA_LANGS.find((l) => l.code === code)?.label ?? code;

export const TRANSLATIONS_COLUMN = "translations";
const KEY_RE = /^i18n_([a-z]{2})_([a-z_][a-z0-9_]*)$/;

/** ชื่อช่องเสมือนของคำแปล เช่น ("ja","description") → "i18n_ja_description" */
export const i18nKey = (lang: string, field: string): string => `i18n_${lang}_${field}`;
/** แยกชื่อช่องเสมือน → { lang, field } · ไม่ใช่ช่องคำแปล = null */
export function parseI18nKey(key: string): { lang: string; field: string } | null {
  const m = KEY_RE.exec(key);
  return m ? { lang: m[1], field: m[2] } : null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** แถวที่มี translations → เติมช่องเสมือน i18n_<ภาษา>_<ช่อง> (ไม่แก้ของเดิม) · ไม่มี = คืนแถวเดิม */
export function flattenTranslations<T extends Obj>(row: T): T {
  const tr = row?.[TRANSLATIONS_COLUMN];
  if (!isObj(tr)) return row;
  const out: Obj = { ...row };
  for (const [lang, fields] of Object.entries(tr)) {
    if (!/^[a-z]{2}$/.test(lang) || !isObj(fields)) continue;
    for (const [field, v] of Object.entries(fields)) if (typeof v === "string") out[i18nKey(lang, field)] = v;
  }
  return out as T;
}

/** patch มีช่องคำแปลไหม (ต้องอ่าน translations เดิมมารวมก่อนบันทึก) */
export const hasI18nKeys = (patch: Obj): boolean => Object.keys(patch).some((k) => !!parseI18nKey(k));

/**
 * รวมช่องเสมือนใน patch กลับเข้า translations เดิม → patch ใหม่ที่มีคอลัมน์ translations แทน
 *   ข้อความว่าง/null = ลบคำแปลช่องนั้น · ภาษา/ช่องอื่นที่ไม่ได้ส่งมาคงเดิม · ไม่มีช่องคำแปล = คืน patch เดิม
 */
export function foldTranslationPatch(patch: Obj, before: unknown): Obj {
  if (!hasI18nKeys(patch)) return patch;
  const base: Record<string, Obj> = {};
  if (isObj(before)) for (const [lang, f] of Object.entries(before)) if (isObj(f)) base[lang] = { ...f };
  // ส่ง translations มาตรง ๆ ด้วย → ใช้เป็นฐาน
  if (isObj(patch[TRANSLATIONS_COLUMN])) for (const [lang, f] of Object.entries(patch[TRANSLATIONS_COLUMN] as Obj)) if (isObj(f)) base[lang] = { ...(base[lang] ?? {}), ...f };
  const out: Obj = {};
  for (const [k, v] of Object.entries(patch)) {
    const p = parseI18nKey(k);
    if (!p) { if (k !== TRANSLATIONS_COLUMN) out[k] = v; continue; }
    const text = v == null ? "" : String(v);
    const lang = (base[p.lang] ??= {});
    if (text.trim()) lang[p.field] = text; else delete lang[p.field];
  }
  for (const lang of Object.keys(base)) if (!Object.keys(base[lang]).length) delete base[lang];
  out[TRANSLATIONS_COLUMN] = base;
  return out;
}

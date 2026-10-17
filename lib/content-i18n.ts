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

/** มีอักษรไทยไหม — ข้อความที่เป็นอังกฤษ/ตัวเลขอยู่แล้ว (เช่น "PVC", "SHOP NOW") ไม่ต้องแปล ไม่นับว่าขาด */
export const needsTranslation = (v: unknown): boolean => /[฀-๿]/.test(textOf(v));

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

/**
 * คำมาตรฐานที่ใช้บ่อย (หน่วย/ชื่อชุดตัวเลือก) → อังกฤษ — ใช้แทนเมื่อร้านยังไม่ได้ตั้งภาษาอังกฤษเอง
 * ค่าที่ตั้งเองชนะเสมอ · ไม่รู้จัก = "" (เว็บใช้ไทยแทน)
 */
const COMMON_EN: Record<string, string> = {
  ใบ: "pc", ชิ้น: "pc", อัน: "pc", ตัว: "pc", เส้น: "pc", ลูก: "pc", ด้าม: "pc", คู่: "pair", ชุด: "set", กล่อง: "box",
  แพ็ค: "pack", แพ็ก: "pack", ห่อ: "pack", ม้วน: "roll", เมตร: "m", หลา: "yd", ผืน: "sheet", แผ่น: "sheet", ขวด: "bottle",
  กระปุก: "jar", หลอด: "tube", "ตร.ฟุต": "sq ft",
  สี: "Colour", "แบบ/สี": "Style / colour", "แบบ / สี": "Style / colour", แบบ: "Style", ขนาด: "Size", ลาย: "Pattern",
  ตัวเลือก: "Option", "ตัวเลือกที่ 2": "Option 2", วัสดุ: "Material", ไซซ์: "Size", ความยาว: "Length",
};
export const commonLabelEn = (th: string): string => COMMON_EN[th.trim()] ?? "";

/* ─────────── ข้อมูลซ้อนลึก (ธีม/เมนู/หมวด/คอลเลกชัน) — ไม่ต้องแก้ตัวทำความสะอาดทีละจุด ─────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** รหัสที่ใช้จับคู่ชิ้นใน array (id ก่อน ไม่มีใช้ key) — ตัวทำความสะอาดอาจกรอง/เรียงใหม่ จึงจับคู่ด้วยตำแหน่งไม่ได้ */
const idOf = (v: unknown): string | null => (isObj(v) ? (typeof v.id === "string" && v.id ? `id:${v.id}` : typeof v.key === "string" && v.key ? `key:${v.key}` : null) : null);

/**
 * เก็บคำแปล (`<key>_en` + `_i18n`) จากข้อมูลดิบกลับเข้าไปในผลที่ทำความสะอาดแล้ว — ทุกชั้นทุกจุด
 * ใช้ต่อท้ายตัวทำความสะอาดเดิม (normalizeTheme / normalizeFieldMap …) ที่เก็บเฉพาะช่องที่รู้จัก
 * keys = ช่องข้อความที่แปลได้ (เช่น label, title, desc) · array จับคู่ชิ้นด้วย id/key · แก้ norm ในตัว (คืนค่าเดิม)
 */
export function carryTranslations<T>(raw: unknown, norm: T, keys: readonly string[], maxLen = 2000): T {
  const walk = (r: unknown, n: unknown, depth: number) => {
    if (depth > 10 || r == null || n == null) return;
    if (Array.isArray(n) && Array.isArray(r)) {
      const byId = new Map<string, unknown>();
      for (const x of r) {
        const id = idOf(x);
        if (id) byId.set(id, x);
      }
      n.forEach((x, i) => {
        const id = idOf(x);
        walk(id ? byId.get(id) : byId.size ? undefined : r[i], x, depth + 1);
      });
      return;
    }
    if (!isObj(n) || !isObj(r)) return;
    const kept: string[] = [];
    for (const k of keys) {
      if (typeof n[k] !== "string") continue;
      const en = r[enKey(k)];
      if (typeof en === "string" && en.trim()) {
        n[enKey(k)] = en.slice(0, maxLen);
        kept.push(k);
      }
    }
    const meta = sanitizeI18nMeta(r[I18N_META_KEY], kept);
    if (meta) n[I18N_META_KEY] = meta;
    for (const [k, v] of Object.entries(n)) if (v && typeof v === "object" && !k.endsWith(EN_SUFFIX) && k !== I18N_META_KEY) walk(r[k], v, depth + 1);
  };
  walk(raw, norm, 0);
  return norm;
}

export type Path = (string | number)[];

/** ช่องข้อความ 1 ช่องในข้อมูลซ้อนลึก (ใช้ทำตารางคำแปล) */
export interface PathSlot {
  /** ที่อยู่ของ object ที่ถือช่องนี้ */
  path: Path;
  key: string;
  th: string;
  en: string;
  status: TranslationStatus;
  /** ป้ายบอกตำแหน่งแบบคนอ่าน เช่น ["เมนู", "Wallets"] */
  where: string[];
}

/**
 * ไล่หาช่องข้อความที่แปลได้ทุกชั้น (ข้ามช่องที่ไทยว่าง)
 * crumbOf = ป้ายของแต่ละชั้น (ชื่อช่องของ object/array → คำไทย) · ไม่คืน = ใช้ชื่อ/หัวข้อของ object นั้นเอง
 */
export function collectTextPaths(
  root: unknown,
  keys: readonly string[],
  crumbOf: (field: string) => string | null = () => null,
): PathSlot[] {
  const out: PathSlot[] = [];
  const uniqKeys = [...new Set(keys)]; // กันชื่อช่องซ้ำในรายการ (แถวซ้ำ)
  const nameOf = (o: Record<string, unknown>): string | null => {
    for (const k of ["label", "title", "name", "key"]) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim().slice(0, 40);
    return null;
  };
  const walk = (v: unknown, path: Path, where: string[], depth: number) => {
    if (depth > 10 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, [...path, i], isObj(x) ? [...where, nameOf(x) ?? `#${i + 1}`] : where, depth + 1));
      return;
    }
    const meta = readMeta(v as Record<string, unknown>);
    for (const k of uniqKeys) {
      const th = (v as Record<string, unknown>)[k];
      // ว่าง / ไม่มีอักษรไทย (เป็นอังกฤษอยู่แล้ว หรือค่าตั้งค่าอย่าง "count") = ไม่ต้องแปล
      if (typeof th !== "string" || !needsTranslation(th)) continue;
      const enRaw = (v as Record<string, unknown>)[enKey(k)];
      const en = typeof enRaw === "string" ? enRaw : "";
      out.push({ path, key: k, th, en, status: translationStatus(th, en, meta[k]), where: [...where, crumbOf(k) ?? k] });
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!x || typeof x !== "object" || k.endsWith(EN_SUFFIX) || k === I18N_META_KEY) continue;
      const c = crumbOf(k);
      walk(x, [...path, k], c ? [...where, c] : where, depth + 1);
    }
  };
  walk(root, [], [], 0);
  return out;
}

/** แก้ object ที่ path (คืนก้อนใหม่ทั้งเส้นทาง — ของเดิมไม่ถูกแตะ) */
export function updateAt<T>(root: T, path: Path, fn: (o: Record<string, unknown>) => Record<string, unknown>): T {
  if (!path.length) return fn(root as unknown as Record<string, unknown>) as unknown as T;
  const [head, ...rest] = path;
  if (Array.isArray(root)) return root.map((x, i) => (i === head ? updateAt(x, rest, fn) : x)) as unknown as T;
  const o = (root ?? {}) as Record<string, unknown>;
  return { ...o, [head]: updateAt(o[head as string], rest, fn) } as unknown as T;
}

/** คัดเฉพาะช่องคำแปล (`*_en` + `_i18n`) ของ object — ใช้ตอนหน้าจอสร้าง object ใหม่จากช่องที่รู้จัก (กันคำแปลหาย) */
export function pickTranslations(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if ((k.endsWith(EN_SUFFIX) && typeof v === "string") || (k === I18N_META_KEY && isObj(v))) out[k] = v;
  return out;
}

/** อ่าน object ที่ path */
export function getAt(root: unknown, path: Path): Record<string, unknown> {
  let cur: unknown = root;
  for (const p of path) cur = cur == null ? undefined : (cur as Record<string | number, unknown>)[p];
  return isObj(cur) ? cur : {};
}

/** ใส่คำแปลหลายช่องทีเดียว (ai = ติดป้าย "AI แปล · รอตรวจ") */
export function applyPathTranslations<T>(root: T, results: { slot: PathSlot; en: string }[], ai = true): T {
  let next = root;
  for (const { slot, en } of results) next = updateAt(next, slot.path, (o) => ({ ...o, ...translationPatch(o, slot.key, o[slot.key] ?? slot.th, en, ai) }));
  return next;
}

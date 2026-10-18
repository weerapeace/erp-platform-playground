/**
 * ชื่อประกอบจากหลายชิ้น (ของกลาง) — เช่น "Name Platform" ของ Parent SKU = ชื่อสินค้า + รหัส
 * (ไฟล์ pure ห้ามใส่ "use client" — API route / เทสต์ import ได้)
 *
 * ตั้งได้ (เจ้าของขอ 2026-10-18 "เลือกได้ว่าจะมีค่าอะไรบ้าง และสลับตำแหน่งได้"):
 *   - ใช้ชิ้นไหนบ้าง: แบรนด์ / คอลเลกชัน / ชื่อสินค้า / รหัส / หมวดสินค้า / ข้อความพิมพ์เอง
 *   - เรียงลำดับ · ตัวคั่นระหว่างชิ้น
 *   - ไม่ใส่ซ้ำ: ถ้า "ชื่อสินค้า" มีแบรนด์/รหัส/… อยู่แล้ว → ดึงออกจากชื่อ แล้ววางตามลำดับที่ตั้ง
 *     (ข้อมูลจริง 2026-10-18: 1,088/1,502 รุ่นมีรหัสในชื่อไทยอยู่แล้ว · สูตรเดิมต่อรหัสซ้ำ "… ONX05 ONX05")
 * เก็บที่ทะเบียนฟิลด์ relation_config.name_parts ของฟิลด์ computed (ไม่ต้องเพิ่มตาราง)
 * ใช้คู่กับ lib/computed-text (name_platform_code / name_platform_code_en) · ตัวตั้งค่า = components/name-parts-editor
 */

export type NamePartKey = "brand" | "collection" | "name" | "code" | "category" | "text";
export type NamePart = { key: NamePartKey; text?: string; text_en?: string };
export type NamePartsConfig = { parts: NamePart[]; sep: string; dedupe: boolean };
export type NameLang = "th" | "en";

export const NAME_PART_DEFS: { key: NamePartKey; label: string; hint: string }[] = [
  { key: "brand", label: "แบรนด์", hint: "เช่น Louis Montini" },
  { key: "collection", label: "คอลเลกชัน", hint: "ตามที่ตั้งในช่อง Collection" },
  { key: "name", label: "ชื่อสินค้า", hint: "ไทย = Name Th · อังกฤษ = Name En" },
  { key: "code", label: "รหัส (Code)", hint: "เช่น BSD14" },
  { key: "category", label: "หมวดสินค้า", hint: "ตามที่ตั้งในช่อง Category" },
  { key: "text", label: "ข้อความพิมพ์เอง", hint: "เช่น ของแท้ / Official" },
];

export const NAME_SEPARATORS: { value: string; label: string }[] = [
  { value: " ", label: "เว้นวรรค" },
  { value: " - ", label: "ขีด ( - )" },
  { value: " | ", label: "ขีดตั้ง ( | )" },
  { value: " · ", label: "จุดกลาง ( · )" },
  { value: ", ", label: "จุลภาค ( , )" },
];

/** ค่าตั้งต้น = แบบเดิม (ชื่อสินค้า + รหัส) แต่ไม่ใส่รหัสซ้ำ */
export const DEFAULT_NAME_PARTS: NamePartsConfig = { parts: [{ key: "name" }, { key: "code" }], sep: " ", dedupe: true };

const PART_KEYS = new Set<NamePartKey>(NAME_PART_DEFS.map((d) => d.key));
const MAX_TEXT = 60;
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** ล้างค่าที่เก็บไว้/ส่งมา → config ที่ใช้ได้เสมอ (ชิ้นละไม่เกิน 1 ครั้ง · ว่าง/เสีย = ค่าตั้งต้น) */
export function cleanNameParts(raw: unknown): NamePartsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as { parts?: unknown; sep?: unknown; dedupe?: unknown };
  const seen = new Set<string>();
  const parts: NamePart[] = [];
  for (const p of Array.isArray(r.parts) ? r.parts : []) {
    const key = (p as { key?: unknown })?.key as NamePartKey;
    if (!PART_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (key === "text") {
      const text = str((p as { text?: unknown }).text).slice(0, MAX_TEXT);
      const text_en = str((p as { text_en?: unknown }).text_en).slice(0, MAX_TEXT);
      if (!text && !text_en) continue;   // ข้อความว่าง = ไม่มีชิ้นนี้
      parts.push({ key, text, ...(text_en ? { text_en } : {}) });
    } else parts.push({ key });
  }
  if (!parts.length) return { ...DEFAULT_NAME_PARTS, parts: [...DEFAULT_NAME_PARTS.parts] };
  const sep = typeof r.sep === "string" && NAME_SEPARATORS.some((s) => s.value === r.sep) ? r.sep : DEFAULT_NAME_PARTS.sep;
  return { parts, sep, dedupe: r.dedupe !== false };
}

/** ข้อความของแต่ละชิ้นจากข้อมูลสินค้า 1 แถว (แถวจากทะเบียนกลางมี brand_label/collection_label/category_label) */
export function namePartText(part: NamePart, row: Record<string, unknown>, lang: NameLang): string {
  switch (part.key) {
    case "brand": return str(row.brand_label) || str(row.brand_name);
    case "collection": return str(row.collection_label) || str(row.collection_name);
    case "category": return str(row.category_label) || str(row.category_name);
    case "code": return str(row.code);
    case "text": return lang === "en" ? str(part.text_en) || str(part.text) : str(part.text);
    case "name":
      // ไทย: ชื่อลงขายที่พิมพ์ไว้ (ถ้ามี) > Name Th · อังกฤษ: Name En > ฝั่งไทย (เหมือนสูตรเดิม)
      return lang === "en"
        ? str(row.name_en) || str(row.name_platform) || str(row.name_th)
        : str(row.name_platform) || str(row.name_th);
  }
}

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);

/** ลบคำ/วลีออกจากข้อความ (ไม่สนตัวพิมพ์เล็กใหญ่) — ต้องไม่ติดตัวอักษร/ตัวเลขข้าง ๆ (กัน "IG-CHAIN" ไปกิน "IG-CHAIN01") */
export function removeToken(source: string, token: string): string {
  const t = token.trim();
  if (!t) return source;
  const lower = source.toLowerCase();
  const tl = t.toLowerCase();
  let out = "";
  let i = 0;
  for (;;) {
    const at = lower.indexOf(tl, i);
    if (at < 0) { out += source.slice(i); break; }
    const before = source[at - 1];
    const after = source[at + t.length];
    const edgeOk = !(isWordChar(before) && isWordChar(t[0])) && !(isWordChar(after) && isWordChar(t[t.length - 1]));
    out += source.slice(i, edgeOk ? at : at + t.length);
    i = at + t.length;
  }
  return out;
}

/** เก็บกวาดหลังดึงชิ้นออก: วงเล็บว่าง · ช่องว่างซ้อน · ตัวคั่นค้างหัว/ท้าย */
export function tidyName(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-|·,]+|[\s\-|·,]+$/g, "")
    .trim();
}

/** ประกอบชื่อตาม config (ไทย/อังกฤษ) */
export function buildNameFromParts(row: Record<string, unknown>, cfg: unknown, lang: NameLang = "th"): string {
  const c = cleanNameParts(cfg);
  const vals = c.parts.map((p) => ({ key: p.key, text: namePartText(p, row, lang) }));
  if (c.dedupe) {
    const name = vals.find((v) => v.key === "name");
    if (name && name.text) {
      let n = name.text;
      // ชิ้นยาวก่อน (เช่น คอลเลกชัน "Patchwork Collection" ก่อน "Patchwork") กันตัดเหลือเศษ
      for (const v of [...vals].filter((x) => x.key !== "name" && x.text).sort((a, b) => b.text.length - a.text.length)) n = removeToken(n, v.text);
      name.text = tidyName(n);
    }
  }
  return vals.map((v) => v.text).filter(Boolean).join(c.sep);
}

/** สรุปเป็นภาษาคน เช่น "ชื่อสินค้า + รหัส (Code)" */
export function describeNameParts(cfg: unknown): string {
  const c = cleanNameParts(cfg);
  const label = (p: NamePart) => (p.key === "text" ? `“${p.text || p.text_en}”` : NAME_PART_DEFS.find((d) => d.key === p.key)?.label ?? p.key);
  return `${c.parts.map(label).join(" + ")}${c.dedupe ? " · ไม่ใส่ซ้ำ (ชื่อมีแบรนด์/รหัสอยู่แล้วจะดึงมาวางตามลำดับ)" : ""}`;
}

/**
 * คำอธิบายประกอบจากบล็อก (ของกลาง) — เช่น "Platform Description" ของ Parent SKU
 * (ไฟล์ pure ห้ามใส่ "use client" — API route / เทสต์ import ได้)
 *
 * เจ้าของขอ 2026-10-20 "อยากได้ popup แก้สูตรอันนี้ด้วย" (ต่อจาก ⚙ Name Platform — lib/name-parts)
 *   - บล็อกเรียงลำดับได้ · เปิด/ปิดได้ · ตั้งว่าเว้นบรรทัดหรือติดบรรทัดบน
 *   - บล็อกข้อมูลจากสินค้า (บทนำ/รายละเอียด/ขนาด/…) ว่าง = ข้ามเอง
 *   - บล็อกข้อความ (Notes/เปลี่ยนสินค้า/เงื่อนไขสั่งซื้อ/ติดตามร้าน + พิมพ์เองเพิ่มได้) แก้ข้อความไทย/อังกฤษได้
 *     ใส่ตัวแทนได้: {แบรนด์} {รับประกัน} {รหัส} {ชื่อสินค้า}
 *   - เจ้าของขอเพิ่ม 2026-10-20 "ต้องเลือกได้ทุก field ห้าม hardcode, และมี if ด้วย"
 *     → แทรกได้ทุกฟิลด์ด้วย {คีย์ฟิลด์} เช่น {brand_name} {weight_g} (relation โชว์ชื่อ ไม่ใช่ id)
 *     → ทุกบล็อกตั้ง "ถ้า…" ได้ (ทุกข้อ/ข้อใดข้อหนึ่ง) · บล็อกข้อความมี "ไม่ตรงเงื่อนไข → ข้อความแทน"
 * เก็บที่ทะเบียนฟิลด์ relation_config.desc_blocks · ยังไม่ตั้ง = ใช้สูตรเดิมในโค้ด (lib/computed-text) ไม่เปลี่ยนอะไร
 * ตัวตั้งค่า = components/desc-blocks-editor
 */

import { readRelationLabel } from "@/lib/relation";

export type DescLang = "th" | "en";
export type DescBlockKey = "intro" | "details" | "size_desc" | "how_to_size" | "size_line" | "special" | "notes" | "warranty" | "exchange" | "ordering" | "follow" | "text";
export type DescGap = "blank" | "line";
/** เงื่อนไข: มีค่า · ว่าง · เท่ากับ · ไม่เท่ากับ · มีคำว่า · ไม่มีคำว่า · มากกว่า · น้อยกว่า · ติ๊ก · ไม่ติ๊ก */
export type DescOp = "filled" | "empty" | "eq" | "neq" | "contains" | "not_contains" | "gt" | "lt" | "true" | "false";
export type DescRule = { field: string; op: DescOp; value?: string };
export type DescWhen = { match: "all" | "any"; rules: DescRule[] };
export type DescBlock = {
  id: string; key: DescBlockKey; on: boolean; gap: DescGap; text?: string; text_en?: string;
  /** แสดงบล็อกนี้เมื่อ… (ไม่มี = แสดงเสมอ) */
  when?: DescWhen;
  /** บล็อกข้อความ: ไม่ตรงเงื่อนไข → ใช้ข้อความนี้แทน (ว่าง = ข้ามบล็อก) */
  else_text?: string; else_text_en?: string;
};
export type DescBlocksConfig = { blocks: DescBlock[] };

type Def = { label: string; hint: string; kind: "field" | "text" | "auto"; th?: string; en?: string };
export const DESC_BLOCK_DEFS: Record<DescBlockKey, Def> = {
  intro: { label: "บทนำ", hint: "ช่อง Introduction (อังกฤษ = Introduction En)", kind: "field" },
  details: { label: "รายละเอียดสินค้า", hint: "หัวข้อ + ช่อง Description (อังกฤษ = English Description) · แก้หัวข้อได้", kind: "field", th: "รายละเอียดสินค้า", en: "Product details" },
  size_desc: { label: "คำอธิบายขนาด", hint: "จากช่องคำอธิบายขนาด (มีแต่ภาษาไทย)", kind: "field" },
  how_to_size: { label: "วิธีวัดขนาด", hint: "จากช่อง How to size (มีแต่ภาษาไทย)", kind: "field" },
  size_line: { label: "ขนาดสินค้า / น้ำหนัก", hint: "คำนวณจาก กว้าง×สูง×หนา หรือขนาดพิมพ์เอง + น้ำหนัก (ถ้าติ๊กโชว์)", kind: "auto" },
  special: { label: "คำอธิบายพิเศษ", hint: "จากช่องคำอธิบายพิเศษ (มีแต่ภาษาไทย)", kind: "field" },
  notes: { label: "หัวข้อ Notes", hint: "ข้อความ", kind: "text", th: "Notes:", en: "Notes:" },
  warranty: { label: "รับประกัน", hint: "ข้ามเองถ้าไม่มีรับประกัน · ใส่ {รับประกัน} ตรงที่จะให้ระยะเวลาไปอยู่", kind: "text", th: "**ระยะเวลารับประกันสินค้า {รับประกัน}**", en: "**Warranty: {รับประกัน}**" },
  exchange: { label: "นโยบายเปลี่ยนสินค้า", hint: "ข้อความ", kind: "text",
    th: "ลูกค้าสามารถเปลี่ยนสินค้าได้ ภายใน 7 วัน หากสินค้าเสียหายโดยเกิดจากกระบวนการผลิต โดยไม่เสียค่าใช้จ่ายเพิ่มเติม",
    en: "Items can be exchanged within 7 days at no extra cost if the defect is caused by the manufacturing process." },
  ordering: { label: "เงื่อนไขการสั่งซื้อ", hint: "ข้อความหลายบรรทัด · {แบรนด์} = ชื่อแบรนด์ของสินค้า", kind: "text",
    th: [
      ".... การสั่งซื้อสินค้าผ่าน {แบรนด์} Official",
      "1. การจัดส่งสินค้าจะจัดส่ง ทุกวันจันทร์ - วันเสาร์ โดยทางร้านจะตัดยอด ณ.เวลา 08.00 น.ของทุกวัน (หากสั่งสินค้า หลัง 08.00 น. ทางร้านจะจัดส่งให้ในวันถัดไปค่ะ (ไม่รวมวันอาทิตย์))",
      "2. หลังจากลูกค้าโอนเงินจะใช้เวลาในการจัดเตรียมสินค้าประมาณ 1-3 วัน และใช้ระยะเวลาจัดส่ง 2-5 วัน ขึ้นอยู่กับแต่ละบริษัทขนส่ง",
      "3. หากลูกค้ากรอกที่อยู่ผิดหรือเบอร์โทรศัพท์ผิด ทางเราจะไม่สามารถแก้ไขข้อมูลของคุณลูกค้าได้ ต้องรบกวนคุณลูกค้ากดยกเลิกแล้วสั่งเข้ามาใหม่",
      "4. หากสั่งไซส์ผิด ลูกค้าสามารถเปลี่ยนไซส์ได้ (แต่เปลี่ยนแบบไม่ได้) แต่จะมีค่าขนส่งสินค้ากลับไป 50 บาท (ค่าส่งลูกค้าเป็นคนออกเอง)",
    ].join("\n"),
    en: [
      ".... Ordering from {แบรนด์} Official",
      "1. Orders are shipped Monday–Saturday. Daily cut-off is 08:00 (orders placed after 08:00 ship the next day, excluding Sundays).",
      "2. After payment, please allow 1–3 days for preparation and 2–5 days for delivery, depending on the courier.",
      "3. If the address or phone number is entered incorrectly, we cannot edit it for you — please cancel and place a new order.",
      "4. Wrong size can be exchanged (style cannot be changed); a 50 THB return-shipping fee applies (paid by the customer).",
    ].join("\n") },
  follow: { label: "ติดตามร้าน / ติดต่อ", hint: "ข้อความ", kind: "text",
    th: "....• อย่าลืม! กดติดตามร้านค้าเพื่อรับโปรโมชั่น และเห็นสินค้าใหม่ก่อนใคร\n....• หากมีข้อสงสัยสามารถ ติดต่อสอบถามผ่านช่องทางแชทได้ ทุกวันจันทร์ - เสาร์ ตั้งแต่ 8.00 - 22.00 น. และวันอาทิตย์ 11.00 – 22.00 น.",
    en: "....• Follow our shop for promotions and to see new arrivals first.\n....• For any questions, chat with us Monday–Saturday 08:00–22:00, Sunday 11:00–22:00." },
  text: { label: "ข้อความพิมพ์เอง", hint: "เพิ่มได้หลายอัน · อังกฤษว่าง = ไม่ใส่ในฉบับอังกฤษ", kind: "text" },
};

/** ตัวแทนพิเศษ (มีตรรกะเพิ่มจากค่าในฟิลด์) — ฟิลด์อื่นทุกตัวใส่ได้ด้วย {คีย์ฟิลด์} */
export const DESC_PLACEHOLDERS: { token: string; label: string; hint: string }[] = [
  { token: "{แบรนด์}", label: "แบรนด์", hint: "ชื่อแบรนด์" },
  { token: "{รับประกัน}", label: "รับประกัน", hint: "อังกฤษแปลให้ (1 ปี → 1 year(s)) · ไม่มีรับประกัน = ว่าง" },
  { token: "{รหัส}", label: "รหัสสินค้า", hint: "Code" },
  { token: "{ชื่อสินค้า}", label: "ชื่อสินค้า", hint: "อังกฤษใช้ Name En (ว่าง = ชื่อไทย)" },
];
const SPECIAL = new Set(DESC_PLACEHOLDERS.map((p) => p.token.slice(1, -1)));

/** เงื่อนไขที่เลือกได้ (ตัวตั้งค่ากรองตามชนิดฟิลด์) */
export const DESC_OPS: { op: DescOp; label: string; value: boolean; for: "any" | "number" | "boolean" | "text" }[] = [
  { op: "filled", label: "มีค่า", value: false, for: "any" },
  { op: "empty", label: "ว่าง", value: false, for: "any" },
  { op: "eq", label: "เท่ากับ", value: true, for: "any" },
  { op: "neq", label: "ไม่เท่ากับ", value: true, for: "any" },
  { op: "contains", label: "มีคำว่า", value: true, for: "text" },
  { op: "not_contains", label: "ไม่มีคำว่า", value: true, for: "text" },
  { op: "gt", label: "มากกว่า", value: true, for: "number" },
  { op: "lt", label: "น้อยกว่า", value: true, for: "number" },
  { op: "true", label: "ติ๊ก (เปิด)", value: false, for: "boolean" },
  { op: "false", label: "ไม่ติ๊ก (ปิด)", value: false, for: "boolean" },
];
const OPS = new Set(DESC_OPS.map((o) => o.op));

const b = (key: DescBlockKey, gap: DescGap): DescBlock => ({ id: key, key, on: true, gap });
/** ค่าตั้งต้น = โครงเดียวกับสูตรเดิม (บทนำ · รายละเอียด · ขนาด · พิเศษ · Notes · รับประกัน · เปลี่ยนสินค้า · สั่งซื้อ · ติดตามร้าน) */
export const DEFAULT_DESC_BLOCKS: DescBlock[] = [
  b("intro", "blank"), b("details", "blank"), b("size_desc", "blank"), b("how_to_size", "blank"), b("size_line", "line"),
  b("special", "blank"), b("notes", "blank"), b("warranty", "line"), b("exchange", "line"), b("ordering", "blank"), b("follow", "blank"),
];

const KEYS = new Set(Object.keys(DESC_BLOCK_DEFS));
const MAX_TEXT = 3000;
const FIELD_RE = /^[A-Za-z0-9_]{1,64}$/;   // คีย์ฟิลด์ (อังกฤษ) — {คำไทยอื่น} ที่ไม่ใช่ตัวแทนพิเศษ คงไว้ตามที่พิมพ์
const s = (v: unknown): string => (v == null ? "" : String(v));
const trim = (v: unknown): string => s(v).trim();

/** ล้างค่า → ใช้ได้เสมอ (บล็อกระบบอย่างละ 1 · ข้อความพิมพ์เองหลายอัน · ไม่มีอะไร = ค่าตั้งต้น) */
export function cleanDescBlocks(raw: unknown): DescBlocksConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as { blocks?: unknown };
  const seen = new Set<string>();
  const blocks: DescBlock[] = [];
  for (const x of Array.isArray(r.blocks) ? r.blocks : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const key = o.key as DescBlockKey;
    if (!KEYS.has(key)) continue;
    let id = trim(o.id) || key;
    if (key !== "text") id = key;            // บล็อกระบบ id = ชื่อบล็อก
    if (seen.has(id)) { if (key !== "text") continue; id = `${id}_${blocks.length}`; }
    seen.add(id);
    const def = DESC_BLOCK_DEFS[key];
    const blk: DescBlock = { id, key, on: o.on !== false, gap: o.gap === "line" ? "line" : "blank" };
    if (def.kind === "text" || key === "details") {
      const t = s(o.text).slice(0, MAX_TEXT), te = s(o.text_en).slice(0, MAX_TEXT);
      if (t) blk.text = t;
      if (te) blk.text_en = te;
      if (key === "text" && !t.trim() && !te.trim()) continue;   // ข้อความพิมพ์เองว่าง = ไม่มีบล็อกนี้
    }
    const when = cleanWhen(o.when);
    if (when) {
      blk.when = when;
      if (def.kind === "text") {
        const et = s(o.else_text).slice(0, MAX_TEXT), ete = s(o.else_text_en).slice(0, MAX_TEXT);
        if (et.trim()) blk.else_text = et;
        if (ete.trim()) blk.else_text_en = ete;
      }
    }
    blocks.push(blk);
  }
  return { blocks: blocks.length ? blocks : DEFAULT_DESC_BLOCKS.map((x) => ({ ...x })) };
}

function cleanWhen(raw: unknown): DescWhen | undefined {
  const w = (raw && typeof raw === "object" ? raw : null) as { match?: unknown; rules?: unknown } | null;
  if (!w || !Array.isArray(w.rules)) return undefined;
  const rules: DescRule[] = [];
  for (const x of w.rules.slice(0, 10)) {
    const r = (x ?? {}) as Record<string, unknown>;
    const field = trim(r.field), op = r.op as DescOp;
    if (!(FIELD_RE.test(field) || SPECIAL.has(field)) || !OPS.has(op)) continue;
    const rule: DescRule = { field, op };
    if (DESC_OPS.find((o) => o.op === op)?.value) rule.value = s(r.value).slice(0, 200);
    rules.push(rule);
  }
  return rules.length ? { match: w.match === "any" ? "any" : "all", rules } : undefined;
}

// ── ข้อมูลจากสินค้า ──
const g = (v: unknown): string => { const n = Number(v); return isFinite(n) ? String(parseFloat(n.toFixed(4))) : "0"; };

function warrantyOf(row: Record<string, unknown>, lang: DescLang): string {
  const w = trim(row.warranty);
  if (!w || w === "ไม่มีรับประกัน") return "";
  return lang === "en"
    ? w.replace(/ปี/g, "year(s)").replace(/เดือน/g, "month(s)").replace(/วัน/g, "day(s)").replace(/ตลอดอายุการใช้งาน/g, "lifetime").trim()
    : w;
}

/** บรรทัดขนาด/น้ำหนัก — ตรรกะเดียวกับสูตรเดิม */
export function sizeLineOf(row: Record<string, unknown>, lang: DescLang): string {
  const width = Number(row.size_length_cm) || 0, height = Number(row.size_height_cm) || 0, thick = Number(row.size_thickness_cm) || 0;
  const customSize = trim(row.custom_size);
  const weightVal = Number(row.weight_g) || 0;
  const weightShow = !!row.show_weight && weightVal > 0;
  const en = lang === "en";
  const productSize = en
    ? (thick ? `${g(width)} x ${g(height)} x ${g(thick)} cm. (W x H x D)` : `${g(width)} x ${g(height)} cm. (W x H)`)
    : (thick ? `${g(width)} x ${g(height)} x ${g(thick)} cm. (กว้าง x สูง x หนา)` : `${g(width)} x ${g(height)} cm. (กว้าง x ยาว)`);
  const weightText = weightShow ? (en ? ` | Weight: ${g(weightVal)} g` : ` | น้ำหนัก: ${g(weightVal)} กรัม`) : "";
  const prefix = en ? "- Size: " : "- ขนาดสินค้า: ";
  if (!(width === 0 && height === 0)) return `${prefix}${productSize}${weightText}`;
  if (customSize) return `${prefix}${customSize}${weightText}`;
  if (weightShow) return en ? `- Weight: ${g(weightVal)} g` : `- น้ำหนัก: ${g(weightVal)} กรัม`;
  return "";
}

/** ค่าเดียวเป็นข้อความอ่านได้ (ไม่ต้องรู้ชนิดฟิลด์) — ใช่/ไม่ใช่ · ตัวเลขมีจุลภาค · วันที่ วว/ดด/ปปปป · รายการคั่น , */
function formatValue(v: unknown, lang: DescLang): string {
  if (v == null) return "";
  if (typeof v === "boolean") return lang === "en" ? (v ? "Yes" : "No") : (v ? "ใช่" : "ไม่ใช่");
  if (typeof v === "number") return isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";
  if (Array.isArray(v)) return v.map((x) => formatValue(x, lang)).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return formatValue(o.label ?? o.name ?? o.title ?? o.value ?? o.text ?? null, lang);
  }
  const str = String(v).trim();
  const d = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(str);
  return d ? `${d[3]}/${d[2]}/${d[1]}` : str;
}

/** ค่าของฟิลด์ (หรือตัวแทนพิเศษ) เป็นข้อความ — relation (…_id) ใช้ชื่อจาก {base}_label / {base}_name */
export function descFieldValue(row: Record<string, unknown>, key: string, lang: DescLang): string {
  switch (key) {
    case "แบรนด์": return trim(row.brand_name) || trim(row.brand_label);
    case "รับประกัน": return warrantyOf(row, lang);
    case "รหัส": return trim(row.code);
    case "ชื่อสินค้า": return lang === "en" ? trim(row.name_en) || trim(row.name_th) : trim(row.name_th);
    default: break;
  }
  const rel = readRelationLabel(row, key);
  if (rel) return rel.trim();
  return formatValue(row[key], lang);
}

/** แทนตัวแทนในข้อความ ({คีย์ฟิลด์} ทุกตัว + ตัวแทนพิเศษ) · ช่องว่างซ้อนในบรรทัดยุบเหลือช่องเดียว (ค่าว่าง) */
export function fillDescText(text: string, row: Record<string, unknown>, lang: DescLang): string {
  return text
    .replace(/\{([^{}\s]{1,64})\}/g, (m, k: string) => (SPECIAL.has(k) || FIELD_RE.test(k) ? descFieldValue(row, k, lang) : m))
    .split("\n").map((l) => l.replace(/ {2,}/g, " ").replace(/\s+$/, "")).join("\n");
}

/** คีย์ฟิลด์ที่ใช้ในข้อความ (ไว้โชว์คำอธิบายใต้ช่อง) */
export function descTokensIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{([^{}\s]{1,64})\}/g)) if ((SPECIAL.has(m[1]) || FIELD_RE.test(m[1])) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

const norm = (v: string): string => v.trim().toLowerCase();
/** เงื่อนไขข้อเดียวจริงไหม (เทียบกับค่าที่อ่านได้ + ค่าดิบ) */
export function descRuleTrue(rule: DescRule, row: Record<string, unknown>): boolean {
  const raw = row[rule.field];
  const disp = descFieldValue(row, rule.field, "th");
  const val = s(rule.value);
  const isZero = typeof raw !== "boolean" && raw != null && raw !== "" && Number(raw) === 0;
  const filled = typeof raw === "boolean" ? raw : disp !== "" && !isZero;
  const same = norm(disp) === norm(val) || (raw != null && typeof raw !== "object" && norm(String(raw)) === norm(val));
  const n = Number(raw), nv = Number(val);
  const nums = raw != null && raw !== "" && isFinite(n) && val.trim() !== "" && isFinite(nv);
  const truthy = raw === true || raw === 1 || raw === "true";
  switch (rule.op) {
    case "filled": return filled;
    case "empty": return !filled;
    case "eq": return same;
    case "neq": return !same;
    case "contains": return !!val.trim() && norm(disp).includes(norm(val));
    case "not_contains": return !val.trim() || !norm(disp).includes(norm(val));
    case "gt": return nums && n > nv;
    case "lt": return nums && n < nv;
    case "true": return truthy;
    case "false": return !truthy;
    default: return true;
  }
}
/** เงื่อนไขของบล็อกผ่านไหม (ไม่มีเงื่อนไข = ผ่าน) */
export function descWhenTrue(when: DescWhen | undefined, row: Record<string, unknown>): boolean {
  if (!when || !when.rules.length) return true;
  return when.match === "any" ? when.rules.some((r) => descRuleTrue(r, row)) : when.rules.every((r) => descRuleTrue(r, row));
}

/** ข้อความของบล็อกเดียว ("" = ข้าม) */
export function renderDescBlock(blk: DescBlock, row: Record<string, unknown>, lang: DescLang): string {
  const def = DESC_BLOCK_DEFS[blk.key];
  const en = lang === "en";
  if (!descWhenTrue(blk.when, row)) {
    // ไม่ตรงเงื่อนไข: บล็อกข้อความที่ตั้ง "ข้อความแทน" → ใช้ข้อความนั้น · อื่น ๆ = ข้าม
    const alt = def.kind === "text" ? (en ? blk.else_text_en : blk.else_text) : "";
    return alt ? fillDescText(alt, row, lang).trim() : "";
  }
  switch (blk.key) {
    case "intro": return s(en ? row.introduction_en : row.introduction).trim();
    case "details": {
      const body = s(en ? row.english_description : row.description).trim();
      if (!body) return "";
      const head = (en ? blk.text_en || def.en : blk.text || def.th) ?? "";
      return head.trim() ? `${head.trim()}\n${body}` : body;
    }
    case "size_desc": return en ? "" : trim(row.size_description);
    case "how_to_size": return en ? "" : trim(row.how_to_size);
    case "special": return en ? "" : trim(row.special_description);
    case "size_line": return sizeLineOf(row, lang);
    case "warranty": if (!warrantyOf(row, lang)) return ""; break;
    default: break;
  }
  // บล็อกข้อความ: ไม่ได้แก้ = ข้อความตั้งต้น · พิมพ์เองที่อังกฤษว่าง = ไม่ใส่ฉบับอังกฤษ
  const raw = en ? (blk.text_en ?? (blk.key === "text" ? "" : def.en ?? "")) : (blk.text ?? def.th ?? "");
  return fillDescText(raw, row, lang).trim();
}

/** ประกอบคำอธิบายตามบล็อก (ไทย/อังกฤษ) */
export function buildDescription(row: Record<string, unknown>, cfg: unknown, lang: DescLang = "th"): string {
  const c = cleanDescBlocks(cfg);
  let out = "";
  for (const blk of c.blocks) {
    if (!blk.on) continue;
    const part = renderDescBlock(blk, row, lang);
    if (!part) continue;
    out = out ? out + (blk.gap === "line" ? "\n" : "\n\n") + part : part;
  }
  return out;
}

/** สรุปสั้น ๆ เช่น "บทนำ → รายละเอียดสินค้า → … (9 บล็อก)" */
export function describeDescBlocks(cfg: unknown): string {
  const on = cleanDescBlocks(cfg).blocks.filter((x) => x.on);
  const names = on.map((x) => DESC_BLOCK_DEFS[x.key].label);
  const conds = on.filter((x) => x.when).length;
  return `${names.slice(0, 4).join(" → ")}${names.length > 4 ? " → …" : ""} (${on.length} บล็อก${conds ? ` · มีเงื่อนไข ${conds}` : ""})`;
}

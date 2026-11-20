/**
 * ค่าเริ่มต้นของ "ช่องคุณลักษณะของหมวด" ต่อร้าน (ของกลาง · pure · ใช้ได้ทุกร้าน — Shopee ใช้แล้ว · TikTok/Lazada ย้ายมาใช้ได้)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-20 (ทดสอบ LY22): "บางช่องอยากให้ set ได้เหมือนกันทุกอัน — ประเทศ = ไทย · ระยะรับประกัน (ดูในรายละเอียด) ·
 *   ขนาดใส่ตามขนาด · ประเภทการประกัน > จากผู้ผลิต · สภาพ > ใหม่" → ตั้งได้เองต่อร้าน ไม่ใส่ตายในโค้ด
 * เก็บ: ui_config key = listingAttrDefaultsKey(platform, brandId) → { rules } (แก้ในป๊อป "ค่าเริ่มต้นของร้าน" · ยังไม่ตั้ง = DEFAULT_ATTR_RULES)
 * ใช้: ตัวประกอบข้อมูลของร้าน เติมให้ "ช่องที่ยังว่าง" เท่านั้น (ค่าที่กรอก/บันทึกไว้ในร่างมาก่อนเสมอ) · หน้าเว็บติดป้ายที่มา
 * 2026-11-20 รอบ Lazada (เจ้าของเลือกข้อ 3): สินค้า "ไม่มีรับประกัน" → ช่องประเภทการประกันใส่ "ไม่มีประกัน" อัตโนมัติ (กันข้อมูลขัดกัน)
 *   ค่าเริ่มต้นต่อร้าน (defaultAttrRules) · ระยะประกันแปลอังกฤษให้ร้านที่ตัวเลือกเป็นอังกฤษ (warrantyEn) · ค่าตายตัวใส่ {warranty} / {warranty_en} ได้
 *   applyAttrDefaults = ลูปเติมช่องว่างตัวเดียว ใช้ทั้ง Shopee และ Lazada
 * เทสต์ lib/__tests__/listing-attr-defaults.test.ts
 */
import type { TtsAttrState, TtsAttrVal } from "@/lib/tiktok-attrs";

export type AttrDefaultSource = "fixed" | "warranty" | "size" | "weight";
/** field = ชื่อช่องของร้าน (ไม่สนวงเล็บ/ช่องว่าง) · ลงท้าย * = ชื่อขึ้นต้นด้วยคำนี้ (เช่น "ประเทศ*") */
export type AttrDefaultRule = { field: string; source: AttrDefaultSource; value?: string };
export type AttrDefaultProduct = { warranty: string | null; size: { l: number | null; w: number | null; h: number | null } | null; weightKg: number | null };

export const ATTR_DEFAULT_SOURCE_LABEL: Record<AttrDefaultSource, string> = {
  fixed: "ค่าที่กำหนด",
  warranty: "จากช่องรับประกันของสินค้า",
  size: "จากขนาดสินค้า (ยาว × กว้าง × สูง)",
  weight: "จากน้ำหนักสินค้า",
};

/** ค่าเริ่มต้นของระบบ Shopee (ใช้เมื่อร้านยังไม่ได้ตั้งเอง) — ตามที่เจ้าของบอก 2026-11-20 */
export const DEFAULT_ATTR_RULES: AttrDefaultRule[] = [
  { field: "ประเทศ*", source: "fixed", value: "ไทย" },
  { field: "สภาพ", source: "fixed", value: "ใหม่" },
  { field: "ประเภทการประกัน", source: "fixed", value: "ประกันจากผู้ผลิต" },
  { field: "ระยะเวลารับประกัน", source: "warranty" },
  { field: "ขนาด", source: "size" },
];
/** แม่แบบนโยบายรับประกัน (อังกฤษ) — แก้ได้ในป๊อปค่าเริ่มต้นของร้าน · {warranty_en} = ระยะประกันภาษาอังกฤษ */
export const WARRANTY_POLICY_TEMPLATE = "Warranty: {warranty_en}. Exchange within 7 days of receipt for manufacturing defects, free of charge. Please contact us via chat with your order number.";
/** ค่าเริ่มต้นของระบบต่อร้าน (ชื่อช่องตามภาษาของร้าน) — Lazada ตามที่เจ้าของบอก 2026-11-20 */
export const DEFAULT_ATTR_RULES_BY_PLATFORM: Record<string, AttrDefaultRule[]> = {
  shopee: DEFAULT_ATTR_RULES,
  lazada: [
    { field: "Condition", source: "fixed", value: "New" },
    { field: "Warranty Type", source: "fixed", value: "Warranty by Seller" },
    { field: "Warranty Period", source: "warranty" },
    { field: "Warranty Policy*", source: "fixed", value: WARRANTY_POLICY_TEMPLATE },
  ],
};
export const defaultAttrRules = (platform: string): AttrDefaultRule[] => DEFAULT_ATTR_RULES_BY_PLATFORM[platform] ?? DEFAULT_ATTR_RULES;

export const listingAttrDefaultsKey = (platform: string, brandId: string): string => `listing_attr_defaults_${platform}_${brandId}`;

const SOURCES = new Set<AttrDefaultSource>(["fixed", "warranty", "size", "weight"]);
/** ค่าที่บันทึกใน ui_config → กติกา (กันค่าแปลก) · ยังไม่เคยตั้ง = null (ผู้เรียกใช้ DEFAULT_ATTR_RULES) */
export function attrRulesOf(v: unknown): AttrDefaultRule[] | null {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  if (!o || !Array.isArray(o.rules)) return null;
  return (o.rules as unknown[]).map((x) => {
    const r = x && typeof x === "object" ? x as Record<string, unknown> : {};
    const field = String(r.field ?? "").trim().slice(0, 80);
    const source = String(r.source ?? "") as AttrDefaultSource;
    const value = String(r.value ?? "").trim().slice(0, 500);
    return field && SOURCES.has(source) ? { field, source, ...(source === "fixed" ? { value } : {}) } : null;
  }).filter((r): r is AttrDefaultRule => !!r && (r.source !== "fixed" || !!r.value));
}

const base = (s: string) => s.replace(/\(.*?\)|（.*?）/g, "").replace(/\s+/g, "").toLowerCase();
/** ชื่อช่องของร้านตรงกับกติกาไหน (ตัวแรกที่ตรง) */
export function matchAttrRule(fieldName: string, rules: AttrDefaultRule[]): AttrDefaultRule | null {
  const n = base(fieldName);
  for (const r of rules) {
    const f = r.field.trim();
    if (f.endsWith("*") ? !!base(f.slice(0, -1)) && n.startsWith(base(f.slice(0, -1))) : n === base(f)) return r;
  }
  return null;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });

/** ช่องรับประกันของสินค้าบอกว่า "ไม่มีรับประกัน" ไหม */
export const isNoWarranty = (w: string | null | undefined): boolean => /ไม่มี.*ประกัน|ไม่รับประกัน|no\s*warranty|^ไม่มี$|^-$/i.test((w ?? "").trim());
const NO_WARRANTY_VALUES = ["No Warranty", "ไม่มีการรับประกัน", "ไม่มีประกัน", "ไม่มีรับประกัน", "No warranty"];
const UNIT_EN: Record<string, string> = { วัน: "day", สัปดาห์: "week", อาทิตย์: "week", เดือน: "month", ปี: "year" };
/** ระยะประกัน (ไทย) → อังกฤษ: "1 เดือน" → "1 month" · "2 ปี" → "2 years" · ไม่มี = "No warranty" · ตลอดชีพ = "Lifetime" · อ่านไม่ออก = ค่าเดิม */
export function warrantyEn(w: string | null | undefined): string {
  const t = (w ?? "").trim(); if (!t) return "";
  if (isNoWarranty(t)) return "No warranty";
  if (/ตลอดชีพ|lifetime/i.test(t)) return "Lifetime";
  const m = t.match(/(\d+(?:\.\d+)?)\s*(วัน|สัปดาห์|อาทิตย์|เดือน|ปี)/);
  if (!m) return t;
  const n = Number(m[1]); const u = UNIT_EN[m[2]];
  return `${m[1]} ${u}${n === 1 ? "" : "s"}`;
}
const isWarrantyTypeField = (field: string) => /ประเภท.*ประกัน|warranty\s*type/i.test(field);
/** ค่าที่ได้จากกติกา เรียงจากที่อยากได้ก่อน (ลองจับตัวเลือกของร้านทีละค่า) · ไม่มีข้อมูล = [] (ไม่เติม) */
export function attrRuleValues(rule: AttrDefaultRule, p: AttrDefaultProduct): string[] {
  // สินค้าไม่มีรับประกัน → ช่องประเภทการประกันต้องเป็น "ไม่มีประกัน" (ไม่ใช้ค่าตายตัว เช่น ประกันจากผู้ผลิต)
  if (isWarrantyTypeField(rule.field) && isNoWarranty(p.warranty)) return NO_WARRANTY_VALUES;
  if (rule.source === "fixed") {
    const v = (rule.value ?? "").replace(/\{warranty_en\}/g, warrantyEn(p.warranty) || "-").replace(/\{warranty\}/g, (p.warranty ?? "").trim() || "-").trim();
    return v ? [v] : [];
  }
  if (rule.source === "warranty") {
    const w = (p.warranty ?? "").trim(); if (!w) return [];
    if (isNoWarranty(w)) return [w, ...NO_WARRANTY_VALUES];
    const en = warrantyEn(w); const enCap = en.charAt(0).toUpperCase() + en.slice(1);
    return [...new Set([w, en, enCap, en.replace(/s$/, ""), `${enCap.replace(/s$/, "")}(s)`].filter(Boolean))];
  }
  if (rule.source === "weight") return p.weightKg && p.weightKg > 0 ? [`${fmt(p.weightKg)} กก.`] : [];
  const s = p.size;
  return s && s.l && s.w && s.h ? [`${fmt(s.l)} x ${fmt(s.w)} x ${fmt(s.h)} ซม.`] : [];
}
/** ค่าแรกที่ได้จากกติกา (ข้อความ) · ไม่มีข้อมูล = null */
export function attrRuleValue(rule: AttrDefaultRule, p: AttrDefaultProduct): string | null {
  return attrRuleValues(rule, p)[0] ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/.,()]+/g, "");
export type AttrDefaultField = { id: string; name: string; multiple: boolean; customizable: boolean; numeric: boolean; options: { id: string; name: string; /** ชื่ออีกแบบที่ใช้จับคู่ได้ (เช่น ค่าอังกฤษของ Lazada) */ alt?: string }[] };
/** ข้อความ (หรือหลายค่าเรียงตามที่อยากได้) → ค่าของช่อง (ตรงตัวเลือก → ตัวเลือก · ใกล้เคียงตัวเดียว → ตัวนั้น · ไม่ตรง = พิมพ์เองได้เฉพาะช่องที่อนุญาต) · ใส่ไม่ได้ = null */
export function attrDefaultVals(f: Omit<AttrDefaultField, "id" | "name">, value: string | string[]): TtsAttrVal[] | null {
  const cands = (Array.isArray(value) ? value : [value]).map((x) => x.trim()).filter(Boolean);
  if (!cands.length) return null;
  const names = (o: AttrDefaultField["options"][number]) => [o.name, o.alt].filter((x): x is string => !!x);
  for (const v of cands) {
    const exact = f.options.find((o) => names(o).some((n) => n.toLowerCase() === v.toLowerCase())) ?? f.options.find((o) => names(o).some((n) => norm(n) === norm(v)));
    if (exact) return [{ id: exact.id, name: exact.name }];
  }
  for (const v of cands) {
    const near = [...new Map(f.options.filter((o) => names(o).some((n) => norm(n).includes(norm(v)) || norm(v).includes(norm(n)))).map((o) => [o.id, o])).values()];
    if (near.length === 1) return [{ id: near[0].id, name: near[0].name }];
  }
  const v = cands[0];
  if (f.numeric) { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m && (f.customizable || !f.options.length) ? [{ name: m[0] }] : null; }
  return f.customizable || !f.options.length ? [{ name: v.slice(0, 500) }] : null;
}

/**
 * เติมค่าเริ่มต้นของร้าน + ค่าจากข้อมูลสินค้า ลง "ช่องที่ยังว่าง" (ทุกช่อง ไม่ใช่แค่ช่องบังคับ) — ใช้ทั้ง Shopee และ Lazada
 * คืนค่าที่เติม + ที่มา (default = ค่าตายตัวของร้าน · product = จากข้อมูลสินค้า) · ช่องที่มีค่าแล้วไม่แตะ
 */
export function applyAttrDefaults(fields: AttrDefaultField[], current: TtsAttrState, rules: AttrDefaultRule[], product: AttrDefaultProduct): { values: TtsAttrState; sources: Record<string, "default" | "product"> } {
  const values: TtsAttrState = {}; const sources: Record<string, "default" | "product"> = {};
  for (const f of fields) {
    if ((current[f.id] ?? []).length) continue;
    const rule = matchAttrRule(f.name, rules); if (!rule) continue;
    const vals = attrDefaultVals(f, attrRuleValues(rule, product)); if (!vals) continue;
    values[f.id] = vals; sources[f.id] = rule.source === "fixed" ? "default" : "product";
  }
  return { values, sources };
}

/**
 * ค่าเริ่มต้นของ "ช่องคุณลักษณะของหมวด" ต่อร้าน (ของกลาง · pure · ใช้ได้ทุกร้าน — Shopee ใช้แล้ว · TikTok/Lazada ย้ายมาใช้ได้)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-20 (ทดสอบ LY22): "บางช่องอยากให้ set ได้เหมือนกันทุกอัน — ประเทศ = ไทย · ระยะรับประกัน (ดูในรายละเอียด) ·
 *   ขนาดใส่ตามขนาด · ประเภทการประกัน > จากผู้ผลิต · สภาพ > ใหม่" → ตั้งได้เองต่อร้าน ไม่ใส่ตายในโค้ด
 * เก็บ: ui_config key = listingAttrDefaultsKey(platform, brandId) → { rules } (แก้ในป๊อป "ค่าเริ่มต้นของร้าน" · ยังไม่ตั้ง = DEFAULT_ATTR_RULES)
 * ใช้: ตัวประกอบข้อมูลของร้าน เติมให้ "ช่องที่ยังว่าง" เท่านั้น (ค่าที่กรอก/บันทึกไว้ในร่างมาก่อนเสมอ) · หน้าเว็บติดป้ายที่มา
 * เทสต์ lib/__tests__/listing-attr-defaults.test.ts
 */
import type { TtsAttrVal } from "@/lib/tiktok-attrs";

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

/** ค่าเริ่มต้นของระบบ (ใช้เมื่อร้านยังไม่ได้ตั้งเอง) — ตามที่เจ้าของบอก 2026-11-20 */
export const DEFAULT_ATTR_RULES: AttrDefaultRule[] = [
  { field: "ประเทศ*", source: "fixed", value: "ไทย" },
  { field: "สภาพ", source: "fixed", value: "ใหม่" },
  { field: "ประเภทการประกัน", source: "fixed", value: "ประกันจากผู้ผลิต" },
  { field: "ระยะเวลารับประกัน", source: "warranty" },
  { field: "ขนาด", source: "size" },
];

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
    const value = String(r.value ?? "").trim().slice(0, 100);
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
/** ค่าที่ได้จากกติกา (ข้อความ) · ไม่มีข้อมูล = null (ไม่เติม) */
export function attrRuleValue(rule: AttrDefaultRule, p: AttrDefaultProduct): string | null {
  if (rule.source === "fixed") return rule.value?.trim() || null;
  if (rule.source === "warranty") return p.warranty?.trim() || null;
  if (rule.source === "weight") return p.weightKg && p.weightKg > 0 ? `${fmt(p.weightKg)} กก.` : null;
  const s = p.size;
  return s && s.l && s.w && s.h ? `${fmt(s.l)} x ${fmt(s.w)} x ${fmt(s.h)} ซม.` : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/.,()]+/g, "");
/** ข้อความ → ค่าของช่อง (ตรงตัวเลือก → ตัวเลือก · ใกล้เคียงตัวเดียว → ตัวนั้น · ไม่ตรง = พิมพ์เองได้เฉพาะช่องที่อนุญาต) · ใส่ไม่ได้ = null */
export function attrDefaultVals(f: { multiple: boolean; customizable: boolean; numeric: boolean; options: { id: string; name: string }[] }, value: string): TtsAttrVal[] | null {
  const v = value.trim(); if (!v) return null;
  const exact = f.options.find((o) => o.name.toLowerCase() === v.toLowerCase()) ?? f.options.find((o) => norm(o.name) === norm(v));
  if (exact) return [{ id: exact.id, name: exact.name }];
  const near = f.options.filter((o) => norm(o.name).includes(norm(v)) || norm(v).includes(norm(o.name)));
  if (near.length === 1) return [{ id: near[0].id, name: near[0].name }];
  if (f.numeric) { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m && (f.customizable || !f.options.length) ? [{ name: m[0] }] : null; }
  return f.customizable || !f.options.length ? [{ name: v.slice(0, 100) }] : null;
}

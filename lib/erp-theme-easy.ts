// ============================================================
// ตัวแก้ธีมแบบใช้ง่าย (pure) — เจ้าของเลือก 2026-11-25: B (โหมดง่าย/ละเอียด) + C (คลิกชิ้นในพรีวิว · ป๊อปเล็ก)
//   motionLevel / withMotionLevel = แถบ "ความเคลื่อนไหว" นิ่ง(0) → มาก(3)
//   currentFxPreset = สไตล์ที่ตรงกับชุดสำเร็จรูป (ไม่ตรง = กำหนดเอง)
//   ADV_GROUPS = โหมดละเอียด 4 กลุ่ม (รวม 11 หมวดเดิม) · searchSettings = ช่องค้นหาการตั้งค่า
//   PART_INFO = ชิ้นในพรีวิวที่คลิกแก้ได้ (7 จุด) → ป๊อปแก้ + "ตั้งค่าทั้งหมดของชิ้นนี้"
// เทสต์: lib/__tests__/erp-theme-easy.test.ts
// ============================================================
import { mergeThemeConfig, type ErpThemeConfig } from "./erp-theme-config";
import { EFFECTS, FX_PRESETS, type EffectKey, type EffectTarget, type Strength } from "./erp-theme-fx";

export type EditorCategory = "colors" | "background" | "gradient" | "effects" | "outline" | "animation" | "typography" | "shape" | "density" | "components" | "mode";
export type AdvGroupKey = "look" | "fx" | "shape" | "more";

export const ADV_GROUPS: { key: AdvGroupKey; label: string; hint: string; cats: EditorCategory[] }[] = [
  { key: "look", label: "สีและพื้นหลัง", hint: "สี · พื้นหลัง · ไล่สี", cats: ["colors", "background", "gradient"] },
  { key: "fx", label: "เอฟเฟกต์", hint: "7 จุด · ชี้/กด · เข้าหน้า · อนุภาค", cats: ["effects"] },
  { key: "shape", label: "ขอบ เงา รูปทรง", hint: "เส้นขอบ · เงา · ความมน", cats: ["outline", "shape"] },
  { key: "more", label: "ตัวอักษรและอื่น ๆ", hint: "ฟอนต์ · ความแน่น · ชิ้นส่วน · มาสคอต · โหมดมืด", cats: ["typography", "density", "components", "animation", "mode"] },
];
export const groupOfCat = (c: EditorCategory): AdvGroupKey => ADV_GROUPS.find((g) => g.cats.includes(c))!.key;

const MOTION = new Set<EffectKey>(EFFECTS.filter((e) => e.motion).map((e) => e.key));

/** ความเคลื่อนไหวตอนนี้ 0–3 (0 = นิ่ง ไม่มีเอฟเฟกต์ขยับเลย) */
export function motionLevel(c: ErpThemeConfig): 0 | 1 | 2 | 3 {
  let max = 0;
  for (const t of Object.values(c.effects.targets)) if (t.fx.some((e) => MOTION.has(e) && e !== "countUp")) max = Math.max(max, t.strength);
  if (!max && (c.effects.enter !== "none" || c.effects.particles !== "none" || c.effects.ripple || c.outline.running)) max = 1;
  return max as 0 | 1 | 2 | 3;
}

/** ตั้งความเคลื่อนไหว: 0 = ตัดเอฟเฟกต์ขยับทั้งหมด (เหลือยกตัว/แถบเน้น/นับขึ้น) · 1–3 = ความแรงของทุกจุด (ไม่มีเลย = ใส่ชุด "สนุก" ก่อน) */
export function withMotionLevel(c: ErpThemeConfig, level: 0 | 1 | 2 | 3): ErpThemeConfig {
  if (level === 0) {
    const targets = Object.fromEntries(Object.entries(c.effects.targets).map(([k, v]) => [k, { ...v, fx: v.fx.filter((e) => !MOTION.has(e) || e === "countUp") }]));
    return mergeThemeConfig(c, { effects: { targets, enter: "none", particles: "none", ripple: false, scaleHover: false, iconWiggle: false, stagger: false }, outline: { running: false } });
  }
  const base = motionLevel(c) === 0 ? mergeThemeConfig(c, { effects: FX_PRESETS.find((p) => p.key === "fun")!.fx }) : c;
  const targets = Object.fromEntries(Object.entries(base.effects.targets).map(([k, v]) => [k, { ...v, strength: level as Strength }]));
  return mergeThemeConfig(base, { effects: { targets } });
}

/** สไตล์ที่ตรงกับชุดสำเร็จรูป (เทียบเฉพาะตารางเอฟเฟกต์) · null = กำหนดเอง */
export function currentFxPreset(c: ErpThemeConfig): string | null {
  const sig = (t: ErpThemeConfig["effects"]["targets"]) => JSON.stringify(Object.keys(t).sort().map((k) => [k, [...t[k as EffectTarget].fx].sort()]));
  const mine = sig(c.effects.targets);
  return FX_PRESETS.find((p) => sig(p.fx.targets) === mine)?.key ?? null;
}

// ── ช่องค้นหาการตั้งค่า ─────────────────────────────────
export type SettingEntry = { label: string; cat: EditorCategory; words: string };
export const SETTINGS_INDEX: SettingEntry[] = [
  { label: "สีหลัก", cat: "colors", words: "สี primary ปุ่ม หลัก" },
  { label: "สีเน้นรอง", cat: "colors", words: "สี accent เน้น แท็บ" },
  { label: "รูปพื้นหลัง", cat: "background", words: "รูป ภาพ พื้นหลัง background เบลอ ความชัด" },
  { label: "ไล่สี", cat: "gradient", words: "ไล่สี gradient มุม สีที่ 2" },
  { label: "ชุดเอฟเฟกต์สำเร็จรูป", cat: "effects", words: "ชุด สไตล์ เรียบ สนุก หรู เทศกาล preset" },
  { label: "เอฟเฟกต์ต่อจุด", cat: "effects", words: "pulse กระพริบ เปลี่ยนสี ไล่สีวิ่ง เรือง แสงวิ่ง ยกตัว สั่น กระดิ่ง ปุ่ม ป้าย การ์ด แถบบน เมนู ตัวเลข" },
  { label: "ชี้เมาส์ / กด", cat: "effects", words: "คลื่นน้ำ ripple ขยาย ขีดเส้นใต้ ไอคอนขยับ" },
  { label: "เข้าหน้า", cat: "effects", words: "เข้าหน้า จาง เลื่อน ซูม เบลอ โผล่ทีละใบ" },
  { label: "อนุภาค", cat: "effects", words: "อนุภาค หิมะ ดาว ฟอง ซากุระ เทศกาล" },
  { label: "เส้นขอบ", cat: "outline", words: "ขอบ เส้นขอบ หนา ประ จุด คู่ ขอบไล่สี ขอบวิ่ง แถบซ้าย border" },
  { label: "เงา", cat: "outline", words: "เงา shadow ลอย เรือง เงาใน" },
  { label: "ความมน", cat: "shape", words: "มน มุม ขอบมน radius เหลี่ยม" },
  { label: "ฟอนต์", cat: "typography", words: "ฟอนต์ ตัวอักษร font ขนาด หัวข้อ หนา" },
  { label: "ความแน่น", cat: "density", words: "แน่น โปร่ง ระยะ ตาราง density" },
  { label: "หน้าตาชิ้นส่วน", cat: "components", words: "ปุ่ม ทึบ อ่อน ตาราง ลาย ช่องกรอก แท็บ ป้าย เมนูข้าง เข้ม" },
  { label: "มาสคอต / ความเร็ว", cat: "animation", words: "มาสคอต gif ความเร็ว ช้า เร็ว" },
  { label: "โหมดมืด", cat: "mode", words: "มืด dark กลางคืน" },
];

export function searchSettings(q: string): SettingEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return SETTINGS_INDEX.filter((e) => e.label.toLowerCase().includes(s) || e.words.toLowerCase().includes(s)).slice(0, 8);
}

// ── ชิ้นในพรีวิวที่คลิกแก้ได้ (C) ─────────────────────────
export type PreviewPart = EffectTarget;
export const PART_INFO: Record<PreviewPart, { label: string; plural: string; cat: EditorCategory; color: "primary" | "accent" | null }> = {
  button: { label: "ปุ่มหลัก", plural: "ปุ่มหลักทุกปุ่ม", cat: "effects", color: "primary" },
  badge: { label: "ป้ายด่วน", plural: "ป้ายด่วนทุกป้าย (สีป้ายล็อกไว้)", cat: "effects", color: null },
  card: { label: "การ์ด", plural: "การ์ดทุกใบ", cat: "outline", color: null },
  topbar: { label: "แถบบน", plural: "แถบบน/หัวเมนูข้าง", cat: "gradient", color: "primary" },
  menu: { label: "เมนูที่เลือก", plural: "เมนูที่เลือกในเมนูข้าง", cat: "effects", color: "primary" },
  number: { label: "ตัวเลขสรุป", plural: "ตัวเลขสรุปบนแดชบอร์ด", cat: "effects", color: null },
  bell: { label: "กระดิ่ง", plural: "กระดิ่งแจ้งเตือน", cat: "effects", color: null },
};

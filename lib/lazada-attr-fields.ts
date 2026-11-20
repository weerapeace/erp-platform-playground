/**
 * ตัวแปลงช่องคุณลักษณะของ Lazada ↔ รูปแบบกลาง (TtsAttrField / TtsAttrState) — pure · ใช้ได้ทั้งหน้าเว็บและหลังบ้าน
 * --------------------------------------------------------------------------
 * ทำไม: ของกลางที่ใช้กับทุกร้าน (ค่าเริ่มต้นของร้าน lib/listing-attr-defaults · แนะนำจากข้อความ/AI attr-suggest-box)
 *   รับช่องแบบ TtsAttrField ส่วน Lazada เก็บค่าเป็นข้อความ (หลายค่าคั่น ,) ตามช่อง LazadaAttrDef — ไฟล์นี้แปลงไป/กลับ
 * ตัวเลือกของ Lazada: en = ค่าที่ส่ง (อังกฤษ) · name = ชื่อที่โชว์ (บางหมวดเป็นไทย) → จับคู่ได้ทั้งสองชื่อ (alt)
 * เทสต์ lib/__tests__/lazada-attr-fields.test.ts
 */
import { lazNormAttr, type LazadaAttrDef } from "@/lib/lazada-listing-edit";
import type { TtsAttrField, TtsAttrState, TtsAttrVal } from "@/lib/tiktok-attrs";
import type { AttrDefaultField } from "@/lib/listing-attr-defaults";

const MULTI = new Set(["multiSelect", "multiEnumInput"]);
const PICK_ONLY = new Set(["singleSelect", "multiSelect"]);

/** ช่อง Lazada → ช่องรูปแบบกลาง (id = ชื่อช่องของ Lazada) */
export function lazAttrFieldOf(d: LazadaAttrDef): TtsAttrField & AttrDefaultField {
  return {
    id: d.name, name: d.label || d.name, required: d.required, multiple: MULTI.has(d.input_type),
    customizable: !PICK_ONLY.has(d.input_type) || !d.choices.length, numeric: d.input_type === "numeric",
    options: d.choices.map((c) => ({ id: c.en, name: c.name || c.en, ...(c.name && c.name !== c.en ? { alt: c.en } : {}) })),
  };
}

/** ค่าในร่าง Lazada { ชื่อช่อง: ข้อความ } → รูปแบบกลาง */
export function lazAttrStateOf(defs: LazadaAttrDef[], values: Record<string, string>): TtsAttrState {
  const out: TtsAttrState = {};
  for (const d of defs) {
    const norm = lazNormAttr(d, values[d.name]); if (!norm) continue;
    const toks = MULTI.has(d.input_type) ? [...new Set(norm.split(",").map((x) => x.trim()).filter(Boolean))] : [norm];
    out[d.name] = toks.map((t): TtsAttrVal => { const c = d.choices.find((x) => x.en === t); return c ? { id: c.en, name: c.name || c.en } : { name: t }; });
  }
  return out;
}

/** ค่ารูปแบบกลางของ 1 ช่อง → ข้อความที่เก็บในร่าง Lazada (ตัวเลือก = ค่าอังกฤษ · หลายค่าคั่น ,) */
export function lazAttrTextOf(d: LazadaAttrDef, vals: TtsAttrVal[] | undefined): string {
  const toks = (vals ?? []).map((v) => (v.id || v.name || "").trim()).filter(Boolean);
  return MULTI.has(d.input_type) ? [...new Set(toks.map((t) => t.replace(/,/g, " ")))].join(",") : (toks[0] ?? "");
}

/** รูปแบบกลางทั้งก้อน → ค่าในร่าง Lazada (เฉพาะช่องที่มีค่า) */
export function lazAttrValuesOf(defs: LazadaAttrDef[], state: TtsAttrState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs) { const t = lazAttrTextOf(d, state[d.name]); if (t) out[d.name] = t; }
  return out;
}

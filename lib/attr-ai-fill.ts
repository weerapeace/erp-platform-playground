/**
 * ให้ AI เดาค่า "ช่องคุณลักษณะของหมวด" (ของกลาง · pure · ใช้ได้ทุกร้าน: Shopee / TikTok / Lazada) — เทสต์ lib/__tests__/attr-ai-fill.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-15 "หลังเลือกหมวดหมู่อยากให้มีเลือกคุณลักษณะ · ให้ AI ตัวถูกเลือกได้ไหม"
 * คู่กับ lib/attr-suggest (จับคำจากชื่อ/รายละเอียด · ฟรี) — ตัวนี้ = AI (เสียเงิน · ผ่านด่านกลาง aiChat "ai.attr_fill" ใน POST /api/ai/attr-fill)
 *   attrAiPrompt(...)       → คำสั่ง + ข้อมูลที่ส่ง AI (เฉพาะช่องที่ยังว่าง · ตัดตัวเลือกยาวเกิน)
 *   parseAttrAiResult(...)  → แปลงคำตอบเป็นรูปเดียวกับ attr-suggest (SuggestHit) · ค่าที่ไม่อยู่ในรายการ = ใส่ได้เฉพาะช่องที่พิมพ์เองได้
 * กติกา: เติมเฉพาะช่องที่ว่าง · หน้าเว็บต้องติดป้าย "AI เดา · ตรวจก่อน" และให้คนกดใส่เอง · ไม่ส่งอะไรขึ้นร้านอัตโนมัติ
 */
import type { SuggestHit } from "@/lib/attr-suggest";

/** ช่องที่ส่งให้ AI (รูปเดียวกับ TtsAttrField — Shopee/TikTok ใช้ร่วม) */
export type AiAttrField = { id: string; name: string; required?: boolean; multiple: boolean; customizable?: boolean; numeric?: boolean; options: { id: string; name: string }[] };
export type AiAttrInput = { platform: string; name: string; description: string; category: string | null; fields: AiAttrField[] };

export const AI_ATTR_MAX_FIELDS = 40;
export const AI_ATTR_MAX_OPTIONS = 150;
export const AI_ATTR_DESC_MAX = 3000;
const MAX_MULTI = 5;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/.,()]+/g, "");

/** คำสั่ง (system) + ข้อมูล (user · JSON) ที่ส่ง AI */
export function attrAiPrompt(input: AiAttrInput): { system: string; user: string; fields: AiAttrField[] } {
  const fields = input.fields.slice(0, AI_ATTR_MAX_FIELDS).map((f) => ({ ...f, options: f.options.slice(0, AI_ATTR_MAX_OPTIONS) }));
  const system = [
    `You fill product attributes for a Thai online marketplace listing (${input.platform}).`,
    "Use ONLY facts visible in the product name, description or images. If a value is not clearly supported, leave that field out — never guess.",
    "For a field with options, answer with the exact option text from its list. Use a free-text value only when free_text is true.",
    "numeric fields: digits only (no units). multiple fields: up to 5 values. Others: exactly one value.",
    'Reply JSON only: {"fields":[{"id":"<field id>","values":["..."]}]}',
  ].join("\n");
  const user = JSON.stringify({
    product: { name: input.name, description: input.description.slice(0, AI_ATTR_DESC_MAX), category: input.category },
    fields: fields.map((f) => ({
      id: f.id, name: f.name, required: !!f.required, multiple: f.multiple, free_text: !!f.customizable || !f.options.length, numeric: !!f.numeric,
      options: f.options.map((o) => o.name),
    })),
  });
  return { system, user, fields };
}

/** คำตอบ AI → SuggestHit[] (จับคู่กับตัวเลือกจริง · id ว่าง = ค่าพิมพ์เอง) */
export function parseAttrAiResult(raw: unknown, fields: AiAttrField[]): SuggestHit[] {
  const r = obj(raw) ?? {};
  const list = Array.isArray(r.fields) ? r.fields : Array.isArray(r.attributes) ? r.attributes : [];
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: SuggestHit[] = [];
  for (const item of list) {
    const o = obj(item); if (!o) continue;
    const f = byId.get(str(o.id ?? o.field_id)); if (!f) continue;
    const rawVals = (Array.isArray(o.values) ? o.values : o.value != null ? [o.value] : []).map(str).filter(Boolean);
    const vals: { id: string; name: string }[] = [];
    for (const v of rawVals) {
      const hit = f.options.find((x) => x.name.toLowerCase() === v.toLowerCase()) ?? f.options.find((x) => norm(x.name) === norm(v));
      if (hit) { if (!vals.some((x) => x.id === hit.id)) vals.push({ id: hit.id, name: hit.name }); continue; }
      const free = !!f.customizable || !f.options.length;
      if (!free) continue;
      if (f.numeric && !/^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ""))) continue;
      const val = f.numeric ? v.replace(/,/g, "") : v.slice(0, 100);
      if (!vals.some((x) => !x.id && x.name === val)) vals.push({ id: "", name: val });
    }
    const keep = f.multiple ? vals.slice(0, MAX_MULTI) : vals.slice(0, 1);
    if (keep.length && !out.some((h) => h.fieldId === f.id)) out.push({ fieldId: f.id, fieldName: f.name, values: keep });
  }
  return out;
}

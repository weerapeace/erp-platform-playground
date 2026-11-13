/**
 * คุณลักษณะของหมวด + เก็บเงินปลายทาง (COD) + ตารางขนาด บน TikTok — กฎกลาง (pure · เทสต์ lib/__tests__/tiktok-attrs.test.ts)
 * ใช้ร่วม: ลิ้นชักสินค้าบนร้าน (แก้สินค้าที่มีอยู่ → Partial Edit) + หน้าลงฉบับร่าง (กรอกก่อนสร้าง → Create Product)
 * ห้าม import lib/tiktok-shop (มีโค้ดเซ็นคำขอ) — หน้าเว็บ import ไฟล์นี้
 *
 * เอกสารทางการ (อ่าน 2026-11-13):
 *   Get Attributes 202309: attributes[{ id, name, type: PRODUCT_PROPERTY|SALES_PROPERTY, is_requried (สะกดตามเอกสาร), values[{ id, name }],
 *     is_customizable, is_multiple_selection, value_data_format }] — ใช้เฉพาะ PRODUCT_PROPERTY (ช่องขาย = ตัวเลือก ไม่แก้ที่นี่)
 *   Get Category Rules 202309: { cod{ is_supported }, size_chart{ is_supported, is_required }, package_dimension{ is_required } }
 *   Get Product: product_attributes[{ id, name, values[{ id, name }] }] · is_cod_allowed · size_chart{ image{ uri, urls[] } | template{ id } }
 *   Partial Edit: product_attributes = อาร์เรย์บนสุด → ส่งทั้งชุด (ตัวที่ไม่ส่ง = หาย) · values ใส่ id (ค่าในรายการ) หรือ name (ค่ากำหนดเอง ≤ 2000)
 *     is_cod_allowed (bool) · size_chart{ image{ uri } } (uri จาก Upload Product Image use_case=SIZE_CHART_IMAGE · ด้านสั้น ≥ 1024px)
 * ช่องกรอกในหน้าเว็บ = ของกลาง LazadaAttrField (แปลงช่อง TikTok เป็นรูปแบบเดียวกันด้วย ttsAttrDef) — ไม่สร้างช่องกรอกชุดที่ 2
 */
import type { LazadaAttrDef } from "@/lib/lazada-listing-edit";
import { ttsSizeMetaOf, type TtsSizeMeta } from "@/lib/tiktok-size-chart";

export type TtsAttrOpt = { id: string; name: string };
/** ช่องคุณลักษณะ 1 ช่องของหมวด */
export type TtsAttrField = { id: string; name: string; required: boolean; multiple: boolean; customizable: boolean; numeric: boolean; options: TtsAttrOpt[] };
/** ค่าที่เลือก: id = ค่าในรายการของ TikTok · name = ชื่อ (ค่ากำหนดเอง หรือชื่อที่คู่กับ id ไว้แสดง) */
export type TtsAttrVal = { id?: string; name?: string };
/** ค่าทั้งหมด: รหัสช่อง → ค่าที่เลือก */
export type TtsAttrState = Record<string, TtsAttrVal[]>;
/** กติกาของหมวด (null = ไม่รู้ / ดึงไม่ได้) */
export type TtsCategoryRules = { codSupported: boolean | null; sizeChartSupported: boolean | null; sizeChartRequired: boolean | null; /** แบบวัด/คอลัมน์มาตรฐานของตารางขนาด (มีเฉพาะหมวดที่ TikTok ส่งมา) */ size?: TtsSizeMeta };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const bool = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);

/** ช่องคุณลักษณะจาก Get Attributes (เฉพาะช่องสินค้า) — ช่องบังคับขึ้นก่อน */
export function ttsAttrFieldsOf(raw: unknown): TtsAttrField[] {
  return arr(raw)
    .filter((a) => str(a.type) === "PRODUCT_PROPERTY")
    .map((a): TtsAttrField => ({
      id: str(a.id), name: str(a.name),
      required: a.is_requried === true || a.is_required === true,
      multiple: a.is_multiple_selection === true,
      customizable: a.is_customizable === true,
      numeric: /INT|DECIMAL|NUM/i.test(str(a.value_data_format)),
      options: arr(a.values).map((v) => ({ id: str(v.id), name: str(v.name) })).filter((v) => v.id && v.name),
    }))
    .filter((f) => f.id && f.name)
    .sort((a, b) => Number(b.required) - Number(a.required));
}

/** กติกาของหมวดจาก Get Category Rules */
export function ttsCategoryRulesOf(raw: unknown): TtsCategoryRules {
  const r = obj(raw) ?? {};
  const size = ttsSizeMetaOf(r);
  return { codSupported: bool(obj(r.cod)?.is_supported), sizeChartSupported: bool(obj(r.size_chart)?.is_supported), sizeChartRequired: bool(obj(r.size_chart)?.is_required), ...(size ? { size } : {}) };
}

/** ค่าคุณลักษณะจาก Get Product (product_attributes) */
export function ttsAttrStateOf(productAttributes: unknown): TtsAttrState {
  const out: TtsAttrState = {};
  for (const a of arr(productAttributes)) {
    const id = str(a.id); if (!id) continue;
    const vals = arr(a.values).map((v): TtsAttrVal => ({ ...(str(v.id) ? { id: str(v.id) } : {}), ...(str(v.name) ? { name: str(v.name) } : {}) })).filter((v) => v.id || v.name);
    if (vals.length) out[id] = vals;
  }
  return out;
}
/** ชื่อช่องจาก Get Product (โชว์ช่องที่หมวดไม่ส่งมา) */
export function ttsAttrNamesOf(productAttributes: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of arr(productAttributes)) { const id = str(a.id); if (id && str(a.name)) out[id] = str(a.name); }
  return out;
}

/** ช่อง TikTok → รูปแบบของช่องกรอกกลาง (LazadaAttrField) · ค่าในช่องกรอก = id ของค่า (คั่น , ถ้าเลือกหลาย) หรือข้อความกำหนดเอง */
export function ttsAttrDef(f: TtsAttrField): LazadaAttrDef {
  const hasOpts = f.options.length > 0;
  const input_type = hasOpts
    ? (f.customizable ? (f.multiple ? "multiEnumInput" : "enumInput") : (f.multiple ? "multiSelect" : "singleSelect"))
    : (f.numeric ? "numeric" : "text");
  return { name: f.id, label: f.name, required: f.required, input_type, is_sale_prop: false, attribute_type: "normal", is_key_prop: false, options: f.options.map((o) => o.name), choices: f.options.map((o) => ({ en: o.id, name: o.name })) };
}

/** ค่าที่เลือก → ข้อความในช่องกรอก (id หรือชื่อกำหนดเอง) */
export function ttsAttrToText(vals: TtsAttrVal[] | undefined): string {
  return (vals ?? []).map((v) => v.id || v.name || "").filter(Boolean).join(",");
}
/** ข้อความในช่องกรอก → ค่าที่เลือก (ตรง id หรือชื่อในรายการ = ค่าในรายการ · ไม่ตรง = ค่ากำหนดเอง) */
export function ttsAttrFromText(f: TtsAttrField | undefined, text: string): TtsAttrVal[] {
  const t = text.trim(); if (!t) return [];
  const tokens = f?.multiple ? t.split(",").map((x) => x.trim()).filter(Boolean) : [t];
  return [...new Set(tokens)].map((tok): TtsAttrVal => {
    const hit = f?.options.find((o) => o.id === tok) ?? f?.options.find((o) => o.name.toLowerCase() === tok.toLowerCase());
    return hit ? { id: hit.id, name: hit.name } : { name: tok };
  });
}
/** ชื่อที่โชว์คน */
export function ttsAttrDisplay(f: TtsAttrField | undefined, vals: TtsAttrVal[] | undefined): string {
  return (vals ?? []).map((v) => (v.id ? f?.options.find((o) => o.id === v.id)?.name ?? v.name ?? v.id : v.name ?? "")).filter(Boolean).join(", ");
}
const valKey = (vals: TtsAttrVal[] | undefined) => (vals ?? []).map((v) => (v.id ? `#${v.id}` : `=${(v.name ?? "").trim()}`)).sort().join("|");
export function sameAttrState(a: TtsAttrState, b: TtsAttrState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (valKey(a[k]) !== valKey(b[k])) return false;
  return true;
}
/** ค่าทั้งชุด → product_attributes ที่ส่ง TikTok (เฉพาะช่องที่มีค่า · id มาก่อน name) */
export function ttsAttrPayload(state: TtsAttrState): { id: string; values: ({ id: string } | { name: string })[] }[] {
  return Object.entries(state)
    .map(([id, vals]) => ({ id, values: vals.map((v) => (v.id ? { id: v.id } : { name: (v.name ?? "").trim() })).filter((v) => ("id" in v ? v.id : v.name)) }))
    .filter((a) => a.values.length);
}

export type TtsAttrPlan = {
  changed: boolean;
  payload: ReturnType<typeof ttsAttrPayload>;
  changes: { label: string; before: string; after: string }[];
  missingRequired: string[];
  errors: string[];
  warnings: string[];
};
/**
 * เทียบค่าคุณลักษณะเดิมกับที่แก้ → ส่งทั้งชุด (TikTok แทนที่ทั้งชุด) · ค่าที่ไม่อยู่ในรายการของช่องที่ห้ามกำหนดเอง = error
 * strictRequired = true (แก้สินค้าที่มีอยู่): ช่องบังคับว่าง = error · false (ฉบับร่าง): แค่เตือน
 */
export function planTiktokAttrs(fields: TtsAttrField[], base: TtsAttrState, next: TtsAttrState, opts: { strictRequired: boolean; names?: Record<string, string> } = { strictRequired: true }): TtsAttrPlan {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const changes: TtsAttrPlan["changes"] = []; const errors: string[] = []; const warnings: string[] = [];
  const keys = [...new Set([...Object.keys(base), ...Object.keys(next)])];
  for (const k of keys) {
    if (valKey(base[k]) === valKey(next[k])) continue;
    const f = byId.get(k);
    changes.push({ label: f?.name ?? opts.names?.[k] ?? `ช่อง ${k}`, before: ttsAttrDisplay(f, base[k]) || "(ว่าง)", after: ttsAttrDisplay(f, next[k]) || "(ว่าง)" });
    if (f && !f.customizable && f.options.length && (next[k] ?? []).some((v) => !v.id)) errors.push(`"${f.name}" ต้องเลือกจากรายการของ TikTok (พิมพ์เองไม่ได้)`);
    if (f && !f.multiple && (next[k] ?? []).length > 1) errors.push(`"${f.name}" เลือกได้ค่าเดียว`);
    if ((next[k] ?? []).some((v) => (v.name ?? "").length > 2000)) errors.push(`"${f?.name ?? k}" ยาวเกิน 2,000 ตัวอักษร`);
  }
  const missingRequired = fields.filter((f) => f.required && !(next[f.id] ?? []).length).map((f) => f.name);
  if (missingRequired.length) {
    const msg = `ช่องบังคับยังว่าง ${missingRequired.length} ช่อง (${missingRequired.slice(0, 3).join(", ")}${missingRequired.length > 3 ? " …" : ""})`;
    if (opts.strictRequired && changes.length) errors.push(`${msg} — TikTok ไม่รับถ้ายังขาด`);
    else warnings.push(opts.strictRequired ? msg : `${msg} — ฉบับร่างยังไม่บังคับ แต่ต้องกรอกก่อนเผยแพร่`);
  }
  if (changes.length && opts.strictRequired) warnings.push("แก้คุณลักษณะแล้ว TikTok ส่งไปตรวจใหม่ ระหว่างตรวจร้านยังใช้ของเดิม");
  return { changed: changes.length > 0, payload: ttsAttrPayload(next), changes, missingRequired, errors, warnings };
}

/** เก็บเงินปลายทาง: เปลี่ยนไหม + หมวดรองรับไหม */
export function planTiktokCod(base: boolean | null, next: boolean | null, supported: boolean | null): { changed: boolean; errors: string[]; change: { label: string; before: string; after: string } | null } {
  const changed = next != null && next !== base;
  const errors = changed && next === true && supported === false ? ["หมวดนี้ TikTok ไม่รองรับเก็บเงินปลายทาง (COD)"] : [];
  const txt = (v: boolean | null) => (v == null ? "ไม่ได้ตั้ง" : v ? "เปิด" : "ปิด");
  return { changed, errors, change: changed ? { label: "เก็บเงินปลายทาง (COD)", before: txt(base), after: txt(next) } : null };
}

/**
 * ตารางขนาด: ref ในฟอร์ม = "tts:<uri>" (รูปเดิม) / "r2:<key>" (รูปใหม่จากระบบ) / "tpl:<id>" (แม่แบบบน TikTok · lib/tiktok-size-chart) / null
 * baseRef = ของเดิมบนร้านในรูปแบบเดียวกัน (tiktokSizeChartRef ใน lib/tiktok-listing-edit) · templateName = ชื่อแม่แบบใหม่ (ไว้โชว์)
 */
export function planTiktokSizeChart(baseRef: string | null, next: string | null, rules: TtsCategoryRules | null, templateName?: string | null): { changed: boolean; errors: string[]; warnings: string[]; change: { label: string; before: string; after: string } | null } {
  const changed = next !== baseRef;
  const errors: string[] = []; const warnings: string[] = [];
  if (changed && !next && baseRef) errors.push("ลบตารางขนาดไม่ได้ (TikTok ไม่มีให้ล้าง) — เปลี่ยนเป็นรูปหรือแม่แบบอื่นแทน");
  if (changed && next && rules?.sizeChartSupported === false) errors.push("หมวดนี้ TikTok ไม่รองรับตารางขนาด");
  if (changed && next && !/^(tts|r2|tpl):./.test(next)) errors.push("ตารางขนาดที่เลือกระบบไม่รู้จัก — เลือกใหม่");
  if (changed && next?.startsWith("r2:")) warnings.push("รูปตารางขนาดจะถูกทำเป็น JPG จัตุรัสพื้นขาว 1500px แล้วฝากกับ TikTok (ด้านสั้นต้อง ≥ 1,024px) · TikTok ตรวจใหม่");
  if (changed && next?.startsWith("tpl:")) warnings.push("ใช้แม่แบบตารางขนาดบน TikTok (แทนรูปเดิมถ้ามี) · TikTok ตรวจใหม่");
  if (!next && rules?.sizeChartRequired) warnings.push("หมวดนี้ TikTok บังคับตารางขนาด");
  const kind = (r: string | null) => (!r ? "ไม่มี" : r.startsWith("tpl:") ? "แม่แบบตาราง" : r.startsWith("r2:") ? "รูปใหม่" : "รูปเดิม");
  const after = next?.startsWith("tpl:") ? `แม่แบบ${templateName ? ` "${templateName}"` : ` #${next.slice(4)}`}` : kind(next);
  return { changed, errors, warnings, change: changed && next ? { label: "ตารางขนาด", before: kind(baseRef), after } : null };
}

/** น้ำหนัก: แปลงหน่วยที่โชว์ในช่องกรอก (เก็บเป็นกิโลกรัมเสมอ) */
export type WeightUnit = "kg" | "g";
export const kgToUnit = (kg: number | null, u: WeightUnit): number | null => (kg == null ? null : u === "g" ? Math.round(kg * 1000) : kg);
export const unitToKg = (v: number | null, u: WeightUnit): number | null => (v == null ? null : u === "g" ? Math.round(v) / 1000 : v);

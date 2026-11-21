/**
 * สร้างสินค้าใหม่บน Shopee (เฟส 5) — ตัวประกอบข้อมูล (ของกลาง · pure · เทสต์ lib/__tests__/shopee-create-plan.test.ts)
 * --------------------------------------------------------------------------
 * แผนเจ้าของอนุมัติ 2026-11-15 ("เริ่ม 5A"): 5A = ดูก่อนส่ง + บันทึกร่าง (ไม่แตะร้าน) · 5B = ลงจริง · 5C = หลายตัว/คัดลอกจากร้านอื่น
 * สร้างแบบ **ปิดขาย (UNLIST) + สต๊อก 0 เสมอ** — BigSeller ยังคุมสต๊อก · เจ้าของตรวจในลิ้นชัก (แก้ได้จากเฟส 4) แล้วค่อยเปิดขาย/ใส่สต๊อก
 * ใช้ 2 ที่ — ต้องตรงกันเสมอ (แบบเดียวกับ lib/tiktok-create-plan · lib/lazada-create-plan):
 *   1) GET  /api/shopee/create-product?parent_sku_id=  → ตัวช่วยลงสินค้า "ดูก่อนส่ง"
 *   2) POST /api/shopee/create-product                  → (5B · เจ้าของ "เริ่ม 5B" 2026-11-15) ฝากรูป → add_item → รอ ≥5 วิ → init_tier_variation
 * ห้าม import lib/shopee (มีโค้ดเซ็นคำขอ) — หน้าเว็บ import ไฟล์นี้
 *
 * เอกสาร Shopee (อ่าน 2026-11-15):
 *   add_item: original_price · description · weight (กก.) · item_name · category_id · image.image_id_list · logistic_info[{logistic_id, enabled}] บังคับ
 *     attribute_list = ต้องมีช่องบังคับของหมวดครบ (get_attribute_tree) · brand{brand_id, original_brand_name} (0 / "NoBrand" = ไม่มีแบรนด์)
 *     seller_stock[{stock}] · item_status UNLIST/NORMAL · pre_order{is_pre_order, days_to_ship} · dimension (บังคับเฉพาะหมวดที่ get_item_limit บอก)
 *   init_tier_variation (หลัง add_item ≥5 วิ): standardise_tier_variation (≤2 ชั้น · variation_id 0 = ชื่อกำหนดเอง · รูปตัวเลือก image_id)
 *     + model[{tier_index, original_price, model_sku ≤100, seller_stock}] ≤50 ตัว · (tier_variation แบบเก่าเลิกใช้ 2025-09-12)
 *   get_item_limit?category_id = ช่วงชื่อ/รายละเอียด/รูป/ราคา/ชื่อชั้น/ชื่อตัวเลือก + วันส่ง (ไม่ใช่พรีออเดอร์) + กล่องบังคับไหม
 * ของเรา (กติกาเดียวกับ TikTok ยกเว้นที่ระบุ):
 *   ชื่อ = ร่าง → ชื่อสำหรับแพลตฟอร์ม → ชื่อสินค้า · รายละเอียด = ข้อความธรรมดา (ร่าง → สำหรับแพลตฟอร์ม → สินค้า)
 *   หมวด = ร่าง → หมวดกลาง → Shopee แนะนำจากชื่อ → หมวดที่สินค้าประเภทเดียวกันบนร้านใช้มากสุด (2 อย่างหลัง = เดา → เตือนให้ตรวจ)
 *   รูป = ร่าง extra.shopee_images → ร่าง image_keys → ปกตัวสี + ปก SKU + รูปสินค้า · ราคาตั้ง = ราคาเต็ม → ราคาขาย (จำนวนเต็มบาท)
 *   แบรนด์ + ขนส่ง + วันส่ง = จาก "สินค้าแบบ" (สินค้าที่ขายอยู่บนร้านเดียวกัน แบรนด์เดียวกัน — หมวดเดียวกันก่อน) · ไม่มีแบบ = ไม่มีแบรนด์ + ลงไม่ได้ (ไม่รู้ขนส่ง)
 *   ช่องบังคับของหมวด = ร่าง extra.shopee_attrs → ค่าจากสินค้าแบบหมวดเดียวกัน (เฉพาะช่องบังคับ) · น้ำหนัก = ร่าง extra.shopee_weight → น้ำหนักสินค้า
 */
import { noteToText } from "@/lib/rich-note";
import { splitSkus } from "@/lib/lazada-create-plan";
import { pickListingDescription } from "@/lib/listing-description";
import { pickListingTitle } from "@/lib/listing-title";
import { listingColorName, listingDefaultImages } from "@/lib/listing-defaults";
import { SHOPEE_DESC_MAX_IMAGES, SHOPEE_DESC_MIN_WIDTH, shopeeTextLength } from "@/lib/shopee-listing-edit";
import type { TtsAttrField, TtsAttrState, TtsAttrVal } from "@/lib/tiktok-attrs";
import { applyAttrDefaults, DEFAULT_ATTR_RULES, type AttrDefaultRule } from "@/lib/listing-attr-defaults";

/** สต๊อกตอนสร้าง (BigSeller ยังคุมสต๊อก — ไม่ส่งจำนวนจริง) · สถานะตอนสร้าง = ปิดขาย */
export const SHOPEE_CREATE_STOCK = 0;
export const SHOPEE_CREATE_STATUS = "UNLIST";
export const SHOPEE_CREATE_MAX_MODELS = 50;
export const SHOPEE_CREATE_MAX_TIERS = 2;
const MODEL_SKU_MAX = 100;
const DEFAULT_IMAGES_MAX = 9;
/**
 * รูปในรายละเอียด (Shopee "extended description" — ร้าน whitelist · ร้าน Louis Montini ได้สิทธิ์แล้ว เช็กสด 2026-11-21: สินค้าเดิม 4/4 เป็นแบบมีรูป)
 * เจ้าของเลือก 2026-11-21 แบบ A (รูปต่อท้ายข้อความ) + ข้อ 1 (ไม่มีรูป Description = รูปสินค้า) · 2 (เตือนรูปไม่คม) · 3 (ใช้ชุดเดียวกับ Lazada)
 * จำนวนสูงสุดยังไม่ยืนยันจากเอกสาร Shopee → ตั้ง 12 ไว้ก่อน (เกิน = Shopee ตอบเหตุผล) · รูปกว้างไม่ถึง 800px = เตือน
 */
export { SHOPEE_DESC_MAX_IMAGES, SHOPEE_DESC_MIN_WIDTH };
/** ✅ ลองจริง 2026-11-15 (MGW318 2 รูป): Shopee ปฏิเสธ "The number of product images must be between 3 and 9" → อย่างน้อย 3 (ร้านบอกช่วงเองได้ใน get_item_limit) */
export const SHOPEE_MIN_IMAGES = 3;
const DEFAULT_DESC_MAX = 3000;

type Obj = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const pos = (v: unknown): number | null => { const n = num(v); return n != null && n > 0 ? n : null; };
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arrOf = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => !!x) : []);
const r2 = (k: string) => `r2:${k}`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type ShopeeCreateSku = {
  /** color_platform_th = "Color Platform [TH]" เช่น "ดำ (01)" — ชื่อสีที่ร้านใช้บน Shopee อยู่แล้ว (มาก่อน color_th) */
  id: string; code: string; color_th: string | null; color: string | null; color_platform_th?: string | null;
  list_price: number | null; fake_price: number | null; cover_image_r2_key: string | null;
  attribute_values: Record<string, unknown> | null; is_active: boolean; sale_ok?: boolean | null;
};
export type ShopeeCreateParent = {
  id: string; code: string; name_th: string | null; name_platform: string | null;
  description: string | null; platform_description: string | null; weight_g: number | null;
  box: { l: number | null; w: number | null; h: number | null } | null;
  brand_name: string | null;
  /** ช่องรับประกันของสินค้า + ขนาดสินค้า (ยาว/กว้าง/สูง ซม.) — ใช้กับค่าเริ่มต้นช่องคุณลักษณะ (lib/listing-attr-defaults) */
  warranty?: string | null;
  /** Platform Description ที่ป๊อป Parent SKU โชว์ (คำนวณสด · loadParentComputedTexts) — มาก่อนคอลัมน์ platform_description ที่เป็นค่าเก่า */
  platform_description_live?: string | null;
  /** ค่าเก่าของคอลัมน์ platform_description (ประวัติเวอร์ชัน) — ร่างที่ตรงค่าเหล่านี้ = สำเนาเก่า */
  platform_description_history?: string[] | null;
  /** ชื่อเวอร์ชันเก่า (name_th/name_platform จากประวัติเวอร์ชัน) — ร่างที่ตรงค่าเหล่านี้ = สำเนาเก่า (lib/listing-title) */
  name_history?: string[] | null;
  /** จำนวนรูป Description ของ Parent */
  desc_image_count?: number;
  /** รูป Description ของ Parent SKU (r2 key เรียงตามที่จัด) — รูปในรายละเอียดอัตโนมัติ */
  desc_image_keys?: string[] | null;
  size?: { l: number | null; w: number | null; h: number | null } | null;
};
export type ShopeeCreateDraft = {
  title: string | null; description: string | null; category_path: string | null; image_keys: string[] | null;
  extra: Record<string, unknown> | null; platform_product_id: string | null;
} | null;

// ───────── หมวด ─────────
export type ShopeeCategoryKind = "draft" | "central" | "recommend" | "same_type";
export type ShopeeCategoryPick = { id: string; label: string; kind: ShopeeCategoryKind; src: string };
/** แถวของตารางยืนยันหมวดทีละหลายตัว (GET /api/shopee/create-product/categories · เฟส 5C) */
export type ShopeeBulkCategoryRow = {
  parent_id: string; code: string; name: string;
  /** มีหมวดที่ยืนยันแล้ว (เลือกไว้ในร่าง หรือจากหมวดกลาง) — ไม่ต้องยืนยันซ้ำ */
  confirmed: boolean;
  suggestion: ShopeeCategoryPick | null;
  candidates: ShopeeCategoryPick[];
  on_shop: string | null;
  /** เหตุที่แนะนำไม่ได้ (เช่น แบรนด์ยังไม่เชื่อม Shopee) */
  note: string | null;
};
export type ShopeeAttrSource = "draft" | "default" | "product" | "template";
/** ก้อน { key: value } ในร่าง (extra.*) → object (กันค่าแปลก) */
const recOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
/** "{id} · ชื่อ" / "{id}" → id หมวด */
export const shopeeCategoryIdOf = (path: unknown): string | null => {
  const s = str(path); if (!s) return null;
  if (s.includes(" · ")) return s.split(" · ")[0].trim() || null;
  const m = s.match(/^(\d+)\b/); return m ? m[1] : null;
};
/** ผู้สมัครหมวดตามลำดับ → ตัวที่ใช้ (ตัวแรกที่มีรหัส) · ไม่มีเลย = null */
export function shopeePickCategory(cands: ShopeeCategoryPick[]): ShopeeCategoryPick | null {
  return cands.find((c) => !!c.id) ?? null;
}
/** ผู้สมัครไม่ซ้ำรหัส (คงตัวแรกของแต่ละรหัส) */
export function shopeeUniqueCategories(cands: ShopeeCategoryPick[]): ShopeeCategoryPick[] {
  const seen = new Set<string>(); const out: ShopeeCategoryPick[] = [];
  for (const c of cands) { if (!c.id || seen.has(c.id)) continue; seen.add(c.id); out.push(c); }
  return out;
}

// ───────── ช่วงตามร้าน×หมวด (get_item_limit?category_id) ─────────
export type ShopeeCreateLimits = {
  nameMin: number | null; nameMax: number | null; descMin: number | null; descMax: number | null; imagesMin?: number | null; imagesMax: number | null;
  priceMin: number | null; priceMax: number | null; tierNameMax: number | null; tierOptionMax: number | null;
  /** วันส่งของสินค้าที่ไม่ใช่พรีออเดอร์ */
  dtsNonPreOrder: number | null; dimensionMandatory: boolean | null; weightMandatory: boolean | null;
};
export function shopeeCreateLimitsOf(j: Obj | null): ShopeeCreateLimits | null {
  if (!j) return null;
  const r = obj(j.response) ?? j;
  const rng = (k: string) => { const o = obj(r[k]); return { min: num(o?.min_limit), max: num(o?.max_limit) }; };
  const name = rng("item_name_length_limit"), desc = rng("item_description_length_limit"), img = rng("item_image_count_limit"), price = rng("price_limit");
  const tn = rng("tier_variation_name_length_limit"), to = rng("tier_variation_option_length_limit");
  const dts = obj(r.dts_limit);
  const bool = (v: unknown) => (v === true ? true : v === false ? false : null);
  const out: ShopeeCreateLimits = {
    nameMin: name.min, nameMax: name.max, descMin: desc.min, descMax: desc.max, imagesMin: img.min, imagesMax: img.max, priceMin: price.min, priceMax: price.max,
    tierNameMax: tn.max, tierOptionMax: to.max, dtsNonPreOrder: num(dts?.non_pre_order_days_to_ship),
    dimensionMandatory: bool(obj(r.dimension_limit)?.dimension_mandatory), weightMandatory: bool(obj(r.weight_limit)?.weight_mandatory),
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// ───────── ช่องคุณลักษณะ (get_attribute_tree → รูปแบบเดียวกับ TikTok เพื่อใช้ช่องกรอกกลาง LazadaAttrField/ttsAttrDef) ─────────
const thOf = (ml: unknown): string => str(arrOf(ml).find((x) => str(x.language).toLowerCase().startsWith("th"))?.value);
/** input_type: 1 เลือก 1 (รายการ) · 2 เลือก 1 หรือพิมพ์เอง · 3 พิมพ์เอง · 4 เลือกหลายค่า · 5 เลือกหลายค่าหรือพิมพ์เอง · validation 1/3 = ตัวเลข */
export function shopeeAttrFieldsOf(tree: Obj[]): TtsAttrField[] {
  return tree.map((a): TtsAttrField => {
    const info = obj(a.attribute_info) ?? {};
    const it = num(info.input_type) ?? 0;
    const vt = num(info.input_validation_type) ?? 0;
    return {
      id: str(a.attribute_id), name: thOf(a.multi_lang) || str(a.name), required: a.mandatory === true,
      multiple: it === 4 || it === 5, customizable: it === 2 || it === 3 || it === 5 || it === 0, numeric: vt === 1 || vt === 3,
      options: arrOf(a.attribute_value_list).map((v) => ({ id: str(v.value_id), name: thOf(v.multi_lang) || str(v.name) })).filter((o) => o.id && o.name),
    };
  }).filter((f) => f.id && f.name);
}
/** ค่าที่กรอก → attribute_list ของ add_item (ค่าในรายการ = value_id · พิมพ์เอง = value_id 0 + original_value_name) */
export function shopeeAttrPayload(state: TtsAttrState): { attribute_id: number; attribute_value_list: { value_id: number; original_value_name?: string }[] }[] {
  return Object.entries(state).map(([id, vals]) => ({
    attribute_id: Number(id),
    attribute_value_list: vals.map((v) => (v.id && /^\d+$/.test(v.id) && Number(v.id) > 0 ? { value_id: Number(v.id) } : { value_id: 0, original_value_name: str(v.name) }))
      .filter((v) => v.value_id > 0 || !!v.original_value_name),
  })).filter((a) => Number.isFinite(a.attribute_id) && a.attribute_id > 0 && a.attribute_value_list.length);
}
/** ค่าคุณลักษณะในร่าง (extra.shopee_attrs) → state (กันค่าแปลก) */
export function shopeeAttrStateOf(v: unknown): TtsAttrState {
  const out: TtsAttrState = {};
  const o = obj(v); if (!o) return out;
  for (const [k, vals] of Object.entries(o)) {
    if (!Array.isArray(vals)) continue;
    const list = vals.map((x): TtsAttrVal => { const e = obj(x) ?? {}; const id = str(e.id); const name = str(e.name); return { ...(id ? { id } : {}), ...(name ? { name } : {}) }; }).filter((x) => x.id || x.name);
    if (list.length) out[k] = list;
  }
  return out;
}

// ───────── "สินค้าแบบ" บนร้าน (get_item_base_info ของสินค้าที่ขายอยู่ แบรนด์เดียวกัน) → แบรนด์ / ขนส่ง / วันส่ง / ค่าคุณลักษณะ ─────────
export type ShopeeLogistic = { logistic_id: number; name: string | null; enabled: boolean; shipping_fee?: number; size_id?: number; is_free?: boolean; /** ค่าส่งโดยประมาณตามน้ำหนัก (get_item_base_info · โชว์อย่างเดียว) */ estimated_fee?: number };
export type ShopeeTemplate = { itemId: string; categoryId: string | null; brand: { id: number; name: string } | null; logistics: ShopeeLogistic[]; daysToShip: number | null; attrs: TtsAttrState; /** normal / extended (extended = ร้านได้สิทธิ์ใส่รูปในรายละเอียด) */ descType?: string | null };
export function shopeeTemplateOf(base: Obj): ShopeeTemplate | null {
  const itemId = str(base.item_id); if (!itemId) return null;
  const b = obj(base.brand);
  const brandId = num(b?.brand_id);
  const logistics = arrOf(base.logistic_info).map((l): ShopeeLogistic => {
    const fee = num(l.shipping_fee), size = num(l.size_id), est = num(l.estimated_shipping_fee);
    return { logistic_id: num(l.logistic_id) ?? 0, name: str(l.logistic_name) || null, enabled: l.enabled === true, ...(fee != null ? { shipping_fee: fee } : {}), ...(size ? { size_id: size } : {}), ...(l.is_free === true ? { is_free: true } : {}), ...(est != null ? { estimated_fee: est } : {}) };
  }).filter((l) => l.logistic_id > 0);
  const attrs: TtsAttrState = {};
  for (const a of arrOf(base.attribute_list)) {
    const id = str(a.attribute_id); if (!id) continue;
    const vals = arrOf(a.attribute_value_list).map((v): TtsAttrVal => { const vid = num(v.value_id); const nm = str(v.original_value_name); return vid && vid > 0 ? { id: String(vid), ...(nm ? { name: nm } : {}) } : { name: nm }; }).filter((v) => v.id || v.name);
    if (vals.length) attrs[id] = vals;
  }
  return {
    itemId, categoryId: base.category_id != null ? String(base.category_id) : null,
    brand: brandId != null ? { id: brandId, name: str(b?.original_brand_name) || "NoBrand" } : null,
    logistics, daysToShip: num(obj(base.pre_order)?.days_to_ship), attrs, descType: str(base.description_type) || null,
  };
}
// ───────── ขนส่ง (เจ้าของขอ 2026-11-15 "ตรงติ๊กจัดส่งด้วย อยากให้ติ๊กได้ด้วย") ─────────
// รายการ = ขนส่งของสินค้าแบบ (มีชื่อ + ค่าส่งโดยประมาณ) รวมกับขนส่งของร้าน (v2.logistics.get_channel_list · ร้านเปิดอยู่เท่านั้น)
// ค่าเริ่ม = ที่สินค้าแบบเปิดอยู่ (ยกเว้นขนส่งของใหญ่ — ปิดไว้จนกว่าจะเลือกเอง) · เลือกเองเก็บร่าง extra.shopee_logistics = [logistic_id]
export type ShopeeChannel = {
  id: number; name: string; shopEnabled: boolean; feeType: string | null; forceEnable: boolean;
  sizes: { id: number; name: string; price: number | null }[]; maxWeight: number | null; maskChannelId: number | null;
};
export function shopeeChannelsOf(j: Obj | null): ShopeeChannel[] {
  if (!j) return [];
  const r = obj(j.response) ?? j;
  return arrOf(r.logistics_channel_list).map((c): ShopeeChannel => ({
    id: num(c.logistics_channel_id) ?? 0, name: str(c.logistics_channel_name), shopEnabled: c.enabled === true, feeType: str(c.fee_type) || null,
    forceEnable: c.force_enable === true,
    sizes: arrOf(c.size_list).map((s) => ({ id: num(s.size_id) ?? 0, name: str(s.name), price: num(s.default_price) })).filter((s) => s.id > 0),
    maxWeight: (() => { const w = num(obj(c.weight_limit)?.item_max_weight); return w && w > 0 ? w : null; })(),
    maskChannelId: num(c.mask_channel_id),
  })).filter((c) => c.id > 0);
}
export const isBulkyChannel = (name: string | null | undefined) => /bulky|ขนาดใหญ่|ของใหญ่/i.test(String(name ?? ""));
export type ShopeeLogisticOption = {
  id: number; name: string; on: boolean;
  /** ค่าส่งที่โชว์ (โดยประมาณ) · null = ไม่รู้ */
  fee: number | null;
  /** ร้านบังคับเปิด (ปิดไม่ได้) */
  forced: boolean;
  /** เปิดไม่ได้ + เหตุผล (เช่น ต้องเลือกขนาดใน Seller Centre · หนักเกิน) */
  blocked: string | null;
  sizeId: number | null; shippingFee: number | null; isFree: boolean;
};
/** รวมรายการขนส่ง (แบบ + ร้าน) → ตัวเลือกที่ติ๊กได้ · picked = extra.shopee_logistics (null = ใช้ค่าเริ่ม) */
export function shopeeLogisticOptions(template: ShopeeTemplate | null, channels: ShopeeChannel[] | null, picked: number[] | null, weightKg: number | null): ShopeeLogisticOption[] {
  const byId = new Map<number, ShopeeLogisticOption>();
  const chById = new Map((channels ?? []).map((c) => [c.id, c]));
  const shopOff = (id: number) => { const c = chById.get(id); return !!channels && (!c || !c.shopEnabled); };
  for (const l of template?.logistics ?? []) {
    if (shopOff(l.logistic_id)) continue;
    const c = chById.get(l.logistic_id);
    byId.set(l.logistic_id, {
      id: l.logistic_id, name: c?.name || l.name || `#${l.logistic_id}`, on: l.enabled && !isBulkyChannel(c?.name || l.name), fee: l.is_free ? 0 : (l.estimated_fee ?? l.shipping_fee ?? null),
      forced: !!c?.forceEnable, blocked: null, sizeId: l.size_id ?? null, shippingFee: l.shipping_fee ?? null, isFree: !!l.is_free,
    });
  }
  // ขนส่งที่ร้านเปิดแต่สินค้าแบบไม่มี — เป็นช่องลูกของขนส่งหลัก (mask) ไม่ใส่ · ใส่เฉพาะช่องหลัก
  for (const c of channels ?? []) {
    if (!c.shopEnabled || byId.has(c.id) || (c.maskChannelId ?? 0) !== 0) continue;
    byId.set(c.id, { id: c.id, name: c.name, on: false, fee: c.sizes[0]?.price ?? null, forced: c.forceEnable, blocked: null, sizeId: null, shippingFee: null, isFree: false });
  }
  const pick = picked ? new Set(picked) : null;
  return [...byId.values()].map((o) => {
    const c = chById.get(o.id);
    let blocked: string | null = null;
    if (c?.feeType === "SIZE_SELECTION" && !o.sizeId) blocked = "ขนส่งนี้ต้องเลือกขนาดพัสดุ — ตั้งใน Seller Centre";
    else if (c?.feeType === "CUSTOM_PRICE" && o.shippingFee == null) blocked = "ขนส่งนี้ต้องตั้งค่าส่งเอง — ตั้งใน Seller Centre";
    else if (c?.maxWeight && weightKg && weightKg > c.maxWeight) blocked = `หนักเกินที่ขนส่งนี้รับ (ไม่เกิน ${c.maxWeight} กก.)`;
    const on = o.forced || (!blocked && (pick ? pick.has(o.id) : o.on));
    return { ...o, blocked, on };
  }).sort((a, b) => Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
}

/** ชื่อแบรนด์ในระบบตรงกับแบรนด์บน Shopee ไหม ("Louis Montini" ↔ "Louis Montini(หลุยส์ มอนตินี่)") */
export function shopeeBrandMatches(erpBrand: string | null | undefined, shopeeBrand: string | null | undefined): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9ก-๙]/g, "");
  const a = n(str(erpBrand)), b = n(str(shopeeBrand));
  return !!a && !!b && (a === b || b.startsWith(a) || a.startsWith(b));
}

// ───────── แผน ─────────
export type ShopeeCreateDim = { key: "color" | "option" | "code"; label: string; name: string; values: string[] };
/** price = ที่จะส่ง (แก้ในร่างได้) · price_base = ราคาจากระบบ (ราคาเต็ม → ราคาขาย) · color_base = ชื่อสีจากระบบ (ก่อนแก้ในร่าง) */
export type ShopeeCreateVariantRow = {
  sku_id: string; code: string; attrs: Record<string, string>; price: number | null; fake: number | null; sale: number | null; image_ref: string | null;
  price_base: number | null; price_custom: boolean; color_base: string | null; color_custom: boolean; image_custom: boolean;
  /** รูปตัวเลือกอัตโนมัติ (ปก SKU) — ใช้ตอนกด "กลับไปใช้รูปอัตโนมัติ" */
  image_base: string | null;
};
export type ShopeeCreateField<T> = { value: T; src: string };
export type ShopeeCreatePreview = {
  parent_id: string; parent_code: string;
  name: ShopeeCreateField<string>;
  /** รูปในรายละเอียด (ต่อท้ายข้อความ) · lazadaRefs = ชุดที่เลือกไว้ในร่าง Lazada (ปุ่ม "ใช้ชุดเดียวกับ Lazada") · lowRes = รูปที่กว้างไม่ถึง 800px */
  descImages: { refs: string[]; custom: boolean; src: string; max: number; lazadaRefs: string[] | null; lowRes: string[] };
  description: ShopeeCreateField<string> & { /** จำนวนรูป Description ของ Parent SKU */ parentImages: number; /** ร้านใส่รูปในรายละเอียดได้ไหม (Shopee เปิดสิทธิ์ extended description): true = สินค้าแบบใช้รูปในรายละเอียด · false = สินค้าแบบเป็นข้อความ (ยังไม่พบสิทธิ์) · null = ไม่มีสินค้าแบบ */ imagesAllowed: boolean | null };
  /** ชื่อสีที่เลือกได้ (Color Platform [TH] ของ SKU ในสินค้านี้ → ชื่อสีปกติ) */
  colorChoices: string[];
  category: { id: string | null; label: string | null; kind: ShopeeCategoryKind | null; src: string; candidates: ShopeeCategoryPick[] };
  brand: { id: number; name: string; src: string };
  images: { refs: string[]; src: string; custom: boolean; min: number; max: number };
  weight: { kg: number | null; src: string };
  box: { l: number | null; w: number | null; h: number | null; mandatory: boolean };
  dims: ShopeeCreateDim[];
  variants: ShopeeCreateVariantRow[];
  /** ช่องคุณลักษณะของหมวด · required = ช่องบังคับที่ยังว่าง · fromTemplate = เติมจากสินค้าแบบ (#item) */
  /** ช่องคุณลักษณะของหมวด · sources = ค่าแต่ละช่องมาจากไหน (draft = กรอก/บันทึกไว้ในร่าง · template = สินค้าบนร้านหมวดเดียวกัน) */
  /** sources = ค่าแต่ละช่องมาจากไหน: draft ร่าง · default ค่าเริ่มต้นของร้าน · product จากข้อมูลสินค้า · template สินค้าบนร้านหมวดเดียวกัน
   *  rules = ค่าเริ่มต้นของร้านที่ใช้อยู่ (rulesCustom = ร้านตั้งเอง · false = ค่าเริ่มต้นของระบบ) */
  attrs: { required: string[]; loaded: boolean; fields: TtsAttrField[]; values: TtsAttrState; fromTemplate: string | null; sources: Record<string, ShopeeAttrSource>; rules: AttrDefaultRule[]; rulesCustom: boolean };
  /** ขนส่ง: options = ติ๊กได้ (เปิด/ปิด · ค่าส่งโดยประมาณ) · custom = เลือกเองไว้ในร่าง */
  logistics: { channels: { id: number; name: string | null }[]; options: ShopeeLogisticOption[]; custom: boolean; src: string };
  daysToShip: number | null;
  stock: number; status: string;
  /** ข้อที่ต้องแก้ก่อนลงจริง (Shopee จะปฏิเสธ) */
  missing: string[];
  warnings: string[];
  on_shop: string | null;
  template_item: string | null;
  draft_extra: Record<string, unknown>;
};

/**
 * แผนสร้างสินค้า 1 ตัวบน Shopee — preview (โชว์คน) + payload (ส่ง Shopee · รูปยังเป็น ref ที่ route ต้องฝากก่อน)
 * category = หมวดที่เลือกแล้ว (shopeePickCategory) + candidates (โชว์ให้กดเปลี่ยน) · attrFields = ช่องของหมวดนั้น (null = ดึงไม่ได้)
 */
export function planShopeeCreate(input: {
  parent: ShopeeCreateParent; skus: ShopeeCreateSku[]; draft: ShopeeCreateDraft;
  category: ShopeeCategoryPick | null; candidates: ShopeeCategoryPick[];
  galleryKeys: string[]; attrFields: TtsAttrField[] | null; limits: ShopeeCreateLimits | null;
  template: ShopeeTemplate | null; onShop: string | null;
  /** ค่าเริ่มต้นช่องคุณลักษณะของร้าน (ui_config) · null/ไม่ส่ง = ค่าเริ่มต้นของระบบ DEFAULT_ATTR_RULES */
  attrRules?: AttrDefaultRule[] | null;
  /** รูปในรายละเอียดที่เลือกไว้ในร่าง Lazada (extra.lazada_desc_images) — ข้อ 3 */
  lazadaDescImages?: string[] | null;
  /** ความกว้างรูป (r2 key → px) จากคลังรูป — ข้อ 2 เตือนรูปไม่คม */
  imageWidths?: Record<string, number> | null;
  /** ขนส่งของร้าน (get_channel_list) · null = ดึงไม่ได้ (ใช้ของสินค้าแบบอย่างเดียว) */
  channels?: ShopeeChannel[] | null;
}): { preview: ShopeeCreatePreview; payload: { add_item: Record<string, unknown>; tier: Record<string, unknown> | null } } {
  const { parent: p, draft: d } = input;
  const L = input.limits;
  const extra = (d?.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>;
  const missing: string[] = []; const warnings: string[] = [];

  // ---------- ชื่อ ----------
  // ตัวเลือกชื่อกลาง (lib/listing-title): ร่างที่คนแก้เอง → ชื่อแพลตฟอร์ม → ชื่อสินค้า · ร่างที่เป็นสำเนาชื่อเก่า = ใช้ชื่อล่าสุด
  const titlePick = pickListingTitle(d?.title, p, "Shopee");
  const name = titlePick.text;
  const nameSrc = titlePick.src;
  const nLen = shopeeTextLength(name);
  if (!name) missing.push("ชื่อสินค้า");
  else if (L?.nameMin != null && nLen < L.nameMin) missing.push(`ชื่อสั้นไป ${nLen} ตัวอักษร (Shopee ต้องอย่างน้อย ${L.nameMin})`);
  else if (L?.nameMax != null && nLen > L.nameMax) missing.push(`ชื่อยาว ${nLen} ตัวอักษร (Shopee รับไม่เกิน ${L.nameMax})`);

  // ---------- รายละเอียด (ข้อความธรรมดา) ----------
  // ร่างที่แก้เอง → Platform Description สด (ตัวเดียวกับป๊อป Parent SKU) → คอลัมน์เดิม (ค่าเก่า) — ตัวเลือกกลาง pickListingDescription
  const pick = pickListingDescription(String(d?.description ?? ""), p, "Shopee");
  const desc = noteToText(pick.text).replace(/\n{3,}/g, "\n\n").trim();
  const descSrc = pick.src;
  const dLen = shopeeTextLength(desc);
  const descMax = L?.descMax ?? DEFAULT_DESC_MAX;
  if (!desc) missing.push("รายละเอียดสินค้า");
  else if (L?.descMin != null && dLen < L.descMin) missing.push(`รายละเอียดสั้นไป ${dLen} ตัวอักษร (Shopee ต้องอย่างน้อย ${L.descMin})`);
  else if (dLen > descMax) missing.push(`รายละเอียดยาว ${dLen.toLocaleString()} ตัวอักษร (Shopee รับไม่เกิน ${descMax.toLocaleString()})`);
  if (/<img\b/i.test(pick.text)) warnings.push("รูปในรายละเอียดไม่ได้ส่ง (Shopee แบบข้อความรับเฉพาะตัวอักษร) — เพิ่มรูปในรูปสินค้าแทน");

  // ---------- หมวด ----------
  const cat = input.category;
  const categoryId = cat?.id ?? null;
  const catSrc = cat ? cat.src : "ยังไม่ได้เลือก — เลือกหมวด Shopee";
  if (!categoryId) missing.push("หมวด Shopee");
  else if (cat && (cat.kind === "recommend" || cat.kind === "same_type")) missing.push(`ยืนยันหมวด Shopee — ระบบเดาให้ (${cat.src}) · กด "ใช้หมวดนี้" ถ้าตรง หรือเลือกหมวดอื่น`);

  // ---------- ตัวขาย + ราคา ----------
  const { masters, sellable, masterOf, act } = splitSkus(input.skus);
  const owner = (s: ShopeeCreateSku, f: "fake_price" | "list_price") => pos(s[f]) ?? pos(masterOf(s.code)?.[f]);
  if (!sellable.length) missing.push("SKU ที่เปิดขาย ≥ 1");

  // ---------- ชั้นตัวเลือก (≤ 2 ชั้น · ชื่อชั้น/ตัวเลือกยาวตามร้าน) ----------
  const nameOv = recOf(extra.shopee_option_names);
  const colorBase = (s: ShopeeCreateSku) => listingColorName(s);   // ชื่อสีเหมือนกันทุกร้าน (lib/listing-defaults)
  const colorOf = (s: ShopeeCreateSku) => str(nameOv[s.id]) || colorBase(s);
  const vo = (s: ShopeeCreateSku) => { const av = s.attribute_values; const v = av && typeof av === "object" ? (av as Record<string, unknown>).variant_option : null; return v && typeof v === "object" ? v as Record<string, unknown> : null; };
  const optOf = (s: ShopeeCreateSku) => str(vo(s)?.value);
  const optName = sellable.map((s) => str(vo(s)?.name)).find(Boolean) || "ตัวเลือก";
  const distinct = (fn: (s: ShopeeCreateSku) => string) => [...new Set(sellable.map(fn).filter(Boolean))];
  const ourDims: { key: ShopeeCreateDim["key"]; label: string; valOf: (s: ShopeeCreateSku) => string }[] = [];
  if (sellable.length > 1) {
    if (distinct(colorOf).length) ourDims.push({ key: "color", label: "สี", valOf: colorOf });
    if (distinct(optOf).length) ourDims.push({ key: "option", label: optName, valOf: optOf });
    if (!ourDims.length) ourDims.push({ key: "code", label: "แบบ", valOf: (s) => s.code });
  }
  const tierNameMax = L?.tierNameMax ?? null, tierOptMax = L?.tierOptionMax ?? null;
  const dims: ShopeeCreateDim[] = ourDims.slice(0, SHOPEE_CREATE_MAX_TIERS).map((od) => ({ key: od.key, label: od.label, name: tierNameMax ? od.label.slice(0, tierNameMax) : od.label, values: distinct(od.valOf) }));
  for (const [i, dm] of dims.entries()) {
    if (dm.name !== dm.label) warnings.push(`ชื่อชั้น "${dm.label}" ยาวเกิน ${tierNameMax} ตัวอักษร — ส่งเป็น "${dm.name}"`);
    const empties = sellable.filter((s) => !ourDims[i].valOf(s)).length;
    if (empties) missing.push(`${empties} SKU ไม่มีค่า "${dm.label}" — Shopee ต้องให้ทุกตัวเลือกมีชั้นเหมือนกัน`);
    const long = tierOptMax ? dm.values.filter((v) => shopeeTextLength(v) > tierOptMax) : [];
    if (long.length) missing.push(`ค่าตัวเลือก "${dm.label}" ยาวเกิน ${tierOptMax} ตัวอักษร ${long.length} ค่า เช่น "${long[0].slice(0, 30)}"`);
  }

  // ---------- แถวตัวเลือก ----------
  // รูปประจำตัวเลือก: เลือกเองในร่าง (extra.shopee_option_images { ชื่อสี: ref }) → ปกของ SKU
  const imgOv = recOf(extra.shopee_option_images);
  const colorImg = new Map<string, string>();
  for (const s of act) { const c = colorOf(s); if (!c || colorImg.has(c)) continue; const k = masters.has(s.code) ? s.cover_image_r2_key : (s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null); if (k) colorImg.set(c, r2(k)); }
  const imgAuto = (s: ShopeeCreateSku): string | null => { const k = s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null; return colorImg.get(colorOf(s)) ?? (k ? r2(k) : null); };
  const imgOfSku = (s: ShopeeCreateSku): string | null => str(imgOv[colorOf(s)]) || imgAuto(s);
  const priceOv = recOf(extra.shopee_prices);
  const variants: ShopeeCreateVariantRow[] = sellable.map((s) => {
    const fake = owner(s, "fake_price"), sale = owner(s, "list_price");
    const pOv = pos(priceOv[s.id]);
    const attrs: Record<string, string> = {};
    dims.forEach((dm, i) => { attrs[dm.name] = ourDims[i].valOf(s); });
    return {
      sku_id: s.id, code: s.code, attrs, price: pOv ?? fake ?? sale, fake, sale, image_ref: imgOfSku(s),
      price_base: fake ?? sale, price_custom: pOv != null, color_base: colorBase(s) || null, color_custom: !!str(nameOv[s.id]), image_custom: !!str(imgOv[colorOf(s)]),
      image_base: imgAuto(s),
    };
  });
  const noPrice = variants.filter((v) => !v.price).length;
  if (noPrice) missing.push(`ราคา (${noPrice} ตัวเลือกยังไม่มีราคา)`);
  const notInt = variants.filter((v) => v.price && !Number.isInteger(v.price));
  if (notInt.length) missing.push(`Shopee ไทยตั้งราคาได้เฉพาะจำนวนเต็มบาท (${notInt.length} ตัวเลือก เช่น ${notInt[0].code} ${notInt[0].price}฿)`);
  const outRange = variants.filter((v) => v.price && ((L?.priceMin != null && v.price < L.priceMin) || (L?.priceMax != null && v.price > L.priceMax)));
  if (outRange.length) missing.push(`ราคาไม่อยู่ในช่วงที่ร้านตั้งได้ (${L?.priceMin ?? "?"}–${L?.priceMax?.toLocaleString() ?? "?"} บาท · เช่น ${outRange[0].code} ${outRange[0].price}฿)`);
  if (variants.length > SHOPEE_CREATE_MAX_MODELS) missing.push(`ตัวเลือก ${variants.length} ตัว — Shopee รับไม่เกิน ${SHOPEE_CREATE_MAX_MODELS} ตัวต่อสินค้า`);
  if (dims.length) {
    const combos = variants.map((v) => dims.map((dm) => v.attrs[dm.name]).join("|"));
    if (new Set(combos).size < combos.length) missing.push("ตัวเลือกซ้ำกัน (สี/ตัวเลือกเหมือนกันมากกว่า 1 SKU) — แก้ชื่อสีหรือเพิ่มตัวเลือก");
  }
  const longSku = variants.filter((v) => v.code.length > MODEL_SKU_MAX);
  if (longSku.length) missing.push(`รหัส SKU ยาวเกิน ${MODEL_SKU_MAX} ตัว ${longSku.length} ตัว`);
  // รูปตัวเลือก: ชั้นแรกเป็น "สี" และทุกสีมีรูป → ใส่ทุกค่า · ไม่ครบ = ไม่ใส่ (เตือน)
  const colorDim = dims[0]?.key === "color" ? dims[0] : null;
  const optImgOn = !!colorDim && variants.length > 0 && variants.every((v) => !!v.image_ref);
  if (colorDim && !optImgOn) warnings.push("บางสียังไม่มีรูป — ไม่ใส่รูปตัวเลือก · กดช่องรูปในตารางตัวเลือกเพื่อเลือกรูป (หรือตั้งปกของ SKU ในระบบ)");
  if (variants.some((v) => v.fake && v.sale && v.sale < v.fake)) warnings.push("ราคาตั้งบน Shopee = ราคาเต็มในระบบ — ส่วนลดทำด้วยโปรโมชันของร้าน (ราคาขายในระบบไม่ได้ส่ง)");

  // ---------- รูปสินค้า ----------
  const imagesMax = L?.imagesMax ?? DEFAULT_IMAGES_MAX;
  const picked = Array.isArray(extra.shopee_images) ? (extra.shopee_images as unknown[]).map(str).filter(Boolean) : [];
  // ชุดรูปตั้งต้นเหมือนกันทุกร้าน (lib/listing-defaults · เจ้าของบอก 2026-11-21): รูปในร่าง → รูปของสินค้าในระบบตามลำดับหน้า Parent SKU (ปก → แกลเลอรี → ปกตัวสี → รูปตัวขาย)
  //   galleryKeys = it.images ของ lib/product-listing-context (เรียงแล้ว) · ปกตัวสี/ตัวขายต่อท้ายเผื่อชุดรูปไม่มี
  const coverKeys = [...act.filter((s) => masters.has(s.code)).map((s) => s.cover_image_r2_key), ...sellable.map((s) => s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null)].filter(Boolean) as string[];
  const poolKeys = listingDefaultImages([...input.galleryKeys, ...coverKeys], [], 999);
  const draftKeysRaw = Array.isArray(d?.image_keys) ? (d!.image_keys as unknown[]).map(str).filter(Boolean) : [];
  const autoRefs = poolKeys.map(r2);
  // เลือกเอง (extra.shopee_images) = ใช้ตามนั้น · ไม่ได้เลือก = รูปในร่าง (ตัวเตรียมร่างเติมให้แค่ปก) แล้วเติมด้วยรูปสินค้าในระบบจนครบ
  //   🐛 ลองจริง 2026-11-15: MGW318 ร่างมีแค่ 2 รูป (ปกสินค้า + ปก SKU) ทั้งที่แกลเลอรีมีอีก 4 → Shopee ปฏิเสธ (ต้อง ≥ 3) — เดิมใช้รูปในร่างอย่างเดียว
  const refs = picked.length ? [...new Set(picked)].slice(0, imagesMax) : listingDefaultImages(poolKeys, draftKeysRaw, imagesMax).map(r2);
  const imgSrc = picked.length ? "เลือกไว้สำหรับ Shopee" : draftKeysRaw.length ? "รูปในร่าง + รูปสินค้าในระบบ (อัตโนมัติ)" : "รูปสินค้าในระบบ ลำดับเดียวกับหน้า Parent SKU (อัตโนมัติ)";
  // ---------- รูปในรายละเอียด (ต่อท้ายข้อความ · แบบ A) ----------
  //   เลือกเอง (extra.shopee_desc_images · [] = ไม่ใส่) → รูป Description ของ Parent SKU → ไม่มี = รูปสินค้าทั้งหมด (ข้อ 1)
  const descPicked = Array.isArray(extra.shopee_desc_images) ? [...new Set((extra.shopee_desc_images as unknown[]).map(str).filter(Boolean))] : null;
  const parentDescRefs = [...new Set((p.desc_image_keys ?? []).map(str).filter(Boolean))].map(r2);
  const descRefs = (descPicked ?? (parentDescRefs.length ? parentDescRefs : autoRefs)).slice(0, SHOPEE_DESC_MAX_IMAGES);
  const descImgSrc = descPicked ? (descPicked.length ? "เลือกไว้สำหรับ Shopee" : "เลือกไม่ใส่รูป")
    : parentDescRefs.length ? `รูป Description ของ Parent SKU (${parentDescRefs.length} รูป)` : "รูปสินค้าทั้งหมด (สินค้านี้ยังไม่มีรูป Description)";
  const widthOf = (ref: string) => input.imageWidths?.[ref.replace(/^r2:/, "")] ?? null;
  const descLowRes = descRefs.filter((r) => { const w = widthOf(r); return w != null && w < SHOPEE_DESC_MIN_WIDTH; });
  if (descLowRes.length) warnings.push(`รูปในรายละเอียด ${descLowRes.length} รูป กว้างไม่ถึง ${SHOPEE_DESC_MIN_WIDTH}px — บนร้านอาจไม่คม`);
  const imagesMin = Math.max(SHOPEE_MIN_IMAGES, L?.imagesMin ?? 0);
  if (refs.length < imagesMin) missing.push(`รูปสินค้าต้องมีอย่างน้อย ${imagesMin} รูป (Shopee บังคับ · ตอนนี้ ${refs.length} รูป) — เพิ่มรูปในแท็บรูปของหน้านี้ หรือเพิ่มรูปสินค้าที่หน้า Parent SKU`);
  else if (refs.length < 5) warnings.push(`มีรูป ${refs.length} รูป — แนะนำอย่างน้อย 5 รูป (Shopee รับได้ ${imagesMax})`);

  // ---------- น้ำหนัก + กล่อง ----------
  const wKg = pos(extra.shopee_weight) ?? (pos(p.weight_g) ? (p.weight_g as number) / 1000 : null);
  const weight = wKg != null ? round3(wKg) : null;
  const wSrc = pos(extra.shopee_weight) ? "แก้ไว้สำหรับ Shopee" : pos(p.weight_g) ? "น้ำหนักสินค้าในระบบ" : "ยังไม่มีน้ำหนัก";
  if (!weight) missing.push(pos(p.weight_g) ? "น้ำหนัก (น้อยเกินไป — เช็กว่ากรอกเป็นกรัม)" : "น้ำหนักพัสดุ (Shopee บังคับ)");
  else if (weight > 30) warnings.push(`น้ำหนัก ${weight} กก. — ตรวจว่ากรอกเป็นกรัมในระบบ (ไม่ใช่กิโลกรัม)`);
  const ceil = (v: unknown) => { const n = pos(v); return n ? Math.ceil(n) : null; };
  const box = { l: ceil(p.box?.l), w: ceil(p.box?.w), h: ceil(p.box?.h) };
  const hasBox = !!(box.l && box.w && box.h);
  const boxMandatory = L?.dimensionMandatory === true;
  if (boxMandatory && !hasBox) missing.push("ขนาดกล่อง ยาว×กว้าง×สูง (หมวดนี้ Shopee บังคับ) — ตั้งที่หน้าสินค้า");

  // ---------- แบรนด์ / ขนส่ง / วันส่ง (จากสินค้าแบบ) ----------
  const t = input.template;
  const brandOk = !!t?.brand && t.brand.id > 0 && shopeeBrandMatches(p.brand_name, t.brand.name);
  const brand = brandOk ? t!.brand! : { id: 0, name: "NoBrand" };
  const brandSrc = brandOk ? `แบรนด์เดียวกับสินค้าบนร้าน (#${t!.itemId})` : t ? `สินค้าแบบบนร้านไม่ใช่แบรนด์ "${p.brand_name ?? "—"}" — ใส่ "ไม่มีแบรนด์" (แก้ใน Seller Centre ได้)` : "ไม่พบสินค้าแบบบนร้าน — ใส่ \"ไม่มีแบรนด์\"";
  if (!brandOk) warnings.push(`แบรนด์: ${brandSrc}`);
  const pickedLog = Array.isArray(extra.shopee_logistics) ? (extra.shopee_logistics as unknown[]).map((x) => num(x)).filter((n): n is number => n != null && n > 0) : null;
  const logOptions = shopeeLogisticOptions(t, input.channels ?? null, pickedLog, weight);
  const chosenLog = logOptions.filter((o) => o.on);
  const logSrc = pickedLog ? "เลือกไว้สำหรับ Shopee" : t ? `ค่าเริ่ม = ขนส่งเดียวกับสินค้าบนร้าน (#${t.itemId}) · ขนส่งของใหญ่ปิดไว้ก่อน` : "ไม่พบสินค้าแบบบนร้าน";
  if (!chosenLog.length) missing.push(!t && !logOptions.length ? "ขนส่ง — ต้องมีสินค้าแบรนด์เดียวกันขายอยู่บนร้านอย่างน้อย 1 ตัว (ใช้เป็นแบบ)" : "ขนส่ง — เปิดอย่างน้อย 1 ขนส่ง");
  const daysToShip = L?.dtsNonPreOrder ?? t?.daysToShip ?? null;

  // ---------- ช่องคุณลักษณะของหมวด ----------
  const fields = input.attrFields ?? null;
  const draftAttrs = shopeeAttrStateOf(extra.shopee_attrs);
  const attrVals: TtsAttrState = { ...draftAttrs };
  const attrSources: Record<string, ShopeeAttrSource> = Object.fromEntries(Object.keys(draftAttrs).map((k) => [k, "draft" as const]));
  let fromTemplate: string | null = null;
  // ค่าเริ่มต้นของร้าน (ตั้งเองได้ · ไม่ตั้ง = ค่าเริ่มต้นของระบบ) + ค่าจากข้อมูลสินค้า → เติมช่องที่ยังว่าง (ทุกช่อง ไม่ใช่แค่ช่องบังคับ)
  const rules = input.attrRules ?? DEFAULT_ATTR_RULES;
  if (fields) {
    const filled = applyAttrDefaults(fields, attrVals, rules, { warranty: p.warranty ?? null, size: p.size ?? null, weightKg: weight });
    Object.assign(attrVals, filled.values); Object.assign(attrSources, filled.sources);
  }
  // ช่องบังคับที่ร่างยังไม่มี → เติมจากสินค้าแบบหมวดเดียวกัน (เตือนให้ตรวจ)
  if (fields && t && t.categoryId && t.categoryId === categoryId) {
    for (const f of fields) {
      if (!f.required || (attrVals[f.id] ?? []).length) continue;
      const v = t.attrs[f.id];
      if (v?.length) { attrVals[f.id] = v; attrSources[f.id] = "template"; fromTemplate = t.itemId; }
    }
  }
  const required = fields ? fields.filter((f) => f.required && !(attrVals[f.id] ?? []).length).map((f) => f.name) : [];
  if (required.length) missing.push(`ช่องบังคับของหมวดยังว่าง ${required.length} ช่อง (${required.slice(0, 3).join(", ")}${required.length > 3 ? " …" : ""})`);
  if (fields) for (const f of fields) if (!f.customizable && f.options.length && (attrVals[f.id] ?? []).some((v) => !v.id)) missing.push(`"${f.name}" ต้องเลือกจากรายการของ Shopee`);
  if (!fields && categoryId) warnings.push("ดึงช่องของหมวดจาก Shopee ไม่ได้ — ถ้ามีช่องบังคับ Shopee จะปฏิเสธตอนลงจริง");
  if (fromTemplate) warnings.push(`ช่องบังคับของหมวดเติมจากสินค้าบนร้านหมวดเดียวกัน (#${fromTemplate}) — ตรวจว่าตรงกับสินค้านี้`);

  const onShop = input.onShop ?? (str(d?.platform_product_id) || null);
  if (onShop) warnings.push(`มีบน Shopee แล้ว (#${onShop}) — ไม่สร้างซ้ำ`);
  warnings.push("ลงแบบ \"ปิดขาย\" + สต๊อก 0 เสมอ (BigSeller ยังคุมสต๊อก) — ตรวจในลิ้นชักสินค้าบนร้าน แล้วค่อยเปิดขาย/ใส่สต๊อก");

  // ---------- payload (รูป = ref · route ฝากแล้วแทนเป็น image_id) ----------
  const prices = variants.map((v) => v.price).filter((n): n is number => n != null && n > 0);
  const optImgOf = new Map<string, string>();
  if (optImgOn && colorDim) for (const v of variants) { const c = v.attrs[colorDim.name]; if (c && v.image_ref && !optImgOf.has(c)) optImgOf.set(c, v.image_ref); }
  const add_item: Record<string, unknown> = {
    item_name: name,
    description: desc,
    // รูปในรายละเอียด: แบบ extended (ข้อความ + รูปต่อท้าย) · route ฝากรูปแล้วแทน image_ref เป็น image_id · ฝากไม่ได้สักรูป = กลับเป็นข้อความอย่างเดียว
    ...(descRefs.length ? { description_type: "extended", description_info: { extended_description: { field_list: [
      { field_type: "text", text: desc },
      ...descRefs.map((ref) => ({ field_type: "image", image_info: { image_ref: ref } })),
    ] } } } : {}),
    original_price: dims.length ? (prices.length ? Math.min(...prices) : 0) : (variants[0]?.price ?? 0),
    weight: weight ?? 0,
    category_id: categoryId ? Number(categoryId) : 0,
    item_status: SHOPEE_CREATE_STATUS,
    image: { image_ref_list: refs },
    brand: { brand_id: brand.id, original_brand_name: brand.name },
    logistic_info: chosenLog.map((l) => ({ logistic_id: l.id, enabled: true, ...(l.sizeId ? { size_id: l.sizeId } : {}), ...(l.shippingFee != null ? { shipping_fee: l.shippingFee } : {}), ...(l.isFree ? { is_free: true } : {}) })),
    seller_stock: [{ stock: SHOPEE_CREATE_STOCK }],
    item_sku: dims.length ? p.code : (variants[0]?.code ?? p.code),
    condition: "NEW",
    ...(daysToShip ? { pre_order: { is_pre_order: false, days_to_ship: daysToShip } } : {}),
    ...(hasBox ? { dimension: { package_length: box.l, package_width: box.w, package_height: box.h } } : {}),
    ...(Object.keys(attrVals).length ? { attribute_list: shopeeAttrPayload(attrVals) } : {}),
  };
  const tier = dims.length ? {
    standardise_tier_variation: dims.map((dm, i) => ({
      variation_id: 0, variation_group_id: 0, variation_name: dm.name,
      variation_option_list: dm.values.map((val) => ({ variation_option_id: 0, variation_option_name: val, ...(i === 0 && optImgOf.get(val) ? { image_ref: optImgOf.get(val) } : {}) })),
    })),
    model: variants.map((v) => ({ tier_index: dims.map((dm) => dm.values.indexOf(v.attrs[dm.name])), original_price: v.price ?? 0, model_sku: v.code, seller_stock: [{ stock: SHOPEE_CREATE_STOCK }] })),
  } : null;

  return {
    payload: { add_item, tier },
    preview: {
      parent_id: p.id, parent_code: p.code,
      name: { value: name, src: nameSrc },
      descImages: { refs: descRefs, custom: descPicked != null, src: descImgSrc, max: SHOPEE_DESC_MAX_IMAGES, lazadaRefs: input.lazadaDescImages?.length ? input.lazadaDescImages : null, lowRes: descLowRes },
      description: { value: desc, src: descSrc, parentImages: parentDescRefs.length || (p.desc_image_count ?? 0), imagesAllowed: input.template?.descType === "extended" ? true : input.template?.descType === "normal" ? false : null },
      colorChoices: [...new Set(act.flatMap((s) => [str(s.color_platform_th), str(s.color_th)]).filter(Boolean))],
      category: { id: categoryId, label: cat?.label ?? null, kind: cat?.kind ?? null, src: catSrc, candidates: input.candidates },
      brand: { ...brand, src: brandSrc },
      images: { refs, src: imgSrc, custom: picked.length > 0, min: imagesMin, max: imagesMax },
      weight: { kg: weight, src: wSrc },
      box: { ...box, mandatory: boxMandatory },
      dims, variants,
      attrs: { required, loaded: !!fields, fields: fields ?? [], values: attrVals, fromTemplate, sources: attrSources, rules, rulesCustom: !!input.attrRules },
      logistics: { channels: chosenLog.map((l) => ({ id: l.id, name: l.name })), options: logOptions, custom: !!pickedLog, src: logSrc },
      daysToShip, stock: SHOPEE_CREATE_STOCK, status: SHOPEE_CREATE_STATUS,
      missing, warnings, on_shop: onShop, template_item: t?.itemId ?? null, draft_extra: extra,
    },
  };
}

/** รูปสินค้าที่ต้องฝาก (บังคับ — ฝากไม่ได้ = หยุด) */
export const shopeeCreateMainImageRefs = (payload: { add_item: Record<string, unknown> }): string[] =>
  [...new Set(((obj(payload.add_item.image)?.image_ref_list as unknown[] | undefined) ?? []).map(str).filter(Boolean))];
/** รูปตัวเลือกที่ต้องฝาก (ไม่บังคับ — ฝากไม่ครบ = ไม่ใส่รูปตัวเลือกทั้งชุด) */
export const shopeeCreateOptionImageRefs = (payload: { tier: Record<string, unknown> | null }): string[] =>
  [...new Set(arrOf(payload.tier?.standardise_tier_variation).flatMap((t) => arrOf(t.variation_option_list).map((o) => str(o.image_ref))).filter(Boolean))];

/**
 * แทน ref ด้วย image_id ที่ฝากแล้ว → body ที่ส่ง Shopee ได้จริง
 * add_item.image = { image_id_list } · รูปตัวเลือก: ฝากครบทุกตัว = ใส่ image_id · ไม่ครบ = ตัดทั้งชุด (optionImages=false)
 */
export function shopeeCreateResolve(payload: { add_item: Record<string, unknown>; tier: Record<string, unknown> | null }, idOf: Map<string, string>): { add_item: Record<string, unknown>; tier: Record<string, unknown> | null; optionImages: boolean } {
  const add = JSON.parse(JSON.stringify(payload.add_item)) as Record<string, unknown>;
  const img = obj(add.image) ?? {};
  const ids = ((img.image_ref_list as unknown[] | undefined) ?? []).map(str).filter(Boolean).map((r) => idOf.get(r)).filter((x): x is string => !!x);
  const { image_ref_list: _drop, ...restImg } = img as Record<string, unknown>;
  void _drop;
  add.image = { ...restImg, image_id_list: ids };
  // รูปในรายละเอียด: แทน ref → image_id · ฝากไม่ได้ = ตัดรูปนั้น · ไม่เหลือสักรูป = ข้อความอย่างเดียว (description_type normal)
  const ext = obj(obj(add.description_info)?.extended_description);
  if (ext) {
    const fl = arrOf(ext.field_list).flatMap((f) => {
      if (str(f.field_type) !== "image") return [f];
      const id = idOf.get(str(obj(f.image_info)?.image_ref));
      return id ? [{ field_type: "image", image_info: { image_id: id } }] : [];
    });
    if (fl.some((f) => str(f.field_type) === "image")) ext.field_list = fl;
    else { delete add.description_info; delete add.description_type; }
  }
  if (!payload.tier) return { add_item: add, tier: null, optionImages: false };
  const tier = JSON.parse(JSON.stringify(payload.tier)) as Record<string, unknown>;
  const optRefs = shopeeCreateOptionImageRefs(payload);
  const allOk = optRefs.length > 0 && optRefs.every((r) => idOf.has(r));
  for (const t of arrOf(tier.standardise_tier_variation)) {
    for (const o of arrOf(t.variation_option_list)) {
      const r = str(o.image_ref); delete o.image_ref;
      if (r && allOk) o.image_id = idOf.get(r)!;
    }
  }
  return { add_item: add, tier, optionImages: allOk };
}

/** รูปในรายละเอียดที่ต้องฝาก (ไม่บังคับ — ฝากไม่ได้ = ตัดรูปนั้น · ไม่เหลือสักรูป = ส่งข้อความอย่างเดียว) */
export const shopeeCreateDescImageRefs = (payload: { add_item: Record<string, unknown> }): string[] => {
  const fl = arrOf(obj(obj(payload.add_item.description_info)?.extended_description)?.field_list);
  return [...new Set(fl.map((f) => str(obj(f.image_info)?.image_ref)).filter(Boolean))];
};

/** รูปทั้งหมดที่ต้องฝากกับ Shopee ก่อนส่ง (รูปสินค้า + รูปตัวเลือก · ไม่ซ้ำ) — ใช้ตอนลงจริง (5B) */
export function shopeeCreateImageRefs(payload: { add_item: Record<string, unknown>; tier: Record<string, unknown> | null }): string[] {
  const main = (obj(payload.add_item.image)?.image_ref_list as unknown[] | undefined ?? []).map(str).filter(Boolean);
  const opt = arrOf(payload.tier?.standardise_tier_variation).flatMap((t) => arrOf(t.variation_option_list).map((o) => str(o.image_ref))).filter(Boolean);
  return [...new Set([...main, ...opt])];
}

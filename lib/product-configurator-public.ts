/**
 * 👜 ตัวประกอบสินค้า — ข้อมูลที่ส่งให้เว็บร้าน (ฝั่ง server เท่านั้น)
 *
 * ใช้ที่: /api/public/storefront/configurator (โหลดหน้าออกแบบ) · /api/public/storefront/configurator-designs (คิดราคาซ้ำตอนบันทึกแบบ)
 * ส่งเฉพาะของที่เปิดอยู่: ทรง is_active (พรีวิวที่มีรหัสพรีวิวถูก = เห็นทรงที่ปิดอยู่ด้วย) · ช่อง/ตัวเลือก/ชั้น/กติกาที่เปิด · รูปของชั้นที่เปิด
 * ไม่ส่ง: shop_id · ค่าแม่แบบถ่ายรูป (view_config) · วันที่สร้าง/แก้
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { normCode, type CfgImage, type CfgLayer, type CfgModel, type CfgOption, type CfgRule, type CfgSlot, type ConfigData } from "@/lib/product-configurator";

type Admin = ReturnType<typeof supabaseAdmin>;

/** การ์ดทรงให้ลูกค้าเลือก (มีหลายทรงที่เปิด) */
export type PublicModelCard = Pick<CfgModel, "code" | "name_th" | "name_en" | "description" | "size_text" | "base_price" | "lead_days" | "views" | "cover_image_key" | "is_active">;
export type PublicConfigurator = { models: PublicModelCard[]; data: ConfigData | null };

const MODEL_COLS = "id, code, name_th, name_en, description, size_text, base_price, lead_days, views, canvas, cover_image_key, sort_order, is_active";
const num = (v: unknown) => Number(v) || 0;

export async function buildConfiguratorPayload(sb: Admin, shopId: string, opts: { model?: string | null; includeInactive?: boolean } = {}): Promise<PublicConfigurator> {
  let q = sb.from("configurator_models").select(MODEL_COLS).eq("shop_id", shopId).is("deleted_at", null).order("sort_order").order("created_at");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data: rows } = await q;
  const list = (rows ?? []) as (Record<string, unknown> & { id: string; code: string })[];
  const models: PublicModelCard[] = list.map((m) => ({
    code: m.code, name_th: String(m.name_th ?? ""), name_en: (m.name_en as string) ?? null, description: (m.description as string) ?? null,
    size_text: (m.size_text as string) ?? null, base_price: num(m.base_price), lead_days: num(m.lead_days),
    views: (Array.isArray(m.views) ? m.views : ["front"]) as CfgModel["views"], cover_image_key: (m.cover_image_key as string) ?? null, is_active: !!m.is_active,
  }));
  const want = normCode(opts.model ?? "");
  const target = (want && list.find((m) => m.code === want)) || list[0];
  if (!target) return { models, data: null };

  const [slots, options, layers, rules] = await Promise.all([
    sb.from("configurator_slots").select("*").eq("model_id", target.id).eq("is_active", true).order("sort_order"),
    sb.from("configurator_options").select("*").eq("model_id", target.id).eq("is_active", true).is("deleted_at", null).order("sort_order"),
    sb.from("configurator_layers").select("*").eq("model_id", target.id).eq("is_active", true).order("z_index"),
    sb.from("configurator_rules").select("*").eq("model_id", target.id).eq("is_active", true).order("sort_order"),
  ]);
  const views = models.find((m) => m.code === target.code)?.views ?? ["front"];
  const slotRows = (slots.data ?? []) as CfgSlot[];
  const slotIds = new Set(slotRows.map((s) => s.id));
  const layerRows = ((layers.data ?? []) as CfgLayer[]).filter((l) => views.includes(l.view));
  const layerIds = layerRows.map((l) => l.id);
  let images: CfgImage[] = [];
  for (let from = 0; layerIds.length; from += 1000) {
    const { data } = await sb.from("configurator_layer_images").select("id, layer_id, combo_key, image_key, width, height, file_name").in("layer_id", layerIds).order("id").range(from, from + 999);
    images = images.concat((data ?? []) as CfgImage[]);
    if (!data || data.length < 1000) break;
  }
  if (slotRows.length === 0) return { models, data: null };

  const strip = <T extends Record<string, unknown>>(r: T) => { const { created_at: _c, updated_at: _u, deleted_at: _d, ...rest } = r as Record<string, unknown>; return rest as T; };
  const data: ConfigData = {
    model: {
      id: target.id, shop_id: "", code: target.code, name_th: String(target.name_th ?? ""), name_en: (target.name_en as string) ?? null,
      description: (target.description as string) ?? null, size_text: (target.size_text as string) ?? null, base_price: num(target.base_price), lead_days: num(target.lead_days),
      views, canvas: (target.canvas as CfgModel["canvas"]) ?? { w: 3000, h: 3000 }, view_config: {}, cover_image_key: (target.cover_image_key as string) ?? null,
      sort_order: num(target.sort_order), is_active: !!target.is_active,
    },
    slots: slotRows.map(strip),
    options: ((options.data ?? []) as CfgOption[]).filter((o) => slotIds.has(o.slot_id)).map((o) => ({ ...strip(o), price_delta: num(o.price_delta), lead_days: num(o.lead_days), attrs: o.attrs ?? {} })),
    layers: layerRows.map(strip),
    images,
    rules: ((rules.data ?? []) as CfgRule[]).map(strip),
  };
  return { models, data };
}

/** รหัสแบบที่ลูกค้าพิมพ์มา (ตัวเล็ก/ไม่มีขีด) → XXXX-XXXX */
export function normDesignCode(raw: unknown): string | null {
  const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

/** รับเฉพาะคีย์ที่เป็นรหัสช่อง + ค่าแบบข้อความ/รายการข้อความ (กันยัดข้อมูลแปลก) */
export function cleanSelectionInput(d: ConfigData, raw: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const codes = new Set(d.slots.map((s) => s.code));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!codes.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 80);
    else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string").slice(0, 40).map((x) => x.slice(0, 40));
  }
  return out;
}

/**
 * ตัวประกอบสินค้า — นิยามทรัพยากร 7 ตาราง (ใช้กับ handler กลาง lib/crud-resource-api.ts)
 * URL: /api/configurator/<models|slots|options|layers|images|rules|designs>[/<id>]
 * สิทธิ์ configurator.view / .edit · audit ทุกการเขียน · กฎตรวจ lib/product-configurator.ts
 */
import type { CrudResource } from "@/lib/crud-resource-api";
import {
  DESIGN_STATUSES, normCode, validateImage, validateLayer, validateModel, validateOption, validateRule, validateSlot,
} from "@/lib/product-configurator";

export const VIEW_PERM = "configurator.view";
export const EDIT_PERM = "configurator.edit";
const perms = { view: VIEW_PERM, edit: EDIT_PERM };

/** ทำรหัสให้เป็นตัวใหญ่ก่อนตรวจ (หน้าจอส่งตัวเล็กมาก็ได้) */
function upCodes(b: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    if (!(k in b) || b[k] == null) continue;
    b[k] = Array.isArray(b[k]) ? (b[k] as unknown[]).map(normCode).filter(Boolean) : normCode(b[k]) || null;
  }
}
const need = (b: Record<string, unknown>, key: string, label: string, partial?: boolean) => (!partial && !b[key] ? [`ต้องระบุ${label}`] : []);
const merge = (pre: string[], v: { ok: boolean; errors?: string[] }) => {
  const errors = [...pre, ...(v.ok ? [] : (v as { errors: string[] }).errors)];
  return errors.length ? { ok: false as const, errors } : { ok: true as const };
};

export const MODELS: CrudResource = {
  table: "configurator_models", entityType: "configurator_models", perms,
  columns: [
    { key: "shop_id", kind: "uuid" }, { key: "code", kind: "text" }, { key: "name_th", kind: "text" }, { key: "name_en", kind: "text" },
    { key: "description", kind: "text" }, { key: "size_text", kind: "text" }, { key: "base_price", kind: "number" }, { key: "lead_days", kind: "int" },
    { key: "views", kind: "text[]" }, { key: "canvas", kind: "json" }, { key: "view_config", kind: "json" }, { key: "cover_image_key", kind: "text" },
    { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["shop_id"],
  orderBy: [{ col: "sort_order", asc: true }, { col: "created_at", asc: true }],
  validate: (b, o) => {
    upCodes(b, ["code"]);
    if ("view_config" in b && b.view_config == null) b.view_config = {};
    if ("base_price" in b && b.base_price == null) b.base_price = 0;
    if ("lead_days" in b && b.lead_days == null) b.lead_days = 0;
    return merge(need(b, "shop_id", "ร้าน (shop_id)", o.partial), validateModel(b, o));
  },
  softDelete: "deleted_at",
  defaults: { base_price: 0, lead_days: 0, views: ["front"], canvas: { w: 3000, h: 3000 }, view_config: {}, sort_order: 100, is_active: false },
  summary: (r) => ({ code: r.code, name_th: r.name_th, shop_id: r.shop_id }),
};

export const SLOTS: CrudResource = {
  table: "configurator_slots", entityType: "configurator_slots", perms,
  columns: [
    { key: "model_id", kind: "uuid" }, { key: "code", kind: "text" }, { key: "name_th", kind: "text" }, { key: "name_en", kind: "text" },
    { key: "help_th", kind: "text" }, { key: "kind", kind: "text" }, { key: "required", kind: "bool" }, { key: "step_view", kind: "text" },
    { key: "config", kind: "json" }, { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["model_id"],
  orderBy: [{ col: "sort_order", asc: true }],
  validate: (b, o) => {
    upCodes(b, ["code"]);
    if ("config" in b && b.config == null) b.config = {};
    return merge(need(b, "model_id", "ทรง (model_id)", o.partial), validateSlot(b, o));
  },
  softDelete: null,
  defaults: { kind: "single", required: true, config: {}, sort_order: 100, is_active: true },
  summary: (r) => ({ model_id: r.model_id, code: r.code, name_th: r.name_th }),
};

export const OPTIONS: CrudResource = {
  table: "configurator_options", entityType: "configurator_options", perms,
  columns: [
    { key: "model_id", kind: "uuid" }, { key: "slot_id", kind: "uuid" }, { key: "code", kind: "text" }, { key: "name_th", kind: "text" },
    { key: "name_en", kind: "text" }, { key: "note_th", kind: "text" }, { key: "price_delta", kind: "number" }, { key: "lead_days", kind: "int" },
    { key: "swatch_hex", kind: "text" }, { key: "swatch_image_key", kind: "text" }, { key: "attrs", kind: "json" },
    { key: "is_default", kind: "bool" }, { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["model_id", "slot_id"],
  orderBy: [{ col: "sort_order", asc: true }],
  validate: (b, o) => {
    upCodes(b, ["code"]);
    if ("attrs" in b && b.attrs == null) b.attrs = {};
    if ("price_delta" in b && b.price_delta == null) b.price_delta = 0;
    if ("lead_days" in b && b.lead_days == null) b.lead_days = 0;
    return merge([...need(b, "model_id", "ทรง (model_id)", o.partial), ...need(b, "slot_id", "ช่อง (slot_id)", o.partial)], validateOption(b, o));
  },
  softDelete: "deleted_at",
  defaults: { price_delta: 0, lead_days: 0, attrs: {}, is_default: false, sort_order: 100, is_active: true },
  summary: (r) => ({ model_id: r.model_id, slot_id: r.slot_id, code: r.code, name_th: r.name_th }),
};

export const LAYERS: CrudResource = {
  table: "configurator_layers", entityType: "configurator_layers", perms,
  columns: [
    { key: "model_id", kind: "uuid" }, { key: "view", kind: "text" }, { key: "code", kind: "text" }, { key: "name_th", kind: "text" },
    { key: "z_index", kind: "int" }, { key: "depends_on", kind: "text[]" }, { key: "show_when", kind: "json" },
    { key: "recolor_slot", kind: "text" }, { key: "text_slot", kind: "text" }, { key: "config", kind: "json" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["model_id", "view"],
  orderBy: [{ col: "view", asc: true }, { col: "z_index", asc: true }],
  validate: (b, o) => {
    upCodes(b, ["code", "depends_on", "recolor_slot", "text_slot"]);
    if ("show_when" in b && b.show_when == null) b.show_when = [];
    if ("config" in b && b.config == null) b.config = {};
    if (Array.isArray(b.show_when)) b.show_when = (b.show_when as { slot?: unknown; options?: unknown[] }[]).map((c) => ({ slot: normCode(c?.slot), options: (c?.options ?? []).map(normCode).filter(Boolean) }));
    return merge(need(b, "model_id", "ทรง (model_id)", o.partial), validateLayer(b, o));
  },
  softDelete: null,
  defaults: { z_index: 100, depends_on: [], show_when: [], config: {}, is_active: true },
  summary: (r) => ({ model_id: r.model_id, view: r.view, code: r.code }),
};

export const IMAGES: CrudResource = {
  table: "configurator_layer_images", entityType: "configurator_layer_images", perms,
  columns: [
    { key: "layer_id", kind: "uuid" }, { key: "combo_key", kind: "text" }, { key: "image_key", kind: "text" },
    { key: "width", kind: "int" }, { key: "height", kind: "int" }, { key: "file_name", kind: "text" },
  ],
  filterCols: ["layer_id"],
  orderBy: [{ col: "combo_key", asc: true }],
  validate: (b, o) => {
    // รูปเดียว (ชั้นที่ไม่เปลี่ยนตามช่องไหน) = combo_key "" (ค่าว่างถูกแปลงเป็น null ระหว่างทาง → คืนเป็น "")
    if ("combo_key" in b && b.combo_key == null) b.combo_key = "";
    if (typeof b.combo_key === "string") b.combo_key = b.combo_key.toUpperCase();
    return merge(need(b, "layer_id", "ชั้นรูป (layer_id)", o.partial), validateImage(b, o));
  },
  softDelete: null,
  defaults: { combo_key: "" },
  summary: (r) => ({ layer_id: r.layer_id, combo_key: r.combo_key, file_name: r.file_name }),
};

export const RULES: CrudResource = {
  table: "configurator_rules", entityType: "configurator_rules", perms,
  columns: [
    { key: "model_id", kind: "uuid" }, { key: "kind", kind: "text" }, { key: "if_slot", kind: "text" }, { key: "if_options", kind: "text[]" },
    { key: "then_slot", kind: "text" }, { key: "then_options", kind: "text[]" }, { key: "reason_th", kind: "text" },
    { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["model_id"],
  orderBy: [{ col: "sort_order", asc: true }, { col: "created_at", asc: true }],
  validate: (b, o) => {
    upCodes(b, ["if_slot", "then_slot", "if_options", "then_options"]);
    return merge(need(b, "model_id", "ทรง (model_id)", o.partial), validateRule(b, o));
  },
  softDelete: null,
  defaults: { kind: "block", if_options: [], sort_order: 100, is_active: true },
  summary: (r) => ({ model_id: r.model_id, kind: r.kind, if_slot: r.if_slot, then_slot: r.then_slot }),
};

export const DESIGNS: CrudResource = {
  table: "configurator_designs", entityType: "configurator_designs", perms,
  columns: [
    { key: "shop_id", kind: "uuid" }, { key: "model_id", kind: "uuid" }, { key: "code", kind: "text" }, { key: "member_id", kind: "uuid" },
    { key: "selections", kind: "json" }, { key: "total_price", kind: "number" }, { key: "lead_days", kind: "int" },
    { key: "status", kind: "text" }, { key: "order_ref", kind: "text" },
  ],
  filterCols: ["shop_id", "model_id", "status"],
  orderBy: [{ col: "created_at", asc: false }],
  validate: (b, o) => {
    const errors = [...need(b, "shop_id", "ร้าน (shop_id)", o.partial), ...need(b, "code", "รหัสแบบ", o.partial)];
    if ("status" in b && !DESIGN_STATUSES.includes(b.status as (typeof DESIGN_STATUSES)[number])) errors.push(`สถานะต้องเป็น ${DESIGN_STATUSES.join(" / ")}`);
    if ("total_price" in b && (b.total_price == null || Number(b.total_price) < 0)) errors.push("ราคารวมต้องไม่ติดลบ");
    if ("selections" in b && (!b.selections || typeof b.selections !== "object")) errors.push("selections ต้องเป็น JSON object");
    return errors.length ? { ok: false, errors } : { ok: true };
  },
  softDelete: null,
  defaults: { selections: {}, total_price: 0, lead_days: 0, status: "saved" },
  summary: (r) => ({ code: r.code, status: r.status, total_price: r.total_price }),
};

export const RESOURCES: Record<string, CrudResource> = {
  models: MODELS, slots: SLOTS, options: OPTIONS, layers: LAYERS, images: IMAGES, rules: RULES, designs: DESIGNS,
};

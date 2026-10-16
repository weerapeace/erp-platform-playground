/** นิยาม 3 ทรัพยากรของ Belt Builder (ใช้กับ handler กลางใน _shared.ts) */
import type { CrudResource } from "./_shared";
import { validatePart, validateSizeRule, DESIGN_STATUSES, DEFAULT_STRAP_FORMULA } from "@/lib/belt-builder";

export const PARTS: CrudResource = {
  table: "belt_parts",
  entityType: "belt_parts",
  columns: [
    { key: "shop_id", kind: "uuid" }, { key: "part_type", kind: "text" }, { key: "code", kind: "text" },
    { key: "name_th", kind: "text" }, { key: "name_en", kind: "text" },
    { key: "image_key", kind: "text" }, { key: "image_url", kind: "text" },
    { key: "anchor", kind: "json" }, { key: "attrs", kind: "json" },
    { key: "price_delta", kind: "number" }, { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["shop_id", "part_type"],
  orderBy: [{ col: "part_type", asc: true }, { col: "sort_order", asc: true }, { col: "created_at", asc: true }],
  validate: (b, o) => {
    // attrs/sort_order ว่าง → ค่าเริ่มต้น (กัน null ชน not null)
    if ("attrs" in b && b.attrs == null) b.attrs = {};
    if ("sort_order" in b && b.sort_order == null) b.sort_order = 100;
    if ("price_delta" in b && b.price_delta == null) b.price_delta = 0;
    if (!o.partial && !b.shop_id) return { ok: false, errors: ["ต้องระบุร้าน (shop_id)"] };
    return validatePart(b, o);
  },
  softDelete: "deleted_at",
  defaults: { attrs: {}, price_delta: 0, sort_order: 100, is_active: true },
  summary: (r) => ({ part_type: r.part_type, code: r.code, name_th: r.name_th }),
};

export const SIZE_RULES: CrudResource = {
  table: "belt_size_rules",
  entityType: "belt_size_rules",
  columns: [
    { key: "shop_id", kind: "uuid" }, { key: "gender", kind: "text" }, { key: "label", kind: "text" },
    { key: "waist_min_in", kind: "number" }, { key: "waist_max_in", kind: "number" },
    { key: "strap_formula", kind: "json" }, { key: "hole_count", kind: "int" }, { key: "hole_spacing_cm", kind: "number" },
    { key: "note", kind: "text" }, { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["shop_id", "gender"],
  orderBy: [{ col: "sort_order", asc: true }, { col: "gender", asc: true }],
  validate: (b, o) => {
    if ("strap_formula" in b && b.strap_formula == null) b.strap_formula = DEFAULT_STRAP_FORMULA;
    if ("sort_order" in b && b.sort_order == null) b.sort_order = 100;
    if ("hole_count" in b && b.hole_count == null) b.hole_count = 5;
    if ("hole_spacing_cm" in b && b.hole_spacing_cm == null) b.hole_spacing_cm = 2.5;
    if (!o.partial && !b.shop_id) return { ok: false, errors: ["ต้องระบุร้าน (shop_id)"] };
    return validateSizeRule(b, o);
  },
  softDelete: "is_active",
  defaults: { strap_formula: DEFAULT_STRAP_FORMULA, hole_count: 5, hole_spacing_cm: 2.5, sort_order: 100, is_active: true },
  summary: (r) => ({ gender: r.gender, waist: `${r.waist_min_in}-${r.waist_max_in}` }),
};

export const DESIGNS: CrudResource = {
  table: "belt_designs",
  entityType: "belt_designs",
  columns: [
    { key: "shop_id", kind: "uuid" }, { key: "member_id", kind: "uuid" }, { key: "selections", kind: "json" },
    { key: "total_price", kind: "number" }, { key: "preview_url", kind: "text" }, { key: "status", kind: "text" }, { key: "order_ref", kind: "text" },
  ],
  filterCols: ["shop_id", "status", "member_id"],
  orderBy: [{ col: "created_at", asc: false }],
  validate: (b, o) => {
    const errors: string[] = [];
    if (!o.partial && !b.shop_id) errors.push("ต้องระบุร้าน (shop_id)");
    if ("status" in b && !DESIGN_STATUSES.includes(b.status as (typeof DESIGN_STATUSES)[number])) errors.push(`สถานะต้องเป็น ${DESIGN_STATUSES.join(" / ")}`);
    if ("total_price" in b && (b.total_price == null || Number(b.total_price) < 0)) errors.push("ราคารวมต้องไม่ติดลบ");
    if ("selections" in b && (!b.selections || typeof b.selections !== "object")) errors.push("selections ต้องเป็น JSON object");
    return errors.length ? { ok: false, errors } : { ok: true };
  },
  softDelete: null,
  defaults: { selections: {}, total_price: 0, status: "saved" },
  summary: (r) => ({ status: r.status, total_price: r.total_price }),
};

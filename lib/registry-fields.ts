/**
 * ของกลาง (pure) — อ่าน "แถวในทะเบียนฟิลด์กลาง" (erp_module_fields ผ่าน /api/admin/field-registry-v2) ให้เป็นข้อมูลที่หน้าจอใช้ต่อ
 *   - registryFieldType: ui_field_type → ชนิดช่อง (ตัวเดียวกับที่ MasterCRUD ใช้ — แก้ที่นี่ทุกตารางเปลี่ยนตาม)
 *   - registryFieldChoices: ตัวเลือก select + ป้ายไทยของตัวเลือก + สกุลเงิน
 *   - registryRoleOk / registryCanView: สิทธิ์เห็นตาม role + ฟิลด์ลับ (sensitive_permission)
 *   - registryGridEditable: ช่องนี้แก้ในตาราง (แก้ไขแบบตาราง) ได้ไหม
 * ใช้ที่: components/master-crud (registryToFieldDef) · components/website-listings-grid-edit
 */

/** ชนิดช่องในหน้าจอ (ตรงกับ FieldDef["type"] ของ MasterCRUD) */
export type RegistryFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "textarea"
  | "relation"
  | "image"
  | "many2many"
  | "one2many"
  | "computed";

/** แถวทะเบียนเท่าที่ไฟล์นี้ใช้ (FormField ของ field-registry-v2 ส่งเข้ามาได้เลย) */
export interface RegistryFieldLike {
  field_key: string;
  column_name: string | null;
  ui_field_type: string;
  is_editable: boolean;
  is_sensitive?: boolean;
  sensitive_permission?: string | null;
  view_roles?: string[] | null;
  edit_roles?: string[] | null;
  options?: Record<string, unknown> | null;
  relation_config?: Record<string, unknown> | null;
}

export function registryFieldType(ui: string): RegistryFieldType {
  return ui === "boolean"
    ? "boolean"
    : ui === "number" || ui === "currency"
      ? "number"
      : ui === "date"
        ? "date"
        : ui === "relation"
          ? "relation"
          : ui === "image"
            ? "image"
            : ui === "select"
              ? "select"
              : ui === "textarea" || ui === "json"
                ? "textarea"
                : ui === "many2many"
                  ? "many2many"
                  : ui === "one2many"
                    ? "one2many"
                    : ui === "computed"
                      ? "computed"
                      : "text";
}

/** ตัวเลือก select (options.options) · ป้ายไทย (options.labels) · สกุลเงิน (options.currency / currency_field · currency ไม่ตั้ง = THB) */
export function registryFieldChoices(rf: Pick<RegistryFieldLike, "options" | "ui_field_type">): {
  options?: string[];
  optionLabels?: Record<string, string>;
  currencyCode?: string;
  currencyField?: string;
} {
  const o = (rf.options ?? {}) as { options?: unknown; labels?: unknown; currency?: string; currency_field?: string };
  const options = Array.isArray(o.options) ? o.options.map((x) => String(x)) : undefined;
  const optionLabels = o.labels && typeof o.labels === "object" && !Array.isArray(o.labels) ? (o.labels as Record<string, string>) : undefined;
  const currencyCode = o.currency || (rf.ui_field_type === "currency" && !o.currency_field ? "THB" : undefined);
  return { options, optionLabels, currencyCode, currencyField: o.currency_field || undefined };
}

/** role อยู่ในรายการไหม — ว่าง = ทุกคน · admin ได้เสมอ (server บังคับซ้ำอีกชั้นที่ lib/field-permissions) */
export function registryRoleOk(roles: string[] | null | undefined, role: string | null | undefined): boolean {
  if (!roles || roles.length === 0) return true;
  return role === "admin" || (!!role && roles.includes(role));
}

/** เห็นฟิลด์นี้ไหม — ฟิลด์ลับต้องมีสิทธิ์ตาม sensitive_permission + role อยู่ใน view_roles */
export function registryCanView(rf: RegistryFieldLike, ctx: { role: string | null | undefined; can: (perm: string) => boolean }): boolean {
  if (rf.is_sensitive && rf.sensitive_permission && !ctx.can(rf.sensitive_permission)) return false;
  return registryRoleOk(rf.view_roles, ctx.role);
}

/** ชนิดที่แก้ในตารางได้ (รูป / แท็ก / รายการย่อย / JSON / คำนวณ = แก้ที่หน้าสินค้า) */
const GRID_TYPES = new Set<RegistryFieldType>(["text", "number", "date", "boolean", "select", "textarea", "relation"]);

export function registryGridEditable(rf: RegistryFieldLike, role: string | null | undefined): boolean {
  if (!rf.column_name || !rf.is_editable) return false;
  if (rf.ui_field_type === "json" || rf.ui_field_type === "related") return false;
  const t = registryFieldType(rf.ui_field_type);
  if (!GRID_TYPES.has(t)) return false;
  if (t === "relation" && !(rf.relation_config as { target_table?: string } | null)?.target_table) return false;
  return registryRoleOk(rf.edit_roles, role);
}

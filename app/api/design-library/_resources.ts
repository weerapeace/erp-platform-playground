/**
 * 📚 Design Library — นิยามทรัพยากร 4 ตาราง (ใช้กับ handler กลาง lib/crud-resource-api.ts)
 * URL: /api/design-library/<templates|recipes|choices|renders>[/<id>]
 * สิทธิ์: ดู design_library.view · สูตร/รูปผล design_library.edit · แม่แบบ/ตัวเลือก design_library.manage · audit ทุกการเขียน
 * สร้างสูตร/บันทึกสูตร/เพิ่มรูปผล = ../actions (ต้องคิดเลขสูตร/เวอร์ชัน + ตรวจสูตรด้วย lib/design-library)
 */
import type { CrudResource, CrudValidation } from "@/lib/crud-resource-api";
import { CHOICE_LISTS } from "@/lib/design-library";

export const VIEW_PERM = "design_library.view";
export const EDIT_PERM = "design_library.edit";
export const MANAGE_PERM = "design_library.manage";

const ok = (errors: string[]): CrudValidation => (errors.length ? { ok: false, errors } : { ok: true });
const HEX = /^#[0-9a-f]{6}$/i;

export const TEMPLATES: CrudResource = {
  table: "design_library_templates", entityType: "design_library_templates", perms: { view: VIEW_PERM, edit: MANAGE_PERM },
  columns: [
    { key: "code", kind: "text" }, { key: "name", kind: "text" }, { key: "description", kind: "text" }, { key: "category", kind: "text" },
    { key: "image_key", kind: "text" }, { key: "image_w", kind: "int" }, { key: "image_h", kind: "int" }, { key: "vector_image_key", kind: "text" },
    { key: "default_spec", kind: "json" }, { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["category"],
  orderBy: [{ col: "sort_order", asc: true }, { col: "created_at", asc: false }],
  validate: (b, o) => {
    const e: string[] = [];
    if ("code" in b && b.code != null) b.code = String(b.code).trim().toUpperCase();
    if (!o.partial && !b.code) e.push("ต้องใส่รหัสแม่แบบ");
    if (b.code != null && !/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(String(b.code))) e.push("รหัสแม่แบบใช้ได้เฉพาะตัวอังกฤษพิมพ์ใหญ่ ตัวเลข และ - (เช่น TOTE-01)");
    if (!o.partial && !b.name) e.push("ต้องใส่ชื่อแม่แบบ");
    if ("name" in b && o.partial && !b.name) e.push("ชื่อแม่แบบว่างไม่ได้");
    if ("default_spec" in b && b.default_spec == null) b.default_spec = {};
    return ok(e);
  },
  softDelete: "deleted_at",
  defaults: { default_spec: {}, sort_order: 100, is_active: true },
  summary: (r) => ({ code: r.code, name: r.name }),
};

export const RECIPES: CrudResource = {
  table: "design_library_recipes", entityType: "design_library_recipes", perms: { view: VIEW_PERM, edit: EDIT_PERM },
  // spec แก้ผ่าน ../actions (save_recipe) เท่านั้น — ที่นี่แก้ได้แค่ชื่อ/หมายเหตุ/กู้คืน
  columns: [{ key: "name", kind: "text" }, { key: "note", kind: "text" }, { key: "is_active", kind: "bool" }],
  filterCols: ["template_id"],
  orderBy: [{ col: "seq", asc: false }],
  validate: (_b, o) => (o.partial ? { ok: true } : { ok: false, errors: ["สร้างสูตรจากปุ่ม \"สร้างสูตรใหม่\" ในหน้าแม่แบบ"] }),
  softDelete: "deleted_at",
  summary: (r) => ({ template_id: r.template_id, seq: r.seq }),
};

export const CHOICES: CrudResource = {
  table: "design_library_choices", entityType: "design_library_choices", perms: { view: VIEW_PERM, edit: MANAGE_PERM },
  columns: [
    { key: "list_key", kind: "text" }, { key: "code", kind: "text" }, { key: "name", kind: "text" }, { key: "name_en", kind: "text" },
    { key: "hex", kind: "text" }, { key: "config", kind: "json" }, { key: "sort_order", kind: "int" }, { key: "is_active", kind: "bool" },
  ],
  filterCols: ["list_key"],
  orderBy: [{ col: "list_key", asc: true }, { col: "sort_order", asc: true }, { col: "name", asc: true }],
  validate: (b, o) => {
    const e: string[] = [];
    if (!o.partial && !CHOICE_LISTS.some((l) => l.key === b.list_key)) e.push("ไม่รู้จักรายการนี้");
    if (o.partial && "list_key" in b) e.push("ย้ายตัวเลือกไปรายการอื่นไม่ได้ — ลบแล้วเพิ่มใหม่");
    if (!o.partial && !b.code) e.push("ต้องใส่รหัส");
    if (b.code != null && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(String(b.code))) e.push("รหัสใช้ได้เฉพาะตัวอังกฤษ ตัวเลข _ และ -");
    if (!o.partial && !b.name) e.push("ต้องใส่ชื่อ");
    if (b.hex != null && !HEX.test(String(b.hex))) e.push("สีต้องเป็นรหัสแบบ #RRGGBB");
    if ("config" in b && b.config == null) b.config = {};
    if (b.list_key === "rule" && b.config && typeof b.config === "object") {
      const c = b.config as Record<string, unknown>;
      if (!String(c.a ?? "").includes(":") || !String(c.b ?? "").includes(":")) e.push("กฎต้องระบุทั้ง 2 ฝั่ง (หมวด + รหัส)");
    }
    return ok(e);
  },
  softDelete: "is_active",
  defaults: { config: {}, sort_order: 100, is_active: true },
  summary: (r) => ({ list_key: r.list_key, code: r.code, name: r.name }),
};

export const RENDERS: CrudResource = {
  table: "design_library_renders", entityType: "design_library_renders", perms: { view: VIEW_PERM, edit: EDIT_PERM },
  columns: [{ key: "note", kind: "text" }, { key: "is_active", kind: "bool" }],
  filterCols: ["recipe_id", "view_key"],
  orderBy: [{ col: "view_key", asc: true }, { col: "version", asc: false }],
  validate: (_b, o) => (o.partial ? { ok: true } : { ok: false, errors: ["อัปโหลดรูปจากปุ่มในหน้าสูตร"] }),
  softDelete: "is_active",
  summary: (r) => ({ recipe_id: r.recipe_id, view_key: r.view_key, version: r.version }),
};

export const RESOURCES: Record<string, CrudResource> = { templates: TEMPLATES, recipes: RECIPES, choices: CHOICES, renders: RENDERS };

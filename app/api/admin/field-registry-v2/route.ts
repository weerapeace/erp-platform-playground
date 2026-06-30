/**
 * Field Registry v2 — list fields for a module
 *
 * GET /api/admin/field-registry-v2?module=parent-skus-v2
 *   → return RegistryField[] (ทุก field ของ module, sort by display_order)
 *
 * ใช้โดย MasterCRUDPage ตอน mount → build columns + form fields แทน hardcode
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// อ่านสดเสมอ — Field Registry เป็น config ที่เปลี่ยน runtime (เพิ่ม module/field ใหม่)
// ห้าม cache ไม่งั้น module ใหม่จะขึ้น "module not found"
export const dynamic = "force-dynamic";
export const revalidate = 0;

export type FormField = {
  id:                string;
  field_key:         string;
  column_name:       string | null;
  field_label:       string;
  field_label_en:    string | null;
  ui_field_type:     string;
  data_type:         string;
  group_key:         string;
  is_visible:        boolean;
  is_required:       boolean;
  is_editable:       boolean;
  is_filterable:     boolean;
  is_sortable:       boolean;
  is_pinned:         boolean;
  is_searchable:     boolean;
  is_sensitive:      boolean;
  sensitive_permission: string | null;
  // สิทธิ์ระดับฟิลด์ตาม role (ของกลาง) — null/ว่าง = ทุกคน
  view_roles:        string[] | null;
  edit_roles:        string[] | null;
  show_in_form:      boolean;
  form_column_span:  number;
  width:             number;
  display_order:     number;
  options:           Record<string, unknown>;
  relation_config:   Record<string, unknown>;
  validation_rules:  Record<string, unknown>;
  placeholder:       string | null;
  help_text:         string | null;
  description:       string | null;   // หมายเหตุภายใน (admin)
  // Sprint 12
  default_value:        string | null;
  default_expression:   string | null;
  is_inline_editable:   boolean;
  is_bulk_editable:     boolean;
  // Sprint 13
  condition_rules:      Record<string, unknown>;
  // Studio style (presets: ขนาด/หนา/เอียง/สี/ฟอนต์/จัดชิด/ไฮไลต์)
  ui_style:             Record<string, unknown>;
};

// กลุ่ม B: layout ฟอร์ม (Tab -> Section -> columns) เก็บใน erp_modules.config.layout
export type FormLayoutSection = { key: string; label: string; columns: number };
export type FormLayoutTab = { key: string; label: string; icon?: string; sections: FormLayoutSection[] };
export type FormLayout = { tabs: FormLayoutTab[] } | null;

export type FieldRegistryV2Response = {
  module_key: string;
  fields:     FormField[];
  layout:     FormLayout;
  /** กฎ section whitelist ตามแท็ก: sectionKey → tagId[] (ว่าง/ไม่มี = โชว์ทุกแท็ก) */
  section_tag_rules?: Record<string, string[]>;
  /** ชุดฟิลด์ "แก้เร็ว" ของโมดูล (RelationPeek quick edit) — null = ยังไม่ตั้ง โชว์ทุกฟิลด์ */
  quick_edit_fields?: string[] | null;
  /** ฟิลด์แสดงชื่อหลักของโมดูล (ปัก 🎯) — ใช้ทำป้ายระบุแถว/ชื่อเรื่อง (ของกลาง) */
  primary_field?: string | null;
  error:      string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse<FieldRegistryV2Response>> {
  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module");
  if (!moduleKey) {
    return NextResponse.json(
      { module_key: "", fields: [], layout: null, error: "missing ?module=" },
      { status: 400 }
    );
  }

  const supabase = supabaseFromRequest(request);

  const { data: mod } = await supabase
    .from("erp_modules")
    .select("id, config, primary_field")
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (!mod) {
    return NextResponse.json(
      { module_key: moduleKey, fields: [], layout: null, error: `module not found: ${moduleKey}` },
      { status: 404 }
    );
  }
  const cfg = (mod.config ?? {}) as { layout?: FormLayout; section_tag_rules?: Record<string, string[]>; quick_edit_fields?: string[] };
  const layout: FormLayout = cfg.layout ?? null;
  const sectionTagRules: Record<string, string[]> = cfg.section_tag_rules ?? {};
  const quickEditFields: string[] | null = Array.isArray(cfg.quick_edit_fields) && cfg.quick_edit_fields.length > 0 ? cfg.quick_edit_fields : null;

  const { data, error } = await supabase
    .from("erp_module_fields")
    .select("id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, is_pinned, is_searchable, is_sensitive, sensitive_permission, view_roles, edit_roles, show_in_form, form_column_span, width, display_order, options, relation_config, validation_rules, placeholder, help_text, description, default_value, default_expression, is_inline_editable, is_bulk_editable, condition_rules, ui_style")
    .eq("module_id", mod.id)
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    return NextResponse.json(
      { module_key: moduleKey, fields: [], layout: null, error: error.message },
      { status: 500 }
    );
  }

  // Phase 3a — cache ทะเบียน field 5 นาที (เปลี่ยนเฉพาะตอน admin แก้ใน Studio) → สลับ table ไม่ดึงใหม่
  return NextResponse.json({
    module_key: moduleKey,
    fields: (data ?? []) as FormField[],
    layout,
    section_tag_rules: sectionTagRules,
    quick_edit_fields: quickEditFields,
    primary_field: (mod.primary_field as string | null) ?? null,
    error: null,
  }, { headers: { "Cache-Control": "private, max-age=300" } });
}

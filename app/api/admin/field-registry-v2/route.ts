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
  show_in_form:      boolean;
  form_column_span:  number;
  width:             number;
  display_order:     number;
  options:           Record<string, unknown>;
  relation_config:   Record<string, unknown>;
  validation_rules:  Record<string, unknown>;
  placeholder:       string | null;
  help_text:         string | null;
  // Sprint 12
  default_value:        string | null;
  default_expression:   string | null;
  is_inline_editable:   boolean;
  // Sprint 13
  condition_rules:      Record<string, unknown>;
};

// กลุ่ม B: layout ฟอร์ม (Tab -> Section -> columns) เก็บใน erp_modules.config.layout
export type FormLayoutSection = { key: string; label: string; columns: number };
export type FormLayoutTab = { key: string; label: string; icon?: string; sections: FormLayoutSection[] };
export type FormLayout = { tabs: FormLayoutTab[] } | null;

export type FieldRegistryV2Response = {
  module_key: string;
  fields:     FormField[];
  layout:     FormLayout;
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
    .select("id, config")
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (!mod) {
    return NextResponse.json(
      { module_key: moduleKey, fields: [], layout: null, error: `module not found: ${moduleKey}` },
      { status: 404 }
    );
  }
  const layout: FormLayout = ((mod.config as { layout?: FormLayout })?.layout) ?? null;

  const { data, error } = await supabase
    .from("erp_module_fields")
    .select("id, field_key, column_name, field_label, ui_field_type, data_type, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, is_pinned, is_searchable, is_sensitive, sensitive_permission, show_in_form, form_column_span, width, display_order, options, relation_config, validation_rules, placeholder, help_text, default_value, default_expression, is_inline_editable, condition_rules")
    .eq("module_id", mod.id)
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    return NextResponse.json(
      { module_key: moduleKey, fields: [], layout: null, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    module_key: moduleKey,
    fields: (data ?? []) as FormField[],
    layout,
    error: null,
  });
}

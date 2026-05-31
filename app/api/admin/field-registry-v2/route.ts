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
};

export type FieldRegistryV2Response = {
  module_key: string;
  fields:     FormField[];
  error:      string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse<FieldRegistryV2Response>> {
  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module");
  if (!moduleKey) {
    return NextResponse.json(
      { module_key: "", fields: [], error: "missing ?module=" },
      { status: 400 }
    );
  }

  const supabase = supabaseFromRequest(request);

  const { data: mod } = await supabase
    .from("erp_modules")
    .select("id")
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (!mod) {
    return NextResponse.json(
      { module_key: moduleKey, fields: [], error: `module not found: ${moduleKey}` },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("erp_module_fields")
    .select("id, field_key, column_name, field_label, ui_field_type, data_type, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, is_pinned, is_searchable, is_sensitive, sensitive_permission, show_in_form, form_column_span, width, display_order, options, relation_config, validation_rules, placeholder, help_text")
    .eq("module_id", mod.id)
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    return NextResponse.json(
      { module_key: moduleKey, fields: [], error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    module_key: moduleKey,
    fields: (data ?? []) as FormField[],
    error: null,
  });
}

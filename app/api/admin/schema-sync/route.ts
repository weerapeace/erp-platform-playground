/**
 * Schema Sync API — Sprint 1
 *
 * GET  /api/admin/schema-sync?module=parent-skus-v2
 *   → return module info + db columns + registry entries + diff (new / removed)
 *
 * POST /api/admin/schema-sync?module=parent-skus-v2
 *   → run schema_sync_module() RPC — insert missing fields into erp_module_fields
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type SchemaSyncModule = {
  id:          string;
  module_key:  string;
  table_name:  string;
  label:       string;
  description: string | null;
  config:      Record<string, unknown>;
};

export type DBColumn = {
  column_name:      string;
  data_type:        string;
  udt_name:         string;
  is_nullable:      boolean;
  column_default:   string | null;
  ordinal_position: number;
  description:      string | null;
};

export type RegistryField = {
  id:             string;
  field_key:      string;
  column_name:    string | null;
  field_label:    string;
  ui_field_type:  string;
  data_type:      string;
  source:         string;
  group_key:      string;
  is_visible:     boolean;
  is_required:    boolean;
  is_editable:    boolean;
  is_filterable:  boolean;
  is_sortable:    boolean;
  is_pinned:      boolean;
  width:          number;
  min_width:      number;
  display_order:  number;
  is_active:      boolean;
  options:        Record<string, unknown>;
  validation_rules: Record<string, unknown>;
  relation_config:  Record<string, unknown>;
};

export type SchemaSyncResponse = {
  module:       SchemaSyncModule | null;
  db_columns:   DBColumn[];
  registry:     RegistryField[];
  diff: {
    new_in_db:        string[];   // column names in DB but not in registry
    missing_from_db:  string[];   // column names in registry but not in DB
  };
  error: string | null;
};

// ---- GET — status ----

export async function GET(request: NextRequest): Promise<NextResponse<SchemaSyncResponse>> {
  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module");
  if (!moduleKey) {
    return NextResponse.json(
      { module: null, db_columns: [], registry: [], diff: { new_in_db: [], missing_from_db: [] }, error: "missing ?module=" },
      { status: 400 }
    );
  }

  const supabase = supabaseFromRequest(request);

  // 1. fetch module
  const { data: mod, error: modErr } = await supabase
    .from("erp_modules")
    .select("id, module_key, table_name, label, description, config")
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (modErr || !mod) {
    return NextResponse.json(
      { module: null, db_columns: [], registry: [], diff: { new_in_db: [], missing_from_db: [] },
        error: modErr?.message ?? `module not found: ${moduleKey}` },
      { status: modErr ? 500 : 404 }
    );
  }

  // 2. fetch DB columns via RPC
  const { data: cols, error: colsErr } = await supabase.rpc("schema_sync_columns", { p_table_name: mod.table_name });
  if (colsErr) {
    return NextResponse.json(
      { module: mod as unknown as SchemaSyncModule, db_columns: [], registry: [], diff: { new_in_db: [], missing_from_db: [] }, error: colsErr.message },
      { status: 500 }
    );
  }

  // 3. fetch registry entries
  const { data: reg, error: regErr } = await supabase
    .from("erp_module_fields")
    .select("id, field_key, column_name, field_label, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, is_pinned, width, min_width, display_order, is_active, options, validation_rules, relation_config")
    .eq("module_id", mod.id)
    .order("display_order");

  if (regErr) {
    return NextResponse.json(
      { module: mod as unknown as SchemaSyncModule, db_columns: cols as DBColumn[], registry: [], diff: { new_in_db: [], missing_from_db: [] }, error: regErr.message },
      { status: 500 }
    );
  }

  // 4. compute diff
  const dbColNames  = new Set((cols as DBColumn[]).map((c) => c.column_name));
  const regColNames = new Set((reg as RegistryField[]).map((r) => r.column_name).filter(Boolean) as string[]);
  const new_in_db       = [...dbColNames].filter((c) => !regColNames.has(c));
  const missing_from_db = [...regColNames].filter((c) => !dbColNames.has(c));

  return NextResponse.json({
    module: mod as unknown as SchemaSyncModule,
    db_columns: cols as DBColumn[],
    registry:   reg as RegistryField[],
    diff: { new_in_db, missing_from_db },
    error: null,
  });
}

// ---- POST — run sync (insert missing fields) ----

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module");
  if (!moduleKey) return NextResponse.json({ error: "missing ?module=" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase.rpc("schema_sync_module", { p_module_key: moduleKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

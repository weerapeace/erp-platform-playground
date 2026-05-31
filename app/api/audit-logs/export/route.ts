import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- POST /api/audit-logs/export — log การ export ของ user ----

type ExportLogBody = {
  entity_type:      string;
  format:           "csv" | "excel";
  mode:             "visible" | "selected" | "filtered_all";
  total_rows:       number;
  exported_rows:    number;
  columns:          string[];
  blocked_columns?: string[];
  filter_desc?:     string | null;
  filename?:        string;
};

export async function POST(request: NextRequest) {
  let body: ExportLogBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.entity_type || !body.format) {
    return NextResponse.json({ error: "entity_type & format required" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_audit_log_export", {
    p_entity_type:     body.entity_type,
    p_format:          body.format,
    p_mode:            body.mode,
    p_total_rows:      body.total_rows,
    p_exported_rows:   body.exported_rows,
    p_columns:         body.columns,
    p_blocked_columns: body.blocked_columns ?? [],
    p_filter_desc:     body.filter_desc ?? null,
    p_filename:        body.filename ?? null,
  });

  if (error) {
    console.error("[api/audit-logs/export] POST", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data, error: null });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type ReportTemplateRow = {
  id:           string;
  entity_type:  string;
  template_key: string;
  label:        string;
  description:  string | null;
  paper_size:   "A4" | "A5" | "Letter";
  orientation:  "portrait" | "landscape";
  header_html:  string;
  body_html:    string;
  footer_html:  string;
  custom_css:   string;
  is_default:   boolean;
  active:       boolean;
  created_at:   string;
  updated_at:   string;
};

export type ReportTemplatesResponse = {
  data:  ReportTemplateRow[];
  error: string | null;
};

// ---- GET ----

export async function GET(request: NextRequest) {
  const entityType = new URL(request.url).searchParams.get("entity_type");
  const { data, error } = await supabaseFromRequest(request).rpc("erp_report_templates_list", {
    p_entity_type: entityType || null,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies ReportTemplatesResponse, { status: 500 });
  return NextResponse.json({ data: (data as ReportTemplateRow[]) ?? [], error: null } satisfies ReportTemplatesResponse);
}

// ---- POST/PATCH upsert ----

type UpsertBody = {
  id?:           string;
  entity_type:   string;
  template_key:  string;
  label:         string;
  description?:  string | null;
  paper_size:    "A4" | "A5" | "Letter";
  orientation:   "portrait" | "landscape";
  header_html?:  string;
  body_html?:    string;
  footer_html?:  string;
  custom_css?:   string;
  is_default?:   boolean;
  active?:       boolean;
  actor?:        string;
};

async function upsert(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.entity_type || !body.template_key || !body.label) {
    return NextResponse.json({ error: "entity_type, template_key, label จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_report_templates_upsert", {
    p_id:           body.id ?? null,
    p_entity_type:  body.entity_type,
    p_template_key: body.template_key,
    p_label:        body.label,
    p_description:  body.description ?? null,
    p_paper_size:   body.paper_size,
    p_orientation:  body.orientation,
    p_header_html:  body.header_html ?? "",
    p_body_html:    body.body_html ?? "",
    p_footer_html:  body.footer_html ?? "",
    p_custom_css:   body.custom_css ?? "",
    p_is_default:   body.is_default ?? false,
    p_active:       body.active ?? true,
    p_actor:        body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export const POST  = upsert;
export const PATCH = upsert;

// ---- DELETE ?id=... ----

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_report_templates_delete", {
    p_id: id, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { TableLayout } from "@/app/api/table-layouts/route";

export type AdminTableLayoutsResponse = {
  data:  TableLayout[];
  error: string | null;
};

// ---- GET — list all layouts ----

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_table_layouts_list");
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies AdminTableLayoutsResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as TableLayout[]) ?? [], error: null } satisfies AdminTableLayoutsResponse);
}

// ---- POST/PATCH — upsert ----

type UpsertBody = Partial<TableLayout> & {
  table_id: string; label: string;
  actor?: string;
};

async function upsert(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.table_id || !body.label) {
    return NextResponse.json({ error: "table_id, label required" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_table_layouts_upsert", {
    p_table_id:          body.table_id,
    p_label:             body.label,
    p_description:       body.description ?? null,
    p_columns:           body.columns ?? [],
    p_default_density:   body.default_density ?? "normal",
    p_default_page_size: body.default_page_size ?? 20,
    p_default_view_mode: body.default_view_mode ?? "table",
    p_notes:             body.notes ?? null,
    p_actor:             body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export const POST  = upsert;
export const PATCH = upsert;

// ---- DELETE ?table_id=... ----

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tableId = searchParams.get("table_id");
  const actor   = searchParams.get("actor");
  if (!tableId) return NextResponse.json({ error: "table_id required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_table_layouts_delete", {
    p_table_id: tableId, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

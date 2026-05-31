import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type NumberingRule = {
  key:               string;
  label:             string;
  pattern:           string;
  reset_policy:      "never" | "yearly" | "monthly";
  current_value:     number;
  last_reset_period: string | null;
  notes:             string | null;
  active:            boolean;
  created_at:        string;
  updated_at:        string;
};

export type NumberingResponse = {
  data:    NumberingRule[];
  preview: Record<string, string | null>;   // key → next number (without consuming)
  error:   string | null;
};

// ---- GET /api/numbering — list rules + preview next number ----

export async function GET(request: NextRequest) {
  const client = supabaseFromRequest(request);
  const { data, error } = await client.rpc("erp_numbering_rules_list");
  if (error) {
    return NextResponse.json({ data: [], preview: {}, error: error.message } satisfies NumberingResponse, { status: 500 });
  }
  const rules = (data as NumberingRule[]) ?? [];
  // preview each
  const preview: Record<string, string | null> = {};
  for (const r of rules) {
    const { data: p } = await client.rpc("erp_numbering_preview", { p_key: r.key });
    preview[r.key] = (p as string) ?? null;
  }
  return NextResponse.json({ data: rules, preview, error: null } satisfies NumberingResponse);
}

// ---- PATCH /api/numbering — upsert rule ----

type UpsertBody = {
  key:           string;
  label:         string;
  pattern:       string;
  reset_policy:  "never" | "yearly" | "monthly";
  active?:       boolean;
  notes?:        string;
};

export async function PATCH(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.key || !body.label || !body.pattern) {
    return NextResponse.json({ error: "key, label, pattern จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_numbering_rules_upsert", {
    p_key:          body.key,
    p_label:        body.label,
    p_pattern:      body.pattern,
    p_reset_policy: body.reset_policy,
    p_active:       body.active ?? true,
    p_notes:        body.notes ?? null,
  });

  if (error) {
    console.error("[api/numbering] PATCH", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}

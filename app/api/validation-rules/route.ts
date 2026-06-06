import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { ValidationRule } from "@/lib/validation";

export type ValidationRulesResponse = {
  data:  ValidationRule[];
  error: string | null;
};

// ---- GET ----
export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_validation_rules_list");
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies ValidationRulesResponse, { status: 500 });
  return NextResponse.json({ data: (data as ValidationRule[]) ?? [], error: null } satisfies ValidationRulesResponse, { headers: { "Cache-Control": "private, max-age=600" } });
}

// ---- POST/PATCH ----
type UpsertBody = Partial<ValidationRule> & { key: string; label: string; actor?: string };

async function upsert(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.key || !body.label) return NextResponse.json({ error: "key, label จำเป็น" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_validation_rules_upsert", {
    p_key:             body.key,
    p_label:           body.label,
    p_description:     body.description ?? null,
    p_category:        body.category ?? "custom",
    p_validator_type:  body.validator_type ?? "regex",
    p_config:          body.config ?? {},
    p_default_message: body.default_message ?? null,
    p_active:          body.active ?? true,
    p_actor:           body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
export const POST  = upsert;
export const PATCH = upsert;

// ---- DELETE ?key=... ----
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key   = searchParams.get("key");
  const actor = searchParams.get("actor");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_validation_rules_delete", {
    p_key: key, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

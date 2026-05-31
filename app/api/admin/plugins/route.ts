export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type Plugin = {
  key:            string;
  label:          string;
  description:    string | null;
  category:       "UI" | "Data" | "Workflow" | "Integration" | "Admin";
  icon:           string;
  version:        string;
  enabled:        boolean;
  used_in:        string[];
  permission_key: string | null;
  settings:       Record<string, unknown>;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
};

export type PluginsResponse = {
  data:  Plugin[];
  error: string | null;
};

// ---- GET ?category=&enabled_only=true ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category    = searchParams.get("category");
  const enabledOnly = searchParams.get("enabled_only") === "true";

  const { data, error } = await supabaseFromRequest(request).rpc("erp_plugins_list", {
    p_category: category || null, p_enabled_only: enabledOnly,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies PluginsResponse, { status: 500 });
  return NextResponse.json({ data: (data as Plugin[]) ?? [], error: null } satisfies PluginsResponse);
}

// ---- PATCH — toggle enabled OR update settings ----

type PatchBody = {
  key:      string;
  enabled?: boolean;
  settings?: Record<string, unknown>;
  actor?:   string;
};

export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const client = supabaseFromRequest(request);
  let result: Plugin | null = null;

  if (body.enabled !== undefined) {
    const { data, error } = await client.rpc("erp_plugins_set_enabled", {
      p_key: body.key, p_enabled: body.enabled, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data as Plugin;
  }
  if (body.settings !== undefined) {
    const { data, error } = await client.rpc("erp_plugins_update_settings", {
      p_key: body.key, p_settings: body.settings, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data as Plugin;
  }
  return NextResponse.json({ data: result, error: null });
}

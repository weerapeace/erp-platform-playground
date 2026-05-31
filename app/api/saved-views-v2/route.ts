/**
 * Saved Views API v2 — Sprint 11C
 *
 * รองรับ shared views (system/team/my) — ผูกกับ erp_modules.module_key
 *
 * GET  /api/saved-views-v2?module=parent-skus-v2
 *   → list views ของ module (เรียง: system → team → my)
 *
 * POST /api/saved-views-v2
 *   body: { module_key, label, scope: 'team'|'my', columns_config, filters, sort_config, search_text, page_size, density, is_default? }
 *   → สร้าง view ใหม่ (RLS gate ไว้ — system สร้างไม่ได้)
 *
 * หมายเหตุ: ของเดิม /api/saved-views ยังคงใช้กับ playground tables (erp_playground_saved_views)
 * — อันนี้สำหรับ MasterCRUDPage + module-level views
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type SavedViewV2 = {
  id:                string;
  module_id:         string;
  module_key:        string;
  view_key:          string;
  view_label:        string;
  label:             string;
  scope:             "system" | "team" | "my";
  owner_email:       string | null;
  is_default:        boolean;
  is_locked:         boolean;
  is_active:         boolean;
  display_order:     number;
  description:       string | null;
  columns_config:    Record<string, unknown>;
  filters:           unknown;
  sort_config:       Record<string, unknown>;
  search_text:       string | null;
  page_size:         number | null;
  group_by:          string | null;
  density:           string;
  created_by_email:  string | null;
  created_at:        string;
  updated_at:        string;
};

export type SavedViewsV2Response = {
  module_key: string;
  views:      SavedViewV2[];
  error:      string | null;
};

const SELECT_COLS = [
  "id", "module_id", "view_key", "view_label", "scope", "owner_email",
  "is_default", "is_locked", "is_active", "display_order", "description",
  "columns_config", "filters", "sort_config", "search_text", "page_size",
  "group_by", "density", "created_by_email", "created_at", "updated_at",
].join(", ");

export async function GET(request: NextRequest): Promise<NextResponse<SavedViewsV2Response>> {
  const { searchParams } = new URL(request.url);
  const moduleKey = searchParams.get("module");
  if (!moduleKey) {
    return NextResponse.json(
      { module_key: "", views: [], error: "missing ?module=" },
      { status: 400 }
    );
  }

  const supabase = supabaseFromRequest(request);

  const { data: mod } = await supabase
    .from("erp_modules")
    .select("id, module_key")
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (!mod) return NextResponse.json({ module_key: moduleKey, views: [], error: `module not found: ${moduleKey}` }, { status: 404 });

  const { data, error } = await supabase
    .from("erp_saved_views")
    .select(SELECT_COLS)
    .eq("module_id", mod.id)
    .eq("is_active", true)
    .order("scope", { ascending: true })
    .order("display_order", { ascending: true })
    .order("view_label", { ascending: true });

  if (error) {
    return NextResponse.json({ module_key: moduleKey, views: [], error: error.message }, { status: 500 });
  }

  const views: SavedViewV2[] = (data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      ...row,
      module_key: moduleKey,
      label:      String(row.view_label ?? ""),
    } as SavedViewV2;
  });

  return NextResponse.json({ module_key: moduleKey, views, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const moduleKey = String(body.module_key ?? "");
  const label     = String(body.label ?? body.view_label ?? "").trim();
  const scope     = String(body.scope ?? "my");

  if (!moduleKey)             return NextResponse.json({ error: "module_key required" }, { status: 400 });
  if (!label)                  return NextResponse.json({ error: "label required" },       { status: 400 });
  if (!["team", "my"].includes(scope)) return NextResponse.json({ error: "scope must be team|my" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const { data: mod } = await supabase
    .from("erp_modules").select("id").eq("module_key", moduleKey).maybeSingle();
  if (!mod) return NextResponse.json({ error: `module not found: ${moduleKey}` }, { status: 404 });

  const viewKey = (body.view_key as string | undefined) ?? `${scope}-${user.email}-${Date.now()}`;

  const payload = {
    module_id:        mod.id,
    view_key:         viewKey,
    view_label:       label,
    scope,
    owner_email:      scope === "my" ? user.email : null,
    owner_key:        scope === "my" ? user.id : null,
    is_default:       Boolean(body.is_default ?? false),
    is_locked:        false,
    is_active:        true,
    display_order:    Number(body.display_order ?? 100),
    description:      (body.description as string | null) ?? null,
    columns_config:   (body.columns_config as object) ?? {},
    filters:          body.filters ?? [],
    sort_config:      (body.sort_config as object) ?? {},
    search_text:      (body.search_text as string | null) ?? null,
    page_size:        body.page_size ?? null,
    group_by:         (body.group_by as string | null) ?? null,
    density:          String(body.density ?? "comfortable"),
    created_by_email: user.email,
  };

  const { data, error } = await supabase
    .from("erp_saved_views")
    .insert(payload)
    .select(SELECT_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

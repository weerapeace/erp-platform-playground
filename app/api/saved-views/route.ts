import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type SavedView = {
  id:          string;
  table_id:    string;
  label:       string;
  config:      Record<string, unknown>;
  owner_id:    string;
  owner_name:  string | null;
  visibility:  "personal" | "team" | "system";
  is_default:  boolean;
  description: string | null;
  created_at:  string;
  updated_at:  string;
};

// ---- GET /api/saved-views?table_id=... ----
export async function GET(request: NextRequest) {
  const tableId = new URL(request.url).searchParams.get("table_id");
  if (!tableId) return NextResponse.json({ data: [], error: "table_id required" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request)
    .rpc("erp_playground_saved_views_list", { p_table_id: tableId });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data as SavedView[]) ?? [], error: null });
}

// ---- POST /api/saved-views ----
export async function POST(request: NextRequest) {
  let body: {
    table_id: string; label: string; config: Record<string, unknown>;
    visibility?: "personal" | "team" | "system"; description?: string; actor?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request)
    .rpc("erp_playground_saved_views_create", {
      p_table_id:    body.table_id,
      p_label:       body.label,
      p_config:      body.config ?? {},
      p_visibility:  body.visibility ?? "personal",
      p_description: body.description ?? null,
      p_actor:       body.actor ?? null,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// ---- PATCH /api/saved-views?id=... ----
// รองรับ: { is_default: boolean, label?: string }
// ถ้า is_default=true → unset default ของ view อื่นใน table+owner เดียวกันก่อน
// F10d: ใช้ supabaseAdmin หลัง auth check (เพราะ RLS policy block UPDATE)
export async function PATCH(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: { is_default?: boolean; label?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // auth check
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();

  // ถ้า set is_default=true — clear default ของ view อื่นในตารางเดียวกันของ owner เดียวกัน
  if (body.is_default === true) {
    const { data: target } = await admin
      .from("erp_playground_saved_views")
      .select("table_id, owner_id")
      .eq("id", id)
      .maybeSingle();
    if (target) {
      await admin
        .from("erp_playground_saved_views")
        .update({ is_default: false })
        .eq("table_id", target.table_id)
        .eq("owner_id", target.owner_id)
        .neq("id", id);
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.is_default !== undefined) patch.is_default = body.is_default;
  if (body.label !== undefined)      patch.label      = body.label;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มี field ที่ update" }, { status: 400 });

  const { data, error } = await admin
    .from("erp_playground_saved_views")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// ---- DELETE /api/saved-views?id=... ----
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseFromRequest(request)
    .rpc("erp_playground_saved_views_delete", { p_id: id, p_actor: actor });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, error: null });
}

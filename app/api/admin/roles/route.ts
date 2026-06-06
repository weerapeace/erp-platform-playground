import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type PermissionDef = {
  key:          string;
  label:        string;
  category:     string;
  description:  string | null;
  is_dangerous: boolean;
  sort_order:   number;
};

export type RoleDef = {
  key:              string;
  label:            string;
  description:      string | null;
  color:            string;
  is_builtin:       boolean;
  active:           boolean;
  sort_order:       number;
  permission_count: number;
  user_count:       number;
  created_at:       string;
  updated_at:       string;
};

export type RolesPermissionsResponse = {
  roles:        RoleDef[];
  permissions:  PermissionDef[];
  matrix:       { role_key: string; permission_key: string }[];
  error:        string | null;
};

// ---- GET — load everything in one shot ----
export async function GET(request: NextRequest) {
  const client = supabaseFromRequest(request);
  const [r1, r2, r3] = await Promise.all([
    client.rpc("erp_roles_list"),
    client.rpc("erp_permissions_list"),
    client.rpc("erp_role_permissions_matrix"),
  ]);
  const err = r1.error ?? r2.error ?? r3.error;
  if (err) {
    return NextResponse.json({ roles: [], permissions: [], matrix: [], error: err.message } satisfies RolesPermissionsResponse, { status: 500 });
  }
  return NextResponse.json({
    roles:       (r1.data as RoleDef[]) ?? [],
    permissions: (r2.data as PermissionDef[]) ?? [],
    matrix:      (r3.data as { role_key: string; permission_key: string }[]) ?? [],
    error:       null,
  } satisfies RolesPermissionsResponse, { headers: { "Cache-Control": "private, max-age=600" } });
}

// ---- PATCH — toggle / upsert role ----

type PatchBody =
  | { kind: "toggle"; role_key: string; permission_key: string; granted: boolean; actor?: string }
  | { kind: "role"; role: Partial<RoleDef> & { key: string; label: string }; actor?: string };

export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const client = supabaseFromRequest(request);

  if (body.kind === "toggle") {
    const { data, error } = await client.rpc("erp_role_permission_toggle", {
      p_role_key: body.role_key,
      p_permission_key: body.permission_key,
      p_granted: body.granted,
      p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }
  if (body.kind === "role") {
    const r = body.role;
    const { data, error } = await client.rpc("erp_roles_upsert", {
      p_key:         r.key,
      p_label:       r.label,
      p_description: r.description ?? null,
      p_color:       r.color ?? "slate",
      p_active:      r.active ?? true,
      p_sort_order:  r.sort_order ?? 100,
      p_actor:       body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }
  return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
}

// ---- DELETE ?role_key=... ----
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key   = searchParams.get("role_key");
  const actor = searchParams.get("actor");
  if (!key) return NextResponse.json({ error: "role_key required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_roles_delete", {
    p_key: key, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

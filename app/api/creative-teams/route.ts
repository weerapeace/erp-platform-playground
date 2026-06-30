/**
 * ทีม Creative (ของกลาง) — /api/creative-teams
 * GET  → { teams: [{ id, name, sort_order, member_ids[], members:[{id,name}] }] }
 * POST { name, member_ids? } → สร้างทีม
 * ใช้เลือกผู้รับผิดชอบเป็นทีม (ดึงสมาชิกมาใส่ได้) · guardApi tasks.view/tasks.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { employeeLabelMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_teams").select("id, name, member_ids, sort_order").eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) return NextResponse.json({ teams: [], error: error.message }, { status: 500 });
  const rows = (data ?? []) as { id: string; name: string; member_ids: string[] | null; sort_order: number }[];
  const allIds = [...new Set(rows.flatMap((r) => r.member_ids ?? []))];
  const map = allIds.length ? await employeeLabelMap(admin, allIds) : new Map<string, string>();
  const teams = rows.map((r) => ({
    id: r.id, name: r.name, sort_order: r.sort_order, member_ids: r.member_ids ?? [],
    members: (r.member_ids ?? []).map((id) => ({ id, name: map.get(String(id)) ?? "" })),
  }));
  return NextResponse.json({ teams, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { name?: string; member_ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อทีม" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: rows } = await admin.from("erp_creative_teams").select("sort_order");
  const maxSort = Math.max(0, ...((rows ?? []).map((r) => (r.sort_order as number) ?? 0)));
  const { data, error } = await admin.from("erp_creative_teams").insert({
    name, member_ids: Array.isArray(body.member_ids) ? body.member_ids : [], sort_order: maxSort + 10, created_by: user?.id ?? null,
  }).select("id, name, member_ids, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data, error: null });
}

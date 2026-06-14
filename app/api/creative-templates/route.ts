/**
 * Creative Task Templates API — แม่แบบงาน (list + create)
 * GET  /api/creative-templates?search=
 * POST /api/creative-templates  { name, task_type?, default_priority?, brand_id?, description?, platforms?, steps?: [{title, required_before_next}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { employeeLabelMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StepRow = { title?: string; description?: string | null; required_before_next?: boolean; assignee_ids?: string[] };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const search = (new URL(request.url).searchParams.get("search") ?? "").trim();
  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_task_templates").select("*, brand:brands!brand_id(name, color)").eq("is_active", true).order("name", { ascending: true }).limit(300);
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  // resolve ชื่อผู้รับผิดชอบของทุกขั้นตอน (m2m ใน jsonb)
  const allIds = rows.flatMap((r) => (Array.isArray(r.steps) ? (r.steps as StepRow[]) : []).flatMap((s) => s.assignee_ids ?? []));
  const empMap = await employeeLabelMap(admin, allIds);
  const items = rows.map((r) => {
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
    const steps = (Array.isArray(r.steps) ? (r.steps as StepRow[]) : []).map((s) => ({ ...s, assignee_labels: (s.assignee_ids ?? []).map((id) => empMap.get(String(id)) ?? "") }));
    const out: Record<string, unknown> = { ...r, steps, brand_label: b?.name ?? null, brand_color: b?.color ?? null }; delete out.brand; return out;
  });
  return NextResponse.json({ data: items, error: null });
}

type Step = { title: string; required_before_next?: boolean };
type Body = { name?: string; task_type?: string | null; default_priority?: string; brand_id?: string | null; description?: string | null; platforms?: string[]; steps?: Step[] };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อเทมเพลต" }, { status: 400 });
  const steps = Array.isArray(body.steps) ? body.steps.filter((s) => s?.title?.trim()).map((s) => ({ title: s.title.trim(), required_before_next: !!s.required_before_next })) : [];

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_task_templates").insert({
    name, task_type: body.task_type || null, default_priority: body.default_priority || "normal",
    brand_id: body.brand_id || null, description: body.description?.trim() || null, platforms: body.platforms ?? [], steps, created_by: user?.id ?? null,
  }).select("id, name").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_template", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name } });
  return NextResponse.json({ id: data.id, error: null });
}

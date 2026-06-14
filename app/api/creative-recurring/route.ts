/**
 * Creative Recurring API — กฎงานประจำ (list + create)
 * GET  /api/creative-recurring?run=1   (run=1 → สร้างงานที่ถึงรอบก่อนคืนรายการ)
 * POST /api/creative-recurring  { name, template_id?, frequency, interval_n?, assignee_id?, brand_id?, campaign_id?, start_date?, end_date? }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { employeeLabelMap } from "@/lib/creative-tasks-server";
import { runAllDue } from "@/lib/creative-recurring";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  let generated = 0;
  if (new URL(request.url).searchParams.get("run") === "1") {
    try { const r = await runAllDue(admin); generated = r.created; } catch { /* best-effort */ }
  }
  const { data, error } = await admin.from("erp_creative_recurring")
    .select("*, template:erp_creative_task_templates!template_id(name), brand:brands!brand_id(name, color)")
    .eq("is_active", true).order("next_run", { ascending: true }).limit(300);
  if (error) return NextResponse.json({ data: [], generated, error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const empMap = await employeeLabelMap(admin, rows.map((r) => r.assignee_id as string));
  const items = rows.map((r) => {
    const tpl = (Array.isArray(r.template) ? r.template[0] : r.template) as { name?: string } | null;
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
    const out: Record<string, unknown> = { ...r, template_label: tpl?.name ?? null, brand_label: b?.name ?? null, brand_color: b?.color ?? null, assignee_label: r.assignee_id ? empMap.get(String(r.assignee_id)) ?? null : null };
    delete out.template; delete out.brand; return out;
  });
  return NextResponse.json({ data: items, generated, error: null });
}

type Body = { name?: string; template_id?: string | null; frequency?: string; interval_n?: number; assignee_id?: string | null; brand_id?: string | null; campaign_id?: string | null; start_date?: string | null; end_date?: string | null; weekday?: number | null; day_of_month?: number | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อกฎงานประจำ" }, { status: 400 });
  const start = body.start_date || new Date().toISOString().slice(0, 10);

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_recurring").insert({
    name, template_id: body.template_id || null, frequency: body.frequency || "weekly", interval_n: body.interval_n || 1,
    weekday: body.weekday ?? null, day_of_month: body.day_of_month ?? null,
    assignee_id: body.assignee_id || null, brand_id: body.brand_id || null, campaign_id: body.campaign_id || null,
    start_date: start, end_date: body.end_date || null, next_run: start, created_by: user?.id ?? null,
  }).select("id, name").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_recurring", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name } });
  return NextResponse.json({ id: data.id, error: null });
}

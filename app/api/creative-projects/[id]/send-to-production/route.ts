/**
 * Send to Production — สร้างงานจริง (erp_creative_tasks) จากโปรเจกต์ Brainstorm
 * POST /api/creative-projects/[id]/send-to-production  { tasks: [{task_type, title}] }
 *   → สร้างงานผูก project_id + brand/campaign/sku จากโปรเจกต์ → ไหลเข้า Task Manager
 *   → ตั้งสถานะโปรเจกต์ = in_production
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { nextTaskNo } from "@/lib/creative-tasks-server";
import { defaultStatusKey, getStatusMeta } from "@/lib/creative-statuses-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TaskReq = { task_type: string; title: string };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { tasks?: TaskReq[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const reqs = Array.isArray(body.tasks) ? body.tasks.filter((t) => t?.title?.trim()) : [];
  if (reqs.length === 0) return NextResponse.json({ error: "ไม่มีงานที่จะสร้าง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: project } = await admin.from("erp_creative_projects").select("id, name, brand_id, campaign_id").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "ไม่พบโปรเจกต์" }, { status: 404 });

  // SKU หลักของโปรเจกต์ (ถ้ามี)
  const { data: primarySku } = await admin.from("erp_creative_project_skus").select("sku_id").eq("project_id", id).eq("role", "primary").limit(1).maybeSingle();
  const skuId = (primarySku?.sku_id as string | null) ?? null;

  const status = await defaultStatusKey(admin);
  const meta = await getStatusMeta(admin, status);
  const progress = meta?.progress_percent ?? 0;

  const created: string[] = [];
  for (const t of reqs) {
    const taskNo = await nextTaskNo(admin);
    const { data, error } = await admin.from("erp_creative_tasks").insert({
      task_no: taskNo, title: t.title.trim(), task_type: t.task_type || null,
      brand_id: (project.brand_id as string) ?? null, campaign_id: (project.campaign_id as string) ?? null,
      sku_id: skuId, project_id: id, status, progress_percent: progress, created_by: user?.id ?? null,
    }).select("id").single();
    if (!error && data) created.push(data.id);
  }

  await admin.from("erp_creative_projects").update({ status: "in_production", updated_at: new Date().toISOString() }).eq("id", id);
  await writeAudit(admin, { action: "send_to_production", entityType: "creative_project", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { created: created.length } });
  if (created.length === 0) return NextResponse.json({ error: friendlyDbError("สร้างงานไม่สำเร็จ") }, { status: 400 });
  return NextResponse.json({ created: created.length, error: null });
}

/**
 * /api/issue-reports — แจ้งปัญหาการใช้งานแอป
 *
 * GET  → manage(report.manage): ทุกใบ · ไม่งั้น: เฉพาะของฉัน (?status= กรองได้)
 * POST → สร้างใบแจ้ง (report.create)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type IssueReport = {
  id: string; app_id: string | null; app_name: string | null; description: string;
  images: string[]; status: string; priority: string;
  reporter_id: string | null; reporter_name: string | null; admin_note: string | null;
  created_at: string; updated_at: string; resolved_at: string | null;
};

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;

  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id ?? null;
  const { data: canManage } = await sb.rpc("erp_can", { p_permission: "report.manage" });

  const db = supabaseAdmin();
  let q = db.from("issue_reports").select("*").order("created_at", { ascending: false }).limit(500);
  if (canManage !== true) q = q.eq("reporter_id", uid ?? "00000000-0000-0000-0000-000000000000");
  const status = new URL(request.url).searchParams.get("status");
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], canManage: false, error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], canManage: canManage === true, error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;

  let body: {
    app_id?: string | null; app_name?: string | null; description?: string;
    images?: string[]; priority?: string; reporterName?: string | null;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.description?.trim()) return NextResponse.json({ error: "กรุณาอธิบายปัญหา" }, { status: 400 });

  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id ?? null;

  const db = supabaseAdmin();
  const { data, error } = await db.from("issue_reports").insert({
    app_id:      body.app_id ?? null,
    app_name:    body.app_name ?? null,
    description: body.description.trim(),
    images:      Array.isArray(body.images) ? body.images : [],
    priority:    body.priority ?? "medium",
    status:      "open",
    reporter_id: uid,
    reporter_name: body.reporterName ?? null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });

  await writeAudit(db, {
    action: "create", entityType: "issue_reports", entityId: data.id,
    actorId: uid, actorName: body.reporterName ?? null,
    metadata: { app: body.app_name, priority: body.priority },
  });
  return NextResponse.json({ id: data.id, error: null });
}

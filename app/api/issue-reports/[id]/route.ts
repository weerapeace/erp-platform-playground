/**
 * /api/issue-reports/[id] — เปลี่ยนสถานะ/priority/โน้ต (report.manage)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "report.manage");
  if (guard) return guard;
  const { id } = await params;

  let body: { status?: string; priority?: string; admin_note?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status && STATUSES.has(body.status)) {
    patch.status = body.status;
    patch.resolved_at = body.status === "resolved" || body.status === "closed" ? new Date().toISOString() : null;
  }
  if (body.priority && PRIORITIES.has(body.priority)) patch.priority = body.priority;
  if (body.admin_note !== undefined) patch.admin_note = body.admin_note;

  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();

  const db = supabaseAdmin();
  const { error } = await db.from("issue_reports").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, {
    action: "update", entityType: "issue_reports", entityId: id,
    actorId: auth?.user?.id ?? null, actorName: null, metadata: patch,
  });
  return NextResponse.json({ ok: true, error: null });
}

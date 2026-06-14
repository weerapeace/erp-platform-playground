/**
 * Creative Recurring rule — รายตัว (PATCH / DELETE soft / POST action=run รันเดี๋ยวนี้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { runRule, type RecurringRule, type Template } from "@/lib/creative-recurring";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["name", "template_id", "frequency", "interval_n", "weekday", "day_of_month", "assignee_id", "brand_id", "campaign_id", "start_date", "end_date", "next_run", "is_active"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_recurring").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "creative_recurring", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changes: Object.keys(patch).filter((k) => k !== "updated_at") } });
  return NextResponse.json({ success: true, error: null });
}

// POST → action=run: สร้างงานรอบถัดไปทันที (ไม่รอถึงกำหนด)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { id } = await params;
  let body: { action?: string }; try { body = await request.json(); } catch { body = {}; }
  const admin = supabaseAdmin();
  const { data: rule } = await admin.from("erp_creative_recurring").select("*").eq("id", id).maybeSingle();
  if (!rule) return NextResponse.json({ error: "ไม่พบกฎ" }, { status: 404 });
  let tpl: Template | null = null;
  if ((rule as RecurringRule).template_id) {
    const { data: t } = await admin.from("erp_creative_task_templates").select("id, task_type, default_priority, brand_id, platforms, steps").eq("id", (rule as RecurringRule).template_id).maybeSingle();
    tpl = (t as Template) ?? null;
  }
  if (body.action === "run") {
    // รัน 1 รอบทันที โดยใช้ next_run ปัจจุบันเป็นกำหนด (upTo = next_run) แล้วเลื่อนต่อ
    const r = rule as RecurringRule;
    const upTo = r.next_run ?? r.start_date;
    const res = await runRule(admin, r, tpl, upTo);
    return NextResponse.json({ created: res.created, error: null });
  }
  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.delete"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_recurring").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "creative_recurring", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}

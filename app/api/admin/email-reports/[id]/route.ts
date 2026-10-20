/**
 * 📧 ส่งอีเมลรายงาน — แก้ไข / ลบ
 * PATCH  /api/admin/email-reports/:id  body: EmailReportInput (ค่าทั้งชุด รวมสวิตช์เปิด/ปิด) → audit "update" (+ ค่าก่อน/หลัง)
 * DELETE /api/admin/email-reports/:id  → ลบแบบเก็บประวัติ (is_active=false · ประวัติการส่งยังอยู่) → audit "delete"
 * สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeReportInput } from "@/lib/email-report/shared";
import { toEmailReport, requestActor } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "admin.email_reports";
const summary = (r: ReturnType<typeof toEmailReport>) => ({
  name: r.name, days: r.days, send_time: r.send_time, is_enabled: r.is_enabled, skip_if_empty: r.skip_if_empty,
  recipients: r.recipients.map((x) => (x.type === "user" ? x.name || x.email : x.email)), filters: r.filters, options: r.options,
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const { id } = await params;
  const parsed = normalizeReportInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ data: null, error: parsed.error }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("email_reports").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบรายงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const actor = await requestActor(supabaseFromRequest(request));
  const { data, error } = await admin.from("email_reports")
    .update({ ...parsed.value, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const report = toEmailReport(data as Record<string, unknown>);
  await writeAudit(admin, {
    action: "update", entityType: "email_report", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { name: report.name, before: summary(toEmailReport(before as Record<string, unknown>)), after: summary(report) },
  });
  return NextResponse.json({ data: report, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const { data, error } = await admin.from("email_reports")
    .update({ is_active: false, is_enabled: false, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", id).eq("is_active", true).select("id, name").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "ลบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "ไม่พบรายงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  await writeAudit(admin, { action: "delete", entityType: "email_report", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { name: (data as { name: string }).name } });
  return NextResponse.json({ ok: true, error: null });
}

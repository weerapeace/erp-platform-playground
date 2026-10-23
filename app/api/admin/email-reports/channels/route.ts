/**
 * 🔌 สวิตช์ช่องทางรายงานทั้งระบบ — PATCH /api/admin/email-reports/channels  body: { email?, discord?, popup? } (boolean)
 * ปิดช่องไหน = ทุกรายงานหยุดใช้ช่องนั้นทันที (ส่งตามเวลา / ส่งเดี๋ยวนี้ / ป๊อปตอนเข้า ERP) · ส่งทดสอบยังได้
 * ตาราง erp_report_channels แถวเดียว (RLS ไม่มี policy) · สิทธิ์ admin.email_reports · audit "update" entity report_channels (ก่อน/หลัง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { loadReportChannels } from "@/lib/email-report/channels";
import { REPORT_CHANNELS, type ReportChannelKey } from "@/lib/email-report/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Partial<Record<ReportChannelKey, boolean>> = {};
  for (const c of REPORT_CHANNELS) if (typeof body?.[c.key] === "boolean") patch[c.key] = body[c.key] as boolean;
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้เปลี่ยน" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const before = await loadReportChannels(admin);
  const { error } = await admin.from("erp_report_channels")
    .upsert({ id: 1, email: before.email, discord: before.discord, popup: before.popup, ...patch, updated_at: new Date().toISOString(), updated_by: actor.name }, { onConflict: "id" });
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const after = await loadReportChannels(admin);
  await writeAudit(admin, {
    action: "update", entityType: "report_channels", entityId: null, actorId: actor.id, actorName: actor.name,
    metadata: { before: { email: before.email, discord: before.discord, popup: before.popup }, after: { email: after.email, discord: after.discord, popup: after.popup } },
  });
  return NextResponse.json({ data: after, error: null });
}

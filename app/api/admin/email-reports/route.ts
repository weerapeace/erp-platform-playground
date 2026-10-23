/**
 * 📧 ส่งอีเมลรายงาน — รายการ + สร้างใหม่
 * GET  /api/admin/email-reports → { data: EmailReport[], runs: EmailReportRun[] (ล่าสุด 30), popup_acks (วันนี้), channels (สวิตช์ทั้งระบบ), discord_ready, email_ready, error }
 * POST /api/admin/email-reports  body: EmailReportInput → สร้าง (audit "create")
 * สิทธิ์: admin.email_reports · ตาราง email_reports / email_report_runs (เปิด RLS ไม่มี policy → ผ่าน supabaseAdmin เท่านั้น)
 * doc: docs/email-reports.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { emailConfigured, emailErrorText, emailProvider, emailSenderAddress, verifyEmailTransport } from "@/lib/email";
import { normalizeReportInput, type EmailReport, type EmailReportRun } from "@/lib/email-report/shared";
import { nowTH } from "@/lib/email-report/send";
import { loadReportChannels } from "@/lib/email-report/channels";
import { discordReady } from "@/lib/discord";
import { toEmailReport, requestActor } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "admin.email_reports";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data, error }, runsRes, acksRes, channels] = await Promise.all([
    admin.from("email_reports").select("*").eq("is_active", true).order("created_at", { ascending: true }),
    admin.from("email_report_runs")
      .select("id, report_id, ran_at, trigger, status, item_count, recipient_count, sent_count, error, actor_name, report:email_reports!report_id(name)")
      .order("ran_at", { ascending: false }).limit(30),
    // 🔔 ป๊อปตอนเข้า ERP: วันนี้ใครรับทราบ / กดไว้ทีหลัง
    admin.from("erp_popup_acks").select("report_id, action, acked_at, user:user_profiles!user_id(display_name, username)").eq("ack_date", nowTH().date).limit(500),
    loadReportChannels(admin),   // 🔌 สวิตช์ช่องทางทั้งระบบ
  ]);
  if (error) return NextResponse.json({ data: [], runs: [], email_ready: emailConfigured(), error: "โหลดรายงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const reports: EmailReport[] = ((data ?? []) as Record<string, unknown>[]).map(toEmailReport);
  const runs: EmailReportRun[] = ((runsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
    const rep = (Array.isArray(r.report) ? r.report[0] : r.report) as { name?: string } | null;
    return {
      id: String(r.id), report_id: String(r.report_id), report_name: rep?.name ?? null, ran_at: String(r.ran_at),
      trigger: r.trigger as EmailReportRun["trigger"], status: r.status as EmailReportRun["status"],
      item_count: (r.item_count as number) ?? null, recipient_count: (r.recipient_count as number) ?? null, sent_count: (r.sent_count as number) ?? null,
      error: (r.error as string) ?? null, actor_name: (r.actor_name as string) ?? null,
    };
  });
  // ช่องทางส่ง + ผู้ส่ง (โชว์ในกล่องสถานะ) · ตัวตั้งเวลา pg_cron ทำงานไหม · ?check=1 = ลองเชื่อมต่อจริง (ไม่ส่งอีเมล)
  const { data: cronOk } = await admin.rpc("erp_email_reports_cron_active");
  const check = new URL(request.url).searchParams.get("check") === "1" ? await verifyEmailTransport() : null;
  const popup_acks = ((acksRes.data ?? []) as Record<string, unknown>[]).map((a) => {
    const u = (Array.isArray(a.user) ? a.user[0] : a.user) as { display_name?: string | null; username?: string | null } | null;
    return { report_id: String(a.report_id), action: a.action === "later" ? "later" : "ack", acked_at: String(a.acked_at), name: u?.display_name || u?.username || "ผู้ใช้" };
  });
  return NextResponse.json({
    data: reports, runs, popup_acks, channels, discord_ready: discordReady().bot,
    email_ready: emailConfigured(), email_provider: emailProvider(), email_sender: emailSenderAddress(),
    scheduler_active: cronOk === true,
    email_check: check ? { ok: check.ok, error: check.error ? emailErrorText(check.error) : null } : null,
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const body = await request.json().catch(() => null);
  const parsed = normalizeReportInput(body);
  if ("error" in parsed) return NextResponse.json({ data: null, error: parsed.error }, { status: 400 });
  const actor = await requestActor(supabaseFromRequest(request));
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("email_reports")
    .insert({ ...parsed.value, created_by: actor.id, updated_by: actor.id })
    .select("*").single();
  if (error || !data) return NextResponse.json({ data: null, error: "บันทึกรายงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const report = toEmailReport(data as Record<string, unknown>);
  await writeAudit(admin, {
    action: "create", entityType: "email_report", entityId: report.id, actorId: actor.id, actorName: actor.name,
    metadata: { name: report.name, source_key: report.source_key, days: report.days, send_time: report.send_time, recipients: report.recipients.length, is_enabled: report.is_enabled },
  });
  return NextResponse.json({ data: report, error: null });
}

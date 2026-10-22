/**
 * 📧 ส่งอีเมลรายงานทันที
 * POST /api/admin/email-reports/:id/send  body: { mode: "test" | "now" }
 *   test = ส่งถึงอีเมลของคนที่กด (หัวเรื่องขึ้นต้น [ทดสอบ]) · now = ส่งถึงผู้รับทุกคนเดี๋ยวนี้ (ไม่แตะรอบส่งตามเวลา)
 * → { ok, result: { status, sent, recipients, items, message, skipped } } · ลงประวัติ email_report_runs + audit "send"
 * สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { runEmailReport } from "@/lib/email-report/send";
import { toEmailReport } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "now" ? "manual" : "test";
  const admin = supabaseAdmin();
  const { data } = await admin.from("email_reports").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "ไม่พบรายงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const actor = await requestActor(supabaseFromRequest(request));
  const result = await runEmailReport(admin, toEmailReport(data as Record<string, unknown>), { trigger: mode, actor, testTo: actor.email });
  const ok = result.status === "sent" || result.status === "partial";
  return NextResponse.json({ ok, result, error: ok ? null : result.message }, { status: ok ? 200 : 422 });
}

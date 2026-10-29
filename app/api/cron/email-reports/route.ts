/**
 * /api/cron/email-reports — ส่งอีเมลรายงานที่ถึงเวลา (pg_cron เรียกทุก 15 นาที)
 *
 * เรียกได้ 3 ทาง:
 *   1. pg_cron + pg_net: header x-cron-token = โทเคนใน Supabase Vault (ชื่อ email_reports_cron) — ตรวจผ่าน RPC erp_cron_token_ok
 *   2. CRON_SECRET (Authorization: Bearer <CRON_SECRET>) ถ้าตั้ง env ไว้
 *   3. แอดมินเช็กเอง (guardApi admin.email_reports) — ดูอย่างเดียว ไม่ส่ง (dry run)
 * ถึงเวลา = วันตรง · ตั้งแต่เวลาที่ตั้ง ถึง +2 ชม. · วันนี้ยังไม่ส่ง (lib/email-report/send isDue) · กันส่งซ้ำด้วยการจอง last_sent_on
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isDue, nowTH, runEmailReport } from "@/lib/email-report/send";
import { toEmailReport } from "../../admin/email-reports/shared";
import { emailErrorText, emailSenderAddress, verifyEmailTransport } from "@/lib/email";
import { pushDuePopups } from "@/lib/email-report/popup-push";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function authorized(request: NextRequest): Promise<"cron" | "dry" | null> {
  const admin = supabaseAdmin();
  const token = request.headers.get("x-cron-token");
  if (token) {
    const { data } = await admin.rpc("erp_cron_token_ok", { p_name: "email_reports_cron", p_token: token });
    if (data === true) return "cron";
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return "cron";
  const denied = await guardApi(request, "admin.email_reports");
  return denied ? null : "dry";
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const mode = await authorized(request);
  if (!mode) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  // ?check=1 = ตรวจการเชื่อมต่อระบบส่งอีเมลอย่างเดียว (ไม่ส่งอะไร) — ใช้ตรวจหลังตั้งค่า Gmail
  if (new URL(request.url).searchParams.get("check") === "1") {
    const v = await verifyEmailTransport();
    return NextResponse.json({ ok: v.ok, check: true, provider: v.provider, sender: emailSenderAddress(), error: v.error ? emailErrorText(v.error) : null });
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("email_reports").select("*").eq("is_active", true).eq("is_enabled", true);
  if (error) return NextResponse.json({ ok: false, error: "โหลดรายงานไม่สำเร็จ" }, { status: 500 });
  const reports = ((data ?? []) as Record<string, unknown>[]).map(toEmailReport);
  const due = reports.filter((r) => isDue(r));
  const now = nowTH();
  if (mode === "dry") {
    return NextResponse.json({ ok: true, dry: true, now, enabled: reports.length, due: due.map((r) => ({ id: r.id, name: r.name, send_time: r.send_time })) });
  }
  const results = [];
  for (const r of due) {
    const res = await runEmailReport(admin, r, { trigger: "schedule", actor: { id: null, name: "ระบบ (ส่งตามเวลา)" } });
    results.push({ id: r.id, name: r.name, status: res.status, sent: res.sent, recipients: res.recipients, message: res.message });
  }
  // ป๊อปเตือนงานถึงเวลา → เด้งที่เบราว์เซอร์/มือถือของคนที่เปิดรับ (วันละครั้งต่อคนต่อรายงาน) · พังไม่กระทบอีเมล
  let popupPush: unknown = null;
  try { popupPush = await pushDuePopups(admin); }
  catch (e) { console.error("[cron] popup push", e); popupPush = { error: e instanceof Error ? e.message : String(e) }; }
  return NextResponse.json({ ok: true, now, enabled: reports.length, due: due.length, results, popupPush });
}

export const GET = handle;
export const POST = handle;

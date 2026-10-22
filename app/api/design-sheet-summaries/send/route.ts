/**
 * 📋✉️ ส่งสรุปงานทางอีเมล (ใช้ค่าที่ตั้งอยู่ในป๊อปตอนนี้ — ยังไม่บันทึกก็ส่งได้)
 * POST /api/design-sheet-summaries/send
 *   body: { doc: SummaryDoc, recipients: [{type:"user",id} | {type:"email",email}], subject?, message?, summary_id? }
 * → ส่งทีละคน (ผู้รับไม่เห็นกัน) · ตอบกลับ = ไปหาคนที่กดส่ง (replyTo) · ชื่อผู้ส่ง = ชื่อคนกด
 * → { ok, sent, total, failed: [{email, reason}], skipped: [], error }
 * สิทธิ์: products.edit (เท่าคนที่แก้สรุปได้) · audit "send_email" (design_sheet_summary)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { absoluteUrl } from "@/lib/app-url";
import { emailConfigured, emailDevEcho, emailErrorText, sendEmail } from "@/lib/email";
import { EMAIL_RE } from "@/lib/email-report/shared";
import { normalizeSummaryDoc, renderSummaryEmail } from "@/lib/design-sheet-summary";
import { loadSummarySheets } from "@/lib/design-sheet-summary-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { doc?: unknown; recipients?: unknown; subject?: unknown; message?: unknown; summary_id?: unknown };
  const parsed = normalizeSummaryDoc(body.doc);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const doc = parsed.value;

  // ── ผู้รับ ──
  const raw = Array.isArray(body.recipients) ? body.recipients.slice(0, 30) : [];
  const userIds: string[] = [];
  let emails: string[] = [];
  for (const x of raw) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (o.type === "user" && typeof o.id === "string" && UUID_RE.test(o.id)) userIds.push(o.id);
    else if (o.type === "email" && typeof o.email === "string" && EMAIL_RE.test(o.email.trim())) emails.push(o.email.trim().toLowerCase());
  }
  const admin = supabaseAdmin();
  const skipped: string[] = [];
  if (userIds.length) {
    const { data } = await admin.from("user_profiles").select("id, email, active, display_name").in("id", userIds);
    for (const u of (data ?? []) as { email: string | null; active: boolean | null; display_name: string | null }[]) {
      if (u.active === false) skipped.push(`${u.display_name ?? "ผู้ใช้"} (ปิดบัญชีแล้ว)`);
      else if (!u.email) skipped.push(`${u.display_name ?? "ผู้ใช้"} (ไม่มีอีเมล)`);
      else emails.push(u.email.toLowerCase());
    }
  }
  emails = [...new Set(emails)];
  if (emails.length === 0) return NextResponse.json({ ok: false, error: skipped.length ? `ไม่มีผู้รับที่ส่งได้ (${skipped.join(", ")})` : "ใส่ผู้รับอย่างน้อย 1 คน", skipped }, { status: 400 });
  if (!emailConfigured() && !emailDevEcho()) return NextResponse.json({ ok: false, error: emailErrorText("email-not-configured") }, { status: 503 });

  const actor = await requestActor(supabaseFromRequest(request));
  const sheets = await loadSummarySheets(admin, doc.items.map((i) => i.sheet_id));
  const subject = String(body.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 150) || doc.title;
  const message = typeof body.message === "string" ? body.message : "";
  const { html, text } = renderSummaryEmail(doc, sheets, { message, senderName: actor.name, absUrl: (u) => absoluteUrl(u) ?? u });

  const failed: { email: string; reason: string }[] = [];
  let sent = 0;
  for (const to of emails) {
    const r = await sendEmail({ to, subject, html, text, fromName: actor.name ?? undefined, replyTo: actor.email ?? undefined });
    if (r.ok) sent += 1; else failed.push({ email: to, reason: emailErrorText(r.error) });
  }

  const summaryId = typeof body.summary_id === "string" && UUID_RE.test(body.summary_id) ? body.summary_id : null;
  await writeAudit(admin, {
    action: "send_email", entityType: "design_sheet_summary", entityId: summaryId, actorId: actor.id, actorName: actor.name,
    metadata: { title: doc.title, audience: doc.audience, subject, recipients: emails, sent, failed, skipped, items: doc.items.length },
  });
  const ok = sent > 0;
  return NextResponse.json({
    ok, sent, total: emails.length, failed, skipped,
    error: ok ? null : failed[0]?.reason ?? "ส่งอีเมลไม่สำเร็จ",
  }, { status: ok ? 200 : 502 });
}

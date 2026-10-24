/**
 * 📧 ส่งอีเมลรายงาน (ของกลาง · ฝั่งเซิร์ฟเวอร์) — ใช้ทั้ง ส่งทดสอบ / ส่งเดี๋ยวนี้ / ส่งตามเวลา (cron)
 * + 💬 Discord (ถ้าเปิดไว้ในรายงาน) — ส่งในรอบเดียวกัน ลงประวัติแถวเดียว (detail.discord) · lib/email-report/discord
 * ขั้นตอน: หาอีเมลผู้รับ (ผู้ใช้ในระบบ = อีเมลล่าสุดจาก user_profiles · คนปิดบัญชี/ไม่มีอีเมล = ข้าม+จดไว้)
 *        → ประกอบรายงาน → ส่งทีละคน (ผู้รับไม่เห็นกัน) → ลงประวัติ email_report_runs + audit
 * ส่งตามเวลา: "จอง" วันนี้ก่อนส่ง (last_sent_on) → cron ซ้อนกันก็ไม่ส่งซ้ำ · ส่งไม่สำเร็จ = ไม่ลองซ้ำวันนั้น (ดูในประวัติ)
 * ช่องทาง: สวิตช์รายรายงาน (email_enabled / discord.enabled) + สวิตช์ทั้งระบบ (erp_report_channels) · ส่งทดสอบ = ข้ามสวิตช์ทั้งระบบ (ส่งหาตัวเองคนเดียว)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { emailConfigured, emailDevEcho, emailErrorText, sendEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { buildReportEmail } from "@/lib/email-report/sources";
import { sendReportToDiscord, type DiscordResult } from "@/lib/email-report/discord";
import { loadReportChannels } from "@/lib/email-report/channels";
import { normalizeReportDiscord, type EmailReport, type EmailReportRun } from "@/lib/email-report/shared";

type Admin = ReturnType<typeof supabaseAdmin>;
type Actor = { id: string | null; name: string | null };

/** วัน/เวลาตามเวลาไทย (เซิร์ฟเวอร์เป็น UTC) */
export function nowTH(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600_000);
  const dow = t.getUTCDay() === 0 ? 7 : t.getUTCDay();   // 1=จันทร์ … 7=อาทิตย์
  return { date: t.toISOString().slice(0, 10), hm: t.toISOString().slice(11, 16), dow };
}

const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
/** ถึงเวลาส่งไหม: วันตรง · ตั้งแต่เวลาที่ตั้ง ถึง +2 ชม. (cron พลาดรอบยังตามส่งได้ แต่ไม่ส่งเย็นถ้าตั้งไว้เช้า) · วันนี้ยังไม่ส่ง */
export function isDue(r: Pick<EmailReport, "is_enabled" | "days" | "send_time" | "last_sent_on">, d = new Date()): boolean {
  const n = nowTH(d);
  if (!r.is_enabled || !r.days.includes(n.dow) || r.last_sent_on === n.date) return false;
  const diff = toMin(n.hm) - toMin(r.send_time);
  return diff >= 0 && diff < 120;
}

export type RunResult = { status: EmailReportRun["status"]; sent: number; recipients: number; items: number; message: string; skipped?: string[]; claimed?: boolean };

export async function runEmailReport(admin: Admin, report: EmailReport, opts: { trigger: EmailReportRun["trigger"]; actor: Actor; testTo?: string | null }): Promise<RunResult> {
  const today = nowTH().date;

  // ส่งตามเวลา: จองวันนี้ก่อน — ถ้ามีอีกรอบจองไปแล้ว ไม่ต้องทำซ้ำ
  if (opts.trigger === "schedule") {
    const { data: claimed } = await admin.from("email_reports").update({ last_sent_on: today })
      .eq("id", report.id).or(`last_sent_on.is.null,last_sent_on.lt.${today}`).select("id");
    if (!claimed || claimed.length === 0) return { status: "skipped_empty", sent: 0, recipients: 0, items: 0, message: "วันนี้ส่งไปแล้ว", claimed: false };
  }

  // ── ช่องทางรอบนี้ ──
  const test = opts.trigger === "test";
  const global = await loadReportChannels(admin);
  const reportEmail = report.email_enabled !== false;
  const reportDiscord = normalizeReportDiscord(report.discord).enabled;
  // ติ๊ก Gmail ไว้แต่ยังไม่มีผู้รับ (รายงานป๊อปอย่างเดียว) = ไม่นับเป็นช่องอีเมล — ไม่ลง "ไม่สำเร็จ" ทุกวัน · ส่งทดสอบยังส่งหาตัวเองได้
  const noRecipients = reportEmail && report.recipients.length === 0;
  const wantEmail = reportEmail && (test || (global.email && !noRecipients));
  const wantDiscord = reportDiscord && (test || global.discord);

  // ── ผู้รับ ──
  const skipped: string[] = [];
  let emails: string[] = [];
  if (!wantEmail) {
    // ไม่ส่งอีเมลรอบนี้ (ปิดในรายงาน หรือปิดทั้งระบบ)
  } else if (test) {
    if (opts.testTo) emails = [opts.testTo.toLowerCase()];
    else skipped.push("บัญชีของคุณยังไม่มีอีเมล");
  } else {
    const userIds = report.recipients.filter((r) => r.type === "user").map((r) => (r as { id: string }).id);
    const byId = new Map<string, { email: string | null; active: boolean; name: string }>();
    if (userIds.length) {
      const { data } = await admin.from("user_profiles").select("id, email, active, display_name").in("id", userIds);
      for (const u of (data ?? []) as { id: string; email: string | null; active: boolean | null; display_name: string | null }[]) {
        byId.set(u.id, { email: u.email, active: u.active !== false, name: u.display_name || u.email || "ผู้ใช้" });
      }
    }
    for (const r of report.recipients) {
      if (r.type === "email") { emails.push(r.email.toLowerCase()); continue; }
      const u = byId.get(r.id);
      if (!u || !u.active) skipped.push(`${r.name || "ผู้ใช้"} (ปิดบัญชีแล้ว)`);
      else if (!u.email) skipped.push(`${u.name} (ไม่มีอีเมล)`);
      else emails.push(u.email.toLowerCase());
    }
    emails = [...new Set(emails)];
  }

  const log = async (status: EmailReportRun["status"], fields: { items?: number; sent?: number; error?: string | null; detail?: Record<string, unknown> }) => {
    await admin.from("email_report_runs").insert({
      report_id: report.id, trigger: opts.trigger, status, item_count: fields.items ?? null, recipient_count: emails.length,
      sent_count: fields.sent ?? 0, error: fields.error ?? null, actor_id: opts.actor.id, actor_name: opts.actor.name,
      detail: { skipped, ...(fields.detail ?? {}) },
    });
    await writeAudit(admin, {
      action: "send", entityType: "email_report", entityId: report.id, actorId: opts.actor.id, actorName: opts.actor.name,
      metadata: { name: report.name, trigger: opts.trigger, status, sent: fields.sent ?? 0, recipients: emails.length, error: fields.error ?? null },
    });
  };

  // ไม่มีช่องไหนให้ส่ง: รายงานป๊อปอย่างเดียว (ตามเวลา) = เงียบ ๆ · ถูกปิดทั้งระบบ = ลงประวัติให้เห็น
  if (!wantEmail && !wantDiscord) {
    const offGlobal = (reportEmail && !global.email) || (reportDiscord && !global.discord);
    const message = offGlobal ? `ปิดช่องทาง${[reportEmail && !global.email ? "อีเมล" : "", reportDiscord && !global.discord ? "Discord" : ""].filter(Boolean).join(" / ")}ทั้งระบบอยู่ — ไม่ได้ส่ง`
      : noRecipients ? "ยังไม่มีผู้รับอีเมล และไม่ได้เปิด Discord (ใช้แค่ป๊อป)" : "รายงานนี้ไม่ได้เปิดอีเมลหรือ Discord (ใช้แค่ป๊อป)";
    if (offGlobal || opts.trigger === "manual") await log("channel_off", { error: message });
    return { status: "channel_off", sent: 0, recipients: 0, items: 0, message, skipped };
  }

  const emailReady = emailConfigured() || emailDevEcho();
  if (!emailReady && !wantDiscord) {
    const message = emailErrorText("email-not-configured");
    await log("not_configured", { error: message });
    return { status: "not_configured", sent: 0, recipients: emails.length, items: 0, message, skipped };
  }

  let built: Awaited<ReturnType<typeof buildReportEmail>>;
  try { built = await buildReportEmail(admin, report); }
  catch (e) {
    console.error("[email-report] build", e);
    const message = "ดึงข้อมูลรายงานไม่สำเร็จ";
    await log("failed", { error: message });
    return { status: "failed", sent: 0, recipients: emails.length, items: 0, message, skipped };
  }
  const items = built.built.total;

  if (opts.trigger === "schedule" && report.skip_if_empty && items === 0) {
    await log("skipped_empty", { items: 0 });
    return { status: "skipped_empty", sent: 0, recipients: emails.length, items: 0, message: "วันนี้ไม่มีงานค้าง เลยไม่ส่ง", skipped };
  }
  if (emails.length === 0 && !wantDiscord) {
    const message = skipped.length ? `ไม่มีผู้รับที่ส่งได้ (${skipped.join(", ")})` : "ยังไม่มีผู้รับ";
    await log("failed", { items, error: message });
    return { status: "failed", sent: 0, recipients: 0, items, message, skipped };
  }

  // ── อีเมล ──
  const subject = opts.trigger === "test" ? `[ทดสอบ] ${built.email.subject}` : built.email.subject;
  const failed: { email: string; code: string }[] = [];
  let sent = 0;
  let emailError: string | null = null;
  if (emails.length) {
    if (!emailReady) emailError = emailErrorText("email-not-configured");
    else {
      for (const to of emails) {
        const r = await sendEmail({ to, subject, html: built.email.html, text: built.email.text, fromName: "ERP รายงาน" });
        if (r.ok) sent += 1; else failed.push({ email: to, code: r.error });
      }
      if (failed.length) emailError = `${emailErrorText(failed[0].code)}${failed.length > 1 ? ` (${failed.length} คน)` : ""}`;
    }
  }

  // ── Discord (ทดสอบ = DM หาคนกด) ──
  let discord: DiscordResult | null = null;
  if (wantDiscord) {
    try { discord = await sendReportToDiscord(admin, report, built.built, { trigger: opts.trigger, actorId: opts.actor.id, subject: built.email.subject }); }
    catch (e) { console.error("[email-report] discord", e); discord = { ok: false, posted: 0, cards: 0, image: false, target: "", error: "ส่งเข้า Discord ไม่สำเร็จ" }; }
  }

  // ── สรุปผลรวมทุกช่องทาง ──
  const emailOk = emails.length === 0 || !emailError;
  const discordOk = !discord || discord.ok;
  const anyOk = sent > 0 || (!!discord && discord.posted > 0);
  const status: EmailReportRun["status"] = emailOk && discordOk ? "sent" : anyOk ? "partial" : "failed";
  const error = [emailError && (wantDiscord ? `อีเมล: ${emailError}` : emailError), discord?.error && `Discord: ${discord.error}`].filter(Boolean).join(" · ") || null;
  await log(status, { items, sent, error, detail: { subject, failed, ...(discord ? { discord } : {}) } });
  const said = [
    emails.length ? (sent ? `อีเมล ${sent}${sent < emails.length ? `/${emails.length}` : ""} คน` : "อีเมลไม่สำเร็จ") : "",
    discord ? (discord.posted ? `Discord ${discord.target} ${discord.posted} ข้อความ${discord.cards ? ` (การ์ดติ๊ก ${discord.cards} ใบ)` : ""}` : "Discord ไม่สำเร็จ") : "",
  ].filter(Boolean).join(" · ");
  const message = status === "sent" ? `ส่งแล้ว — ${said}` : status === "partial" ? `ส่งได้บางส่วน — ${said} — ${error}` : error ?? "ส่งไม่สำเร็จ";
  return { status, sent, recipients: emails.length, items, message, skipped };
}

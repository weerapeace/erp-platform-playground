/**
 * 💬 ส่งรายงานเข้า Discord (ฝั่งเซิร์ฟเวอร์) — เรียกจาก runEmailReport
 *   ส่งทดสอบ = DM หาคนกด (ต้องผูกบัญชี Discord) · ส่งเดี๋ยวนี้/ตามเวลา = ห้องที่ตั้งไว้
 * ข้อความ 1: (แท็กทีมตามที่ตั้ง) หัวเรื่อง + รูปรายงาน + ลิงก์ดูทั้งหมด + บอกว่ามีของรอกี่ใบ
 * ข้อความถัดไป: การ์ดเฉพาะใบที่มีเช็กลิสต์ค้าง พร้อมปุ่มติ๊ก (lib/discord-checklist) — สูงสุด max_cards ใบ
 * วาดรูปไม่ได้ → ส่งตัวเลขสรุปเป็นการ์ดแทน (ทีมยังได้ข้อความ)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { DiscordError, discordDmChannel, discordReady, discordSend, type DiscordFile } from "@/lib/discord";
import { checklistCardMessage, type ChecklistTask } from "@/lib/discord-checklist";
import { renderReportPng } from "@/lib/email-report/image";
import { loadChecklistPresets, userNames } from "@/lib/record-tasks-server";
import { linksOf } from "@/lib/record-tasks";
import { normalizeReportDiscord, type EmailReport, type EmailReportRun } from "@/lib/email-report/shared";
import type { BuiltReport } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;
export type DiscordResult = { ok: boolean; posted: number; cards: number; image: boolean; target: string; error: string | null };

export async function sendReportToDiscord(admin: Admin, report: Pick<EmailReport, "name" | "discord">, built: BuiltReport,
  opts: { trigger: EmailReportRun["trigger"]; actorId: string | null; subject: string }): Promise<DiscordResult> {
  const cfg = normalizeReportDiscord(report.discord);
  const ready = discordReady();
  const fail = (error: string, target = "", posted = 0): DiscordResult => ({ ok: false, posted, cards: 0, image: false, target, error });
  if (!ready.bot) return fail("ยังไม่ได้ตั้งบอท Discord (ดูคู่มือในหน้านี้)");
  const test = opts.trigger === "test";

  // ── ปลายทาง ──
  let channelId: string; let target: string;
  try {
    if (test) {
      const { data: link } = opts.actorId ? await admin.from("erp_discord_links").select("discord_user_id").eq("user_id", opts.actorId).maybeSingle() : { data: null };
      if (!link) return fail("ส่งทดสอบเข้า Discord ไม่ได้ — ผูกบัญชี Discord ของคุณก่อน (เมนูบัญชี → ผูกบัญชี Discord)");
      channelId = await discordDmChannel((link as { discord_user_id: string }).discord_user_id);
      target = "DM ของคุณ";
    } else {
      if (!cfg.enabled || !cfg.channel_id) return fail("ยังไม่ได้เลือกห้อง Discord");
      channelId = cfg.channel_id; target = cfg.channel_name ? `#${cfg.channel_name}` : "ห้อง Discord";
    }
  } catch (e) { return fail(e instanceof DiscordError ? e.message : "เปิดห้อง Discord ไม่สำเร็จ"); }

  const { content, mention, cards: cardMsgs } = await composeDiscordReport(admin, cfg, built, { test, subject: opts.subject, buttons: ready.buttons });
  const files: DiscordFile[] = [];
  let image = false;
  if (built.total > 0) {
    try {
      files.push({ name: "report.png", type: "image/png", data: await renderReportPng(built, { reportName: report.name, maxRows: cfg.image_rows }) });
      image = true;
    } catch (e) { console.error("[discord] render image", e); }
  }
  const fallbackEmbed = !image && built.stats.length ? [{
    title: built.heading, color: 0x5865f2,
    fields: built.stats.map((s) => ({ name: s.label, value: `**${s.value.toLocaleString("th-TH")}**`, inline: true })),
    ...(built.total === 0 ? { description: built.emptyText } : {}),
  }] : [];
  let posted = 0;
  try {
    await discordSend(channelId, {
      content,
      allowed_mentions: mention ? { roles: [cfg.role_id!] } : { parse: [] },
      ...(fallbackEmbed.length ? { embeds: fallbackEmbed } : {}),
    }, files);
    posted++;
  } catch (e) { return fail(e instanceof DiscordError ? e.message : "ส่งเข้า Discord ไม่สำเร็จ", target); }

  // ── การ์ดต้องติ๊ก (ทีละใบ) ──
  let cards = 0; let error: string | null = null;
  for (const msg of cardMsgs) {
    try {
      await discordSend(channelId, msg);
      posted++; cards++;
    } catch (e) { error = e instanceof DiscordError ? e.message : "ส่งการ์ดบางใบไม่สำเร็จ"; }
  }
  return { ok: !error, posted, cards, image, target, error };
}

/**
 * ประกอบข้อความ Discord ของรายงาน (ไม่ส่ง) — ใช้ทั้งตอนส่งจริง และตัวอย่างในหน้าตั้งค่า (preview?format=discord)
 * content = ข้อความ 1 (หัวเรื่อง · ของรอกี่ใบ · ลิงก์ดูทั้งหมด) · cards = การ์ดเฉพาะใบที่มีเช็กลิสต์ค้าง (สูงสุด max_cards)
 */
export async function composeDiscordReport(admin: Admin, cfg: ReturnType<typeof normalizeReportDiscord>, built: BuiltReport,
  opts: { test: boolean; subject: string; buttons: boolean }) {
  // ── เช็กลิสต์ค้าง (การ์ด) ──
  const records = cfg.max_cards > 0 ? (built.checklist?.records ?? []).slice(0, cfg.max_cards) : [];
  const tasksBy = new Map<string, ChecklistTask[]>();
  if (records.length && built.checklist) {
    const { data } = await admin.from("erp_record_tasks").select("id, record_id, title, status, resolved_by, assigned_to, metadata")
      .eq("module_key", built.checklist.moduleKey).in("record_id", records.map((r) => r.id)).order("created_at", { ascending: true });
    const rows = (data ?? []) as (ChecklistTask & { record_id: string; assigned_to: string | null; metadata: unknown })[];
    const names = await userNames(admin, rows.map((t) => t.assigned_to));
    for (const t of rows) (tasksBy.get(t.record_id) ?? tasksBy.set(t.record_id, []).get(t.record_id)!).push({ id: t.id, title: t.title, status: t.status, resolved_by: t.resolved_by, assigned_name: t.assigned_to ? names.get(t.assigned_to) ?? null : null, links: linksOf(t.metadata) });
  }
  const cardRecords = records.filter((r) => (tasksBy.get(r.id) ?? []).length > 0);
  // ＋ พิมพ์เพิ่ม / เมนูค่าที่ใช้บ่อย บนการ์ด (เฉพาะตอนปุ่มใช้ได้)
  const presets = opts.buttons && built.checklist && cardRecords.length ? await loadChecklistPresets(admin, built.checklist.moduleKey) : [];

  // ── ข้อความ 1: ภาพรวม ──
  const overdue = built.overdue ?? 0;
  const mention = !opts.test && !!cfg.role_id && (cfg.mention === "always" || (cfg.mention === "overdue" && overdue > 0));
  const content = [
    `${opts.test ? "🧪 ทดสอบ (เห็นคนเดียว) — " : ""}${mention ? `<@&${cfg.role_id}> ` : ""}**${opts.subject}**${overdue > 0 ? ` — เกินกำหนด ${overdue} งาน` : ""}`,
    cardRecords.length ? `⏳ มีของรอ ${cardRecords.length} ใบ — ${opts.buttons ? "ติ๊กที่การ์ดด้านล่างได้เลย" : "เปิดใบงานเพื่อติ๊กในระบบ"}` : "",
    built.viewAllLink ? `[${built.viewAllLabel} →](${built.viewAllLink})` : "",
  ].filter(Boolean).join("\n").slice(0, 2000);
  const cards = cardRecords.map((r) => checklistCardMessage({ title: r.title, url: r.link, description: r.description, thumbnail: r.imageUrl }, tasksBy.get(r.id) ?? [], opts.buttons,
    built.checklist ? { moduleKey: built.checklist.moduleKey, recordId: r.id, presets } : null));
  return { content, mention, cards };
}

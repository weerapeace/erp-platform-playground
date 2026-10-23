/**
 * 💬 Discord Interactions — Discord เรียกที่นี่เมื่อมีคนกดปุ่มในข้อความของบอท (ตั้ง URL นี้ใน Discord Developer Portal)
 * POST /api/discord/interactions  (ไม่ต้องล็อกอิน ERP — ยืนยันด้วยลายเซ็น Ed25519 ของ Discord แทน)
 *
 * ปุ่มติ๊กเช็กลิสต์ custom_id "rt:<id>" → ตอบ Discord ทันที (กันเกิน 3 วิ) แล้วค่อยทำงานต่อเบื้องหลัง:
 *   ยังไม่ผูกบัญชี → ข้อความเห็นคนเดียว + ปุ่มไปผูกบัญชี · ไม่มีสิทธิ์ products.edit → แจ้งเห็นคนเดียว
 *   ผ่าน → สลับ ค้าง ⇄ เสร็จ (บันทึกว่าใครติ๊ก + audit) → แก้การ์ดเดิมให้เป็นสถานะล่าสุด
 */
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { DiscordError, discordEditOriginal, discordFollowup, discordVerify } from "@/lib/discord";
import { checklistCardUpdate, type ChecklistTask } from "@/lib/discord-checklist";
import { isTaskDone } from "@/lib/record-tasks";
import { absoluteUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Interaction = {
  type: number; token: string; data?: { custom_id?: string };
  member?: { user?: { id: string; username?: string } }; user?: { id: string; username?: string };
  message?: { embeds?: Parameters<typeof checklistCardUpdate>[0][] };
};

const EPHEMERAL = 64;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();
  if (!discordVerify(raw, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) {
    return NextResponse.json({ error: "invalid request signature" }, { status: 401 });
  }
  let i: Interaction;
  try { i = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (i.type === 1) return NextResponse.json({ type: 1 });   // PING ตอนตั้ง URL ใน Developer Portal

  const customId = i.data?.custom_id ?? "";
  const discordUserId = i.member?.user?.id ?? i.user?.id ?? "";
  if (i.type === 3 && customId.startsWith("rt:") && discordUserId) {
    const taskId = customId.slice(3);
    after(() => toggleTask(i, taskId, discordUserId).catch(async (e) => {
      console.error("[discord] tick", e);
      await discordFollowup(i.token, { content: "ติ๊กไม่สำเร็จ ลองกดใหม่อีกครั้ง", flags: EPHEMERAL }).catch(() => {});
    }));
    return NextResponse.json({ type: 6 });   // DEFERRED_UPDATE_MESSAGE — รับแล้ว เดี๋ยวแก้ข้อความเอง
  }
  return NextResponse.json({ type: 4, data: { content: "ปุ่มนี้ใช้ไม่ได้แล้ว", flags: EPHEMERAL } });
}

async function toggleTask(i: Interaction, taskId: string, discordUserId: string) {
  const admin = supabaseAdmin();

  // 1) ใครกด (ผูกบัญชีหรือยัง)
  const { data: link } = await admin.from("erp_discord_links").select("user_id").eq("discord_user_id", discordUserId).maybeSingle();
  if (!link) {
    await discordFollowup(i.token, {
      content: "ยังไม่ได้ผูกบัญชี Discord กับ ERP — ผูกครั้งเดียว แล้วกดติ๊กได้เลย",
      flags: EPHEMERAL,
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "ผูกบัญชี", url: absoluteUrl("/account/discord") ?? "" }] }],
    });
    return;
  }
  const userId = (link as { user_id: string }).user_id;
  // 2) สิทธิ์ (กฎเดียวกับ erp_can — ฟังก์ชันใน DB)
  const [{ data: can }, { data: prof }] = await Promise.all([
    admin.rpc("erp_can_user", { p_user: userId, p_permission: "products.edit" }),
    admin.from("user_profiles").select("display_name, username, email").eq("id", userId).maybeSingle(),
  ]);
  if (can !== true) {
    await discordFollowup(i.token, { content: "บัญชี ERP ของคุณไม่มีสิทธิ์แก้ใบงาน (products.edit) — ติดต่อแอดมิน", flags: EPHEMERAL });
    return;
  }
  const p = (prof ?? {}) as { display_name?: string | null; username?: string | null; email?: string | null };
  const name = p.display_name || p.username || p.email || "ผู้ใช้";

  // 3) สลับสถานะ
  const { data: task } = await admin.from("erp_record_tasks").select("id, module_key, record_id, title, status").eq("id", taskId).maybeSingle();
  if (!task) {
    await discordFollowup(i.token, { content: "ข้อนี้ถูกลบไปแล้วในระบบ", flags: EPHEMERAL });
    return;
  }
  const t = task as { id: string; module_key: string; record_id: string; title: string; status: string };
  const next = isTaskDone(t.status) ? "open" : "resolved";
  const patch = { status: next, resolved_at: next === "resolved" ? new Date().toISOString() : null, resolved_by: next === "resolved" ? name : null };
  const { error } = await admin.from("erp_record_tasks").update(patch).eq("id", t.id);
  if (error) throw new Error(error.message);
  await writeAudit(admin, { action: "update", entityType: "record_task", entityId: t.id, actorId: userId, actorName: `${name} (Discord)`, metadata: { ...patch, title: t.title, via: "discord" } });

  // 4) แก้การ์ดเดิมให้เป็นสถานะล่าสุด (ทุกข้อของเรคคอร์ดนี้)
  const { data: all } = await admin.from("erp_record_tasks").select("id, title, status, resolved_by")
    .eq("module_key", t.module_key).eq("record_id", t.record_id).order("created_at", { ascending: true });
  try {
    await discordEditOriginal(i.token, checklistCardUpdate(i.message?.embeds?.[0], (all ?? []) as ChecklistTask[]));
  } catch (e) {
    if (!(e instanceof DiscordError)) throw e;
    console.error("[discord] edit card", e.message);
  }
}

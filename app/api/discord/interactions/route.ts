/**
 * 💬 Discord Interactions — Discord เรียกที่นี่เมื่อมีคนกดปุ่ม/เลือกเมนู/ส่งกล่องพิมพ์ในข้อความของบอท (ตั้ง URL นี้ใน Discord Developer Portal)
 * POST /api/discord/interactions  (ไม่ต้องล็อกอิน ERP — ยืนยันด้วยลายเซ็น Ed25519 ของ Discord แทน)
 *
 * ทุกอย่างตอบ Discord ทันที (กันเกิน 3 วิ) แล้วค่อยทำงานต่อเบื้องหลัง (after):
 *   ปุ่มติ๊ก "rt:<id>"            → สลับ ค้าง ⇄ เสร็จ (ผู้รับผิดชอบข้อนั้น หรือคนมีสิทธิ์ products.edit)
 *   ปุ่ม "＋ พิมพ์เพิ่ม" "rta:…"   → เด้งกล่องพิมพ์ทันที (ไม่แตะฐานข้อมูล)
 *   ส่งกล่องพิมพ์ "rtm:…"          → เพิ่มทีละบรรทัด (สูงสุด 10 ข้อ) + ผู้รับผิดชอบจากชื่อที่พิมพ์ (products.edit)
 *   เมนูค่าที่ใช้บ่อย "rtp:…"       → เพิ่มข้อที่เลือก (products.edit)
 *   ยังไม่ผูกบัญชี → ข้อความเห็นคนเดียว + ปุ่มไปผูกบัญชี · ไม่มีสิทธิ์ → แจ้งเห็นคนเดียว
 *   สำเร็จ → บันทึก + audit (via discord) → แก้การ์ดเดิมให้เป็นสถานะล่าสุด (lib/discord-checklist)
 */
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { DiscordError, discordEditOriginal, discordFollowup, discordVerify } from "@/lib/discord";
import { checklistAddModal, checklistCardUpdate, parseChecklistCustomId, type ChecklistTask } from "@/lib/discord-checklist";
import { isTaskDone, linksOf } from "@/lib/record-tasks";
import { absoluteUrl } from "@/lib/app-url";
import { createRecordTasks, findUserByName, isKnownChecklist, loadChecklistPresets, userNames } from "@/lib/record-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Interaction = {
  type: number; token: string;
  data?: { custom_id?: string; values?: string[]; components?: { components?: { custom_id?: string; value?: string }[] }[] };
  member?: { user?: { id: string; username?: string } }; user?: { id: string; username?: string };
  message?: { embeds?: Parameters<typeof checklistCardUpdate>[0][] };
};
type Admin = ReturnType<typeof supabaseAdmin>;

const EPHEMERAL = 64;
const DEFERRED_UPDATE = { type: 6 };   // รับแล้ว เดี๋ยวแก้ข้อความเอง

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
  const fail = (e: unknown, what: string) => {
    console.error(`[discord] ${what}`, e);
    return discordFollowup(i.token, { content: `${what}ไม่สำเร็จ ลองใหม่อีกครั้ง`, flags: EPHEMERAL }).catch(() => {});
  };

  // ── ปุ่ม / เมนู ──
  if (i.type === 3 && discordUserId) {
    if (customId.startsWith("rt:")) {
      const taskId = customId.slice(3);
      after(() => toggleTask(i, taskId, discordUserId).catch((e) => fail(e, "ติ๊ก")));
      return NextResponse.json(DEFERRED_UPDATE);
    }
    const c = parseChecklistCustomId(customId);
    if (c?.kind === "add") {
      // เด้งกล่องพิมพ์ทันที — หัวกล่องใช้รหัสใบงานจากการ์ด (คำแรกของหัวการ์ด)
      const code = (i.message?.embeds?.[0]?.title ?? "").split(/\s+/)[0] || null;
      return NextResponse.json({ type: 9, data: checklistAddModal(c.moduleKey, c.recordId, code) });
    }
    if (c?.kind === "preset") {
      const value = (i.data?.values?.[0] ?? "").trim();
      after(() => addTasks(i, c.moduleKey, c.recordId, value ? [value] : [], "", discordUserId).catch((e) => fail(e, "เพิ่ม")));
      return NextResponse.json(DEFERRED_UPDATE);
    }
  }

  // ── ส่งกล่องพิมพ์ ──
  if (i.type === 5 && discordUserId) {
    const c = parseChecklistCustomId(customId);
    if (c?.kind === "modal") {
      const fields = new Map<string, string>();
      for (const row of i.data?.components ?? []) for (const f of row.components ?? []) if (f.custom_id) fields.set(f.custom_id, f.value ?? "");
      const lines = (fields.get("items") ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      after(() => addTasks(i, c.moduleKey, c.recordId, lines, fields.get("who") ?? "", discordUserId).catch((e) => fail(e, "เพิ่ม")));
      return NextResponse.json(DEFERRED_UPDATE);
    }
  }
  return NextResponse.json({ type: 4, data: { content: "ปุ่มนี้ใช้ไม่ได้แล้ว", flags: EPHEMERAL } });
}

/** คนกดเป็นใครใน ERP (ผูกบัญชีแล้ว) — ยังไม่ผูก = ส่งปุ่มไปผูก (เห็นคนเดียว) แล้วคืน null */
async function erpUser(admin: Admin, i: Interaction, discordUserId: string): Promise<{ id: string; name: string } | null> {
  const { data: link } = await admin.from("erp_discord_links").select("user_id").eq("discord_user_id", discordUserId).maybeSingle();
  if (!link) {
    await discordFollowup(i.token, {
      content: "ยังไม่ได้ผูกบัญชี Discord กับ ERP — ผูกครั้งเดียว แล้วกดได้เลย",
      flags: EPHEMERAL,
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "ผูกบัญชี", url: absoluteUrl("/account/discord") ?? "" }] }],
    });
    return null;
  }
  const userId = (link as { user_id: string }).user_id;
  const { data: prof } = await admin.from("user_profiles").select("display_name, username, email").eq("id", userId).maybeSingle();
  const p = (prof ?? {}) as { display_name?: string | null; username?: string | null; email?: string | null };
  return { id: userId, name: p.display_name || p.username || p.email || "ผู้ใช้" };
}

const canEditSheets = async (admin: Admin, userId: string) =>
  (await admin.rpc("erp_can_user", { p_user: userId, p_permission: "products.edit" })).data === true;

/** แก้การ์ดเดิมให้เป็นสถานะล่าสุด (ทุกข้อของเรคคอร์ดนี้ + ปุ่มพิมพ์เพิ่ม/ค่าที่ใช้บ่อย) */
async function rerenderCard(admin: Admin, i: Interaction, moduleKey: string, recordId: string) {
  const [{ data: all }, presets] = await Promise.all([
    admin.from("erp_record_tasks").select("id, title, status, resolved_by, assigned_to, metadata").eq("module_key", moduleKey).eq("record_id", recordId).order("created_at", { ascending: true }),
    loadChecklistPresets(admin, moduleKey),
  ]);
  const rows = (all ?? []) as (ChecklistTask & { assigned_to: string | null; metadata: unknown })[];
  const names = await userNames(admin, rows.map((r) => r.assigned_to));
  try {
    await discordEditOriginal(i.token, checklistCardUpdate(i.message?.embeds?.[0],
      rows.map((r) => ({ id: r.id, title: r.title, status: r.status, resolved_by: r.resolved_by, assigned_name: r.assigned_to ? names.get(r.assigned_to) ?? null : null, links: linksOf(r.metadata) })),
      isKnownChecklist(moduleKey) ? { moduleKey, recordId, presets } : null));
  } catch (e) {
    if (!(e instanceof DiscordError)) throw e;
    console.error("[discord] edit card", e.message);
  }
}

async function toggleTask(i: Interaction, taskId: string, discordUserId: string) {
  const admin = supabaseAdmin();
  const me = await erpUser(admin, i, discordUserId);
  if (!me) return;
  // สิทธิ์ (กฎเดียวกับ erp_can) · ผู้รับผิดชอบติ๊กข้อของตัวเองได้เสมอ (กฎเดียวกับ PATCH /api/record-tasks/[id])
  const [can, { data: task }] = await Promise.all([
    canEditSheets(admin, me.id),
    admin.from("erp_record_tasks").select("id, module_key, record_id, title, status, assigned_to").eq("id", taskId).maybeSingle(),
  ]);
  if (!task) {
    await discordFollowup(i.token, { content: "ข้อนี้ถูกลบไปแล้วในระบบ", flags: EPHEMERAL });
    return;
  }
  const t = task as { id: string; module_key: string; record_id: string; title: string; status: string; assigned_to: string | null };
  if (!can && t.assigned_to !== me.id) {
    await discordFollowup(i.token, { content: "บัญชี ERP ของคุณไม่มีสิทธิ์แก้ใบงาน (products.edit) — ติดต่อแอดมิน", flags: EPHEMERAL });
    return;
  }
  const next = isTaskDone(t.status) ? "open" : "resolved";
  const patch = { status: next, resolved_at: next === "resolved" ? new Date().toISOString() : null, resolved_by: next === "resolved" ? me.name : null };
  const { error } = await admin.from("erp_record_tasks").update(patch).eq("id", t.id);
  if (error) throw new Error(error.message);
  await writeAudit(admin, { action: "update", entityType: "record_task", entityId: t.id, actorId: me.id, actorName: `${me.name} (Discord)`, metadata: { ...patch, title: t.title, via: "discord" } });
  await rerenderCard(admin, i, t.module_key, t.record_id);
}

/** เพิ่มข้อจาก Discord (กล่องพิมพ์ / เมนูค่าที่ใช้บ่อย) — ต้องผูกบัญชี + products.edit · ชื่อผู้รับผิดชอบหาไม่เจอ = เพิ่มโดยไม่ใส่ชื่อ แล้วบอกคนกด */
async function addTasks(i: Interaction, moduleKey: string, recordId: string, titles: string[], whoRaw: string, discordUserId: string) {
  const admin = supabaseAdmin();
  if (!isKnownChecklist(moduleKey)) {
    await discordFollowup(i.token, { content: "เพิ่มในการ์ดนี้ไม่ได้", flags: EPHEMERAL });
    return;
  }
  const me = await erpUser(admin, i, discordUserId);
  if (!me) return;
  if (!(await canEditSheets(admin, me.id))) {
    await discordFollowup(i.token, { content: "บัญชี ERP ของคุณไม่มีสิทธิ์แก้ใบงาน (products.edit) — ติดต่อแอดมิน", flags: EPHEMERAL });
    return;
  }
  if (!titles.length) {
    await discordFollowup(i.token, { content: "ยังไม่ได้พิมพ์สิ่งที่รอ", flags: EPHEMERAL });
    return;
  }
  const notes: string[] = [];
  let assignee: string | null = null;
  if (whoRaw.trim()) {
    const found = await findUserByName(admin, whoRaw);
    if (found && "id" in found) assignee = found.id;
    else if (found && "error" in found) notes.push(`${found.error} — เพิ่มโดยยังไม่ใส่ผู้รับผิดชอบ (ใส่ได้ในใบงาน)`);
  }
  if (titles.length > 10) notes.push(`เพิ่มได้ครั้งละ 10 ข้อ — เพิ่ม 10 ข้อแรกแล้ว`);
  const rows = await createRecordTasks(admin, { module_key: moduleKey, record_id: recordId, titles, assigned_to: assignee, actor: me, via: "Discord" });
  await rerenderCard(admin, i, moduleKey, recordId);
  if (notes.length) await discordFollowup(i.token, { content: `เพิ่มแล้ว ${rows.length} ข้อ\n${notes.join("\n")}`, flags: EPHEMERAL });
}

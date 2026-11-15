/**
 * ห้องแชทรวม — บันทึกข้อความเข้า/ออก + แจ้งเตือน (server เท่านั้น · ใช้ supabaseAdmin)
 *   ใช้ร่วมทุกช่องทาง: ตัวต่อช่องทางแปลงข้อมูลเป็น ChatInbound แล้วเรียก ingestInbound ที่นี่ที่เดียว
 *   กติกาห้อง (ยังไม่ตอบ / แจ้งเตือนเมื่อไหร่) อยู่ที่ lib/chat/rules.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { bellAllowed } from "@/lib/bell-switch";
import { usersWithPerms } from "@/lib/perm-holders";
import { chatPreview, inboundPatch, outboundPatch, type ConvState } from "./rules";
import type { ChatAttachment, ChatConversation, ChatInbound, ChatSendResult } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

/** คอลัมน์ห้องที่ส่งไปหน้าเว็บได้ (ไม่มีโทเคนลับ) */
export const CONV_COLS = "id, channel, brand_id, account_ref, external_id, customer_name, customer_avatar, assigned_to, assigned_name, status, last_message_at, last_preview, last_direction, waiting_since, unread_count, reply_until, created_at";
/** คอลัมน์ห้องฝั่งเซิร์ฟเวอร์ (มีโทเคนไว้ส่ง/อ่านแล้ว) */
export const CONV_SERVER_COLS = `${CONV_COLS}, reply_token, reply_token_at, read_token, meta`;
export const MSG_COLS = "id, conversation_id, direction, sender_type, text, attachments, external_message_id, sent_by, sent_by_name, sent_at, send_status, send_error, send_via";

export type ConvServerRow = ChatConversation & {
  reply_token: string | null; reply_token_at: string | null; read_token: string | null; meta: Record<string, unknown> | null;
};

/** อีเวนต์แจ้งเตือน (กระดิ่ง → web push ประเภท "แชทลูกค้า" ใน lib/push-categories) */
export const CHAT_BELL_EVENT = "chat.new_message";
const PROFILE_REFRESH_MS = 7 * 24 * 3600_000;

export type CustomerProfile = { name: string | null; avatar: string | null };

/**
 * บันทึกข้อความเข้า 1 ข้อความ (สร้างห้องถ้ายังไม่มี) · ข้อความซ้ำ (แพลตฟอร์มส่งซ้ำ) = ไม่ทำอะไร
 * getProfile = ถามชื่อ/รูปลูกค้าจากแพลตฟอร์ม (เรียกเฉพาะห้องใหม่ หรือข้อมูลเก่าเกิน 7 วัน)
 */
export async function ingestInbound(
  admin: Admin, ev: ChatInbound,
  opts: { brandId: string | null; getProfile?: () => Promise<CustomerProfile | null> },
): Promise<{ conversationId: string | null; inserted: boolean }> {
  const key = { channel: ev.channel, account_ref: ev.accountRef, external_id: ev.externalConvId };
  const findConv = async () => {
    const { data } = await admin.from("chat_conversations").select(CONV_SERVER_COLS)
      .eq("channel", key.channel).eq("account_ref", key.account_ref).eq("external_id", key.external_id).maybeSingle();
    return (data as unknown as ConvServerRow | null) ?? null;
  };

  let conv = await findConv();
  const isNew = !conv;
  if (!conv && ev.kind !== "message") return { conversationId: null, inserted: false };   // เพิ่มเพื่อน/บล็อก ของคนที่ยังไม่เคยทัก = ไม่สร้างห้อง

  const meta = (conv?.meta ?? {}) as Record<string, unknown>;
  const profileAt = Date.parse(String(meta.profile_at ?? ""));
  let profile: CustomerProfile | null = null;
  if (opts.getProfile && (isNew || !Number.isFinite(profileAt) || Date.now() - profileAt > PROFILE_REFRESH_MS)) {
    profile = await opts.getProfile().catch(() => null);
  }

  if (!conv) {
    const { data, error } = await admin.from("chat_conversations").insert({
      ...key, brand_id: opts.brandId, status: "open",
      customer_name: profile?.name ?? null, customer_avatar: profile?.avatar ?? null,
      meta: profile ? { profile_at: new Date().toISOString() } : {},
    }).select(CONV_SERVER_COLS).maybeSingle();
    conv = (data as unknown as ConvServerRow | null) ?? (error ? await findConv() : null);   // ชนกันพร้อมกัน → อ่านแถวที่อีกคำขอสร้าง
    if (!conv) return { conversationId: null, inserted: false };
  }

  const preview = chatPreview(ev.text, ev.attachments);
  const { data: ins } = await admin.from("chat_messages").upsert({
    conversation_id: conv.id, direction: "in", sender_type: ev.kind === "message" ? "customer" : "system",
    text: ev.text, attachments: ev.attachments, external_message_id: ev.externalMessageId,
    sent_at: ev.sentAt, send_status: "received",
  }, { onConflict: "conversation_id,external_message_id", ignoreDuplicates: true }).select("id");
  if (!ins || ins.length === 0) return { conversationId: conv.id, inserted: false };   // ซ้ำ

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let notify = false;
  if (ev.kind === "message") {
    const r = inboundPatch(conv as ConvState, ev.sentAt, preview, ev.channel);
    Object.assign(patch, r.patch);
    notify = r.notify;
  } else {
    patch.meta = { ...meta, ...(patch.meta as object | undefined), blocked: ev.kind === "unfollow" };
  }
  if (ev.replyToken) { patch.reply_token = ev.replyToken; patch.reply_token_at = new Date().toISOString(); }
  if (ev.readToken) patch.read_token = ev.readToken;
  if (!conv.brand_id && opts.brandId) patch.brand_id = opts.brandId;
  if (profile) {
    if (profile.name) patch.customer_name = profile.name;
    if (profile.avatar) patch.customer_avatar = profile.avatar;
    patch.meta = { ...meta, ...(patch.meta as object | undefined), profile_at: new Date().toISOString() };
  }
  await admin.from("chat_conversations").update(patch).eq("id", conv.id);

  if (notify) await notifyWaiting(admin, { ...conv, customer_name: (patch.customer_name as string) ?? conv.customer_name }, preview).catch(() => {});
  return { conversationId: conv.id, inserted: true };
}

/** ลูกค้าเริ่มรอคำตอบ → กระดิ่ง 1 ครั้ง ถึงคนรับผิดชอบห้อง (ยังไม่มี = ทุกคนที่ตอบแชทได้) */
export async function notifyWaiting(admin: Admin, conv: Pick<ChatConversation, "id" | "assigned_to" | "customer_name" | "channel">, preview: string): Promise<void> {
  if (!(await bellAllowed(admin, CHAT_BELL_EVENT))) return;
  const to = conv.assigned_to ? [conv.assigned_to] : await usersWithPerms(admin, ["chat.reply"]);
  if (to.length === 0) return;
  const who = conv.customer_name?.trim() || "ลูกค้า";
  await admin.from("erp_notifications").insert(to.slice(0, 50).map((uid) => ({
    user_id: uid, event_type: CHAT_BELL_EVENT,
    title: `แชทใหม่จาก ${who}`.slice(0, 120), body: preview.slice(0, 200) || null,
    link_url: `/chat?c=${conv.id}`, entity_type: "chat_conversation", entity_id: conv.id, priority: "normal",
  })));
}

/** บันทึกข้อความที่พนักงานส่ง (สำเร็จ/ไม่สำเร็จ) · สำเร็จ = ห้องเป็น "ตอบแล้ว" */
export async function recordOutbound(
  admin: Admin, convId: string,
  m: { text: string | null; attachments: ChatAttachment[]; actorId: string | null; actorName: string | null; result: ChatSendResult },
): Promise<{ id: string | null; sent_at: string }> {
  const at = new Date().toISOString();
  const { data } = await admin.from("chat_messages").insert({
    conversation_id: convId, direction: "out", sender_type: "staff",
    text: m.text, attachments: m.attachments, external_message_id: m.result.externalId ?? null,
    sent_by: m.actorId, sent_by_name: m.actorName, sent_at: at,
    send_status: m.result.ok ? "sent" : "failed", send_error: m.result.ok ? null : m.result.error, send_via: m.result.via,
  }).select("id").maybeSingle();
  if (m.result.ok) {
    await admin.from("chat_conversations").update({ ...outboundPatch(at, chatPreview(m.text, m.attachments)), updated_at: at }).eq("id", convId);
  }
  return { id: (data as { id?: string } | null)?.id ?? null, sent_at: at };
}

/** ห้องที่ลูกค้ายังรอคำตอบ (แท็บแชทในศูนย์แจ้งเตือน / ตัวนับหน้าแบรนด์) */
export async function countWaiting(admin: Admin, brandId?: string | null): Promise<number> {
  let q = admin.from("chat_conversations").select("id", { count: "exact", head: true }).eq("status", "open").not("waiting_since", "is", null);
  if (brandId) q = q.eq("brand_id", brandId);
  const { count } = await q;
  return count ?? 0;
}

/** แถวห้องจาก DB → แบบที่ส่งหน้าเว็บ (ตัดโทเคน · ใส่ชื่อแบรนด์) */
export function toPublicConv(r: Record<string, unknown>): ChatConversation {
  const b = r.brands as { name?: string } | null | undefined;
  const out: Record<string, unknown> = {};
  for (const k of CONV_COLS.split(",").map((s) => s.trim())) out[k] = r[k] ?? null;
  out.unread_count = Number(r.unread_count) || 0;
  out.brand_name = b?.name ?? null;
  return out as unknown as ChatConversation;
}

/**
 * /api/chat/conversations/[id] — ห้องแชท 1 ห้อง
 *   GET   ข้อความ (ล่าสุด 80 · ?before=<sent_at> = เก่ากว่านั้น) + ข้อมูลส่ง (ตอบฟรีได้อีกกี่วิ · โควตา) + สต็อกสินค้าที่คุย · สิทธิ์ chat.view
 *   PATCH { action:"read" }                     เปิดอ่านแล้ว (ล้างตัวนับ + บอกแพลตฟอร์มว่าอ่านแล้ว) · chat.view
 *         { action:"assign", user_id|null }     มอบหมายคนรับผิดชอบ · chat.assign · audit
 *         { action:"status", status:"open"|"done" }  จบห้อง / เปิดกลับ · chat.assign · audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { isUuid, lineCanReplyFree, lineFreeSecondsLeft } from "@/lib/chat/rules";
import { CONV_SERVER_COLS, MSG_COLS, toPublicConv, type ConvServerRow } from "@/lib/chat/store";
import { chatAdapter } from "@/lib/chat/registry";
import { productsInThread } from "@/lib/chat/products";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const PAGE = 80;

async function loadConv(id: string): Promise<(ConvServerRow & { brands?: { name?: string } | null }) | null> {
  const { data } = await supabaseAdmin().from("chat_conversations").select(`${CONV_SERVER_COLS}, brands(name)`).eq("id", id).maybeSingle();
  return (data as unknown as (ConvServerRow & { brands?: { name?: string } | null }) | null) ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "chat.view"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404, headers: NO_STORE });
  const admin = supabaseAdmin();
  const conv = await loadConv(id);
  if (!conv) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404, headers: NO_STORE });

  const before = new URL(request.url).searchParams.get("before");
  let mq = admin.from("chat_messages").select(MSG_COLS).eq("conversation_id", id).order("sent_at", { ascending: false }).limit(PAGE + 1);
  if (before && Number.isFinite(Date.parse(before))) mq = mq.lt("sent_at", new Date(before).toISOString());
  const { data: rows, error } = await mq;
  if (error) return NextResponse.json({ error: "โหลดข้อความไม่สำเร็จ กรุณาลองใหม่" }, { status: 500, headers: NO_STORE });
  const list = ((rows ?? []) as unknown as ChatMessage[]);
  const has_more = list.length > PAGE;
  const messages = list.slice(0, PAGE).reverse().map((m) => ({ ...m, attachments: Array.isArray(m.attachments) ? m.attachments : [] }));

  if (before) return NextResponse.json({ messages, has_more, error: null }, { headers: NO_STORE });

  const adapter = chatAdapter(conv.channel);
  const [quota, products] = await Promise.all([
    adapter?.quota ? adapter.quota(admin, conv).catch(() => null) : Promise.resolve(null),
    productsInThread(admin, messages.map((m) => m.attachments as ChatAttachment[])).catch(() => []),
  ]);
  const isLine = conv.channel === "line";
  const free = isLine && lineCanReplyFree(conv.reply_token_at, !!conv.reply_token);
  return NextResponse.json({
    conversation: toPublicConv(conv as unknown as Record<string, unknown>),
    messages, has_more,
    send: {
      can_send: !!adapter,
      supports: adapter?.supports ?? { image: false, product: false },
      // LINE: ตอบฟรีได้อีกกี่วินาที (0 = ส่งแล้วนับโควตา)
      free_seconds: isLine ? lineFreeSecondsLeft(conv.reply_token_at, !!conv.reply_token) : null,
      counts_quota: isLine ? !free : false,
      quota,
      blocked: (conv.meta as Record<string, unknown> | null)?.blocked === true,
    },
    products,
    error: null,
  }, { headers: NO_STORE });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; user_id?: string | null; status?: string };
  const admin = supabaseAdmin();

  if (body.action === "read") {
    const denied = await guardApi(request, "chat.view"); if (denied) return denied;
    const conv = await loadConv(id);
    if (!conv) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
    if (conv.unread_count > 0) await admin.from("chat_conversations").update({ unread_count: 0 }).eq("id", id);
    const adapter = chatAdapter(conv.channel);
    if (adapter?.markRead && conv.read_token) await adapter.markRead(admin, conv).catch(() => {});
    return NextResponse.json({ ok: true, error: null });
  }

  if (body.action === "assign" || body.action === "status") {
    const denied = await guardApi(request, "chat.assign"); if (denied) return denied;
    const conv = await loadConv(id);
    if (!conv) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
    let patch: Record<string, unknown>;
    if (body.action === "assign") {
      const uid = body.user_id ?? null;
      if (uid !== null && !isUuid(uid)) return NextResponse.json({ error: "ผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
      let name: string | null = null;
      if (uid) {
        const { data: u } = await admin.from("user_profiles").select("display_name, email, active").eq("id", uid).maybeSingle();
        const p = u as { display_name?: string | null; email?: string | null; active?: boolean | null } | null;
        if (!p) return NextResponse.json({ error: "ไม่พบผู้ใช้นี้" }, { status: 400 });
        if (p.active === false) return NextResponse.json({ error: "บัญชีนี้ปิดใช้งานแล้ว เลือกคนอื่น" }, { status: 400 });
        name = p.display_name || p.email || null;
      }
      patch = { assigned_to: uid, assigned_name: name };
    } else {
      if (body.status !== "open" && body.status !== "done") return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
      patch = { status: body.status };
    }
    const { error } = await admin.from("chat_conversations").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    const changes = Object.keys(patch).filter((k) => k !== "assigned_to" || body.action === "assign").map((k) => ({ field: k, old: (conv as unknown as Record<string, unknown>)[k] ?? null, new: patch[k] ?? null }));
    await writeAuditFor(request, admin, {
      action: body.action === "assign" ? "chat.assign" : "chat.status", entityType: "chat_conversation", entityId: id,
      metadata: { name: conv.customer_name ?? "ลูกค้า", channel: conv.channel, changes },
    });
    return NextResponse.json({ ok: true, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}

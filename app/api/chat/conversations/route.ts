/**
 * GET /api/chat/conversations — รายการห้องแชท (หน้า /chat ช่องซ้าย)
 *   ?channel= · ?brand= · ?status=open|done|all (ค่าเริ่ม open) · ?unanswered=1 · ?mine=1 · ?q= · ?limit=
 *   สิทธิ์ chat.view · ไม่ส่งโทเคนลับ · ไม่แคช (ข้อมูลลูกค้า)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { parseChatFilter } from "@/lib/chat/rules";
import { CONV_COLS, countWaiting, toPublicConv } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "chat.view"); if (denied) return denied;
  const f = parseChatFilter(new URL(request.url).searchParams);
  const admin = supabaseAdmin();
  const me = f.mine ? (await requestActor(supabaseFromRequest(request))).id : null;

  let q = admin.from("chat_conversations").select(`${CONV_COLS}, brands(name)`)
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(f.limit);
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.channel) q = q.eq("channel", f.channel);
  if (f.brand) q = q.eq("brand_id", f.brand);
  if (f.unanswered) q = q.eq("status", "open").not("waiting_since", "is", null);
  if (f.mine) q = me ? q.eq("assigned_to", me) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  if (f.q) q = q.or(`customer_name.ilike.%${f.q}%,last_preview.ilike.%${f.q}%`);

  const [{ data, error }, waiting] = await Promise.all([q, countWaiting(admin, f.brand).catch(() => 0)]);
  if (error) return NextResponse.json({ data: [], waiting: 0, error: "โหลดรายการแชทไม่สำเร็จ กรุณาลองใหม่" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map(toPublicConv),
    waiting, error: null,
  }, { headers: NO_STORE });
}

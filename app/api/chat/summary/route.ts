/**
 * GET /api/chat/summary — ห้องที่ลูกค้ายังรอคำตอบ (แท็บ "แชท" ในศูนย์แจ้งเตือน)
 *   ไม่มีสิทธิ์ chat.view = { data: null } (แท็บไม่ขึ้น · ไม่ตอบ 401 ให้ป๊อปเงียบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { CONV_COLS, countWaiting, toPublicConv } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const headers = { "Cache-Control": "no-store" };
  if (!(await apiCan(request, "chat.view"))) return NextResponse.json({ data: null, error: null }, { headers });
  const admin = supabaseAdmin();
  const [{ data }, waiting] = await Promise.all([
    admin.from("chat_conversations").select(`${CONV_COLS}, brands(name)`).eq("status", "open").not("waiting_since", "is", null)
      .order("waiting_since", { ascending: true }).limit(8),
    countWaiting(admin).catch(() => 0),
  ]);
  return NextResponse.json({
    data: { waiting, items: ((data ?? []) as unknown as Record<string, unknown>[]).map(toPublicConv) },
    error: null,
  }, { headers });
}

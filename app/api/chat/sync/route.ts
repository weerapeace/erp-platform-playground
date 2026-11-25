/**
 * POST /api/chat/sync — ดึงแชทใหม่จากร้านค้าออนไลน์ (Shopee / Lazada / TikTok) ที่เปิดรับไว้ · สิทธิ์ chat.view
 *   หน้า /chat เรียกทุก ~30 วิ ตอนเปิดอยู่ — ร้านเดียวกันดึงห่างกันอย่างน้อย 25 วิ (กี่คนเปิดก็ไม่ดึงถี่ขึ้น)
 *   { force: true } = ดึงตอนนี้เลย ไม่รอช่วงห่าง · ต้องมีสิทธิ์ chat.settings (ปุ่มในหน้าตั้งค่า)
 *   ไม่มีร้านเปิดรับ = จบทันที (ไม่เรียกแพลตฟอร์ม)
 * ตัวดึง: lib/chat/shop-sync.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { runShopChatSync } from "@/lib/chat/shop-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "chat.view"); if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const force = body.force === true && await apiCan(request, "chat.settings");
  try {
    const r = await runShopChatSync(supabaseAdmin(), { budgetMs: 22_000, force });
    return NextResponse.json({ ok: true, ...r, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[chat/sync]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "ดึงแชทจากร้านค้าไม่สำเร็จ ระบบจะลองใหม่เอง" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

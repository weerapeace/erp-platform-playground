/**
 * /api/cron/chat-sync — ตัวตั้งเวลาดึงแชทร้านค้าออนไลน์ (vercel.json ทุก 3 นาที)
 *   ให้กระดิ่ง "แชทใหม่" เด้งได้แม้ไม่มีใครเปิดหน้า /chat · ตอนมีคนเปิดหน้า หน้าเว็บดึงเองถี่กว่า (ร้านเดียวกันไม่ดึงซ้อน)
 *   ไม่มีร้านเปิดรับแชท = อ่านค่าตั้ง 1 ครั้งแล้วจบ · ผลรอบล่าสุดดูที่ออฟฟิศทีม AI (recordWorkerRun "chat-sync")
 *   คนกดเอง (chat.settings) = ดูว่าเปิดรับกี่ร้าน ไม่ดึงจริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { enabledShops, runShopChatSync } from "@/lib/chat/shop-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = supabaseAdmin();
  if (!isTrustedCron(request)) {
    const denied = await guardApi(request, "chat.settings"); if (denied) return denied;
    return NextResponse.json({ dry: true, shops: await enabledShops(admin) }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const r = await runShopChatSync(admin, { budgetMs: 50_000 });
    const summary = r.shops === 0 ? "ยังไม่มีร้านเปิดรับแชท"
      : `${r.shops} ร้าน · ข้อความใหม่ ${r.saved}${r.skipped ? ` · ข้าม ${r.skipped} (เพิ่งดึงจากหน้าแชท)` : ""}${r.errors.length ? ` · ติดปัญหา: ${r.errors.join(" | ").slice(0, 300)}` : ""}`;
    await recordWorkerRun(admin, "chat-sync", { ok: true, summary, warn: r.errors.length > 0 });
    return NextResponse.json({ ok: true, ...r, summary });
  } catch (e) {
    const error = e instanceof Error ? e.message : "cron failed";
    await recordWorkerRun(admin, "chat-sync", { ok: false, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

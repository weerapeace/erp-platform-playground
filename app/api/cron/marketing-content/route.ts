/**
 * /api/cron/marketing-content — ดึงรีวิว Shopee + โพสต์ Facebook/Instagram (+ ลองวิดีโอ Shopee) วันละ 2 รอบ 09:00 / 21:00 เวลาไทย (vercel.json "0 2,14 * * *")
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 ข้อ 1, 2, 6) · ทำงานจริงที่ lib/marketing-content-server · ⚠️ อ่านอย่างเดียว
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ marketing.dashboard.view กด "ดึงตอนนี้" (POST)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { syncMarketingContent } from "@/lib/marketing-content-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function run(cron: boolean): Promise<NextResponse> {
  const admin = supabaseAdmin();
  try {
    const s = await syncMarketingContent(admin, { deadline: Date.now() + 45_000 });
    const summary = `รีวิว ${s.reviews.count} · FB ${s.facebook.count} · IG ${s.instagram.count} โพสต์${s.reviews.error ? ` · ${s.reviews.error}` : ""}${s.facebook.error ? ` · ${s.facebook.error}` : ""}`;
    if (cron) await recordWorkerRun(admin, "marketing-content", { ok: true, summary, warn: !!(s.reviews.error || s.facebook.error || s.instagram.error) });
    return NextResponse.json({ ok: true, status: s, summary, error: null });
  } catch (e) {
    console.error("[cron/marketing-content]", e);
    if (cron) await recordWorkerRun(admin, "marketing-content", { ok: false, error: "ดึงรีวิว/โพสต์ไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "ดึงรีวิว/โพสต์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) return NextResponse.json({ error: "ใช้ POST จากแท็บรีวิว/คอนเทนต์" }, { status: 401 });
  return run(true);
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  return run(false);
}

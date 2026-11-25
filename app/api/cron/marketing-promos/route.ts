/**
 * /api/cron/marketing-promos — ดึงรายการโปร Shopee (โค้ดส่วนลด · โปรลดราคา · แฟลชเซล) วันละครั้ง 08:50 เวลาไทย (vercel.json "50 1 * * *")
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 6 ข้อ 1) · ทำงานจริงที่ lib/marketing-promos-server · ⚠️ อ่านจากร้านอย่างเดียว
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ marketing.dashboard.view กด "ดึงตอนนี้" (POST)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { syncShopeePromos } from "@/lib/marketing-promos-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function run(cron: boolean): Promise<NextResponse> {
  const admin = supabaseAdmin();
  try {
    const r = await syncShopeePromos(admin, { deadline: Date.now() + 45_000 });
    const saved = r.reduce((s, x) => s + (x.saved ?? 0), 0);
    const err = r.flatMap((x) => x.errors ?? [])[0];
    const summary = r.length ? `เก็บโปร ${saved} รายการ (${r.length} ร้าน)${err ? ` · ${err}` : ""}` : "ยังไม่มีร้าน Shopee ที่เชื่อมไว้";
    if (cron) await recordWorkerRun(admin, "marketing-promos", { ok: true, summary, warn: !!err });
    return NextResponse.json({ ok: true, results: r, summary, error: null });
  } catch (e) {
    console.error("[cron/marketing-promos]", e);
    if (cron) await recordWorkerRun(admin, "marketing-promos", { ok: false, error: "ดึงรายการโปรไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "ดึงรายการโปรไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) return NextResponse.json({ error: "ใช้ POST จากแท็บโปรโมชั่น" }, { status: 401 });
  return run(true);
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  return run(false);
}

/**
 * /api/cron/marketing-ads — ดึงยอดโฆษณา Shopee Ads + Meta Ads เก็บไว้ (vercel.json วันละ 2 รอบ 08:40 / 20:40 เวลาไทย)
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 ข้อ 1 + 6) · ทำงานจริงที่ lib/marketing-ads-server
 * ⚠️ อ่านจากแพลตฟอร์มอย่างเดียว ไม่แก้งบ/แคมเปญ
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ marketing.dashboard.view กด "ดึงตอนนี้" ในแท็บโฆษณา (POST ?brand_id=)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { syncMetaAds, syncShopeeAds } from "@/lib/marketing-ads-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function run(request: NextRequest, cron: boolean): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim() || null;
  const deadline = Date.now() + 48_000;
  try {
    const shopee = await syncShopeeAds(admin, { deadline: deadline - 12_000, brandId });
    const meta = await syncMetaAds(admin, { deadline, brandId });
    const all = [...shopee, ...meta];
    const ok = all.filter((r) => r.ok), bad = all.filter((r) => !r.ok);
    const summary = all.length
      ? `ดึงได้ ${ok.length}/${all.length} บัญชี · ${ok.reduce((s, r) => s + (r.rows ?? 0), 0)} แถว${bad.length ? ` · ไม่สำเร็จ: ${bad[0].error}` : ""}`
      : "ยังไม่มีบัญชีโฆษณาที่เชื่อมไว้";
    if (cron) await recordWorkerRun(admin, "marketing-ads", { ok: true, summary, warn: bad.length > 0 });
    return NextResponse.json({ ok: true, results: all, summary, error: null });
  } catch (e) {
    console.error("[cron/marketing-ads]", e);
    if (cron) await recordWorkerRun(admin, "marketing-ads", { ok: false, error: "ดึงยอดโฆษณาไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "ดึงยอดโฆษณาไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) return NextResponse.json({ error: "ใช้ POST จากแท็บโฆษณา" }, { status: 401 });
  return run(request, true);
}

/** ปุ่ม "ดึงตอนนี้" — อ่านจากแพลตฟอร์มอย่างเดียว จึงใช้สิทธิ์ดูหน้าการตลาด */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  return run(request, false);
}

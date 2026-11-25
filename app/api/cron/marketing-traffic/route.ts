/**
 * /api/cron/marketing-traffic — เก็บยอดสะสมต่อสินค้า Shopee (คนดู/กดถูกใจ/ขาย/ดาว/รีวิว) ทุกคืน 00:05 เวลาไทย (vercel.json "5 17 * * *")
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 4 ข้อ 1) · ทำงานจริงที่ lib/marketing-traffic-server
 * รันหลังเที่ยงคืน → จดเป็นยอด "สิ้นวันเมื่อวาน" · ⚠️ อ่านจากร้านอย่างเดียว
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ marketing.dashboard.view กด "เก็บตอนนี้" (POST · จดเป็นยอดของวันนี้ ณ ตอนกด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { bkkYmd } from "@/lib/platform-dashboard-calc";
import { snapshotShopeeItems } from "@/lib/marketing-traffic-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function run(cron: boolean, asOf?: string): Promise<NextResponse> {
  const admin = supabaseAdmin();
  try {
    const r = await snapshotShopeeItems(admin, { deadline: Date.now() + 50_000, asOf });
    const summary = r.brands ? `เก็บยอด ${r.saved}/${r.items} สินค้า (${r.brands} ร้าน)${r.errors.length ? ` · ${r.errors[0]}` : ""}` : "ยังไม่มีร้าน Shopee ที่เชื่อมไว้";
    if (cron) await recordWorkerRun(admin, "marketing-traffic", { ok: r.saved > 0 || !r.items, summary, warn: r.errors.length > 0 });
    return NextResponse.json({ ok: true, ...r, summary, error: null });
  } catch (e) {
    console.error("[cron/marketing-traffic]", e);
    if (cron) await recordWorkerRun(admin, "marketing-traffic", { ok: false, error: "เก็บยอดคนดูไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "เก็บยอดคนดูไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) return NextResponse.json({ error: "ใช้ POST จากแท็บคนเข้าร้าน" }, { status: 401 });
  return run(true);
}

/** ปุ่ม "เก็บตอนนี้" — จดเป็นยอดของวันนี้ (ใช้เริ่มเก็บวันแรก) · อ่านจากร้านอย่างเดียว */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  return run(false, bkkYmd(Date.now()) as string);
}

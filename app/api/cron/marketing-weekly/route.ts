/**
 * /api/cron/marketing-weekly — สรุปการตลาดรายสัปดาห์ ทุกวันจันทร์ (vercel.json "30 1 * * 1" = 08:30 เวลาไทย)
 * เจ้าของเลือก 2026-11-27 (แผนการตลาด รอบ 8 ข้อ 3)
 *   สร้างใบของ "สัปดาห์ที่แล้ว" 1 ใบ (ทุกแบรนด์รวม) + บทสรุปจาก AI → กระดิ่งถึงคนรับตามกฎ "marketing.weekly" (ไม่มีกฎ = แอดมิน)
 *   มีใบสัปดาห์นั้นแล้ว (มีคนกดสร้างไปก่อน) = ไม่สร้างซ้ำ (ไม่เสียค่า AI) แค่แจ้ง · ไม่ส่ง LINE (มีตัวเลขยอดขาย)
 *   ใบรายแบรนด์ กดสร้างเองที่แท็บสรุปสัปดาห์
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ products.platforms.edit เรียกเอง (POST) = สร้างทันที ไม่ส่งกระดิ่ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { ruleRecipients } from "@/lib/notify-recipients";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { bkkYmd } from "@/lib/platform-dashboard-calc";
import { lastFullWeek, pctChange, weekLabel, type WeeklyData } from "@/lib/marketing-weekly-calc";
import { generateWeeklyReport } from "@/lib/marketing-weekly-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const EVENT = "marketing.weekly";

async function run(request: NextRequest, cron: boolean): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const note = (r: { ok: boolean; summary?: string; error?: string; warn?: boolean }) => (cron ? recordWorkerRun(admin, "marketing-weekly", r) : Promise.resolve());
  const weekStart = lastFullWeek(bkkYmd(Date.now()) as string);
  try {
    const { data: exist } = await admin.from("marketing_weekly_reports").select("id, data, ai_summary").eq("week_start", weekStart).is("brand_id", null).eq("is_active", true).maybeSingle();
    let row = exist as { id: string; data: WeeklyData; ai_summary: string | null; ai_error?: string | null } | null;
    let made = false;
    if (!row) {
      row = await generateWeeklyReport(admin, weekStart, null, { userId: null, source: "cron" }) as unknown as typeof row;
      made = true;
    }
    if (!cron) return NextResponse.json({ ok: true, made, id: row?.id ?? null, error: null });

    const { ids } = await ruleRecipients(admin, EVENT);
    let sent = 0;
    if (ids.length && row) {
      const d = row.data;
      const ch = pctChange(d.sales.cur, d.sales.prev);
      const title = `สรุปการตลาด ${weekLabel(weekStart)} พร้อมแล้ว`;
      const body = [
        `ยอดขาย ฿${Math.round(d.sales.cur).toLocaleString("en-US")}${ch == null ? "" : ` (${ch >= 0 ? "+" : ""}${Math.round(ch * 100)}% จากสัปดาห์ก่อน)`}`,
        row.ai_summary ? row.ai_summary.slice(0, 280) : "บทสรุปจาก AI ยังไม่มี — เปิดแท็บสรุปสัปดาห์เพื่อดูตัวเลข",
      ].join("\n");
      const { error } = await admin.rpc("erp_notify", {
        p_user_ids: ids, p_event_type: EVENT, p_title: title, p_body: body,
        p_link_url: `/marketing/dashboard?tab=weekly`, p_entity_type: "marketing_weekly_report", p_entity_id: row.id, p_priority: "normal",
      });
      if (error) { console.error("[cron/marketing-weekly] erp_notify:", error.message); await note({ ok: false, error: "สร้างใบแล้ว แต่ส่งกระดิ่งไม่สำเร็จ" }); return NextResponse.json({ ok: false, error: "ส่งกระดิ่งไม่สำเร็จ" }, { status: 500 }); }
      sent = ids.length;
    }
    const aiErr = (row as { ai_error?: string | null } | null)?.ai_error;
    await note({ ok: true, warn: !!aiErr, summary: `${made ? "สร้าง" : "มีอยู่แล้ว"}ใบ ${weekLabel(weekStart)}${aiErr ? ` (AI: ${aiErr.slice(0, 80)})` : ""} · แจ้ง ${sent} คน` });
    return NextResponse.json({ ok: true, made, sent, error: null });
  } catch (e) {
    console.error("[cron/marketing-weekly]", e);
    await note({ ok: false, error: "สร้างสรุปสัปดาห์ไม่สำเร็จ" });
    return NextResponse.json({ ok: false, error: "สร้างสรุปสัปดาห์ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run(request, true);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  return run(request, false);
}

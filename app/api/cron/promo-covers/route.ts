/**
 * /api/cron/promo-covers — ตัวตั้งเวลาเปลี่ยนปกโปร (vercel.json ทุก 15 นาที)
 *   ส่งปกโปรของชุดที่ถึงเวลาเริ่ม (TikTok/Lazada ล่วงหน้าตามที่ตั้ง) · ย้อนปกเดิมของชุดที่ถึงเวลาจบ · แจ้งกระดิ่งรายการที่ล้มเหลว
 *   เช็กซ้ำหลังย้อน: TikTok (หลัง 1 ชม.) / Lazada (หลัง 24 ชม.) ดูบนร้านว่าปกเดิมขึ้นจริง — ค้าง = ย้อนไม่ผ่าน + แจ้งเตือน
 *   ไม่มีงานถึงเวลา = อ่านฐานข้อมูล 1 ครั้งแล้วจบ (ไม่แตะร้าน)
 *   คนกดเอง (products.platforms.view) = ดูว่ามีงานรอกี่ชุด ไม่ทำจริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { runPromoCovers, verifyReverts } from "@/lib/promo-cover-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  const admin = supabaseAdmin();
  if (!cron) {
    const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
    const { data } = await admin.from("promo_cover_campaigns").select("id, name, status, starts_at, ends_at").in("status", ["scheduled", "live"]).is("deleted_at", null);
    return NextResponse.json({ dry: true, campaigns: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const actor = { id: null, name: "ตัวตั้งเวลาเปลี่ยนปกโปร" };
    const started = Date.now();
    const r = await runPromoCovers(admin, { budgetMs: 230_000, actor });
    // เช็กซ้ำหลังย้อน (TikTok/Lazada) ด้วยเวลาที่เหลือ
    const v = await verifyReverts(admin, { budgetMs: Math.max(10_000, 270_000 - (Date.now() - started)), actor });
    const busy = r.applied + r.reverted + r.failed + r.conflict;
    const main = busy ? `ส่งปกโปร ${r.applied} · ย้อนปกเดิม ${r.reverted} · ไม่ผ่าน ${r.failed} · มีคนเปลี่ยนปกเอง ${r.conflict}${r.remaining ? ` · ค้าง ${r.remaining} (ทำต่อรอบหน้า)` : ""}` : `ไม่มีงานถึงเวลา (${r.campaigns} ชุดที่รอ/กำลังใช้)`;
    const check = v.checked ? ` · เช็กหลังย้อน ${v.checked} (ปกเดิมขึ้นแล้ว ${v.ok} · ร้านยังตรวจ ${v.waiting} · ค้าง ${v.stuck})` : "";
    const summary = main + check;
    await recordWorkerRun(admin, "promo-covers", { ok: true, summary, warn: r.failed > 0 || r.conflict > 0 || v.stuck > 0 });
    return NextResponse.json({ ok: true, ...r, verify: v, summary });
  } catch (e) {
    const error = e instanceof Error ? e.message : "cron failed";
    await recordWorkerRun(admin, "promo-covers", { ok: false, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

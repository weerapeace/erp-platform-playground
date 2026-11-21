/**
 * /api/cron/parent-computed-sync — เขียน Platform Description / สรุปขนาด ของทุก Parent SKU ลงคอลัมน์ตามสูตร (เจ้าของสั่ง "แก้ที่ต้นทาง" 2026-11-21)
 * vercel.json 20:20 UTC = 03:20 เวลาไทย · ทำไม/กติกา: lib/parent-computed-sync · ตัวทำงาน: lib/parent-computed-sync-server
 *
 * GET  ตัวตั้งเวลา (Vercel Cron)          → เขียนจริงทุกรุ่น
 * GET  คนมีสิทธิ์ products.edit กดเปิดเอง → ลองดูอย่างเดียว (ตัวเลข + ตัวอย่างก่อน/หลัง) ไม่เขียน
 * POST คนมีสิทธิ์ products.edit           → เขียนจริงทุกรุ่น (เติมย้อนหลังครั้งแรก) · body { ids?: string[] } = เฉพาะบางรุ่น
 * ไม่แตะร้าน · ค่าเดิมเก็บในประวัติเวอร์ชัน (ย้อนได้) · ลำดับ "แก้ล่าสุด" ไม่สลับ (ทริกเกอร์คง updated_at)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { syncParentComputedTexts, type ParentComputedSyncResult } from "@/lib/parent-computed-sync-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const WORKER = "parent-computed-sync";
const summaryOf = (r: ParentComputedSyncResult) =>
  `${r.dryRun ? "ลองดู: " : ""}เทียบ ${r.checked} รุ่น · ${r.dryRun ? "จะเปลี่ยน" : "เปลี่ยน"} ${r.changed} รุ่น${r.failed ? ` · พลาด ${r.failed}` : ""}${r.keptBlank ? ` · สูตรได้ค่าว่าง คงข้อความเดิม ${r.keptBlank}` : ""}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "products.edit"); if (denied) return denied; }
  const admin = supabaseAdmin();
  try {
    const r = await syncParentComputedTexts(admin, { dryRun: !cron, source: "cron", sampleLimit: cron ? 0 : 20 });
    if (cron) await recordWorkerRun(admin, WORKER, { ok: r.failed === 0, warn: r.failed > 0, summary: summaryOf(r) });
    return NextResponse.json({ ok: true, summary: summaryOf(r), ...r });
  } catch (e) {
    const msg = (e as Error).message || "ทำงานไม่สำเร็จ";
    if (cron) await recordWorkerRun(admin, WORKER, { ok: false, error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : undefined;
  if (Array.isArray(body.ids) && !ids?.length) return NextResponse.json({ ok: false, error: "ไม่มีรหัสสินค้าที่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const r = await syncParentComputedTexts(admin, { ids, source: "manual", actorId: user?.id ?? null, actorName: user?.email ?? null });
    if (!ids) await recordWorkerRun(admin, WORKER, { ok: r.failed === 0, warn: r.failed > 0, summary: `${summaryOf(r)} (กดเอง)` });
    return NextResponse.json({ ok: true, summary: summaryOf(r), ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || "ทำงานไม่สำเร็จ" }, { status: 500 });
  }
}

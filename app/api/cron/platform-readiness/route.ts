/**
 * /api/cron/platform-readiness — ตรวจ "พร้อมลงร้าน" ล่วงหน้าทุกคืน (เช็กข้ามร้าน ข้อ 6 · เจ้าของเลือก 2026-11-20)
 * vercel.json: ทุก 30 นาที ช่วง 17:00-21:30 UTC (= 00:00-04:30 เวลาไทย · 10 รอบ/คืน)
 *
 * ทำอะไร: ทุกแบรนด์ที่มีบัญชีร้าน → หารุ่นที่ "ยังไม่ลง" บางร้าน (กฎเดียวกับหน้าเช็กข้ามร้าน lib/platform-cross-shop)
 *   → ตรวจด้วยตัวตรวจตัวเดียวกับตัวช่วยลงสินค้า (lib/platform-create-readiness-server) เฉพาะร้านที่ขาด
 *   → จดลง platform_create_readiness (lib/platform-readiness-store) · ป้าย "พร้อมลง" + ตัวกรอง "พร้อมลงเลย" ขึ้นทันที
 * ตัวที่ตรวจนานสุดก่อน · ตรวจแล้วใน 20 ชม. = ข้าม · ทีละ 2 รุ่น (ถามร้านจริง กันโดนจำกัดความถี่) · รอบละไม่เกิน ~4 นาที
 * อ่านอย่างเดียว ไม่ส่งอะไรขึ้นร้าน · ไม่สร้างร่าง
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ products.platforms.edit กดเอง (?dry=1 = ดูว่าจะตรวจกี่รุ่น ไม่ตรวจจริง · ?brand_id= = แบรนด์เดียว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { loadCrossShop } from "@/lib/platform-cross-shop-server";
import { activeShops, listableMissing } from "@/lib/platform-cross-shop";
import { checkCreateReadiness, readinessCodes } from "@/lib/platform-create-readiness-server";
import { isReady, saveReadiness } from "@/lib/platform-readiness-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const FRESH_MS = 20 * 3600_000;
const CONCURRENCY = 2;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied; }
  const sp = new URL(request.url).searchParams;
  const dry = sp.get("dry") === "1";
  const onlyBrand = (sp.get("brand_id") ?? "").trim();
  const t0 = Date.now();
  const admin = supabaseAdmin();
  try {
    // แบรนด์ที่มีบัญชีร้าน
    let brandIds: string[] = [];
    if (onlyBrand) brandIds = [onlyBrand];
    else {
      const { data } = await admin.from("platform_accounts").select("brand_id").eq("is_active", true);
      brandIds = [...new Set(((data ?? []) as { brand_id: string | null }[]).map((a) => a.brand_id).filter((x): x is string => !!x))];
    }

    // รุ่นที่ขาดบางร้าน + ผลตรวจเดิม → เรียงตัวที่ตรวจนานสุดก่อน
    type Job = { parentId: string; codes: string[]; oldest: number };
    const jobs: Job[] = [];
    for (const b of brandIds) {
      const d = await loadCrossShop(admin, b, { suggest: false, stock: false });
      const on = activeShops(d.shops).map((s) => s.code);
      for (const r of d.rows) {
        const codes = readinessCodes(listableMissing(r, on));
        if (!codes.length) continue;
        const ats = codes.map((c) => (r.ready?.[c]?.at ? Date.parse(r.ready[c].at) : 0));
        const oldest = Math.min(...ats);
        if (Date.now() - oldest < FRESH_MS) continue;
        jobs.push({ parentId: r.id, codes, oldest });
      }
    }
    jobs.sort((a, b) => a.oldest - b.oldest);
    if (dry) return NextResponse.json({ ok: true, dry, brands: brandIds.length, todo: jobs.length, error: null });

    let done = 0, ready = 0, failed = 0, i = 0;
    const worker = async () => {
      while (i < jobs.length && Date.now() - t0 < BUDGET_MS) {
        const job = jobs[i++];
        const res = await checkCreateReadiness(admin, job.parentId, job.codes, null);
        await saveReadiness(admin, job.parentId, res);
        done++;
        if (res.length && res.every(isReady)) ready++;
        if (res.some((r) => r.error)) failed++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const left = jobs.length - done;
    const summary = jobs.length ? `ตรวจ ${done} รุ่น · พร้อมลงครบ ${ready}${failed ? ` · ร้านตอบช้า ${failed}` : ""}${left ? ` · เหลือรอบหน้า ${left}` : " · ครบแล้ว"}` : "ไม่มีรุ่นที่ต้องตรวจ (ตรวจครบในวันนี้แล้ว)";
    if (cron) await recordWorkerRun(admin, "platform-readiness", { ok: true, summary, warn: failed > done / 2 && done > 0 });
    return NextResponse.json({ ok: true, done, ready, failed, left, error: null });
  } catch (e) {
    console.error("[cron/platform-readiness]", e instanceof Error ? e.message : e);
    if (cron) await recordWorkerRun(admin, "platform-readiness", { ok: false, error: e instanceof Error ? e.message : "cron failed" });
    return NextResponse.json({ ok: false, error: cron ? "cron failed" : e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}

/**
 * /api/cron/platform-drift — เทียบ "ร้านที่ลงขายแล้ว ตรงกับระบบไหม" (รูป/รายละเอียด/ชื่อตัวเลือก/ราคา) ล่วงหน้าทุกคืน
 * เจ้าของเลือก 2026-11-21 (ข้อ 2 เช็กข้ามร้าน: เรื่องตรวจ "ตรงกับระบบ") · vercel.json: นาที 15,45 ช่วง 17-21 UTC (= 00:15-04:45 เวลาไทย · 10 รอบ/คืน)
 *
 * ทำอะไร: รายการบนร้านที่จับคู่สินค้าแล้ว + ยังอยู่บนร้าน (Shopee/Lazada/TikTok/LINE ของแบรนด์ที่มีบัญชีร้าน)
 *   → ตัวที่ยังไม่เคยเทียบก่อน แล้วค่อยตัวที่เทียบนานสุด (เทียบแล้วไม่ถึง 60 ชม. = ข้าม)
 *   → เทียบด้วยตัวตรวจกลาง lib/platform-listing-drift-server (ดึงสดทั้งระบบ+ร้าน) → จดลง platform_listing_drift
 * ทีละ 2 รายการ (ถามร้านจริง กันโดนจำกัดความถี่) · รอบละไม่เกิน ~4 นาที · อ่านอย่างเดียว ไม่ส่งอะไรขึ้นร้าน
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) · คนมีสิทธิ์ products.platforms.edit กดเอง (?dry=1 = ดูว่าจะเทียบกี่รายการ · ?brand_id= = แบรนด์เดียว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { DRIFT_PLATFORMS, checkListingDrift } from "@/lib/platform-listing-drift-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const FRESH_MS = 60 * 3600_000;
const CONCURRENCY = 2;
const PAGE = 1000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied; }
  const sp = new URL(request.url).searchParams;
  const dry = sp.get("dry") === "1";
  const onlyBrand = (sp.get("brand_id") ?? "").trim();
  const t0 = Date.now();
  const admin = supabaseAdmin();
  try {
    let brandIds: string[] = [];
    if (onlyBrand) brandIds = [onlyBrand];
    else {
      const { data } = await admin.from("platform_accounts").select("brand_id").eq("is_active", true);
      brandIds = [...new Set(((data ?? []) as { brand_id: string | null }[]).map((a) => a.brand_id).filter((x): x is string => !!x))];
    }
    const { data: pfs } = await admin.from("erp_platforms").select("id, code").in("code", [...DRIFT_PLATFORMS]);
    const pfIds = ((pfs ?? []) as { id: string }[]).map((p) => p.id);

    // รายการที่จับคู่แล้ว + ยังอยู่บนร้าน
    const listings: string[] = [];
    if (brandIds.length && pfIds.length) {
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await admin.from("platform_catalog_listings").select("id, status")
          .in("platform_id", pfIds).in("brand_id", brandIds).not("matched_parent_sku_id", "is", null)
          .order("id").range(from, from + PAGE - 1);
        if (error) throw new Error(`อ่านรายการบนร้านไม่สำเร็จ: ${error.message}`);
        const rows = (data ?? []) as { id: string; status: string | null }[];
        for (const r of rows) if (!isGoneStatus(r.status)) listings.push(r.id);
        if (rows.length < PAGE) break;
      }
    }
    // ผลเทียบเดิม
    const at = new Map<string, number>();
    for (let i = 0; i < listings.length; i += 300) {
      const { data } = await admin.from("platform_listing_drift").select("listing_id, checked_at").in("listing_id", listings.slice(i, i + 300));
      for (const r of (data ?? []) as { listing_id: string; checked_at: string }[]) at.set(r.listing_id, Date.parse(r.checked_at));
    }
    const jobs = listings.map((id) => ({ id, oldest: at.get(id) ?? 0 })).filter((j) => Date.now() - j.oldest >= FRESH_MS).sort((a, b) => a.oldest - b.oldest);
    if (dry) return NextResponse.json({ ok: true, dry, brands: brandIds.length, listings: listings.length, todo: jobs.length, error: null });

    let done = 0, diff = 0, failed = 0, i = 0;
    const worker = async () => {
      while (i < jobs.length && Date.now() - t0 < BUDGET_MS) {
        const job = jobs[i++];
        const r = await checkListingDrift(admin, job.id, null);
        done++;
        if (!r.ok) failed++;
        else if (r.issues.length) diff++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const left = jobs.length - done;
    const summary = jobs.length ? `เทียบ ${done} รายการ · ไม่ตรงระบบ ${diff}${failed ? ` · เทียบไม่ได้ ${failed}` : ""}${left ? ` · เหลือรอบหน้า ${left}` : " · ครบแล้ว"}` : "ไม่มีรายการที่ต้องเทียบ (เทียบครบแล้ว)";
    if (cron) await recordWorkerRun(admin, "platform-drift", { ok: true, summary, warn: failed > done / 2 && done > 0 });
    return NextResponse.json({ ok: true, done, diff, failed, left, error: null });
  } catch (e) {
    console.error("[cron/platform-drift]", e instanceof Error ? e.message : e);
    if (cron) await recordWorkerRun(admin, "platform-drift", { ok: false, error: e instanceof Error ? e.message : "cron failed" });
    return NextResponse.json({ ok: false, error: cron ? "cron failed" : e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}

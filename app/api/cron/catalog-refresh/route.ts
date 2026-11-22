/**
 * /api/cron/catalog-refresh — อัปเดตรายการสินค้าบนร้าน Lazada / Shopee "เฉพาะตัวที่เปลี่ยน" + LINE SHOPPING ทั้งร้าน ทุกชั่วโมง
 * เจ้าของเลือก 2026-11-21 ข้อ 1 (บั๊ก LY22: ลง Lazada ผ่านทางอื่นแล้ว แต่ระบบไม่รู้ เพราะรายการร้านอัปเดตเฉพาะตอนกดดึงสินค้า)
 * vercel.json "40 * * * *" · ทุกแบรนด์ที่เชื่อม Lazada / Shopee → refreshShopChanged (app/api/platform-catalog/refresh-changed)
 *   ต่อจากรอบก่อน (รอบค้างทำต่อ) · บันทึกผลรอบ recordWorkerRun "catalog-refresh" (ออฟฟิศทีม AI)
 * เข้าได้: ตัวตั้งเวลา (isTrustedCron) · คนที่มีสิทธิ์ products.platforms.edit = โหมดดู (ไม่ดึง บอกว่าจะดึงร้านไหน)
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { shopeeConfigured } from "@/lib/shopee";
import { getPlatformId } from "../../lazada/shared";
import { lazadaConnectedBrandIds } from "../../lazada/orders-sync";
import { shopeeConnectedBrandIds } from "../../shopee/orders-sync";
import { lineConnectedBrandIds } from "../../line-shopping/orders-sync";
import { refreshShopChanged, type RefreshPlatform, type RefreshResult } from "../../platform-catalog/refresh-changed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;
const ROUND_END_MS = 270_000;
const PER_SHOP_MS = 90_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cron = isTrustedCron(request);
  if (!cron) { const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied; }
  const admin = supabaseAdmin();
  const lzId = await getPlatformId(admin, "lazada");
  const spId = shopeeConfigured() ? await getPlatformId(admin, "shopee") : null;
  const lsId = await getPlatformId(admin, "line_shopping");
  const jobs: { platform: RefreshPlatform; brandId: string }[] = [
    ...(lzId ? (await lazadaConnectedBrandIds(admin, lzId).catch(() => [] as string[])).map((b) => ({ platform: "lazada" as const, brandId: b })) : []),
    ...(spId ? (await shopeeConnectedBrandIds(admin, spId).catch(() => [] as string[])).map((b) => ({ platform: "shopee" as const, brandId: b })) : []),
    // LINE: ดึงทั้งร้านทุกรอบ (ไม่มีตัวกรองเฉพาะตัวที่เปลี่ยน · ~10 ครั้ง/ร้าน/ชั่วโมง ไม่ชนโควตา) — เจ้าของอนุมัติ 2026-11-22
    ...(lsId ? (await lineConnectedBrandIds(admin, lsId).catch(() => [] as string[])).map((b) => ({ platform: "line_shopping" as const, brandId: b })) : []),
  ];
  if (!cron) return NextResponse.json({ ok: true, dry: true, shops: jobs });

  const startedAt = Date.now();
  const results: RefreshResult[] = [];
  for (const j of jobs) {
    const left = ROUND_END_MS - (Date.now() - startedAt);
    const budget = Math.min(PER_SHOP_MS, left - 15_000);
    if (budget < 10_000) break;   // เวลารอบหมด — รอบหน้าทำต่อ (ต่อจากรอบก่อนเสมอ)
    results.push(await refreshShopChanged(admin, { platform: j.platform, brandId: j.brandId, budgetMs: budget }));
  }
  const failed = results.filter((r) => !r.ok);
  const saved = results.reduce((a, r) => a + r.saved, 0);
  const newly = results.reduce((a, r) => a + r.newly_matched, 0);
  const pending = results.filter((r) => r.ok && !r.done).length + (jobs.length - results.length);
  await recordWorkerRun(admin, "catalog-refresh", {
    ok: failed.length === 0,
    summary: `${results.length}/${jobs.length} ร้าน · อัปเดต ${saved} รายการ · จับคู่ใหม่ ${newly}${pending ? ` · ค้างทำต่อรอบหน้า ${pending}` : ""}`,
    ...(failed.length ? { error: failed.map((r) => `${r.platform}: ${r.error}`).join(" · ").slice(0, 400) } : {}),
  });
  return NextResponse.json({ ok: failed.length === 0, results });
}

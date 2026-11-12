/**
 * /api/cron/tiktok-orders — ตัวดึงออเดอร์ TikTok อัตโนมัติ (pg_cron เรียกทุก 30 นาที)
 *   ทุกแบรนด์ที่เชื่อม TikTok ไว้ → ดึงออเดอร์ที่ "เปลี่ยนสถานะ" ใน 3 ชม.ล่าสุด (ซ้อนกันได้ บันทึกซ้ำไม่ซ้ำใบ) → platform_orders
 *   ใช้ตัวกลางเดียวกับปุ่ม (../../tiktok-shop/orders-sync) · บันทึกผลรอบด้วย recordWorkerRun "tiktok-orders"
 *   ⚠️ ยังไม่ได้ลงทะเบียนใน lib/ai-office (OFFICE_WORKERS) เพราะออฟฟิศพิกเซลโต๊ะเต็ม 20/20 (SCENE_DESKS) — ต้องให้เจ้าของตัดสินใจขยายฉากก่อน
 * เข้าได้ 3 ทาง:
 *   1. pg_cron + pg_net: header x-cron-token = โทเคนใน Supabase Vault (ชื่อ tiktok_orders_cron) — ตรวจผ่าน RPC erp_cron_token_ok
 *   2. Authorization: Bearer CRON_SECRET (เรียกทดสอบ)
 *   3. คนที่มีสิทธิ์ platform_orders.manage = โหมดดู (ไม่ดึง บอกแค่จะดึงแบรนด์ไหน)
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน TikTok
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { getPlatformId, ttsTokenOrReason, ttsConnectedBrandIds } from "../../tiktok-shop/shared";
import { syncTiktokOrders, TTS_ORDER_SOURCE } from "../../tiktok-shop/orders-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const WINDOW_SEC = 3 * 3600;   // รอบละ 30 นาที แต่ย้อน 3 ชม. — รอบไหนล้มรอบถัดไปยังเก็บตก

async function authorized(request: NextRequest): Promise<"cron" | "dry" | null> {
  const admin = supabaseAdmin();
  const token = request.headers.get("x-cron-token");
  if (token) {
    const { data } = await admin.rpc("erp_cron_token_ok", { p_name: "tiktok_orders_cron", p_token: token });
    if (data === true) return "cron";
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return "cron";
  const denied = await guardApi(request, "platform_orders.manage");
  return denied ? null : "dry";
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const mode = await authorized(request);
  if (!mode) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();
  const ttId = await getPlatformId(admin, "tiktok");
  if (!ttId) return NextResponse.json({ ok: false, error: "ยังไม่มีแพลตฟอร์ม TikTok ในระบบ" }, { status: 400 });
  const brands = await ttsConnectedBrandIds(admin, ttId);
  if (mode === "dry") return NextResponse.json({ ok: true, dry: true, brands: brands.length });

  const updateTimeGe = Math.floor(Date.now() / 1000) - WINDOW_SEC;
  const results: { brand_id: string; ok: boolean; created?: number; updated?: number; error?: string }[] = [];
  for (const brandId of brands) {
    const tok = await ttsTokenOrReason(admin, brandId, ttId, null);
    if (!tok.ok) { results.push({ brand_id: brandId, ok: false, error: tok.reason }); continue; }
    const shop = tok.meta.shops?.[0];
    if (!shop?.cipher) { results.push({ brand_id: brandId, ok: false, error: "ยังไม่รู้รหัสร้าน (กด ตรวจการเชื่อมต่อ)" }); continue; }
    const r = await syncTiktokOrders(admin, { platformId: ttId, brandId, accessToken: tok.accessToken, shop, window: { updateTimeGe }, timeBudgetMs: 45_000 });
    results.push({ brand_id: brandId, ok: !r.stop_reason, created: r.created, updated: r.updated, ...(r.stop_reason ? { error: r.stop_reason } : {}) });
    // บันทึกประวัติเฉพาะรอบที่มีออเดอร์ใหม่หรือมีปัญหา (รอบปกติ ~48 ครั้ง/วัน ไม่ต้องรก audit)
    if (r.created > 0 || r.stop_reason) {
      const { sample: _sample, ...counts } = r;
      await writeAudit(admin, {
        action: "import", entityType: "platform_orders", entityId: null, actorId: null, actorName: "tiktok_orders_cron",
        metadata: { source: TTS_ORDER_SOURCE, auto: true, shop: shop.name, brand_id: brandId, window_hours: WINDOW_SEC / 3600, ...counts },
      });
    }
  }
  const failed = results.filter((x) => !x.ok);
  const created = results.reduce((a, x) => a + (x.created ?? 0), 0);
  const updated = results.reduce((a, x) => a + (x.updated ?? 0), 0);
  await recordWorkerRun(admin, "tiktok-orders", {
    ok: failed.length === 0,
    summary: brands.length === 0 ? "ยังไม่มีแบรนด์ไหนเชื่อม TikTok" : `ออเดอร์ใหม่ ${created} · อัปเดตสถานะ ${updated}`,
    ...(failed.length ? { error: failed.map((f) => f.error).join(" · ").slice(0, 300) } : {}),
  });
  return NextResponse.json({ ok: failed.length === 0, brands: brands.length, created, updated, results });
}

export const GET = handle;
export const POST = handle;

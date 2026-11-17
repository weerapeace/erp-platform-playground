/**
 * /api/cron/tiktok-orders — ตัวดึงออเดอร์ TikTok อัตโนมัติ (pg_cron เรียกทุก 15 นาที · เจ้าของเลือก 2026-11-12)
 *   ทุกแบรนด์ที่เชื่อม TikTok ไว้ → ดึงออเดอร์ที่ "เปลี่ยนสถานะ" ใน 1 ชม.ล่าสุด (ซ้อนกันได้ บันทึกซ้ำไม่ซ้ำใบ) → platform_orders
 *   ใช้ตัวกลางเดียวกับปุ่ม (../../tiktok-shop/orders-sync) · บันทึกผลรอบด้วย recordWorkerRun "tiktok-orders"
 *   ⚠️ ยังไม่ได้ลงทะเบียนใน lib/ai-office (OFFICE_WORKERS) เพราะออฟฟิศพิกเซลโต๊ะเต็ม 20/20 (SCENE_DESKS) — ต้องให้เจ้าของตัดสินใจขยายฉากก่อน
 * เข้าได้ 3 ทาง:
 *   1. pg_cron + pg_net: header x-cron-token = โทเคนใน Supabase Vault (ชื่อ tiktok_orders_cron) — ตรวจผ่าน RPC erp_cron_token_ok
 *   2. Authorization: Bearer CRON_SECRET (เรียกทดสอบ)
 *   3. คนที่มีสิทธิ์ platform_orders.manage = โหมดดู (ไม่ดึง บอกแค่จะดึงแบรนด์ไหน)
 * + 2026-11-13 (เจ้าของ "ตามแนะนำเลย"): ต่อท้ายด้วยดึงสินค้า "เฉพาะตัวที่เปลี่ยน" ใน 1 ชม.ล่าสุด (../../tiktok-shop/products-sync)
 *   → เปิดขาย/เผยแพร่/ปิดขายใน Seller Center แล้ว สถานะใน ERP ตามเองภายใน ~15 นาที (ใช้ตัวตั้งเวลาเดิม ไม่ต้องเพิ่มใน DB)
 * + 2026-11-14 (เจ้าของ "เริ่มเฟส 3" Shopee): ต่อท้ายด้วยดึงออเดอร์ Shopee ที่ "เปลี่ยนสถานะ" ใน 3 ชม.ล่าสุด ของทุกแบรนด์ที่เชื่อม Shopee
 *   (../../shopee/orders-sync · ใช้ตัวตั้งเวลาเดิม ไม่เพิ่มงานใน DB / ไม่เพิ่มคนในออฟฟิศ AI) · Shopee พลาดไม่ทำให้ส่วน TikTok ล้ม
 *   ออเดอร์ Shopee ของแบรนด์ที่เชื่อมแล้วไม่บันทึกจากเมลอีก (lib/platform-email/server) → ตัวนี้คือทางเข้าหลัก จึงย้อน 3 ชม. เผื่อรอบที่ล้ม
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน TikTok / Shopee
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recordWorkerRun } from "@/lib/ai-office-runs";
import { getPlatformId, ttsTokenOrReason, ttsConnectedBrandIds } from "../../tiktok-shop/shared";
import { syncTiktokOrders, TTS_ORDER_SOURCE } from "../../tiktok-shop/orders-sync";
import { syncTiktokProductsChanged } from "../../tiktok-shop/products-sync";
import { shopeeConfigured } from "@/lib/shopee";
import { shopeeTokenOrReason } from "../../shopee/shared";
import { syncShopeeOrders, shopeeConnectedBrandIds, fillShopeeTracking, SHOPEE_ORDER_SOURCE } from "../../shopee/orders-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const WINDOW_SEC = 3600;   // รอบละ 15 นาที แต่ย้อน 1 ชม. — รอบไหนล้มรอบถัดไปยังเก็บตก
const SHOPEE_WINDOW_SEC = 3 * 3600;   // Shopee: ทางเข้าหลัก (ไม่มีเมลสำรองแล้ว) → ย้อน 3 ชม.

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
  const spId = shopeeConfigured() ? await getPlatformId(admin, "shopee") : null;
  const shopeeBrands = spId ? await shopeeConnectedBrandIds(admin, spId) : [];
  if (mode === "dry") return NextResponse.json({ ok: true, dry: true, brands: brands.length, shopee_brands: shopeeBrands.length });
  const startedAt = Date.now();

  const updateTimeGe = Math.floor(Date.now() / 1000) - WINDOW_SEC;
  const results: { brand_id: string; ok: boolean; created?: number; updated?: number; products?: number; error?: string }[] = [];
  for (const brandId of brands) {
    const tok = await ttsTokenOrReason(admin, brandId, ttId, null);
    if (!tok.ok) { results.push({ brand_id: brandId, ok: false, error: tok.reason }); continue; }
    const shop = tok.meta.shops?.[0];
    if (!shop?.cipher) { results.push({ brand_id: brandId, ok: false, error: "ยังไม่รู้รหัสร้าน (กด ตรวจการเชื่อมต่อ)" }); continue; }
    const r = await syncTiktokOrders(admin, { platformId: ttId, brandId, accessToken: tok.accessToken, shop, window: { updateTimeGe }, timeBudgetMs: 45_000 });
    // สินค้าที่เปลี่ยนใน 1 ชม.ล่าสุด (สถานะ/ราคา/ชื่อ) — พลาดไม่ทำให้รอบออเดอร์ล้ม (บอกใน error)
    const ps = await syncTiktokProductsChanged(admin, { platformId: ttId, brandId, accessToken: tok.accessToken, cipher: shop.cipher, updateTimeGe, timeBudgetMs: 25_000 });
    const errs = [r.stop_reason, ps.stop_reason ? `สินค้า: ${ps.stop_reason}` : null].filter(Boolean).join(" · ");
    results.push({ brand_id: brandId, ok: !errs, created: r.created, updated: r.updated, products: ps.saved, ...(errs ? { error: errs } : {}) });
    // บันทึกประวัติเฉพาะรอบที่มีออเดอร์ใหม่หรือมีปัญหา (รอบปกติ ~48 ครั้ง/วัน ไม่ต้องรก audit)
    if (r.created > 0 || r.stop_reason) {
      const { sample: _sample, ...counts } = r;
      await writeAudit(admin, {
        action: "import", entityType: "platform_orders", entityId: null, actorId: null, actorName: "tiktok_orders_cron",
        metadata: { source: TTS_ORDER_SOURCE, auto: true, shop: shop.name, brand_id: brandId, window_hours: WINDOW_SEC / 3600, ...counts },
      });
    }
  }
  // ── Shopee: ออเดอร์ที่เปลี่ยนสถานะใน 3 ชม.ล่าสุด (เวลาที่เหลือของรอบ · ≤ 30 วิ/แบรนด์) ──
  const shopee: { brand_id: string; ok: boolean; created?: number; updated?: number; tracking_filled?: number; tracking_error?: string; error?: string }[] = [];
  if (spId) {
    const nowSec = Math.floor(Date.now() / 1000);
    // เวลาที่เหลือของรอบ (maxDuration 120 วิ · เผื่อ 10 วิให้ recordWorkerRun ทำงานเสมอ) — TikTok ใช้ได้ถึง ~85 วิ/แบรนด์ (session TikTok เตือน 2026-11-14)
    const leftMs = () => 110_000 - (Date.now() - startedAt);
    for (const brandId of shopeeBrands) {
      if (leftMs() < 15_000) { shopee.push({ brand_id: brandId, ok: false, error: "เวลารอบหมดก่อนถึง Shopee (รอบถัดไปเก็บตก — ย้อน 3 ชม.)" }); continue; }
      const tok = await shopeeTokenOrReason(admin, brandId, spId, null);
      if (!tok.ok) { shopee.push({ brand_id: brandId, ok: false, error: tok.reason }); continue; }
      const budget = Math.min(30_000, leftMs() - 10_000);
      if (budget < 5_000) { shopee.push({ brand_id: brandId, ok: false, error: "เวลารอบหมดก่อนถึง Shopee (รอบถัดไปเก็บตก — ย้อน 3 ชม.)" }); continue; }
      const r = await syncShopeeOrders(admin, { platformId: spId, brandId, accessToken: tok.accessToken, shopId: tok.shopId, window: { field: "update_time", from: nowSec - SHOPEE_WINDOW_SEC, to: nowSec }, timeBudgetMs: budget });
      // เลขพัสดุ (สถานีแพ็คยิงใบปะหน้า) — เวลาที่เหลือ ≤ 20 วิ · พลาดไม่ทำให้รอบนี้ล้ม (รอบหน้าทำต่อ)
      const tb = Math.min(20_000, leftMs() - 10_000);
      const tr = tb > 3_000 ? await fillShopeeTracking(admin, { platformId: spId, brandId, accessToken: tok.accessToken, shopId: tok.shopId, timeBudgetMs: tb }) : null;
      shopee.push({ brand_id: brandId, ok: !r.stop_reason, created: r.created, updated: r.updated, tracking_filled: tr?.filled ?? 0, ...(tr?.error ? { tracking_error: tr.error } : {}), ...(r.stop_reason ? { error: `Shopee: ${r.stop_reason}` } : {}) });
      if (r.created > 0 || r.stop_reason) {
        const { sample: _s, ...counts } = r;
        await writeAudit(admin, {
          action: "import", entityType: "platform_orders", entityId: null, actorId: null, actorName: "shopee_orders_cron",
          metadata: { source: SHOPEE_ORDER_SOURCE, auto: true, shop_id: tok.shopId, brand_id: brandId, window_hours: SHOPEE_WINDOW_SEC / 3600, ...counts },
        });
      }
    }
  }

  // ok = ส่วน TikTok เท่านั้น (เหมือนเดิม) · Shopee มีปัญหา = warn + เหตุผลต่อท้ายสรุป (ไม่ทำให้คน TikTok ในออฟฟิศขึ้นแดง)
  const failed = results.filter((x) => !x.ok);
  const spFailed = shopee.filter((x) => !x.ok);
  const created = results.reduce((a, x) => a + (x.created ?? 0), 0);
  const updated = results.reduce((a, x) => a + (x.updated ?? 0), 0);
  const spCreated = shopee.reduce((a, x) => a + (x.created ?? 0), 0);
  const spUpdated = shopee.reduce((a, x) => a + (x.updated ?? 0), 0);
  const spTrack = shopee.reduce((a, x) => a + (x.tracking_filled ?? 0), 0);
  const spTrackErr = shopee.find((x) => x.tracking_error)?.tracking_error;
  const spNote = shopeeBrands.length ? ` · Shopee ใหม่ ${spCreated} อัปเดต ${spUpdated} เลขพัสดุ +${spTrack}${spTrackErr ? ` (เลขพัสดุ: ${spTrackErr.slice(0, 80)})` : ""}${spFailed.length ? ` ⚠️ ${spFailed.map((f) => f.error).join(" · ").slice(0, 160)}` : ""}` : "";
  await recordWorkerRun(admin, "tiktok-orders", {
    ok: failed.length === 0, warn: spFailed.length > 0,
    summary: (brands.length === 0 ? "ยังไม่มีแบรนด์ไหนเชื่อม TikTok" : `ออเดอร์ใหม่ ${created} · อัปเดตสถานะ ${updated} · สินค้าที่เปลี่ยน ${results.reduce((a, x) => a + (x.products ?? 0), 0)}`) + spNote,
    ...(failed.length ? { error: failed.map((f) => f.error).join(" · ").slice(0, 300) } : {}),
  });
  return NextResponse.json({ ok: failed.length === 0, brands: brands.length, created, updated, results, shopee: { ok: spFailed.length === 0, brands: shopeeBrands.length, created: spCreated, updated: spUpdated, results: shopee } });
}

export const GET = handle;
export const POST = handle;

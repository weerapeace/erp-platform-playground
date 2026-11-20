// ตัวดึงออเดอร์ "ทีละร้าน" — ใช้ร่วม: ตัวดึงอัตโนมัติ /api/cron/tiktok-orders (Lazada · LINE SHOPPING · เว็บไซต์) + ปุ่ม "ดึงตอนนี้" (/api/platform-orders/pull ทุกร้าน)
// เจ้าของเลือก 2026-11-20 (widget หน้าสถานะดึงออเดอร์ ข้อ 1, 3, 4, 5) · จดผลทุกรอบด้วย recordShopPull → หน้าสถานะ /master/platform-orders/pull-status
// แยกจาก route.ts (route ต้อง export แค่ handler) · ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { recordShopPull } from "@/lib/order-pull-server";
import type { PullPlatform } from "@/lib/order-pull-health";
import { shopeeConfigured } from "@/lib/shopee";
import { lineApiKey } from "@/lib/line-shopping-server";
import { mirrorWebshopOrders } from "@/lib/webshop-order-mirror";
import { getPlatformId, lazTokenOrReason } from "../lazada/shared";
import { syncLazadaOrders, LAZADA_ORDER_SOURCE } from "../lazada/orders-sync";
import { syncLineOrders, LINE_ORDER_SOURCE } from "../line-shopping/orders-sync";
import { shopeeTokenOrReason } from "../shopee/shared";
import { syncShopeeOrders, SHOPEE_ORDER_SOURCE } from "../shopee/orders-sync";
import { ttsTokenOrReason } from "../tiktok-shop/shared";
import { syncTiktokOrders, TTS_ORDER_SOURCE } from "../tiktok-shop/orders-sync";

export type PullOutcome = { platform: PullPlatform; brand_id: string | null; ok: boolean; created: number; updated: number; error: string | null; done: boolean };

/**
 * ดึงออเดอร์ของ 1 ร้านที่ "เปลี่ยนสถานะ" ใน windowSec วินาทีล่าสุด แล้วจดผล
 * manual = กดจากหน้าสถานะ (จด audit ทุกครั้ง) · อัตโนมัติ = จด audit เฉพาะรอบที่มีออเดอร์ใหม่หรือมีปัญหา
 */
export async function pullShop(admin: SupabaseClient, args: { platform: PullPlatform; brandId: string | null; windowSec: number; budgetMs: number; manual?: boolean; actorId?: string | null; actorName?: string | null }): Promise<PullOutcome> {
  const { platform, brandId, windowSec, budgetMs } = args;
  const fail = async (error: string): Promise<PullOutcome> => {
    await recordShopPull(admin, platform, brandId, { ok: false, error, manual: args.manual });
    return { platform, brand_id: brandId, ok: false, created: 0, updated: 0, error, done: false };
  };
  const platformId = await getPlatformId(admin, platform);
  if (!platformId) return fail(`ไม่พบแพลตฟอร์ม ${platform} ในระบบ`);
  if (platform !== "website" && !brandId) return fail("ไม่ได้ระบุแบรนด์");
  const nowSec = Math.floor(Date.now() / 1000);
  const fromIso = new Date((nowSec - windowSec) * 1000).toISOString();

  let r: { ok: boolean; created: number; updated: number; error: string | null; done: boolean; extra?: Record<string, unknown> };
  try {
    if (platform === "lazada") {
      const tok = await lazTokenOrReason(admin, brandId as string, platformId, args.actorId ?? null);
      if (!tok.ok) return fail(tok.reason);
      const x = await syncLazadaOrders(admin, { platformId, brandId: brandId as string, accessToken: tok.accessToken, gateway: tok.gateway, window: { updatedAfter: fromIso }, timeBudgetMs: budgetMs });
      r = { ok: !x.stop_reason, created: x.created, updated: x.updated, error: x.stop_reason, done: x.done, extra: { source: LAZADA_ORDER_SOURCE, from_email: x.from_email, items_replaced: x.items_replaced, items_matched: x.items_matched } };
    } else if (platform === "line_shopping") {
      const k = await lineApiKey(admin, brandId, platformId);
      if (!k.apiKey) return fail(k.error ?? "ไม่มีกุญแจ LINE SHOPPING");
      const x = await syncLineOrders(admin, { platformId, brandId: brandId as string, apiKey: k.apiKey, sinceIso: fromIso, timeBudgetMs: budgetMs });
      r = { ok: !x.stop_reason, created: x.created, updated: x.updated, error: x.stop_reason, done: x.done, extra: { source: LINE_ORDER_SOURCE, shape: x.created > 0 ? x.shape : undefined } };
    } else if (platform === "website") {
      const x = await mirrorWebshopOrders(admin, { platformId });
      r = { ok: !x.stop_reason, created: x.created, updated: x.updated, error: x.stop_reason, done: true, extra: { source: "webshop", checked: x.checked } };
    } else if (platform === "shopee") {
      if (!shopeeConfigured()) return fail("ยังไม่ได้ตั้งกุญแจแอป Shopee ในระบบ");
      const tok = await shopeeTokenOrReason(admin, brandId as string, platformId, args.actorId ?? null);
      if (!tok.ok) return fail(tok.reason);
      const x = await syncShopeeOrders(admin, { platformId, brandId: brandId as string, accessToken: tok.accessToken, shopId: tok.shopId, window: { field: "update_time", from: nowSec - Math.min(windowSec, 15 * 86400), to: nowSec }, timeBudgetMs: budgetMs });
      r = { ok: !x.stop_reason, created: x.created, updated: x.updated, error: x.stop_reason, done: x.done, extra: { source: SHOPEE_ORDER_SOURCE } };
    } else {
      const tok = await ttsTokenOrReason(admin, brandId as string, platformId, args.actorId ?? null);
      if (!tok.ok) return fail(tok.reason);
      const shop = tok.meta.shops?.[0];
      if (!shop?.cipher) return fail("ยังไม่รู้รหัสร้าน TikTok (กด ตรวจการเชื่อมต่อ ที่หน้าบัญชีแพลตฟอร์ม)");
      const x = await syncTiktokOrders(admin, { platformId, brandId: brandId as string, accessToken: tok.accessToken, shop, window: { updateTimeGe: nowSec - windowSec }, timeBudgetMs: budgetMs });
      r = { ok: !x.stop_reason, created: x.created, updated: x.updated, error: x.stop_reason, done: x.done, extra: { source: TTS_ORDER_SOURCE } };
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "ดึงไม่สำเร็จ (ไม่ทราบสาเหตุ)");
  }

  await recordShopPull(admin, platform, brandId, { ok: r.ok, created: r.created, updated: r.updated, error: r.error, manual: args.manual });
  if (args.manual || r.created > 0 || r.error) {
    await writeAudit(admin, {
      action: "import", entityType: "platform_orders", entityId: null, actorId: args.actorId ?? null, actorName: args.actorName ?? `${platform}_orders_${args.manual ? "pull_now" : "cron"}`,
      metadata: { platform, brand_id: brandId, auto: !args.manual, window_hours: Math.round((windowSec / 3600) * 10) / 10, created: r.created, updated: r.updated, error: r.error, ...r.extra },
    });
  }
  return { platform, brand_id: brandId, ok: r.ok, created: r.created, updated: r.updated, error: r.error, done: r.done };
}

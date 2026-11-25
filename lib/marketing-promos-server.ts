/**
 * ดึง + เก็บรายการโปรโมชั่น Shopee (ของกลาง · server เท่านั้น) — ใช้ที่ /api/cron/marketing-promos + ปุ่ม "ดึงตอนนี้" ในแท็บโปรโมชั่น
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 6 ข้อ 1) · ที่เก็บ marketing_promotions · ⚠️ อ่านจากร้านอย่างเดียว ไม่สร้าง/แก้โปร
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { shopeeErrorText } from "@/lib/shopee";
import { shopeeDiscounts, shopeeFlashSales, shopeeVouchers, type PromoRow } from "@/lib/shopee-promos";
import { getPlatformId, shopeeTokenOrReason } from "@/app/api/shopee/shared";
import { shopeeConnectedBrandIds } from "@/app/api/shopee/orders-sync";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function syncShopeePromos(admin: Admin, opts: { deadline: number }): Promise<{ brand_id: string; ok: boolean; saved?: number; errors?: string[] }[]> {
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return [];
  const out: { brand_id: string; ok: boolean; saved?: number; errors?: string[] }[] = [];
  for (const brandId of await shopeeConnectedBrandIds(admin, spId)) {
    if (Date.now() > opts.deadline) { out.push({ brand_id: brandId, ok: false, errors: ["หมดเวลารอบนี้"] }); continue; }
    const tok = await shopeeTokenOrReason(admin, brandId, spId, null);
    if (!tok.ok) { out.push({ brand_id: brandId, ok: false, errors: [tok.reason] }); continue; }
    const rows: PromoRow[] = [];
    const errors: string[] = [];
    for (const [label, fn] of [["โค้ดส่วนลด", shopeeVouchers], ["โปรลดราคา", shopeeDiscounts], ["แฟลชเซล", shopeeFlashSales]] as const) {
      try { rows.push(...(await fn(tok))); } catch (e) { errors.push(`${label}: ${shopeeErrorText(e)}`); }
    }
    const now = new Date().toISOString();
    const payload = rows.map((r) => ({ ...r, platform: "shopee", brand_id: brandId, account_id: String(tok.shopId), updated_at: now }));
    let saved = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await admin.from("marketing_promotions").upsert(payload.slice(i, i + 500), { onConflict: "platform,kind,promo_id" });
      if (error) { errors.push(error.message); break; }
      saved += Math.min(500, payload.length - i);
    }
    out.push({ brand_id: brandId, ok: errors.length < 3, saved, ...(errors.length ? { errors } : {}) });
  }
  return out;
}

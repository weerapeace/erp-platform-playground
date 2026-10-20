/**
 * 🚚 วิธีจัดส่งของเว็บร้าน — อ่าน/เขียน store_settings key "shipping_methods" (JSON ก้อนเดียวต่อร้าน)
 * กติกา/คิดค่าส่ง = lib/website-shipping.ts (pure · มิเรอร์ไปเว็บร้าน)
 * ใช้ที่: /api/website/shipping (แท็บ 🚚 การจัดส่ง) · /api/public/storefront/site (ส่งให้เว็บร้าน) · createStorefrontOrder (คิดค่าส่งจริง)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { readSiteInfo, type SiteInfo } from "@/lib/website-site-info";
import { normalizeShipping, visibleMethods, type ShippingConfig } from "@/lib/website-shipping";

type Admin = ReturnType<typeof supabaseAdmin>;

export const SHIPPING_KEY = "shipping_methods";

/** config ของร้าน (ยังไม่ตั้ง = 1 วิธีจากค่าส่งเหมาเดิม) */
export async function readShipping(sb: Admin, shopId: string, info?: SiteInfo): Promise<ShippingConfig> {
  const [{ data }, si] = await Promise.all([
    sb.from("store_settings").select("value").eq("shop_id", shopId).eq("key", SHIPPING_KEY).maybeSingle(),
    info ? Promise.resolve(info) : readSiteInfo(sb, shopId),
  ]);
  return normalizeShipping((data as { value?: unknown } | null)?.value ?? null, si);
}

export async function saveShipping(sb: Admin, shopId: string, cfg: ShippingConfig): Promise<{ error: string | null }> {
  const value = JSON.stringify({ methods: cfg.methods, remotePostals: cfg.remotePostals });
  const { error } = await sb.from("store_settings").upsert({ shop_id: shopId, key: SHIPPING_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });
  return { error: error?.message ?? null };
}

/** ส่งให้เว็บร้าน: เฉพาะวิธีที่เปิด (ค่าส่งไม่ใช่ความลับ — ลูกค้าเห็นอยู่แล้ว) */
export function publicShipping(cfg: ShippingConfig): ShippingConfig {
  return { methods: visibleMethods(cfg), remotePostals: cfg.remotePostals, ...(cfg.legacy ? { legacy: true } : {}) };
}

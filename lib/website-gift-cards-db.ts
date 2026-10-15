/**
 * 🎴 การ์ดของขวัญ — อ่าน/เขียนค่าที่ร้านตั้ง (store_settings key "gift_cards" เก็บ JSON ก้อนเดียว)
 * กฎ/ชนิด/ตัววาด: lib/website-gift-cards.ts (pure ใช้ได้ทั้ง client/server)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeGiftCards, type GiftCardConfig } from "@/lib/website-gift-cards";

type Admin = ReturnType<typeof supabaseAdmin>;
export const GIFT_CARDS_KEY = "gift_cards";

export async function readGiftCards(sb: Admin, shopId: string): Promise<GiftCardConfig> {
  const { data } = await sb.from("store_settings").select("value").eq("shop_id", shopId).eq("key", GIFT_CARDS_KEY).maybeSingle();
  return normalizeGiftCards((data as { value?: string } | null)?.value ?? null);
}

export async function writeGiftCards(sb: Admin, shopId: string, cfg: GiftCardConfig): Promise<{ error: unknown }> {
  const { error } = await sb
    .from("store_settings")
    .upsert({ shop_id: shopId, key: GIFT_CARDS_KEY, value: JSON.stringify(cfg), updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });
  return { error };
}

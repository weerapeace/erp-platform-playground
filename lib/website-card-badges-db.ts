/**
 * 🏷 ป้ายบนการ์ดของร้าน — อ่าน/เขียน store_settings "card_badges" + เปลี่ยนชื่อป้ายในสินค้าที่ใช้อยู่ตาม
 * กฎ/ชนิด: lib/website-card-badges.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { CARD_BADGES_KEY, badgeRenames, normalizeCardBadges, type CardBadge } from "@/lib/website-card-badges";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function readCardBadges(sb: Admin, shopId: string): Promise<CardBadge[]> {
  const { data } = await sb.from("store_settings").select("value").eq("shop_id", shopId).eq("key", CARD_BADGES_KEY).maybeSingle();
  return normalizeCardBadges((data as { value?: string } | null)?.value ?? null);
}

/** หลายร้านทีเดียว (products API / หน้าต่างสินค้าที่แสดงทุกร้าน) */
export async function readCardBadgesMany(sb: Admin, shopIds: string[]): Promise<Map<string, CardBadge[]>> {
  const out = new Map<string, CardBadge[]>(shopIds.map((id) => [id, normalizeCardBadges(null)]));
  if (!shopIds.length) return out;
  const { data } = await sb.from("store_settings").select("shop_id, value").eq("key", CARD_BADGES_KEY).in("shop_id", shopIds);
  for (const r of (data ?? []) as { shop_id: string; value: string | null }[]) out.set(r.shop_id, normalizeCardBadges(r.value));
  return out;
}

/** บันทึกรายการ + เปลี่ยนชื่อป้ายในสินค้าที่ใช้ชื่อเดิม → คืนจำนวนสินค้าที่เปลี่ยนชื่อป้ายตาม */
export async function writeCardBadges(sb: Admin, shopId: string, list: CardBadge[]): Promise<{ error: unknown; renamed: number; renames: { from: string; to: string }[] }> {
  const before = await readCardBadges(sb, shopId);
  const { error } = await sb
    .from("store_settings")
    .upsert({ shop_id: shopId, key: CARD_BADGES_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });
  if (error) return { error, renamed: 0, renames: [] };
  const renames = badgeRenames(before, list);
  let renamed = 0;
  for (const r of renames) {
    const { data } = await sb.from("store_listings").update({ web_badge: r.to, updated_at: new Date().toISOString() }).eq("shop_id", shopId).eq("web_badge", r.from).select("parent_sku_id");
    renamed += (data ?? []).length;
  }
  return { error: null, renamed, renames };
}

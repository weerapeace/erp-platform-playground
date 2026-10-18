/**
 * 📏 ตารางไซส์ของร้าน — อ่าน/เขียน store_settings "size_guides" · กฎ/ชนิด: lib/website-size-guides.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { SIZE_GUIDES_KEY, normalizeSizeGuides, type SizeGuide } from "@/lib/website-size-guides";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function readSizeGuides(sb: Admin, shopId: string): Promise<SizeGuide[]> {
  const { data } = await sb.from("store_settings").select("value").eq("shop_id", shopId).eq("key", SIZE_GUIDES_KEY).maybeSingle();
  return normalizeSizeGuides((data as { value?: string } | null)?.value ?? null);
}

/** หลายร้านทีเดียว (แท็บ 🛍 ใน Parent SKU แสดงทุกร้าน) */
export async function readSizeGuidesMany(sb: Admin, shopIds: string[]): Promise<Map<string, SizeGuide[]>> {
  const out = new Map<string, SizeGuide[]>(shopIds.map((id) => [id, []]));
  if (!shopIds.length) return out;
  const { data } = await sb.from("store_settings").select("shop_id, value").eq("key", SIZE_GUIDES_KEY).in("shop_id", shopIds);
  for (const r of (data ?? []) as { shop_id: string; value: string | null }[]) out.set(r.shop_id, normalizeSizeGuides(r.value));
  return out;
}

export async function writeSizeGuides(sb: Admin, shopId: string, list: SizeGuide[]): Promise<{ error: unknown }> {
  const { error } = await sb
    .from("store_settings")
    .upsert({ shop_id: shopId, key: SIZE_GUIDES_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });
  return { error: error ?? null };
}

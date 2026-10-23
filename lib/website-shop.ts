/**
 * หาร้านจาก slug (ของกลางฝั่งเซิร์ฟเวอร์) — เดิมทุก route ของเว็บไซต์เขียน sb.from("shops")...eq("slug") เอง
 *
 *   const shop = await shopBySlug<{ id: string; name: string }>(sb, p.get("shop"), "id, name");
 *   if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
 *
 *   // API สาธารณะของเว็บร้าน: ร้านที่ปิด (status ≠ active) = ไม่พบ
 *   const shop = await activeShopBySlug(sb, body.shop);
 *
 * - slug ตัดช่องว่างหัวท้ายให้ · ว่าง/ไม่ใช่ข้อความ = null (ไม่ยิง query)
 * - cols = คอลัมน์ที่ต้องใช้ (ต้องมี id) — ข้อความแจ้ง "ไม่พบร้าน" ให้แต่ละ route ตอบเอง (ภาษา/รูปแบบต่างกัน)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type ShopRow = { id: string };

export async function shopBySlug<T extends ShopRow = ShopRow>(sb: SupabaseClient, slug: unknown, cols = "id"): Promise<T | null> {
  const s = typeof slug === "string" ? slug.trim() : "";
  if (!s) return null;
  const { data } = await sb.from("shops").select(cols).eq("slug", s).maybeSingle();
  return (data as T | null) ?? null;
}

/** ร้านที่เปิดขายอยู่ (status = "active") — ไม่พบ หรือร้านปิด = null */
export async function activeShopBySlug<T extends ShopRow = ShopRow>(sb: SupabaseClient, slug: unknown, cols = "id"): Promise<(T & { status: string }) | null> {
  const withStatus = /(^|,)\s*status\s*(,|$)/.test(cols) ? cols : `${cols}, status`;
  const shop = await shopBySlug<T & { status: string }>(sb, slug, withStatus);
  return shop && shop.status === "active" ? shop : null;
}

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

/**
 * 🌐 origin ที่เว็บร้านส่งมา (ลิงก์ในอีเมล / ที่อยู่ callback ของ OAuth) ต้องเป็นโดเมนของร้านนี้ (shop_domains) — กันพาไปเว็บปลอม
 * https เท่านั้น · รับทั้งมี/ไม่มี www · เครื่อง dev (NODE_ENV=development) อนุญาต localhost · ไม่ผ่าน = null
 */
export async function trustedShopOrigin(sb: SupabaseClient, shopId: string, raw: unknown): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(String(raw ?? ""));
  } catch {
    return null;
  }
  if (process.env.NODE_ENV === "development" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return u.origin;
  if (u.protocol !== "https:") return null;
  const { data } = await sb.from("shop_domains").select("domain").eq("shop_id", shopId);
  const hosts = ((data ?? []) as { domain: string }[]).map((d) => d.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase());
  const host = u.hostname.toLowerCase();
  return hosts.some((h) => h === host || `www.${h}` === host || h === `www.${host}`) ? u.origin : null;
}

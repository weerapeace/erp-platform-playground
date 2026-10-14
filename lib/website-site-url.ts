/**
 * ที่อยู่เว็บจริงของแต่ละร้าน (ฝั่งเซิร์ฟเวอร์) — อ่านจาก shop_domains
 * ใช้ร่วม: แท็บ 🛍 เว็บไซต์ ใน Parent SKU · หน้า "สินค้าบนเว็บ" · ดีไซน์ (พรีวิว)
 * ⚠️ เดิมแท็บ 🛍 สร้างลิงก์จากเว็บเก่า (pixiedustie-store/preview/<slug>) → ร้านอื่นเปิดแล้ว 404 · ใช้ตัวนี้แทน
 */
import { siteUrlFromDomain } from "@/lib/website-links";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/** shop_id → https://โดเมนร้าน (ร้านที่ยังไม่ตั้งโดเมน = ไม่มีในแผนที่) */
export async function loadShopSiteUrls(sb: Admin, shopIds?: string[]): Promise<Map<string, string>> {
  let q = sb.from("shop_domains").select("shop_id, domain");
  if (shopIds?.length) q = q.in("shop_id", shopIds);
  const { data } = await q;
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { shop_id: string; domain: string | null }[]) {
    const url = siteUrlFromDomain(r.domain);
    if (url && !out.has(r.shop_id)) out.set(r.shop_id, url);
  }
  return out;
}

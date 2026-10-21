/**
 * 🏷 โปรโมชันอัตโนมัติ — ส่วนที่อ่านฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎ: lib/website-promotions.ts
 * ใช้ที่: createStorefrontOrder (คิดส่วนลดจริง) · /api/public/storefront/site (ส่งให้เว็บโชว์ป้าย/ราคา) · /api/website/promotions (แท็บ 🏷)
 */
import { isLive, promotionFromRow, publicPromotions, type Promotion } from "@/lib/website-promotions";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export async function readPromotions(sb: Admin, shopId: string): Promise<Promotion[]> {
  try {
    const { data, error } = await sb.from("store_promotions").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(promotionFromRow);
  } catch (e) {
    // อ่านไม่ได้ (ตารางยังไม่มี/DB สะดุด) = ไม่มีโปร · ไม่ล้มการสั่งซื้อ
    console.error("[promotions] read", e instanceof Error ? e.message : e);
    return [];
  }
}

/** ที่ใช้ได้ตอนนี้ (คิดยอดออเดอร์) */
export async function readLivePromotions(sb: Admin, shopId: string, now: Date = new Date()): Promise<Promotion[]> {
  return (await readPromotions(sb, shopId)).filter((p) => isLive(p, now));
}

/** ส่งเว็บร้าน: เปิด + ยังไม่หมดเวลา (ที่ยังไม่เริ่ม เว็บซ่อนเองจนถึงเวลา) */
export async function readPublicPromotions(sb: Admin, shopId: string): Promise<Promotion[]> {
  return publicPromotions(await readPromotions(sb, shopId));
}

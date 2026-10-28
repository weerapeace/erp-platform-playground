/**
 * 🏷 โปรโมชันอัตโนมัติ — ส่วนที่อ่านฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎ: lib/website-promotions.ts
 * ใช้ที่: createStorefrontOrder (คิดส่วนลดจริง) · /api/public/storefront/site (ส่งให้เว็บโชว์ป้าย/ราคา) · /api/website/promotions (แท็บ 🏷)
 * 📦 โปรที่อ้างกลุ่มสินค้า: ใส่นิยามกลุ่มลงในขอบเขตตอนอ่าน (withGroupDefs) → เว็บร้านกับตอนรับออเดอร์คิดตรงกัน
 */
import { isLive, promotionFromRow, publicPromotions, withGroupDefs, type Promotion } from "@/lib/website-promotions";
import { groupFromRow, type ProductGroupRow } from "@/lib/website-product-groups";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/** กลุ่มสินค้าของร้าน (อ่านไม่ได้ = ไม่มีกลุ่ม → โปรแบบกลุ่มไม่ลด ไม่ล้มการสั่งซื้อ) */
export async function readProductGroups(sb: Admin, shopId: string): Promise<ProductGroupRow[]> {
  try {
    const { data, error } = await sb.from("store_product_groups").select("*").eq("shop_id", shopId).order("name").limit(200);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(groupFromRow);
  } catch (e) {
    console.error("[product-groups] read", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function readPromotions(sb: Admin, shopId: string): Promise<Promotion[]> {
  try {
    const { data, error } = await sb.from("store_promotions").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const promos = ((data ?? []) as Record<string, unknown>[]).map(promotionFromRow);
    const needGroups = promos.some((p) => p.rule.scope.groups?.length || p.rule.scope.excludeGroups?.length);
    return needGroups ? withGroupDefs(promos, await readProductGroups(sb, shopId)) : promos;
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

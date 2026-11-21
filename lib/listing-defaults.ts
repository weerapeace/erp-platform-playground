/**
 * ค่าตั้งต้นที่ "ทุกร้านต้องเหมือนกัน" ตอนลงสินค้า — ของกลาง (pure · ห้าม import "@/...")
 *
 * เจ้าของบอก 2026-11-21 (LY22): "ในระบบก็มี (01) ทำไมหลังส่งตัดออก" · "หลังส่งต้องเหมือนกันสิ ตรงรูป เพราะในระบบเหมือนกัน"
 *   เดิม: Shopee/Lazada ใช้ชื่อสี Color Platform [TH] แต่ TikTok/LINE ใช้สีไทย → "ดำ" แทน "ดำ (01)"
 *         ชุดรูปตั้งต้นแต่ละร้านเรียงต่างกัน (TikTok/Lazada/LINE เอาปกตัวสีขึ้นก่อน → ปกเป็นกระเป๋าสีดำ · Shopee ได้ปกรวมสี)
 *   ตอนนี้: ทุกร้าน (Shopee · Lazada · TikTok · LINE) ใช้ 2 ตัวนี้ — ต่างกันได้แค่จำนวนรูปสูงสุดที่ร้านรับ
 */

/** ชื่อสีที่ส่งร้าน: Color Platform [TH] (เช่น "ดำ (01)") → สีไทย → สี */
export function listingColorName(s: { color_platform_th?: string | null; color_th?: string | null; color?: string | null }): string {
  return String(s.color_platform_th || s.color_th || s.color || "").trim();
}

/**
 * ชุดรูปตั้งต้น (เมื่อไม่ได้เลือกรูปเองสำหรับร้านนั้น):
 *   รูปในร่าง (ถ้ามี — ตัวเตรียมร่างเติมให้แค่ปก) → รูปของสินค้าในระบบตามลำดับเดียวกับหน้า Parent SKU
 *   pool = it.images ของ lib/product-listing-context (ปก → แกลเลอรี → ปกตัวสี → รูปตัวขาย) · ไม่ซ้ำ · ตัดตามจำนวนที่ร้านรับ
 */
export function listingDefaultImages(pool: readonly string[], draftKeys: readonly string[], max: number): string[] {
  const out: string[] = [];
  for (const k of [...draftKeys, ...pool]) { const v = String(k ?? "").trim(); if (v && !out.includes(v)) out.push(v); }
  return out.slice(0, Math.max(0, max));
}

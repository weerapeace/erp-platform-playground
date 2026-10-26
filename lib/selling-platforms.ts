/**
 * ร้าน/แพลตฟอร์มที่ "ขายของ" จริง — ของกลาง
 * erp_platforms มีช่องทางโซเชียลปนอยู่ด้วย (Instagram/Facebook/YouTube/X/LINE OA) ซึ่งไม่มีสินค้าให้ลง/จับคู่
 * ใช้กรองตัวเลือกร้านในหน้า ลงสินค้าบนแพลตฟอร์ม · สินค้าบนแพลตฟอร์ม
 */
export const SELLING_PLATFORMS = ["shopee", "lazada", "tiktok", "line_shopping", "website"] as const;

export function isSellingPlatform(code: string | null | undefined): boolean {
  return (SELLING_PLATFORMS as readonly string[]).includes(String(code ?? ""));
}

/**
 * 💬 ข้อความลูกค้าในออเดอร์ (platform_orders.raw) — ตัวเล็ก แยกจาก lib/gift-card-design ให้หน้าอื่น (ศูนย์ออเดอร์) import ได้โดยไม่ดึงตัววาดการ์ดทั้งก้อน
 * pure · ใช้ได้ทั้ง server/client · เทสต์อยู่ใน lib/__tests__/gift-card-design.test.ts
 */
type RawLike = { shopee?: { message_to_seller?: unknown }; tiktok?: { buyer_message?: unknown }; lazada?: { remarks?: unknown; gift_message?: unknown }; line_shopping?: { remarkBuyer?: unknown; remarkRecipient?: unknown; isGift?: unknown }; buyer_message?: unknown; note?: unknown; gift_message?: unknown } | null | undefined;
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/**
 * ข้อความลูกค้าในออเดอร์ (platform_orders.raw) — Shopee message_to_seller · TikTok buyer_message · Lazada remarks/gift_message
 *   LINE SHOPPING remarkBuyer (+ remarkRecipient = ข้อความถึงผู้รับ ต่อท้าย) · สร้างเอง note
 */
export function buyerNoteOf(raw: unknown): string | null {
  const r = raw as RawLike;
  const ls = r?.line_shopping;
  const line = [txt(ls?.remarkBuyer), txt(ls?.remarkRecipient) ? `ข้อความถึงผู้รับ: ${txt(ls?.remarkRecipient)}` : null].filter(Boolean).join("\n") || null;
  const cands = [r?.shopee?.message_to_seller, r?.tiktok?.buyer_message, r?.lazada?.gift_message, r?.lazada?.remarks, line, r?.gift_message, r?.buyer_message, r?.note];
  for (const c of cands) if (txt(c)) return txt(c);
  return null;
}
/** ลูกค้าติ๊ก "เป็นของขวัญ" ในร้าน (ตอนนี้ LINE SHOPPING isGift) → นับเป็นงานการ์ด/ห่อ แม้ไม่มีข้อความ */
export function isGiftOrder(raw: unknown): boolean {
  const g = (raw as RawLike)?.line_shopping?.isGift;
  return g === true || g === "true";
}

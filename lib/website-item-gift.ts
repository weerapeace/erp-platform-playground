/**
 * 🎀 ห่อของขวัญ / 💌 การ์ด "รายชิ้น" (ดีไซน์ตะกร้า giftMode = item) — ของกลางฝั่ง ERP ตอนรับออเดอร์จากเว็บร้าน
 *
 * หน้าเว็บส่ง items[].gift = { wrap, card, message } → ตรวจกับบริการที่ร้านเปิด (ข้อมูลร้าน › 🎀) + คิดค่าบริการเอง (ไม่เชื่อหน้าเว็บ)
 *   ค่าห่อ = ค่าห่อของร้าน × จำนวนชิ้นในรายการนั้น · การ์ด = 1 ใบต่อรายการ (ข้อความเขียนในแถวนั้น)
 * เก็บที่ store_order_items.gift (jsonb) + ต่อท้ายตัวเลือก (variant_label) "🎀 ห่อของขวัญ · 💌 การ์ด" → ทุกหน้าที่โชว์รายการเห็นเอง
 * ยอดรวมค่าห่อ/การ์ดรายชิ้นบวกเข้า store_orders.gift_fee / gift_card_fee (ช่องเดิม) — ยอดชำระคิดสูตรเดิม
 */
import { calcCardFee, calcGiftFee, type SiteInfo } from "@/lib/website-site-info";

export const ITEM_GIFT_MESSAGE_MAX = 300;

export interface ItemGiftChoice {
  wrap: boolean;
  card: boolean;
  /** ข้อความบนการ์ด (มีเฉพาะเมื่อเลือกการ์ด) */
  message: string;
}
export interface ItemGift extends ItemGiftChoice {
  /** บาท */
  wrapFee: number;
  cardFee: number;
}

/** ค่าที่หน้าเว็บส่งมา / ค่าใน store_order_items.gift → ที่ลูกค้าเลือก (ไม่ได้เลือกอะไร = null) */
export function cleanItemGift(raw: unknown): ItemGiftChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const wrap = r.wrap === true;
  const card = r.card === true;
  if (!wrap && !card) return null;
  return { wrap, card, message: card ? String(r.message ?? "").replace(/\r/g, "").trim().slice(0, ITEM_GIFT_MESSAGE_MAX) : "" };
}

/** ตรวจกับบริการที่ร้านเปิด + คิดค่าบริการ — ร้านปิดบริการไปแล้วระหว่างลูกค้ากรอก = บอกให้เอาออก (ไม่เงียบ) */
export function priceItemGift(
  choice: ItemGiftChoice | null | undefined,
  qty: number,
  info: Pick<SiteInfo, "gift_enabled" | "gift_fee" | "card_enabled" | "card_fee">,
  name = "สินค้า"
): { ok: true; gift: ItemGift | null } | { ok: false; error: string } {
  if (!choice || (!choice.wrap && !choice.card)) return { ok: true, gift: null };
  if (choice.wrap && !info.gift_enabled) return { ok: false, error: `ร้านปิดบริการห่อของขวัญแล้ว — เอาตัวเลือกห่อของ ${name} ออกแล้วสั่งอีกครั้ง` };
  if (choice.card && !info.card_enabled) return { ok: false, error: `ร้านปิดบริการการ์ดอวยพรแล้ว — เอาการ์ดของ ${name} ออกแล้วสั่งอีกครั้ง` };
  const n = Math.max(1, Math.floor(qty) || 1);
  return {
    ok: true,
    gift: {
      wrap: choice.wrap,
      card: choice.card,
      message: choice.card ? choice.message : "",
      wrapFee: choice.wrap ? Math.round(calcGiftFee(true, info) * n * 100) / 100 : 0,
      cardFee: choice.card ? calcCardFee(true, info) : 0,
    },
  };
}

/** ป้ายต่อท้ายตัวเลือกของรายการ (ใบออเดอร์/ข้อความถึงลูกค้า/หน้าติดตาม) */
export function itemGiftLabel(g: Pick<ItemGiftChoice, "wrap" | "card">, lang: "th" | "en" = "th"): string {
  const parts: string[] = [];
  if (g.wrap) parts.push(lang === "en" ? "🎀 Gift wrapped" : "🎀 ห่อของขวัญ");
  if (g.card) parts.push(lang === "en" ? "💌 Card" : "💌 การ์ด");
  return parts.join(" · ");
}

/**
 * 🎀 ห่อของขวัญ / 💌 การ์ด "รายชิ้น" (ดีไซน์ตะกร้า giftMode = item) — ของกลางฝั่ง ERP ตอนรับออเดอร์จากเว็บร้าน
 *
 * หน้าเว็บส่ง items[].gift = { wrap, style, card, message, cardInfo } → ตรวจกับบริการที่ร้านเปิด (ข้อมูลร้าน › 🎀) + คิดค่าบริการเอง (ไม่เชื่อหน้าเว็บ)
 *   ค่าห่อ = ราคาแบบห่อที่เลือก (ร้านไม่มีแบบห่อ = ค่าห่อของร้าน) × จำนวนชิ้น · การ์ด = 1 ใบต่อรายการ (ข้อความเขียนในแถวนั้น)
 *   cardInfo = ลาย/ตัวหนังสือ/โอกาส/ถึง/จาก (ตรวจด้วย normalizeOrderCard ตัวเดียวกับการ์ดทั้งออเดอร์) · พิมพ์ได้ที่ /print/gift-cards
 * เก็บที่ store_order_items.gift (jsonb) + ต่อท้ายตัวเลือก (variant_label) "🎀 ห่อของขวัญ (แบบ) · 💌 การ์ด" → ทุกหน้าที่โชว์รายการเห็นเอง
 * ยอดรวมค่าห่อ/การ์ดรายชิ้นบวกเข้า store_orders.gift_fee / gift_card_fee (ช่องเดิม) — ยอดชำระคิดสูตรเดิม
 */
import { calcCardFee, type SiteInfo } from "@/lib/website-site-info";
import { normalizeOrderCard, readOrderCard, wrapFeeFor, type GiftCardConfig, type OrderGiftCard } from "@/lib/website-gift-cards";

export const ITEM_GIFT_MESSAGE_MAX = 300;

/** ที่หน้าเว็บส่งมา (ยังไม่ได้ตรวจกับค่าที่ร้านตั้ง) */
export interface ItemGiftChoice {
  wrap: boolean;
  card: boolean;
  /** ข้อความบนการ์ด (มีเฉพาะเมื่อเลือกการ์ด) */
  message: string;
  /** 🎀 id แบบห่อ ("" = ร้านไม่มีแบบห่อ) */
  style: string;
  /** 🎴 ลาย/ตัวหนังสือ/ถึง/จาก (ยังไม่ตรวจ) */
  cardInfo?: unknown;
}
/** ตรวจแล้ว — เก็บลง store_order_items.gift */
export interface ItemGift {
  wrap: boolean;
  card: boolean;
  message: string;
  style: string;
  /** ชื่อแบบห่อ ณ ตอนสั่ง (ร้านแก้ชื่อทีหลังไม่กระทบ) · En = ชื่ออังกฤษ (ว่าง = ใช้ไทย) */
  styleName: string;
  styleNameEn: string;
  /** บาท */
  wrapFee: number;
  cardFee: number;
  /** การ์ดที่ตั้งลาย/ถึง-จาก (ร้านยังไม่ตั้งลายการ์ด / ลูกค้าไม่ได้เลือก = null) · printedAt = พิมพ์แล้ว */
  cardInfo: OrderGiftCard | null;
}

/** ค่าที่หน้าเว็บส่งมา → ที่ลูกค้าเลือก (ไม่ได้เลือกอะไร = null) */
export function cleanItemGift(raw: unknown): ItemGiftChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const wrap = r.wrap === true;
  const card = r.card === true;
  if (!wrap && !card) return null;
  const style = wrap ? String(r.style ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) : "";
  return {
    wrap,
    card,
    message: card ? String(r.message ?? "").replace(/\r/g, "").trim().slice(0, ITEM_GIFT_MESSAGE_MAX) : "",
    style,
    ...(card && r.cardInfo && typeof r.cardInfo === "object" ? { cardInfo: r.cardInfo } : {}),
  };
}

/** ค่าใน store_order_items.gift → รูปแบบเดียวกันเสมอ (ข้อมูลรอบแรกไม่มี style/cardInfo = ค่าว่าง) */
export function readItemGift(raw: unknown): ItemGift | null {
  const c = cleanItemGift(raw);
  if (!c) return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    wrap: c.wrap,
    card: c.card,
    message: c.message,
    style: c.style,
    styleName: typeof r.styleName === "string" ? r.styleName.slice(0, 40) : "",
    styleNameEn: typeof r.styleNameEn === "string" ? r.styleNameEn.slice(0, 40) : "",
    wrapFee: n(r.wrapFee),
    cardFee: n(r.cardFee),
    cardInfo: c.card ? readOrderCard(r.cardInfo) : null,
  };
}

/**
 * ตรวจกับบริการที่ร้านเปิด + คิดค่าบริการ — ร้านปิดบริการ/แบบห่อ/ลายการ์ดไปแล้วระหว่างลูกค้ากรอก = บอกให้แก้ (ไม่เงียบ ไม่เดาให้)
 * cards = ตั้งค่าการ์ด+แบบห่อของร้าน (readGiftCards) — ไม่ส่ง = ไม่มีแบบห่อ/ลายการ์ด (แบบเดิม)
 */
export function priceItemGift(
  choice: ItemGiftChoice | null | undefined,
  qty: number,
  info: Pick<SiteInfo, "gift_enabled" | "gift_fee" | "card_enabled" | "card_fee">,
  name = "สินค้า",
  cards?: GiftCardConfig | null
): { ok: true; gift: ItemGift | null } | { ok: false; error: string } {
  if (!choice || (!choice.wrap && !choice.card)) return { ok: true, gift: null };
  if (choice.wrap && !info.gift_enabled) return { ok: false, error: `ร้านปิดบริการห่อของขวัญแล้ว — เอาตัวเลือกห่อของ ${name} ออกแล้วสั่งอีกครั้ง` };
  if (choice.card && !info.card_enabled) return { ok: false, error: `ร้านปิดบริการการ์ดอวยพรแล้ว — เอาการ์ดของ ${name} ออกแล้วสั่งอีกครั้ง` };
  const n = Math.max(1, Math.floor(qty) || 1);
  let wrapFee = 0;
  let styleName = "";
  let styleNameEn = "";
  let style = "";
  if (choice.wrap) {
    const w = wrapFeeFor(cards, choice.style, info.gift_fee);
    if (!w.ok) return { ok: false, error: `${name}: ${w.error}` };
    wrapFee = Math.round(w.fee * n * 100) / 100;
    styleName = w.style?.name ?? "";
    styleNameEn = w.style?.nameEn ?? "";
    style = w.style?.id ?? "";
  }
  let cardInfo: OrderGiftCard | null = null;
  if (choice.card && cards) {
    const rc = normalizeOrderCard(choice.cardInfo ?? null, cards, choice.message);
    if (!rc.ok) return { ok: false, error: `${name}: ${rc.error}` };
    cardInfo = rc.card;
  }
  return {
    ok: true,
    gift: {
      wrap: choice.wrap,
      card: choice.card,
      message: choice.card ? choice.message : "",
      style,
      styleName,
      styleNameEn,
      wrapFee,
      cardFee: choice.card ? calcCardFee(true, info) : 0,
      cardInfo,
    },
  };
}

/** ป้ายต่อท้ายตัวเลือกของรายการ (ใบออเดอร์/ข้อความถึงลูกค้า/หน้าติดตาม) */
export function itemGiftLabel(g: Pick<ItemGift, "wrap" | "card"> & { styleName?: string; styleNameEn?: string }, lang: "th" | "en" = "th"): string {
  const parts: string[] = [];
  const sn = lang === "en" ? g.styleNameEn || g.styleName : g.styleName;
  const st = sn ? ` (${sn})` : "";
  if (g.wrap) parts.push(lang === "en" ? `🎀 Gift wrapped${st}` : `🎀 ห่อของขวัญ${st}`);
  if (g.card) parts.push(lang === "en" ? "💌 Card" : "💌 การ์ด");
  return parts.join(" · ");
}

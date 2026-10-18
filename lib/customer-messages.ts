/**
 * 💬 ข้อความถึงลูกค้าเว็บร้าน — 2 ภาษา (ของกลาง · pure ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ)
 *
 * ภาษา = ภาษาที่ลูกค้าใช้ตอนสั่ง/ฝากชื่อ (store_orders.lang · store_restock_requests.lang) — ไม่ใช่ภาษาของพนักงาน
 * ใช้ร่วม:
 *   - อีเมลอัตโนมัติ (lib/order-notify) — เปิดที่แท็บ 🏪 ข้อมูลร้าน › "ส่งอีเมลแจ้งลูกค้าอัตโนมัติ"
 *   - ปุ่ม "📋 คัดลอกข้อความ" ในแท็บ 🧾 ออเดอร์ / 🔔 แจ้งเมื่อมีของ (พนักงานส่ง LINE/SMS เอง)
 * แก้ถ้อยคำที่นี่ที่เดียว ทุกช่องทางเปลี่ยนตาม
 */
import type { EmailMessage } from "@/lib/email";
import { emailLayout } from "@/lib/email-layout";

export type CustomerLang = "th" | "en";
export const customerLang = (v: unknown): CustomerLang => (v === "en" ? "en" : "th");
export const CUSTOMER_LANG_LABEL: Record<CustomerLang, string> = { th: "ไทย", en: "อังกฤษ" };

/* ─────────── ออเดอร์ ─────────── */

export type OrderEvent = "placed" | "paid" | "preparing" | "shipped" | "completed" | "cancelled" | "refunded";

/** ชื่อเหตุการณ์ (ฝั่งพนักงาน) */
export const ORDER_EVENTS: { key: OrderEvent; label: string }[] = [
  { key: "placed", label: "ได้รับออเดอร์แล้ว" },
  { key: "paid", label: "ได้รับชำระเงินแล้ว" },
  { key: "preparing", label: "กำลังเตรียมของ" },
  { key: "shipped", label: "จัดส่งแล้ว" },
  { key: "completed", label: "ขอบคุณ (สำเร็จ)" },
  { key: "cancelled", label: "ยกเลิกออเดอร์" },
  { key: "refunded", label: "คืนเงินแล้ว" },
];

/** อีเมลอัตโนมัติส่งเฉพาะเรื่องสำคัญ (กำลังเตรียมของ/สำเร็จ = คัดลอกส่งเองได้ ไม่ส่งอัตโนมัติ กันอีเมลถี่เกิน) */
export const AUTO_EMAIL_EVENTS: readonly OrderEvent[] = ["placed", "paid", "shipped", "cancelled", "refunded"];

type StatusPair = { status: string; paymentStatus: string };

/** พนักงานเปลี่ยนสถานะ → เรื่องที่ควรแจ้งลูกค้า (ไม่มี = null) · สถานะออเดอร์มาก่อนสถานะจ่าย */
export function orderEventOf(before: StatusPair, after: StatusPair): OrderEvent | null {
  if (after.status !== before.status) {
    if (after.status === "preparing" || after.status === "shipped" || after.status === "completed" || after.status === "cancelled") return after.status;
    return null;
  }
  if (after.paymentStatus !== before.paymentStatus) {
    if (after.paymentStatus === "paid") return "paid";
    if (after.paymentStatus === "refunded") return "refunded";
  }
  return null;
}

/** เรื่องที่ตรงกับสถานะตอนนี้ (ค่าเริ่มของปุ่มคัดลอกข้อความ) */
export function currentOrderEvent(o: StatusPair): OrderEvent {
  if (o.status === "cancelled") return "cancelled";
  if (o.paymentStatus === "refunded") return "refunded";
  if (o.status === "completed" || o.status === "shipped" || o.status === "preparing") return o.status;
  return o.paymentStatus === "paid" ? "paid" : "placed";
}

export interface MessageOrder {
  orderNo: string;
  customerName: string;
  paymentMethod: string;
  paymentStatus: string;
  /** ชื่อสินค้า/ตัวเลือก ในภาษาของลูกค้าแล้ว */
  items: { name: string; variantLabel: string | null; qty: number; lineTotal: number }[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  giftFee?: number;
  /** 💌 ค่าการ์ดอวยพร (บริการแยกจากห่อ) */
  giftCardFee?: number;
  pointsDiscount?: number;
  grandTotal: number;
  /** หมายเหตุที่ลูกค้าเห็น (เช่น เลขพัสดุที่พนักงานใส่) */
  note: string;
  promptpay: { number: string; name: string } | null;
}

export interface MessageShop {
  name: string;
  /** https://โดเมนร้าน (ยังไม่มีโดเมน = null → ไม่มีลิงก์ตามออเดอร์) */
  siteUrl: string | null;
  /** ข้อความแจ้งลูกค้าตอนสั่งซื้อ (ข้อมูลร้าน order_note) ในภาษาของลูกค้าแล้ว */
  orderNote?: string;
  contactLine?: string;
  contactPhone?: string;
}

export interface CustomerMessage {
  subject: string;
  title: string;
  lines: string[];
  table: { left: string; right: string; bold?: boolean }[];
  link: { text: string; href: string } | null;
  foot: string;
  /** ข้อความล้วน — สำหรับคัดลอกไปส่ง LINE/SMS และส่วนข้อความล้วนของอีเมล */
  text: string;
}

export const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** ลิงก์หน้าตามออเดอร์บนเว็บร้าน (/en สำหรับลูกค้าอังกฤษ) — ไม่ใส่เบอร์โทรในลิงก์ (ข้อมูลส่วนตัว) ลูกค้ากรอกเบอร์เองที่หน้านั้น */
export const trackUrl = (siteUrl: string | null, orderNo: string, lang: CustomerLang): string | null =>
  siteUrl ? `${siteUrl}${lang === "en" ? "/en" : ""}/track?no=${encodeURIComponent(orderNo)}` : null;

const T = {
  th: {
    hello: (n: string) => `สวัสดีคุณ${n}`,
    payment: { cod: "เก็บเงินปลายทาง", promptpay: "โอนพร้อมเพย์" } as Record<string, string>,
    subtotal: "ยอดสินค้า",
    shipping: "ค่าส่ง",
    free: "ฟรี",
    gift: "ค่าห่อของขวัญ",
    card: "ค่าการ์ดอวยพร",
    discount: "ส่วนลด",
    points: "ใช้แต้ม",
    total: "ยอดรวม",
    track: "ดูสถานะออเดอร์",
    trackText: "ดูสถานะออเดอร์",
    contact: (line?: string, phone?: string) => [line ? `LINE ${line}` : "", phone ? `โทร ${phone}` : ""].filter(Boolean).join(" · "),
    contactPrefix: "ติดต่อร้าน",
    noteFromShop: "ข้อมูลจากร้าน",
    ev: {
      placed: (o: MessageOrder) => ({
        subject: `ได้รับคำสั่งซื้อ ${o.orderNo} แล้ว`,
        title: "ขอบคุณสำหรับคำสั่งซื้อ",
        lines: [
          `ร้านได้รับคำสั่งซื้อเลขที่ ${o.orderNo} แล้ว`,
          o.paymentStatus === "paid"
            ? `ชำระเงินแล้ว ${money(o.grandTotal)}`
            : o.paymentMethod === "promptpay" && o.promptpay
              ? `กรุณาโอน ${money(o.grandTotal)} ผ่านพร้อมเพย์ ${o.promptpay.number}${o.promptpay.name ? ` (${o.promptpay.name})` : ""} แล้วส่งสลิปให้ร้าน`
              : o.paymentMethod === "cod"
                ? `ชำระเงินปลายทาง ${money(o.grandTotal)} ตอนรับสินค้า`
                : `ยอดชำระ ${money(o.grandTotal)}`,
        ],
        items: true,
      }),
      paid: (o: MessageOrder) => ({ subject: `ได้รับชำระเงินแล้ว — ${o.orderNo}`, title: "ได้รับชำระเงินแล้ว", lines: [`ร้านได้รับชำระเงิน ${money(o.grandTotal)} สำหรับออเดอร์ ${o.orderNo} แล้ว`, "กำลังเตรียมจัดส่ง จะแจ้งอีกครั้งเมื่อส่งของ"], items: false }),
      preparing: (o: MessageOrder) => ({ subject: `กำลังเตรียมสินค้า — ${o.orderNo}`, title: "กำลังเตรียมสินค้าให้คุณ", lines: [`ออเดอร์ ${o.orderNo} กำลังแพ็กของ จะแจ้งอีกครั้งเมื่อจัดส่ง`], items: false }),
      shipped: (o: MessageOrder) => ({ subject: `จัดส่งแล้ว — ${o.orderNo}`, title: "จัดส่งสินค้าแล้ว", lines: [`ออเดอร์ ${o.orderNo} ออกจากร้านแล้ว`], items: false }),
      completed: (o: MessageOrder) => ({ subject: `ขอบคุณที่อุดหนุน — ${o.orderNo}`, title: "ขอบคุณที่อุดหนุน", lines: [`ออเดอร์ ${o.orderNo} เสร็จเรียบร้อย หวังว่าจะชอบสินค้านะคะ`], items: false }),
      cancelled: (o: MessageOrder) => ({ subject: `ยกเลิกคำสั่งซื้อ ${o.orderNo}`, title: "ยกเลิกคำสั่งซื้อแล้ว", lines: [`ออเดอร์ ${o.orderNo} ถูกยกเลิกแล้ว`, "หากมีข้อสงสัย ติดต่อร้านได้เลย"], items: false }),
      refunded: (o: MessageOrder) => ({ subject: `คืนเงินแล้ว — ${o.orderNo}`, title: "คืนเงินเรียบร้อย", lines: [`ร้านคืนเงิน ${money(o.grandTotal)} สำหรับออเดอร์ ${o.orderNo} แล้ว`], items: false }),
    },
  },
  en: {
    hello: (n: string) => `Hi ${n},`,
    payment: { cod: "Cash on delivery", promptpay: "PromptPay transfer" } as Record<string, string>,
    subtotal: "Subtotal",
    shipping: "Shipping",
    free: "Free",
    gift: "Gift wrapping",
    card: "Greeting card",
    discount: "Discount",
    points: "Points",
    total: "Total",
    track: "Track your order",
    trackText: "Track your order",
    contact: (line?: string, phone?: string) => [line ? `LINE ${line}` : "", phone ? `Tel ${phone}` : ""].filter(Boolean).join(" · "),
    contactPrefix: "Contact us",
    noteFromShop: "Note from the shop",
    ev: {
      placed: (o: MessageOrder) => ({
        subject: `We've received your order ${o.orderNo}`,
        title: "Thank you for your order",
        lines: [
          `We've received your order ${o.orderNo}.`,
          o.paymentStatus === "paid"
            ? `Payment received: ${money(o.grandTotal)}.`
            : o.paymentMethod === "promptpay" && o.promptpay
              ? `Please transfer ${money(o.grandTotal)} via PromptPay ${o.promptpay.number}${o.promptpay.name ? ` (${o.promptpay.name})` : ""} and send us the slip.`
              : o.paymentMethod === "cod"
                ? `Please pay ${money(o.grandTotal)} in cash on delivery.`
                : `Amount due: ${money(o.grandTotal)}.`,
        ],
        items: true,
      }),
      paid: (o: MessageOrder) => ({ subject: `Payment received — ${o.orderNo}`, title: "Payment received", lines: [`We've received your payment of ${money(o.grandTotal)} for order ${o.orderNo}.`, "We're getting it ready and will let you know when it ships."], items: false }),
      preparing: (o: MessageOrder) => ({ subject: `Preparing your order — ${o.orderNo}`, title: "We're preparing your order", lines: [`Order ${o.orderNo} is being packed. We'll let you know when it ships.`], items: false }),
      shipped: (o: MessageOrder) => ({ subject: `Your order has shipped — ${o.orderNo}`, title: "Your order is on its way", lines: [`Order ${o.orderNo} has left our shop.`], items: false }),
      completed: (o: MessageOrder) => ({ subject: `Thank you — ${o.orderNo}`, title: "Thank you for shopping with us", lines: [`Order ${o.orderNo} is complete. We hope you love it!`], items: false }),
      cancelled: (o: MessageOrder) => ({ subject: `Order ${o.orderNo} cancelled`, title: "Your order has been cancelled", lines: [`Order ${o.orderNo} has been cancelled.`, "If you have any questions, please contact us."], items: false }),
      refunded: (o: MessageOrder) => ({ subject: `Refund issued — ${o.orderNo}`, title: "Refund issued", lines: [`We've refunded ${money(o.grandTotal)} for order ${o.orderNo}.`], items: false }),
    },
  },
} as const;

/** ข้อความแจ้งลูกค้า 1 เรื่อง ในภาษาของลูกค้า */
export function orderMessage(ev: OrderEvent, o: MessageOrder, shop: MessageShop, lang: CustomerLang): CustomerMessage {
  const t = T[lang];
  const e = t.ev[ev](o);
  const lines = [t.hello(o.customerName), ...e.lines];
  if (ev === "placed" && shop.orderNote?.trim()) lines.push(shop.orderNote.trim());
  if ((ev === "shipped" || ev === "preparing") && o.note.trim()) lines.push(`${t.noteFromShop}: ${o.note.trim()}`);

  const table: CustomerMessage["table"] = [];
  if (e.items) {
    for (const i of o.items) table.push({ left: `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} ×${i.qty}`, right: money(i.lineTotal) });
    table.push({ left: t.subtotal, right: money(o.subtotal) });
    table.push({ left: t.shipping, right: o.shippingFee ? money(o.shippingFee) : t.free });
    if (o.giftFee) table.push({ left: t.gift, right: money(o.giftFee) });
    if (o.giftCardFee) table.push({ left: t.card, right: money(o.giftCardFee) });
    if (o.discount > 0) table.push({ left: t.discount, right: `-${money(o.discount)}` });
    if ((o.pointsDiscount ?? 0) > 0) table.push({ left: t.points, right: `-${money(o.pointsDiscount ?? 0)}` });
    table.push({ left: `${t.total} (${t.payment[o.paymentMethod] ?? o.paymentMethod})`, right: money(o.grandTotal), bold: true });
  }

  const href = trackUrl(shop.siteUrl, o.orderNo, lang);
  const contact = t.contact(shop.contactLine, shop.contactPhone);
  const foot = [contact ? `${t.contactPrefix}: ${contact}` : "", shop.name].filter(Boolean).join("\n");
  const text = [
    e.title,
    "",
    ...lines,
    ...(table.length ? ["", ...table.map((r) => `${r.bold ? "" : "• "}${r.left}  ${r.right}`)] : []),
    ...(href ? ["", `${t.trackText}: ${href}`] : []),
    "",
    foot,
  ].join("\n");

  return { subject: `${e.subject} — ${shop.name}`, title: e.title, lines, table, link: href ? { text: t.track, href } : null, foot, text };
}

/** อีเมลแจ้งออเดอร์ (HTML + ข้อความล้วน) */
export function orderEmail(to: string, ev: OrderEvent, o: MessageOrder, shop: MessageShop, lang: CustomerLang): EmailMessage {
  const m = orderMessage(ev, o, shop, lang);
  return {
    to,
    fromName: shop.name,
    subject: m.subject,
    html: emailLayout({ lang, shopName: shop.name, title: m.title, lines: m.lines, table: m.table, button: m.link ?? undefined, foot: m.foot }),
    text: m.text,
  };
}

/* ─────────── 🔔 แจ้งเมื่อมีของ ─────────── */

/** ข้อความ "สินค้ากลับมาแล้ว" ให้พนักงานคัดลอกไปส่ง (ลูกค้าฝากอีเมล/เบอร์/LINE ไว้) */
export function restockMessage(
  p: { productName: string; option: string | null; productUrl: string | null; customerName: string | null },
  shop: Pick<MessageShop, "name">,
  lang: CustomerLang
): string {
  const item = `${p.productName}${p.option ? ` (${p.option})` : ""}`;
  return (
    lang === "en"
      ? [p.customerName ? `Hi ${p.customerName},` : "Hi,", `Good news — ${item} is back in stock!`, p.productUrl ? `Order here: ${p.productUrl}` : "Reply to this message to order.", "", shop.name]
      : [p.customerName ? `สวัสดีคุณ${p.customerName}` : "สวัสดีค่ะ", `${item} ที่คุณรอ กลับมามีของแล้ว`, p.productUrl ? `สั่งได้ที่: ${p.productUrl}` : "ตอบกลับข้อความนี้เพื่อสั่งได้เลย", "", shop.name]
  ).join("\n");
}

/** ลิงก์หน้าสินค้าตามภาษาลูกค้า (/en/product/...) */
export const localizedUrl = (siteUrl: string | null, path: string, lang: CustomerLang): string | null =>
  siteUrl ? `${siteUrl}${lang === "en" ? "/en" : ""}${path}` : null;

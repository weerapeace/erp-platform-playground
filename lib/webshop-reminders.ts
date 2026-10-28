/**
 * 🔔 เตือนลืมของในตะกร้า + แจ้งของที่ถูกใจลดราคา (ชุด 5) — กฎ + ถ้อยคำ (pure · ทดสอบได้)
 * ส่วนอ่าน/เขียน DB + ส่งจริง: lib/webshop-reminders-db.ts
 *
 * ส่งเฉพาะสมาชิกที่ยินยอมรับข่าวสาร (marketing_opt_in · PDPA) · ช่องทาง: อีเมล (ยืนยันแล้ว) + LINE OA ของร้าน (เข้าด้วย LINE)
 * ร้านเปิด/ตั้งที่ ERP › ข้อมูลร้าน › 🔔 แจ้งเตือนลูกค้า (cart_reminder_* / wishlist_alert_*)
 */
import { createHash } from "crypto";
import type { EmailLayoutInput } from "@/lib/email-layout";
import type { CustomerLang } from "@/lib/customer-messages";

/** ของ 1 แถวในตะกร้าที่เว็บร้านส่งมา (ไว้แสดงในข้อความเตือนเท่านั้น — ราคาจริงคิดใหม่ตอนสั่งเสมอ) */
export interface CartItem {
  code: string;
  name: string;
  variant: string | null;
  qty: number;
  /** ราคาต่อชิ้น (บาท) ตามที่ลูกค้าเห็นตอนใส่ตะกร้า */
  price: number;
  /** slug หน้าสินค้า (/product/<slug>) */
  slug: string;
}

export const CART_MAX_ITEMS = 30;
/** ตะกร้าที่ค้างนานกว่านี้ไม่เตือน (ลูกค้าเลิกสนใจแล้ว / ระบบไม่ได้รันนาน) */
export const CART_MAX_AGE_DAYS = 7;
/** แจ้งของถูกใจลดราคา: รวมได้สูงสุดกี่ชิ้นต่อข้อความ */
export const WISHLIST_MAX_PER_MESSAGE = 5;
/** ระยะห่างขั้นต่ำระหว่างรอบตรวจของแต่ละร้าน (นาที) */
export const REMINDER_RUN_EVERY_MIN = 30;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** ตรวจ/ตัดข้อมูลตะกร้าที่เว็บร้านส่งมา — ชื่อว่าง/จำนวนผิด = ทิ้งแถว · สูงสุด 30 แถว */
export function cleanCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const r of raw.slice(0, CART_MAX_ITEMS)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = str(o.name, 160);
    const qty = Math.floor(Number(o.qty));
    if (!name || !(qty >= 1)) continue;
    const price = Number(o.price);
    out.push({
      code: str(o.code, 60),
      name,
      variant: str(o.variant, 120) || null,
      qty: Math.min(qty, 99),
      price: Number.isFinite(price) && price > 0 ? Math.min(Math.round(price * 100) / 100, 1_000_000) : 0,
      slug: str(o.slug, 120).toLowerCase().replace(/[^a-z0-9-]/g, ""),
    });
  }
  return out;
}

/** ลายนิ้วมือของตะกร้า (ของ + ตัวเลือก + จำนวน) — เปลี่ยนของแล้วเตือนได้อีกครั้ง · ตัวอักษร 0-9a-f เท่านั้น (ใช้ในตัวกรอง DB ได้) */
export function cartHash(items: CartItem[]): string {
  const s = items
    .map((i) => `${i.code}|${i.variant ?? ""}|${i.qty}`)
    .sort()
    .join(";");
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

export interface CartRowLite {
  updated_at: string;
  reminded_hash: string | null;
  items: CartItem[];
}

/** ถึงเวลาเตือนไหม: ค้างไว้ ≥ hours ชม. · ไม่เก่ากว่า 7 วัน · ของชุดนี้ยังไม่เคยเตือน */
export function cartDue(row: CartRowLite, hours: number, now = Date.now()): boolean {
  const t = Date.parse(row.updated_at);
  if (!Number.isFinite(t) || !row.items?.length) return false;
  const age = now - t;
  if (age < hours * 3_600_000 || age > CART_MAX_AGE_DAYS * 86_400_000) return false;
  return row.reminded_hash !== cartHash(row.items);
}

/** ลดราคาพอจะแจ้งไหม: ต่ำกว่าราคาอ้างอิงอย่างน้อย pct% และต่ำกว่าราคาที่เคยแจ้งไปแล้ว (ไม่แจ้งซ้ำราคาเดิม) */
export function priceDropped(base: number | null, now: number, pct: number, alerted: number | null): boolean {
  if (!base || !(base > 0) || !(now > 0)) return false;
  if (now > base * (1 - pct / 100) + 1e-9) return false;
  return alerted == null || now < alerted - 1e-9;
}

/* ─────────── ถ้อยคำ (อีเมล + LINE · ภาษาตามลูกค้า) ─────────── */

const baht = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export interface ReminderMessage {
  subject: string;
  /** โครงอีเมล (ส่งต่อ emailLayout) */
  email: EmailLayoutInput;
  /** เนื้อความอีเมลแบบตัวหนังสือล้วน */
  text: string;
  /** ข้อความ LINE */
  line: string;
}

const optOutFoot = (lang: CustomerLang) =>
  lang === "en"
    ? "You're receiving this because you agreed to receive news from us. You can turn this off on your account page."
    : "คุณได้รับข้อความนี้เพราะยินยอมรับข่าวสารจากร้าน · ปิดรับได้ที่หน้าบัญชีของฉัน";

const itemLabel = (i: { name: string; variant: string | null }) => (i.variant ? `${i.name} (${i.variant})` : i.name);

export function cartReminderMessage(a: { lang: CustomerLang; shopName: string; customerName: string; items: CartItem[]; total: number; cartUrl: string | null }): ReminderMessage {
  const en = a.lang === "en";
  const title = en ? "Your cart is waiting for you" : "ของในตะกร้ายังรอคุณอยู่";
  const hi = a.customerName ? (en ? `Hi ${a.customerName},` : `สวัสดีคุณ${a.customerName}`) : en ? "Hi," : "สวัสดีค่ะ";
  const body = en
    ? "You picked some items but haven't checked out yet. We've kept them for you — tap below to finish your order."
    : "คุณเลือกของไว้ในตะกร้าแต่ยังไม่ได้สั่งซื้อ — เราเก็บไว้ให้แล้ว กดปุ่มด้านล่างเพื่อสั่งต่อได้เลย";
  const note = en
    ? "Prices and stock are confirmed again at checkout."
    : "ราคาและจำนวนของจะตรวจอีกครั้งตอนสั่งซื้อ";
  const table = [
    ...a.items.map((i) => ({ left: `${itemLabel(i)} × ${i.qty}`, right: i.price > 0 ? baht(i.price * i.qty) : "-" })),
    ...(a.total > 0 ? [{ left: en ? "Total" : "รวม", right: baht(a.total), bold: true }] : []),
  ];
  const btn = en ? "Back to my cart" : "กลับไปที่ตะกร้า";
  const lines = a.items.map((i) => `• ${itemLabel(i)} × ${i.qty}`);
  const text = [hi, "", body, "", ...lines, a.total > 0 ? `${en ? "Total" : "รวม"} ${baht(a.total)}` : "", "", note, a.cartUrl ? `${btn}: ${a.cartUrl}` : ""]
    .filter((x, idx, arr) => x !== "" || arr[idx - 1] !== "")
    .join("\n")
    .trim();
  const line = [`🛒 ${title} · ${a.shopName}`, ...lines.slice(0, 8), a.items.length > 8 ? (en ? `…and ${a.items.length - 8} more` : `…และอีก ${a.items.length - 8} รายการ`) : "", a.total > 0 ? `${en ? "Total" : "รวม"} ${baht(a.total)}` : "", a.cartUrl ? `🔗 ${a.cartUrl}` : ""]
    .filter(Boolean)
    .join("\n");
  return {
    subject: `${a.shopName}: ${title}`,
    email: { lang: a.lang, shopName: a.shopName, title, lines: [hi, body, note], table, button: a.cartUrl ? { text: btn, href: a.cartUrl } : undefined, foot: optOutFoot(a.lang) },
    text: `${text}\n\n${optOutFoot(a.lang)}`,
    line,
  };
}

export interface PriceDrop {
  name: string;
  oldPrice: number;
  newPrice: number;
  url: string | null;
}

export function wishlistAlertMessage(a: { lang: CustomerLang; shopName: string; customerName: string; drops: PriceDrop[]; accountUrl: string | null }): ReminderMessage {
  const en = a.lang === "en";
  const title = en ? "Items you liked are now cheaper" : "ของที่คุณถูกใจลดราคาแล้ว";
  const hi = a.customerName ? (en ? `Hi ${a.customerName},` : `สวัสดีคุณ${a.customerName}`) : en ? "Hi," : "สวัสดีค่ะ";
  const body = en ? "Good news — the price dropped on items in your wishlist:" : "ข่าวดี — ของในรายการโปรดของคุณราคาลดลงแล้ว:";
  const drops = a.drops.slice(0, WISHLIST_MAX_PER_MESSAGE);
  const target = drops.length === 1 ? drops[0].url ?? a.accountUrl : a.accountUrl;
  const btn = drops.length === 1 ? (en ? "View item" : "ดูสินค้า") : en ? "View my wishlist" : "ดูรายการโปรด";
  const row = (d: PriceDrop) => `${baht(d.oldPrice)} → ${baht(d.newPrice)}`;
  const text = [hi, "", body, ...drops.map((d) => `• ${d.name}: ${row(d)}${d.url ? `\n  ${d.url}` : ""}`), "", target ? `${btn}: ${target}` : ""].join("\n").trim();
  const line = [`❤️ ${title} · ${a.shopName}`, ...drops.map((d) => `• ${d.name}\n  ${row(d)}${d.url ? `\n  ${d.url}` : ""}`)].join("\n");
  return {
    subject: `${a.shopName}: ${title}`,
    email: { lang: a.lang, shopName: a.shopName, title, lines: [hi, body], table: drops.map((d) => ({ left: d.name, right: row(d) })), button: target ? { text: btn, href: target } : undefined, foot: optOutFoot(a.lang) },
    text: `${text}\n\n${optOutFoot(a.lang)}`,
    line,
  };
}

/* ─────────── 🔔 มีของแล้ว / ชุดเปิดขายแล้ว (ฝากไว้ที่ "แจ้งฉันเมื่อมีของ") ─────────── */

/** รอบหนึ่งส่งได้สูงสุดกี่คำขอต่อร้าน (ที่เหลือรอบหน้า) */
export const RESTOCK_MAX_PER_RUN = 300;

const restockFoot = (lang: CustomerLang) =>
  lang === "en"
    ? "This is a one-time message because you asked to be notified on our website."
    : "ข้อความนี้ส่งครั้งเดียว เพราะคุณกด \"แจ้งฉันเมื่อมีของ\" บนเว็บของร้าน";

/** ถ้อยคำแจ้ง "มีของแล้ว" (สินค้า) / "เปิดขายแล้ว" (ชุดมาใหม่) — อีเมล + LINE ตามภาษาที่ลูกค้าใช้ตอนฝาก */
export function restockAlertMessage(a: {
  lang: CustomerLang;
  shopName: string;
  customerName: string | null;
  kind: "product" | "drop";
  itemName: string;
  option: string | null;
  url: string | null;
}): ReminderMessage {
  const en = a.lang === "en";
  const item = a.option ? `${a.itemName} (${a.option})` : a.itemName;
  const drop = a.kind === "drop";
  const title = drop ? (en ? `${a.itemName} is now open` : `ชุด ${a.itemName} เปิดขายแล้ว`) : en ? "Back in stock" : "ของกลับมาแล้ว";
  const hi = a.customerName ? (en ? `Hi ${a.customerName},` : `สวัสดีคุณ${a.customerName}`) : en ? "Hi," : "สวัสดีค่ะ";
  const body = drop
    ? en
      ? `The drop you were waiting for — ${a.itemName} — is now open. Favourite pieces tend to sell out fast.`
      : `ชุด ${a.itemName} ที่คุณรอ เปิดขายแล้ว — ชิ้นที่ชอบมักหมดเร็ว`
    : en
      ? `Good news — ${item} is back in stock.`
      : `${item} ที่คุณรอ กลับมามีของแล้ว`;
  const btn = drop ? (en ? "Shop the drop" : "ดูชุดนี้") : en ? "Order now" : "สั่งซื้อเลย";
  const text = [hi, "", body, a.url ? `${btn}: ${a.url}` : "", "", a.shopName].filter((x, i, arr) => x !== "" || arr[i - 1] !== "").join("\n").trim();
  const line = [`🔔 ${title} · ${a.shopName}`, body, a.url ? `${btn}: ${a.url}` : ""].filter(Boolean).join("\n");
  return {
    subject: `${a.shopName}: ${title}`,
    email: { lang: a.lang, shopName: a.shopName, title, lines: [hi, body], button: a.url ? { text: btn, href: a.url } : undefined, foot: restockFoot(a.lang) },
    text: `${text}\n\n${restockFoot(a.lang)}`,
    line,
  };
}

/** คำขอนี้ถึงเวลาแจ้งหรือยัง — สินค้า: เผยแพร่ + ไม่ได้ตั้ง "หมด" · ชุด: ถึงเวลาเปิดแล้ว */
export function restockReady(
  r: { parent_sku_id: string | null; drop_id: string | null },
  inStock: ReadonlySet<string>,
  dropStart: ReadonlyMap<string, number>,
  now = Date.now(),
): boolean {
  if (r.drop_id) {
    const t = dropStart.get(r.drop_id);
    return t != null && t <= now;
  }
  return !!r.parent_sku_id && inStock.has(r.parent_sku_id);
}

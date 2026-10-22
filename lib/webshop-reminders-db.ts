/**
 * 🔔 เตือนลืมของในตะกร้า + แจ้งของที่ถูกใจลดราคา (ชุด 5) — ส่วนอ่าน/เขียน DB + ส่งจริง (ฝั่งเซิร์ฟเวอร์เท่านั้น)
 * กฎ/ถ้อยคำ: lib/webshop-reminders.ts · ช่องทาง: อีเมล (lib/email · ต้องยืนยันอีเมลแล้ว) + LINE OA ร้าน (lib/webshop-line)
 *
 * รอบตรวจ (Vercel Hobby เพิ่ม cron ไม่ได้แล้ว) — "เรียกระหว่างทาง" ห่างกันอย่างน้อย 30 นาทีต่อร้าน:
 *   • ลูกค้าเปิดเว็บ (/api/public/storefront/stats) · พนักงานเปิดแท็บออเดอร์ (/api/website/orders) → maybeRunWebshopReminders
 *   • หรือเรียก /api/cron/webshop-reminders เอง (CRON_SECRET / คนมีสิทธิ์ products.edit)
 * กันส่งซ้ำ: "จองแถวก่อนส่ง" ด้วยเงื่อนไขในคำสั่ง update (2 รอบชนกัน = คนเดียวได้ส่ง) · ส่งไม่สำเร็จไม่ส่งใหม่ (ไม่สแปม)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeSiteInfo, type SiteInfo } from "@/lib/website-site-info";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { customerLang, localizedUrl, type CustomerLang } from "@/lib/customer-messages";
import { sendEmail } from "@/lib/email";
import { emailLayout } from "@/lib/email-layout";
import { lineTextToMember } from "@/lib/webshop-line";
import { writeAudit } from "@/lib/audit";
import { normalizeFieldMap, resolveProduct, attachNameRefs, nameRuleNeedsRefs, PARENT_SELECT, CHILD_SELECT, type ParentRow, type ChildSku, type ListingRow } from "@/lib/website-field-map";
import { productHref } from "@/lib/website-links";
import {
  CART_MAX_AGE_DAYS,
  REMINDER_RUN_EVERY_MIN,
  WISHLIST_MAX_PER_MESSAGE,
  cartDue,
  cartHash,
  cartReminderMessage,
  priceDropped,
  wishlistAlertMessage,
  type CartItem,
  type PriceDrop,
  type ReminderMessage,
} from "@/lib/webshop-reminders";

type Admin = ReturnType<typeof supabaseAdmin>;

interface Shop {
  id: string;
  name: string;
  slug: string;
  field_map: unknown;
}
interface Member {
  id: string;
  name: string;
  email: string | null;
  email_verified: boolean;
  marketing_opt_in: boolean;
  status: string;
}
export interface ReminderRunResult {
  shop: string;
  carts: { due: number; sent: number };
  wishlist: { drops: number; sent: number };
}

/** เวลารอบตรวจล่าสุดของร้าน (store_settings) */
const RUN_KEY = "reminders_last_run";
const CHUNK = 150;

const chunks = <T,>(arr: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function membersById(sb: Admin, ids: string[]): Promise<Map<string, Member>> {
  const out = new Map<string, Member>();
  for (const part of chunks([...new Set(ids)])) {
    const { data } = await sb.from("store_customers").select("id, name, email, email_verified, marketing_opt_in, status").in("id", part);
    for (const m of (data ?? []) as Member[]) out.set(m.id, m);
  }
  return out;
}

const canMarket = (m: Member | undefined): m is Member => !!m && m.status === "active" && m.marketing_opt_in;

/** ส่งทั้ง 2 ช่องทาง (อีเมลที่ยืนยันแล้ว + LINE) — คืนช่องทางที่ส่งสำเร็จ */
async function deliver(sb: Admin, shop: Shop, m: Member, msg: ReminderMessage): Promise<string[]> {
  const ok: string[] = [];
  if (m.email && m.email_verified) {
    const r = await sendEmail({ to: m.email, subject: msg.subject, html: emailLayout(msg.email), text: msg.text, fromName: shop.name });
    if (r.ok) ok.push("email");
  }
  if (await lineTextToMember(sb, shop.id, m.id, msg.line)) ok.push("line");
  return ok;
}

/* ─────────── 🛒 ตะกร้าค้าง ─────────── */

export async function runCartReminders(sb: Admin, shop: Shop, info: SiteInfo, siteUrl: string | null, now = Date.now()): Promise<{ due: number; sent: number }> {
  if (!info.cart_reminder_enabled) return { due: 0, sent: 0 };
  const hours = info.cart_reminder_hours;
  const { data } = await sb
    .from("store_member_carts")
    .select("customer_id, items, total, lang, updated_at, reminded_hash")
    .eq("shop_id", shop.id)
    .gte("updated_at", new Date(now - CART_MAX_AGE_DAYS * 86_400_000).toISOString())
    .lte("updated_at", new Date(now - hours * 3_600_000).toISOString())
    .limit(200);
  type Row = { customer_id: string; items: CartItem[]; total: number; lang: string; updated_at: string; reminded_hash: string | null };
  const rows = ((data ?? []) as Row[]).filter((r) => Array.isArray(r.items) && cartDue(r, hours, now));
  if (!rows.length) return { due: 0, sent: 0 };
  const members = await membersById(sb, rows.map((r) => r.customer_id));
  let sent = 0;
  for (const r of rows) {
    const m = members.get(r.customer_id);
    if (!canMarket(m)) continue;
    const hash = cartHash(r.items);
    // 🔒 จองก่อนส่ง — ตะกร้าเปลี่ยนระหว่างนี้ (updated_at ไม่ตรง) หรือรอบอื่นจองไปแล้ว = ข้าม
    const { data: claimed } = await sb
      .from("store_member_carts")
      .update({ reminded_at: new Date(now).toISOString(), reminded_hash: hash })
      .eq("customer_id", r.customer_id)
      .eq("updated_at", r.updated_at)
      .or(`reminded_hash.is.null,reminded_hash.neq.${hash}`)
      .select("customer_id");
    if (!claimed?.length) continue;
    const lang = customerLang(r.lang);
    const msg = cartReminderMessage({ lang, shopName: shop.name, customerName: m.name, items: r.items, total: Number(r.total) || 0, cartUrl: localizedUrl(siteUrl, "/cart", lang) });
    const channels = await deliver(sb, shop, m, msg);
    if (!channels.length) continue;
    sent++;
    await writeAudit(sb, { action: "notify", entityType: "store_member_carts", entityId: r.customer_id, actorId: null, actorName: "system", metadata: { shop_id: shop.id, kind: "cart_reminder", items: r.items.length, total: Number(r.total) || 0, channels } });
  }
  return { due: rows.length, sent };
}

/* ─────────── ❤️ ของถูกใจลดราคา ─────────── */

interface LivePrice {
  price: number;
  name: string;
  nameEn: string;
  code: string;
}

/** ราคาขายบนเว็บตอนนี้ (สูตรเดียวกับหน้าเว็บ · ราคาต่ำสุดของตัวเลือก · ไม่รวมโปรอัตโนมัติ/คูปอง) — เฉพาะที่เปิดขายและไม่ได้ตั้ง "หมด" */
export async function livePrices(sb: Admin, shop: Shop, parentIds: string[]): Promise<Map<string, LivePrice>> {
  const out = new Map<string, LivePrice>();
  const fieldMap = normalizeFieldMap(shop.field_map);
  for (const ids of chunks([...new Set(parentIds)])) {
    const [{ data: listings }, { data: parents }, { data: kids }] = await Promise.all([
      sb
        .from("store_listings")
        .select("parent_sku_id, is_published, web_name, web_price, web_description, web_images, web_unit, web_category, web_categories, web_options, web_personalize, web_stock_status, web_variant_off")
        .eq("shop_id", shop.id)
        .in("parent_sku_id", ids),
      sb.from("parent_skus_v2").select(PARENT_SELECT).in("id", ids),
      sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", ids).eq("is_active", true),
    ]);
    const parentRows = (parents ?? []) as ParentRow[];
    if (nameRuleNeedsRefs(fieldMap)) await attachNameRefs(sb, parentRows);
    const listingOf = new Map(((listings ?? []) as (ListingRow & { parent_sku_id: string; is_published: boolean; web_stock_status?: string | null })[]).map((l) => [l.parent_sku_id, l]));
    const kidsOf = new Map<string, ChildSku[]>();
    for (const k of (kids ?? []) as (ChildSku & { parent_sku_id: string })[]) kidsOf.set(k.parent_sku_id, [...(kidsOf.get(k.parent_sku_id) ?? []), k]);
    for (const p of parentRows) {
      const l = listingOf.get(p.id);
      if (!l?.is_published || l.web_stock_status === "out") continue;
      const r = resolveProduct(fieldMap, p, kidsOf.get(p.id) ?? [], l, null);
      const price = Math.round((Number(r.price) || 0) * 100) / 100;
      if (price > 0) out.set(p.id, { price, name: r.name, nameEn: r.name_en || r.name, code: String(p.code ?? "") });
    }
  }
  return out;
}

/** ภาษาของสมาชิก = ภาษาที่ใช้สั่งครั้งล่าสุด (ไม่เคยสั่ง = ไทย) */
async function memberLang(sb: Admin, customerId: string): Promise<CustomerLang> {
  const { data } = await sb.from("store_orders").select("lang").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return customerLang((data as { lang?: string } | null)?.lang);
}

export async function runWishlistAlerts(sb: Admin, shop: Shop, info: SiteInfo, siteUrl: string | null): Promise<{ drops: number; sent: number }> {
  if (!info.wishlist_alert_enabled) return { drops: 0, sent: 0 };
  const { data } = await sb.from("store_wishlists").select("id, customer_id, parent_sku_id, price_at_add, alerted_price").eq("shop_id", shop.id).limit(5000);
  type Row = { id: string; customer_id: string; parent_sku_id: string; price_at_add: number | null; alerted_price: number | null };
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { drops: 0, sent: 0 };
  const prices = await livePrices(sb, shop, rows.map((r) => r.parent_sku_id));

  // ราคาอ้างอิง: ยังไม่มี = ตั้งเป็นราคาตอนนี้ (ครั้งแรกที่ตรวจ) — ต่อสินค้า 1 คำสั่ง
  const needBase = [...new Set(rows.filter((r) => r.price_at_add == null && prices.has(r.parent_sku_id)).map((r) => r.parent_sku_id))];
  for (const pid of needBase) {
    await sb.from("store_wishlists").update({ price_at_add: prices.get(pid)!.price }).eq("shop_id", shop.id).eq("parent_sku_id", pid).is("price_at_add", null);
  }

  const pct = info.wishlist_alert_pct;
  const byCustomer = new Map<string, { row: Row; live: LivePrice; ratio: number }[]>();
  for (const r of rows) {
    const live = prices.get(r.parent_sku_id);
    if (r.price_at_add == null || !live) continue;
    const base = Number(r.price_at_add);
    if (!priceDropped(base, live.price, pct, r.alerted_price == null ? null : Number(r.alerted_price))) continue;
    byCustomer.set(r.customer_id, [...(byCustomer.get(r.customer_id) ?? []), { row: r, live, ratio: live.price / base }]);
  }
  if (!byCustomer.size) return { drops: 0, sent: 0 };

  const members = await membersById(sb, [...byCustomer.keys()]);
  let drops = 0;
  let sent = 0;
  for (const [cid, list] of byCustomer) {
    const m = members.get(cid);
    if (!canMarket(m)) continue;
    const picked = list.sort((a, b) => a.ratio - b.ratio).slice(0, WISHLIST_MAX_PER_MESSAGE);
    // 🔒 จองก่อนส่ง (ราคาที่แจ้ง) — รอบอื่นแจ้งราคานี้ไปแล้ว = ข้ามชิ้นนั้น
    const claimed: typeof picked = [];
    for (const d of picked) {
      const { data: ok } = await sb
        .from("store_wishlists")
        .update({ alerted_price: d.live.price })
        .eq("id", d.row.id)
        .or(`alerted_price.is.null,alerted_price.gt.${d.live.price}`)
        .select("id");
      if (ok?.length) claimed.push(d);
    }
    if (!claimed.length) continue;
    drops += claimed.length;
    const lang = await memberLang(sb, cid);
    const items: PriceDrop[] = claimed.map((d) => ({
      name: lang === "en" ? d.live.nameEn : d.live.name,
      oldPrice: Number(d.row.price_at_add),
      newPrice: d.live.price,
      url: d.live.code ? localizedUrl(siteUrl, productHref(d.live.code), lang) : null,
    }));
    const msg = wishlistAlertMessage({ lang, shopName: shop.name, customerName: m.name, drops: items, accountUrl: localizedUrl(siteUrl, "/account", lang) });
    const channels = await deliver(sb, shop, m, msg);
    if (!channels.length) continue;
    sent++;
    await writeAudit(sb, { action: "notify", entityType: "store_wishlists", entityId: cid, actorId: null, actorName: "system", metadata: { shop_id: shop.id, kind: "wishlist_price_drop", items: items.map((i) => ({ name: i.name, from: i.oldPrice, to: i.newPrice })), channels } });
  }
  return { drops, sent };
}

/* ─────────── รอบตรวจ ─────────── */

/** ตรวจทุกร้านที่เปิดไว้ (หรือร้านเดียว) — ร้านที่ปิดทั้ง 2 อย่าง = ข้าม */
export async function runWebshopReminders(sb: Admin, opts: { shopId?: string } = {}): Promise<ReminderRunResult[]> {
  let q = sb.from("shops").select("id, name, slug, field_map, status").eq("status", "active");
  if (opts.shopId) q = q.eq("id", opts.shopId);
  const { data: shops } = await q;
  const list = (shops ?? []) as Shop[];
  if (!list.length) return [];
  const urls = await loadShopSiteUrls(sb, list.map((s) => s.id));
  const out: ReminderRunResult[] = [];
  for (const shop of list) {
    const { data: rows } = await sb.from("store_settings").select("key, value").eq("shop_id", shop.id);
    const info = normalizeSiteInfo(Array.isArray(rows) ? rows : []);
    if (!info.cart_reminder_enabled && !info.wishlist_alert_enabled) continue;
    await sb.from("store_settings").upsert({ shop_id: shop.id, key: RUN_KEY, value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });
    const siteUrl = urls.get(shop.id) ?? null;
    const carts = await runCartReminders(sb, shop, info, siteUrl);
    const wishlist = await runWishlistAlerts(sb, shop, info, siteUrl);
    out.push({ shop: shop.slug, carts, wishlist });
  }
  return out;
}

// จำในเครื่องว่าเพิ่งเช็กร้านไหนไป (ลดการอ่าน DB ทุกคำขอ) — ตัวกันจริงอยู่ที่ store_settings
const checkedAt = new Map<string, number>();

/** เรียกระหว่างทาง (หลังตอบคำขอแล้ว · ใน after()) — ห่างกันอย่างน้อย 30 นาทีต่อร้าน · พังเงียบ */
export async function maybeRunWebshopReminders(sb: Admin, shopId: string): Promise<void> {
  try {
    const now = Date.now();
    if ((checkedAt.get(shopId) ?? 0) > now - 5 * 60_000) return;
    checkedAt.set(shopId, now);
    const { data } = await sb.from("store_settings").select("key, value").eq("shop_id", shopId).in("key", [RUN_KEY, "cart_reminder_enabled", "wishlist_alert_enabled"]);
    const rows = (data ?? []) as { key: string; value: unknown }[];
    const flags = normalizeSiteInfo(rows);
    if (!flags.cart_reminder_enabled && !flags.wishlist_alert_enabled) return;
    const last = Date.parse(String(rows.find((r) => r.key === RUN_KEY)?.value ?? ""));
    if (Number.isFinite(last) && last > now - REMINDER_RUN_EVERY_MIN * 60_000) return;
    await runWebshopReminders(sb, { shopId });
  } catch (e) {
    console.error("[webshop-reminders]", e);
  }
}

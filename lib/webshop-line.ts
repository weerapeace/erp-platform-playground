/**
 * 💬 LINE ของเว็บร้าน (ชุด 5) — ฝั่งเซิร์ฟเวอร์เท่านั้น · พังไม่ล้มออเดอร์/การบันทึก (เงียบ + audit)
 *
 * 1) แจ้งพนักงานในกลุ่ม LINE "🛍 เว็บร้าน" — ใช้บอทบริษัทเดิม (line_config) · ตั้งกลุ่ม/เปิดปิดรายเหตุการณ์ที่ ERP › ศูนย์ LINE
 *    ออเดอร์ใหม่ · ลูกค้าแนบสลิป · ลูกค้าขอคืน/เปลี่ยน (แม่แบบข้อความ DEFAULT_TPL ใน lib/board-notify)
 * 2) แจ้งลูกค้าทาง LINE OA ของร้าน — สมาชิกที่เข้าสู่ระบบด้วย LINE (store_customer_identities provider=line)
 *    ต้อง: ร้านเปิด line_notify_enabled · ตั้ง env LINE_OA_TOKEN_<SLUG> (Channel access token ของ OA ร้าน — ความลับ)
 *    · LINE Login กับ OA อยู่ Provider เดียวกัน · ลูกค้าแอดเพื่อน OA แล้ว (ไม่งั้น LINE ปฏิเสธ — ข้ามเงียบ ๆ)
 *    ถ้อยคำเดียวกับอีเมล/ปุ่มคัดลอก (lib/customer-messages orderMessage · ภาษาตามที่ลูกค้าสั่ง)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { boardLink, pushLineTpl } from "@/lib/board-notify";
import { writeAudit } from "@/lib/audit";
import { readSiteInfo } from "@/lib/website-site-info";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { customerLang, orderMessage, type OrderEvent } from "@/lib/customer-messages";
import { toOrderView, type ItemRow, type OrderRow } from "@/lib/website-orders";

type Admin = ReturnType<typeof supabaseAdmin>;

const baht = (n: unknown) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const PAY: Record<string, string> = { cod: "เก็บปลายทาง", promptpay: "โอนพร้อมเพย์" };

/* ─────────── 1) พนักงาน ─────────── */

async function shopOf(sb: Admin, shopId: string): Promise<{ name: string; slug: string }> {
  const { data } = await sb.from("shops").select("name, slug").eq("id", shopId).maybeSingle();
  return (data as { name: string; slug: string } | null) ?? { name: "", slug: "" };
}

/** 🛒 ออเดอร์เว็บใหม่ → กลุ่มเว็บร้าน */
export async function notifyStaffNewOrder(sb: Admin, orderId: string): Promise<void> {
  try {
    const { data } = await sb.from("store_orders").select("shop_id, order_no, grand_total, payment_method, customer_name").eq("id", orderId).maybeSingle();
    const o = data as { shop_id: string; order_no: string; grand_total: number; payment_method: string; customer_name: string } | null;
    if (!o) return;
    const [{ data: items }, shop] = await Promise.all([sb.from("store_order_items").select("qty").eq("order_id", orderId), shopOf(sb, o.shop_id)]);
    const qty = ((items ?? []) as { qty: number }[]).reduce((s, i) => s + (Number(i.qty) || 0), 0);
    await pushLineTpl(sb, "webshop", "webshop_order", { shop: shop.name, order_no: o.order_no, total: baht(o.grand_total), payment: PAY[o.payment_method] ?? o.payment_method, customer: o.customer_name, items: qty, link: boardLink(`/website/${shop.slug}?tab=orders`) });
  } catch {
    /* เงียบ */
  }
}

/** 💳 ลูกค้าแนบสลิปแล้วต้องให้คนตรวจ → กลุ่มเว็บร้าน */
export async function notifyStaffSlip(sb: Admin, shopId: string, orderNo: string): Promise<void> {
  try {
    const { data } = await sb.from("store_orders").select("order_no, grand_total, deposit_amount, payment_status").eq("shop_id", shopId).eq("order_no", orderNo).maybeSingle();
    const o = data as { order_no: string; grand_total: number; deposit_amount: number | null; payment_status: string } | null;
    if (!o) return;
    const shop = await shopOf(sb, shopId);
    const amount = o.deposit_amount && o.payment_status !== "partial" ? o.deposit_amount : o.grand_total;
    await pushLineTpl(sb, "webshop", "webshop_slip", { shop: shop.name, order_no: o.order_no, amount: baht(amount), link: boardLink(`/website/${shop.slug}?tab=orders`) });
  } catch {
    /* เงียบ */
  }
}

/** ↩️ ลูกค้าขอคืน/เปลี่ยน → กลุ่มเว็บร้าน */
export async function notifyStaffReturn(sb: Admin, shopId: string, orderNo: string, kind: string, reasonLabel: string): Promise<void> {
  try {
    const shop = await shopOf(sb, shopId);
    await pushLineTpl(sb, "webshop", "webshop_return", { shop: shop.name, order_no: orderNo, kind: kind === "exchange" ? "เปลี่ยน" : "คืน", reason: reasonLabel, link: boardLink(`/website/${shop.slug}?tab=returns`) });
  } catch {
    /* เงียบ */
  }
}

/* ─────────── 2) ลูกค้า (LINE OA ของร้าน) ─────────── */

/** Channel access token ของ OA ร้าน (env LINE_OA_TOKEN_<SLUG ตัวใหญ่ ขีด → _>) · ไม่ตั้ง = null */
export function shopLineToken(slug: string): string | null {
  const key = `LINE_OA_TOKEN_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[key]?.trim() || null;
}

/** LINE userId ของสมาชิก (เข้าด้วย LINE) · ไม่มี = null */
export async function memberLineUserId(sb: Admin, customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await sb.from("store_customer_identities").select("provider_user_id").eq("customer_id", customerId).eq("provider", "line").limit(1).maybeSingle();
  return ((data as { provider_user_id: string } | null)?.provider_user_id ?? "").trim() || null;
}

/** ส่งข้อความถึงลูกค้า 1 คน — ok / เหตุผลที่ไม่ได้ส่ง */
export async function pushLineToCustomer(token: string, userId: string, text: string): Promise<{ ok: boolean; status: number }> {
  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** เหตุการณ์ออเดอร์ที่ส่ง LINE ให้ลูกค้าอัตโนมัติ */
export const LINE_ORDER_EVENTS: readonly OrderEvent[] = ["placed", "paid", "shipped", "completed", "cancelled", "refunded"];

/** แจ้งสถานะออเดอร์ทาง LINE OA (อัตโนมัติ · เรียกจาก lib/order-notify) — คืน true เมื่อส่งสำเร็จ */
export async function notifyOrderLine(sb: Admin, orderId: string, event: OrderEvent): Promise<boolean> {
  try {
    if (!LINE_ORDER_EVENTS.includes(event)) return false;
    const { data: o } = await sb.from("store_orders").select("*").eq("id", orderId).maybeSingle();
    const row = o as (OrderRow & { shop_id: string; customer_id: string | null }) | null;
    if (!row?.customer_id) return false;
    const info = await readSiteInfo(sb, row.shop_id);
    if (!info.line_notify_enabled) return false;
    const shop = await shopOf(sb, row.shop_id);
    const token = shopLineToken(shop.slug);
    const userId = token ? await memberLineUserId(sb, row.customer_id) : null;
    if (!token || !userId) return false;
    const lang = customerLang(row.lang);
    const [{ data: items }, urls] = await Promise.all([
      sb.from("store_order_items").select("name, variant_label, name_en, variant_label_en, unit_price, qty, line_total").eq("order_id", row.id).order("id"),
      loadShopSiteUrls(sb, [row.shop_id]),
    ]);
    const view = toOrderView(row, (items ?? []) as ItemRow[], info, lang);
    const msg = orderMessage(event, view, { name: shop.name, siteUrl: urls.get(row.shop_id) ?? null, contactLine: info.contact_line, contactPhone: info.contact_phone }, lang);
    const sent = await pushLineToCustomer(token, userId, msg.text);
    await writeAudit(sb, { action: "notify", entityType: "store_orders", entityId: row.id, actorId: null, actorName: "system", metadata: { orderNo: row.order_no, shopId: row.shop_id, channel: "line", event, lang, ok: sent.ok, status: sent.status } });
    return sent.ok;
  } catch {
    return false;
  }
}

/** ข้อความสั้นถึงลูกค้า (ไม่ใช่เหตุการณ์ออเดอร์ เช่น ผลขอคืน/ตะกร้าค้าง/ของลดราคา) · ไม่พร้อม = false */
export async function lineTextToMember(sb: Admin, shopId: string, customerId: string | null | undefined, text: string): Promise<boolean> {
  try {
    const info = await readSiteInfo(sb, shopId);
    if (!info.line_notify_enabled) return false;
    const shop = await shopOf(sb, shopId);
    const token = shopLineToken(shop.slug);
    const userId = token ? await memberLineUserId(sb, customerId) : null;
    if (!token || !userId) return false;
    return (await pushLineToCustomer(token, userId, text)).ok;
  } catch {
    return false;
  }
}

/**
 * ✉️ แจ้งลูกค้าเรื่องออเดอร์ทางอีเมล — ในภาษาที่ลูกค้าใช้ตอนสั่ง (store_orders.lang) · ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * อัตโนมัติ (ตอนสั่ง + ตอนพนักงานเปลี่ยนสถานะ) ส่งเมื่อครบ 3 ข้อ:
 *   1) ร้านเปิด "ส่งอีเมลแจ้งลูกค้าอัตโนมัติ" (ข้อมูลร้าน order_email_enabled · ค่าเริ่ม ปิด)
 *   2) ลูกค้ากรอกอีเมลตอนสั่ง  3) ตั้งค่าการส่งอีเมลแล้ว (RESEND_API_KEY + EMAIL_FROM — lib/email)
 * พนักงานกด "✉️ ส่งอีเมล" เอง (force) = ไม่ต้องเปิดข้อ 1
 * ทุกครั้งที่ส่ง (สำเร็จ/ไม่สำเร็จ) เขียน audit "notify" — พังไม่ล้มออเดอร์/การเปลี่ยนสถานะ
 * ถ้อยคำ: lib/customer-messages (ที่เดียวกับปุ่มคัดลอกข้อความในแท็บออเดอร์)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { emailConfigured, emailDevEcho, sendEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { readSiteInfo } from "@/lib/website-site-info";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { AUTO_EMAIL_EVENTS, customerLang, orderEmail, type OrderEvent } from "@/lib/customer-messages";
import { toOrderView, type ItemRow, type OrderRow } from "@/lib/website-orders";

type Admin = ReturnType<typeof supabaseAdmin>;

export type NotifyResult = {
  event: OrderEvent;
  lang: "th" | "en";
  sent: boolean;
  /** off = ร้านไม่ได้เปิดอัตโนมัติ · no-email = ลูกค้าไม่ได้ให้อีเมล · not-configured = ยังไม่ตั้งระบบส่งอีเมล */
  reason?: "off" | "no-email" | "not-configured" | "send-failed" | "not-found";
};

/** ข้อความภาษาคนให้พนักงาน (ไม่ส่ง = บอกเหตุผล) */
export function notifyNote(r: NotifyResult | null | undefined): string {
  if (!r) return "";
  const lang = r.lang === "en" ? "ภาษาอังกฤษ" : "ภาษาไทย";
  if (r.sent) return `✉️ ส่งอีเมลแจ้งลูกค้าแล้ว (${lang})`;
  if (r.reason === "no-email") return "ลูกค้าไม่ได้กรอกอีเมล — คัดลอกข้อความไปส่ง LINE/SMS แทนได้";
  if (r.reason === "not-configured") return "ยังไม่ได้ตั้งค่าระบบส่งอีเมล (RESEND_API_KEY / EMAIL_FROM)";
  if (r.reason === "send-failed") return "ส่งอีเมลไม่สำเร็จ — ลองกดส่งใหม่ หรือคัดลอกข้อความไปส่งเอง";
  return "";
}

export async function notifyOrderCustomer(
  sb: Admin,
  orderId: string,
  event: OrderEvent,
  opts: { force?: boolean; actorId?: string | null; actorName?: string | null } = {}
): Promise<NotifyResult> {
  const { data: o } = await sb.from("store_orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return { event, lang: "th", sent: false, reason: "not-found" };
  const row = o as OrderRow & { shop_id: string; customer_email: string | null };
  const lang = customerLang(row.lang);
  const info = await readSiteInfo(sb, row.shop_id);

  const result = (r: Omit<NotifyResult, "event" | "lang">): NotifyResult => ({ event, lang, ...r });
  if (!opts.force && (!info.order_email_enabled || !AUTO_EMAIL_EVENTS.includes(event))) return result({ sent: false, reason: "off" });
  const to = (row.customer_email ?? "").trim();
  if (!to) return result({ sent: false, reason: "no-email" });
  if (!emailConfigured() && !emailDevEcho()) return result({ sent: false, reason: "not-configured" });

  const [{ data: items }, { data: shop }, urls] = await Promise.all([
    sb.from("store_order_items").select("name, variant_label, name_en, variant_label_en, unit_price, qty, line_total").eq("order_id", row.id).order("id"),
    sb.from("shops").select("name").eq("id", row.shop_id).maybeSingle(),
    loadShopSiteUrls(sb, [row.shop_id]),
  ]);
  const view = toOrderView(row, (items ?? []) as ItemRow[], info, lang);
  const en = lang === "en";
  const pick = (k: string) => String((en ? info[`${k}_en` as `${string}_en`] : "") || (info as unknown as Record<string, unknown>)[k] || "");
  const mail = orderEmail(to, event, view, {
    name: (shop as { name?: string } | null)?.name ?? "",
    siteUrl: urls.get(row.shop_id) ?? null,
    orderNote: pick("order_note"),
    contactLine: info.contact_line,
    contactPhone: info.contact_phone,
  }, lang);

  const sent = await sendEmail(mail);
  await writeAudit(sb, {
    action: "notify",
    entityType: "store_orders",
    entityId: row.id,
    actorId: opts.actorId ?? null,
    actorName: opts.actorName ?? (opts.force ? null : "system"),
    metadata: { orderNo: row.order_no, shopId: row.shop_id, channel: "email", event, lang, auto: !opts.force, ok: sent.ok, ...(sent.ok ? {} : { error: sent.error }) },
  });
  return sent.ok ? result({ sent: true }) : result({ sent: false, reason: sent.error === "email-not-configured" ? "not-configured" : "send-failed" });
}

/**
 * 🖨 แจ้งลูกค้าเมื่อร้าน "ขอรูปใหม่" / "ปฏิเสธลาย" รีด — ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * ส่งทางเดิมของร้าน (ไม่มีช่องทางใหม่):
 *   - 💬 LINE OA ของร้าน — ร้านเปิด line_notify_enabled + มี LINE_OA_TOKEN_<SLUG> + ลูกค้าเป็นสมาชิกที่เข้าด้วย LINE (lib/webshop-line)
 *   - ✉️ อีเมล — ลูกค้ากรอกอีเมลตอนสั่ง + ตั้งระบบส่งอีเมลแล้ว (lib/email) · พนักงานกดเอง = ไม่ต้องเปิดสวิตช์อีเมลอัตโนมัติของร้าน
 * ถ้อยคำ: lib/customer-messages printReviewMessage · ทุกครั้งที่ส่งเขียน audit "notify"
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { emailConfigured, emailDevEcho, sendEmail } from "@/lib/email";
import { readSiteInfo } from "@/lib/website-site-info";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { customerLang, printReviewEmail, printReviewMessage, type PrintReviewEvent } from "@/lib/customer-messages";
import { lineTextToMember, memberLineUserId, shopLineToken } from "@/lib/webshop-line";

type Admin = ReturnType<typeof supabaseAdmin>;

export type PrintNotifyResult = {
  line: boolean;
  email: "sent" | "no-email" | "not-configured" | "failed";
  /** ข้อความที่ใช้ (ให้พนักงานคัดลอกไปส่งเองได้ถ้าไม่ถึงลูกค้า) */
  text: string;
};

type OrderLite = { id: string; order_no: string; customer_name: string; customer_email: string | null; customer_id: string | null; lang: string | null };

async function orderOf(sb: Admin, shopId: string, orderRef: string | null): Promise<OrderLite | null> {
  if (!orderRef) return null;
  const { data } = await sb.from("store_orders").select("id, order_no, customer_name, customer_email, customer_id, lang").eq("shop_id", shopId).eq("order_no", orderRef).maybeSingle();
  return (data as OrderLite | null) ?? null;
}

/** ส่งถึงลูกค้าทางไหนได้บ้าง (โชว์ในแท็บออเดอร์ก่อนกด) */
export async function printNotifyChannels(sb: Admin, shopId: string, shopSlug: string, orderRef: string | null): Promise<{ email: boolean; line: boolean }> {
  const o = await orderOf(sb, shopId, orderRef);
  if (!o) return { email: false, line: false };
  const info = await readSiteInfo(sb, shopId);
  const email = !!o.customer_email?.trim() && (emailConfigured() || emailDevEcho());
  const line = !!info.line_notify_enabled && !!shopLineToken(shopSlug) && !!(await memberLineUserId(sb, o.customer_id));
  return { email, line };
}

/** แจ้งผลตรวจลาย — ไม่พบออเดอร์ = null · พังไม่ล้มการบันทึกผลตรวจ */
export async function notifyPrintReview(
  sb: Admin,
  shop: { id: string; slug: string },
  design: { id: string; code: string; order_ref: string | null },
  ev: PrintReviewEvent,
  note: string,
  actor: { id: string | null; name: string | null },
): Promise<PrintNotifyResult | null> {
  const o = await orderOf(sb, shop.id, design.order_ref);
  if (!o) return null;
  const lang = customerLang(o.lang);
  const [info, { data: shopRow }, urls] = await Promise.all([
    readSiteInfo(sb, shop.id),
    sb.from("shops").select("name").eq("id", shop.id).maybeSingle(),
    loadShopSiteUrls(sb, [shop.id]),
  ]);
  const shopName = (shopRow as { name?: string } | null)?.name ?? "";
  const msg = printReviewMessage(ev, { orderNo: o.order_no, customerName: o.customer_name, designCode: design.code, note }, { name: shopName, siteUrl: urls.get(shop.id) ?? null, contactLine: info.contact_line, contactPhone: info.contact_phone }, lang);
  const audit = (channel: "line" | "email", ok: boolean, extra: Record<string, unknown> = {}) =>
    writeAudit(sb, { action: "notify", entityType: "store_orders", entityId: o.id, actorId: actor.id, actorName: actor.name, metadata: { orderNo: o.order_no, shopId: shop.id, channel, event: `print_${ev}`, design: design.code, lang, ok, ...extra } });

  let line = false;
  try {
    line = await lineTextToMember(sb, shop.id, o.customer_id, msg.text);
    if (line) await audit("line", true);
  } catch {
    line = false;
  }

  let email: PrintNotifyResult["email"] = "no-email";
  const to = (o.customer_email ?? "").trim();
  if (to) {
    if (!emailConfigured() && !emailDevEcho()) email = "not-configured";
    else {
      const sent = await sendEmail(printReviewEmail(to, msg, shopName, lang));
      email = sent.ok ? "sent" : sent.error === "email-not-configured" ? "not-configured" : "failed";
      await audit("email", sent.ok, sent.ok ? {} : { error: sent.error });
    }
  }
  return { line, email, text: msg.text };
}

/** ข้อความภาษาคนให้พนักงาน */
export function printNotifyNote(r: PrintNotifyResult | null): string {
  if (!r) return "ไม่พบออเดอร์ — ยังไม่ได้แจ้งลูกค้า";
  const sent = [r.line ? "LINE" : "", r.email === "sent" ? "อีเมล" : ""].filter(Boolean);
  if (sent.length) return `แจ้งลูกค้าทาง ${sent.join(" + ")} แล้ว`;
  if (r.email === "not-configured") return "ยังไม่ได้ตั้งค่าระบบส่งอีเมล และลูกค้าไม่ได้เข้าด้วย LINE — คัดลอกข้อความไปส่งเอง";
  if (r.email === "failed") return "ส่งอีเมลไม่สำเร็จ — คัดลอกข้อความไปส่งเอง";
  return "ลูกค้าไม่มีอีเมลและไม่ได้เข้าด้วย LINE — คัดลอกข้อความไปส่งเอง";
}

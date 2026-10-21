/**
 * API สาธารณะ — รับออเดอร์จากเว็บร้าน : /api/public/storefront/orders
 *
 * POST { shop, items:[{productId, optionId?, option2Id?, qty}], customer:{name,phone,email?},
 *        ship:{addressLine, subdistrict?, district?, province?, postal?}, paymentMethod:"cod"|"promptpay", note?, lang?:"th"|"en" }
 *      → { ok:true, order:{orderNo, grandTotal, promptpay, ...} }
 *      🌐 lang = ภาษาหน้าเว็บที่ลูกค้าสั่ง → ออเดอร์จำไว้ · ✉️ อีเมลยืนยันส่งหลังตอบลูกค้า (ถ้าร้านเปิด — lib/order-notify)
 * GET  ?shop=<slug>&no=<เลขที่>&phone=<เบอร์>[&lang=en]  → ลูกค้าตามออเดอร์ของตัวเอง (ต้องรู้ทั้งเลขที่และเบอร์)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS
 * ปลอดภัยเพราะ: ราคาคิดใหม่ฝั่งเซิร์ฟเวอร์จาก lib/website-orders.ts เสมอ · รับเฉพาะสินค้าที่เผยแพร่ของร้านนั้น
 * · จำกัด 50 รายการ/ออเดอร์ · ไม่คืนข้อมูลลูกค้าคนอื่น
 */
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { verifyPreviewKey } from "@/lib/storefront-preview-key";
import { createStorefrontOrder, findStorefrontOrder } from "@/lib/website-orders";
import { notifyOrderCustomer } from "@/lib/order-notify";
import { clientIp, parseTracking, sendMetaPurchase } from "@/lib/meta-capi";
import { customerLang } from "@/lib/customer-messages";
import { readSiteInfo } from "@/lib/website-site-info";
import { issueReviewToken } from "@/lib/review-token";
import { REVIEWABLE_ORDER_STATUSES } from "@/lib/website-reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

async function loadShop(slug: string) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("shops").select("id, slug, status, field_map").eq("slug", slug).maybeSingle();
  const s = data as { id: string; slug: string; status: string; field_map: unknown } | null;
  if (!s || s.status !== "active") return null;
  return { sb, shop: s };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  // 🔒 กันยิงรัว (lib/rate-limit · audit 2026-10-21) — ต่อ IP 10 ครั้ง/10 นาที + ต่อเบอร์ 5 ครั้ง/10 นาที
  const phoneKey = String((body.customer as { phone?: unknown } | undefined)?.phone ?? "").replace(/\D/g, "");
  const limited = await overLimit(
    request,
    [
      { name: "orders:ip", limit: 10, windowSec: 600 },
      { name: "orders:phone", limit: 5, windowSec: 600, key: phoneKey },
    ],
    String(body.lang ?? ""),
  );
  if (limited) return json({ ok: false, error: limited }, 429);

  const slug = String(body.shop ?? new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);

  const ctx = await loadShop(slug);
  if (!ctx) return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  // 🔑 ร้านปิดเว็บ: ทดลองสั่งได้เฉพาะจากลิงก์พรีวิวที่มีรหัส (body.pk · lib/storefront-preview-key)
  const result = await createStorefrontOrder(ctx.sb, ctx.shop, body, { allowClosed: verifyPreviewKey(ctx.shop.slug, body.pk) });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  // ✉️ อีเมลยืนยันออเดอร์ (ภาษาของลูกค้า) — ทำหลังตอบหน้าเว็บแล้ว ลูกค้าไม่ต้องรอ · ไม่เปิด/ไม่มีอีเมล = ข้ามเงียบ
  const orderId = result.orderId;
  after(() => notifyOrderCustomer(ctx.sb, orderId, "placed").catch((e) => console.error("[orders] notify placed", e)));
  // 📊 ยอดซื้อไป Meta จากเซิร์ฟเวอร์ (ลูกค้ายินยอมคุกกี้การตลาด + ร้านตั้งโทเค็น · lib/meta-capi)
  const tracking = parseTracking(body.tracking);
  const ip = clientIp(request);
  after(() => sendMetaPurchase(ctx.sb, ctx.shop.id, orderId, tracking, ip).catch((e) => console.error("[orders] meta capi", e)));
  return json({ ok: true, order: result.order }, 201);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 🔒 กันไล่เดาเลขออเดอร์ (lib/rate-limit · audit 2026-10-21)
  const limited = await overLimit(request, [{ name: "order-lookup:ip", limit: 30, windowSec: 600 }]);
  if (limited) return json({ error: limited }, 429);
  const url = new URL(request.url);
  const slug = (url.searchParams.get("shop") ?? "").trim();
  const no = (url.searchParams.get("no") ?? "").trim();
  const phone = (url.searchParams.get("phone") ?? "").trim();
  if (!slug) return json({ error: "ต้องระบุ shop" }, 400);
  if (!no || !phone) return json({ error: "ต้องระบุเลขที่ออเดอร์และเบอร์โทร" }, 400);

  const ctx = await loadShop(slug);
  if (!ctx) return json({ error: "ไม่พบร้าน" }, 404);

  const lang = url.searchParams.get("lang");
  const order = await findStorefrontOrder(ctx.sb, ctx.shop.id, no, phone, lang ? customerLang(lang) : undefined);
  if (!order) return json({ error: "ไม่พบออเดอร์ — ตรวจเลขที่และเบอร์โทรอีกครั้ง" }, 404);
  // ⭐ ส่งแล้ว/สำเร็จ + ร้านเปิดรีวิว → แนบรหัสลิงก์รีวิว (ปุ่ม "รีวิวสินค้า" ในหน้าตามออเดอร์ · ผ่านด่านเลขออเดอร์+เบอร์มาแล้ว)
  let reviewToken: string | null = null;
  // ↩️ ส่งแล้ว/สำเร็จ + ร้านเปิดคืน/เปลี่ยน → ลิงก์หน้าขอคืน/เปลี่ยน (ลายเซ็นชุดเดียวกับลิงก์รีวิว · หน้านั้นตรวจกำหนดวันเอง)
  let returnToken: string | null = null;
  const delivered = (REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(order.status);
  const returnable = order.status === "shipped" || order.status === "completed";
  if (delivered || returnable) {
    const info = await readSiteInfo(ctx.sb, ctx.shop.id);
    if ((delivered && info.reviews_enabled) || (returnable && info.returns_enabled)) {
      const { data: row } = await ctx.sb.from("store_orders").select("id").eq("shop_id", ctx.shop.id).eq("order_no", order.orderNo).maybeSingle();
      const token = row ? issueReviewToken((row as { id: string }).id) : null;
      if (delivered && info.reviews_enabled) reviewToken = token;
      if (returnable && info.returns_enabled) returnToken = token;
    }
  }
  return json({ order, reviewToken, returnToken });
}

/**
 * 👤 สมาชิกสั่งซื้อ — /api/storefront-member/order
 * POST (ข้อมูลเดียวกับ /api/public/storefront/orders) → ออเดอร์ผูกกับสมาชิก (customer_id)
 * เว็บร้านฝั่งเซิร์ฟเวอร์เรียกแทนเบราว์เซอร์ เมื่อมีคนล็อกอินอยู่ (รหัสสมาชิกมาจากคุกกี้ที่เซ็นแล้ว ไม่ใช่จากเบราว์เซอร์)
 * ราคา/ส่วนลดคิดใหม่ฝั่งเซิร์ฟเวอร์เหมือนเดิมทุกอย่าง (lib/website-orders createStorefrontOrder)
 * ⭐ redeemPoints = แต้มที่ขอใช้ลด (ตรวจ + ตัดแต้มแบบล็อกแถวใน createStorefrontOrder)
 */
import { NextRequest, NextResponse, after } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { createStorefrontOrder } from "@/lib/website-orders";
import { notifyOrderCustomer } from "@/lib/order-notify";
import { notifyStaffNewOrder } from "@/lib/webshop-line";
import { parseTracking, sendMetaPurchase } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = await request.json().catch(() => null);
  if (!body) return storefrontJson({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  const { data: shop } = await g.sb.from("shops").select("id, slug, status, field_map").eq("id", g.shop.id).maybeSingle();
  if (!shop) return storefrontJson({ ok: false, error: "ไม่พบร้าน" }, 404);
  const r = await createStorefrontOrder(g.sb, shop as { id: string; slug: string; status: string; field_map: unknown }, body, { customerId: g.member.id, redeemPoints: Number((body as { redeemPoints?: unknown }).redeemPoints) || 0 });
  if (!r.ok) return storefrontJson({ ok: false, error: r.error }, r.status);
  // ✉️ อีเมลยืนยันออเดอร์ในภาษาของลูกค้า (ถ้าร้านเปิด) — หลังตอบแล้ว (lib/order-notify)
  const orderId = r.orderId;
  after(() => notifyOrderCustomer(g.sb, orderId, "placed").catch((e) => console.error("[member-order] notify placed", e)));
  // 🛍 แจ้งกลุ่ม LINE พนักงาน
  after(() => notifyStaffNewOrder(g.sb, orderId));
  // 🛒 สั่งแล้ว = ล้างตะกร้าที่เก็บไว้เตือน (lib/webshop-reminders)
  after(async () => {
    await g.sb.from("store_member_carts").delete().eq("customer_id", g.member.id);
  });
  // 📊 ยอดซื้อไป Meta จากเซิร์ฟเวอร์ (ลูกค้ายินยอมคุกกี้การตลาด + ร้านตั้งโทเค็น) · ทางนี้มาจากเซิร์ฟเวอร์เว็บร้าน = ไม่มี IP ลูกค้า
  const tracking = parseTracking((body as { tracking?: unknown }).tracking);
  after(() => sendMetaPurchase(g.sb, g.shop.id, orderId, tracking, null).catch((e) => console.error("[member-order] meta capi", e)));
  return storefrontJson({ ok: true, order: r.order }, 201);
}

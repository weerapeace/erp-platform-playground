/**
 * 👤 สมาชิกสั่งซื้อ — /api/storefront-member/order
 * POST (ข้อมูลเดียวกับ /api/public/storefront/orders) → ออเดอร์ผูกกับสมาชิก (customer_id)
 * เว็บร้านฝั่งเซิร์ฟเวอร์เรียกแทนเบราว์เซอร์ เมื่อมีคนล็อกอินอยู่ (รหัสสมาชิกมาจากคุกกี้ที่เซ็นแล้ว ไม่ใช่จากเบราว์เซอร์)
 * ราคา/ส่วนลดคิดใหม่ฝั่งเซิร์ฟเวอร์เหมือนเดิมทุกอย่าง (lib/website-orders createStorefrontOrder)
 * ⭐ redeemPoints = แต้มที่ขอใช้ลด (ตรวจ + ตัดแต้มแบบล็อกแถวใน createStorefrontOrder)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { createStorefrontOrder } from "@/lib/website-orders";

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
  return storefrontJson({ ok: true, order: r.order }, 201);
}

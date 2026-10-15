/**
 * 🎟️ สมาชิกลองใส่โค้ดส่วนลด (หน้าชำระเงิน · เข้าสู่ระบบอยู่) — /api/storefront-member/coupon
 * POST { code, subtotal, phone? } → { ok:true, code, discount, label } | { ok:false, error }
 * ต่างจาก /api/public/storefront/coupon แค่ "รู้ว่าเป็นสมาชิกคนไหน" → คูปองเฉพาะสมาชิก/ระดับ ตรวจได้
 * ⚠️ แค่ดูผลล่วงหน้า — ยอดจริงคิดใหม่ตอนสั่ง (createStorefrontOrder → checkCoupon พร้อมรหัสสมาชิก)
 * ด่าน: กุญแจภายใน + สมาชิก (รหัสสมาชิกมาจากคุกกี้ที่เว็บร้านเซ็นไว้ ไม่ใช่จากเบราว์เซอร์)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { checkCoupon } from "@/lib/website-coupons-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return storefrontJson({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  const subtotal = Number(body.subtotal);
  if (!(subtotal >= 0) || subtotal > 10_000_000) return storefrontJson({ ok: false, error: "ยอดสินค้าไม่ถูกต้อง" }, 400);
  const r = await checkCoupon(g.sb, g.shop.id, body.code, subtotal, body.phone, g.member.id);
  if (!r.ok) return storefrontJson({ ok: false, error: r.error }, 200);
  return storefrontJson({ ok: true, code: r.coupon?.code ?? "", discount: r.discount, label: r.label }, 200);
}

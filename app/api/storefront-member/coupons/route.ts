/**
 * 🎟️ คูปองสำหรับสมาชิก — /api/storefront-member/coupons
 * GET → { ok, coupons: [{ code, label, endsAt, minTierName, eligible, used }] }
 *   เฉพาะคูปองที่ร้านตั้ง "เฉพาะสมาชิก" ที่เปิดอยู่ + ยังไม่หมดเขต/ไม่ครบจำนวน · ระดับไม่ถึง = eligible:false (โชว์แบบล็อก)
 * ด่าน: กุญแจภายใน + สมาชิก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { memberCouponList } from "@/lib/website-coupons-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const coupons = await memberCouponList(g.sb, g.shop.id, g.member.id, g.member.phone);
  return storefrontJson({ ok: true, coupons }, 200);
}

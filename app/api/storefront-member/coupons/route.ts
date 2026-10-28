/**
 * 🎟️ คูปองสำหรับสมาชิก — /api/storefront-member/coupons
 * GET → { ok, coupons: [{ code, label, endsAt, minTierName, eligible, used, birthday? }], birthdayOffer: { kind, value, maxDiscount, minSubtotal } | null }
 *   🎂 เปิดในเดือนเกิด (ร้านเปิดคูปองวันเกิด) = ออกคูปองวันเกิดของปีนี้ให้ก่อนแล้วค่อยรวมในรายการ · birthdayOffer = สิทธิ์ (เว็บร้านทำข้อความ 2 ภาษาเอง · ชวนใส่วันเกิด)
 *   เฉพาะคูปองที่ร้านตั้ง "เฉพาะสมาชิก" ที่เปิดอยู่ + ยังไม่หมดเขต/ไม่ครบจำนวน · ระดับไม่ถึง = eligible:false (โชว์แบบล็อก)
 * ด่าน: กุญแจภายใน + สมาชิก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { memberCouponList } from "@/lib/website-coupons-db";
import { ensureBirthdayCoupon } from "@/lib/website-birthday-db";
import { birthdayOffer } from "@/lib/website-birthday";
import { readSiteInfo } from "@/lib/website-site-info";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const info = await readSiteInfo(g.sb, g.shop.id);
  // สมาชิกทดลอง (is_test) ไม่ได้คูปองจริง
  if (!g.member.is_test) await ensureBirthdayCoupon(g.sb, g.shop.id, g.member, info);
  const coupons = await memberCouponList(g.sb, g.shop.id, g.member.id, g.member.phone);
  return storefrontJson({ ok: true, coupons, birthdayOffer: birthdayOffer(info) }, 200);
}

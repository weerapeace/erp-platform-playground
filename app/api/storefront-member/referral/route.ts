/**
 * 🎁 โค้ดชวนเพื่อนของสมาชิก — /api/storefront-member/referral
 * GET → { ok, enabled, code?, friendDiscount, minSubtotal, rewardPoints, pointsOn, friends, earned }
 * ร้านปิดชวนเพื่อน = { enabled: false } (ไม่สร้างโค้ด) · เปิด = สร้างโค้ดให้ครั้งแรกที่เปิดดู (lib/website-referral-db)
 * 🧪 สมาชิกทดลอง = โค้ดตัวอย่าง "FTEST00" (ไม่สร้างโค้ดจริง — กันลูกค้าจริงใช้โค้ดของบัญชีทดลองได้ส่วนลด)
 * ด่าน: กุญแจภายใน + สมาชิก (lib/storefront-internal guardMember)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { readSiteInfo } from "@/lib/website-site-info";
import { pointsConfigFrom } from "@/lib/member-points";
import { ensureReferralCode, referralSummary } from "@/lib/website-referral-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const info = await readSiteInfo(g.sb, g.shop.id);
  if (!info.referral_enabled || !(info.referral_friend_discount > 0)) return storefrontJson({ ok: true, enabled: false }, 200);
  const pointsOn = pointsConfigFrom(info).enabled;
  if (g.member.is_test) {
    return storefrontJson({ ok: true, enabled: true, test: true, code: "FTEST00", friendDiscount: info.referral_friend_discount, minSubtotal: info.referral_min_subtotal, rewardPoints: pointsOn ? info.referral_reward_points : 0, pointsOn, friends: 0, earned: 0 }, 200);
  }
  const c = await ensureReferralCode(g.sb, g.shop.id, g.member.id);
  if (!c) return storefrontJson({ ok: false, error: "สร้างโค้ดไม่สำเร็จ กรุณาลองใหม่" }, 500);
  const sum = await referralSummary(g.sb, c.id);
  return storefrontJson(
    {
      ok: true,
      enabled: true,
      code: c.code,
      friendDiscount: info.referral_friend_discount,
      minSubtotal: info.referral_min_subtotal,
      rewardPoints: pointsOn ? info.referral_reward_points : 0,
      pointsOn,
      friends: sum.friends,
      earned: sum.points,
    },
    200,
  );
}

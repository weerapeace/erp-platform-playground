/**
 * ⭐ แต้มของสมาชิก — /api/storefront-member/points
 * GET → { ok, enabled, balance, spend12m, tier, next, tiers, config, history[] }
 *   ร้านยังไม่เปิดแต้ม แต่สมาชิกมีแต้มค้าง (เคยเปิด) = ยังเห็นยอด/ประวัติ แค่ใช้ไม่ได้
 * ด่าน: กุญแจภายใน + สมาชิก (เว็บร้านเรียกฝั่งเซิร์ฟเวอร์ · รหัสสมาชิกมาจากคุกกี้ที่เซ็นแล้ว)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { memberPointsState, pointsHistory } from "@/lib/member-points-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const [state, history] = await Promise.all([memberPointsState(g.sb, g.shop.id, g.member.id), pointsHistory(g.sb, g.member.id, 50)]);
  return storefrontJson({ ok: true, ...state, history }, 200);
}

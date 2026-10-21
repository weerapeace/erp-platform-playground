/**
 * 🎁 ชวนเพื่อน — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎอยู่ lib/website-referral.ts
 * ใช้ที่: /api/storefront-member/referral (หน้าบัญชี) · /api/website/orders PATCH (ออเดอร์สำเร็จ → ให้แต้มคนชวน)
 */
import { makeReferralCode } from "@/lib/website-referral";
import { adjustPoints } from "@/lib/member-points-db";
import { pointsConfigFrom } from "@/lib/member-points";
import { readSiteInfo } from "@/lib/website-site-info";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/** โค้ดชวนเพื่อนของสมาชิก (ยังไม่มี = สร้างใหม่ · โค้ดชนกัน = สุ่มใหม่) · value 1 = ค่าจองที่ (DB บังคับ > 0) — มูลค่าจริงอ่านจากที่ตั้งร้านตอนตรวจ */
export async function ensureReferralCode(sb: Admin, shopId: string, memberId: string): Promise<{ id: string; code: string } | null> {
  const { data } = await sb.from("store_coupons").select("id, code").eq("shop_id", shopId).eq("referrer_id", memberId).maybeSingle();
  if (data) return data as { id: string; code: string };
  for (let i = 0; i < 6; i++) {
    const code = makeReferralCode();
    const { data: ins, error } = await sb
      .from("store_coupons")
      .insert({ shop_id: shopId, code, kind: "fixed", value: 1, min_subtotal: 0, per_phone_once: true, new_customers_only: true, members_only: false, active: true, note: "โค้ดชวนเพื่อนของสมาชิก (สร้างอัตโนมัติ)", referrer_id: memberId })
      .select("id, code")
      .maybeSingle();
    if (ins) return ins as { id: string; code: string };
    // สมาชิกคนเดียวกันกดพร้อมกัน 2 แท็บ → แถวของอีกแท็บเข้าไปก่อน: อ่านอันนั้น
    const { data: again } = await sb.from("store_coupons").select("id, code").eq("shop_id", shopId).eq("referrer_id", memberId).maybeSingle();
    if (again) return again as { id: string; code: string };
    if (error && (error as { code?: string }).code !== "23505") return null;
  }
  return null;
}

/** สรุปของคนชวน: เพื่อนที่ใช้โค้ดแล้ว (ไม่นับออเดอร์ยกเลิก) · แต้มที่ได้ไปแล้ว */
export async function referralSummary(sb: Admin, couponId: string): Promise<{ friends: number; points: number }> {
  const { data } = await sb.from("store_coupon_redemptions").select("referral_points, store_orders(status)").eq("coupon_id", couponId);
  const rows = (data ?? []) as unknown as { referral_points: number | null; store_orders: { status: string } | null }[];
  const live = rows.filter((r) => r.store_orders?.status !== "cancelled");
  return { friends: live.length, points: rows.reduce((s, r) => s + (Number(r.referral_points) || 0), 0) };
}

/**
 * ออเดอร์ "สำเร็จ" ที่ใช้โค้ดชวนเพื่อน → ให้แต้มคนชวน ครั้งเดียวต่อออเดอร์
 * กันให้ซ้ำ: จองสิทธิ์ก่อนด้วยการเขียน referral_points เฉพาะแถวที่ยังว่าง แล้วค่อยบวกแต้ม (บวกไม่สำเร็จ = คืนสิทธิ์)
 * ร้านปิดแต้ม / ตั้งแต้ม 0 / ไม่ใช่โค้ดชวนเพื่อน = ไม่ทำอะไร (คืน null) · ยกเลิกทีหลังไม่ดึงแต้มคืนอัตโนมัติ (ร้านปรับเองได้)
 */
export async function rewardReferral(sb: Admin, orderId: string, actor: string): Promise<{ referrerId: string; points: number } | null> {
  const { data } = await sb
    .from("store_coupon_redemptions")
    .select("id, referral_points, store_coupons(referrer_id, shop_id), store_orders(order_no, status)")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  const red = data as unknown as { id: string; referral_points: number | null; store_coupons: { referrer_id: string | null; shop_id: string } | null; store_orders: { order_no: string; status: string } | null } | null;
  const referrerId = red?.store_coupons?.referrer_id;
  if (!red || !referrerId || red.referral_points !== null || red.store_orders?.status !== "completed") return null;
  const info = await readSiteInfo(sb, red.store_coupons!.shop_id);
  const pts = Math.round(Number(info.referral_reward_points) || 0);
  if (!pointsConfigFrom(info).enabled || pts <= 0) return null;
  const { data: claimed } = await sb.from("store_coupon_redemptions").update({ referral_points: pts }).eq("id", red.id).is("referral_points", null).select("id");
  if (!(claimed ?? []).length) return null;
  const bal = await adjustPoints(sb, referrerId, pts, `🎁 ชวนเพื่อนสำเร็จ (ออเดอร์ ${red.store_orders?.order_no ?? ""})`, actor);
  if (bal === null) {
    await sb.from("store_coupon_redemptions").update({ referral_points: null }).eq("id", red.id);
    return null;
  }
  return { referrerId, points: pts };
}

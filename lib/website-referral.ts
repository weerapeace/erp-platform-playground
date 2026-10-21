/**
 * 🎁 ชวนเพื่อน (ชุด 6) — กฎกลาง
 *
 * โค้ดชวนเพื่อน = แถวหนึ่งใน store_coupons ที่มี referrer_id (สมาชิกเจ้าของโค้ด) → ใช้ระบบคูปองเดิมทั้งหมด
 *   (ตรวจโค้ด · 1 เบอร์ครั้งเดียว · เฉพาะลูกค้าใหม่ · บันทึกการใช้ใน store_coupon_redemptions)
 * มูลค่า/ขั้นต่ำ อ่านจากที่ตั้งร้าน "ตอนตรวจ" เสมอ (ร้านเปลี่ยนส่วนลด = โค้ดทุกคนเปลี่ยนตาม) — referralCoupon
 * คนชวนได้แต้มเมื่อออเดอร์เพื่อน "สำเร็จ" (lib/website-referral-db rewardReferral) · แท็บคูปอง ERP ไม่โชว์โค้ดพวกนี้
 */
import type { StoreCoupon } from "@/lib/website-coupons";

/** ตัวอักษรที่ไม่สับสน (ไม่มี 0/O/1/I/L) */
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** โค้ดใหม่ "F" + 6 ตัว เช่น FK7Q2MX — rand ส่งมาได้ (ทดสอบ) */
export function makeReferralCode(rand: () => number = Math.random): string {
  let s = "F";
  for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(rand() * ALPHA.length) % ALPHA.length];
  return s;
}

export interface ReferralSettings {
  referral_enabled: boolean;
  referral_friend_discount: number;
  referral_min_subtotal: number;
  referral_reward_points: number;
}

/** คูปองของโค้ดชวนเพื่อน + ค่าจากที่ตั้งร้านปัจจุบัน (ลดเป็นบาท · ลูกค้าใหม่ · 1 เบอร์ครั้งเดียว · ไม่จำกัดจำนวนเพื่อน) */
export function referralCoupon(c: StoreCoupon, s: ReferralSettings): StoreCoupon {
  return {
    ...c,
    kind: "fixed",
    value: Math.max(0, Number(s.referral_friend_discount) || 0),
    minSubtotal: Math.max(0, Number(s.referral_min_subtotal) || 0),
    maxDiscount: null,
    usageLimit: null,
    perPhoneOnce: true,
    newCustomersOnly: true,
    membersOnly: false,
    minTier: null,
    active: c.active && s.referral_enabled && (Number(s.referral_friend_discount) || 0) > 0,
    startsAt: null,
    endsAt: null,
  };
}

/** เบอร์ (ตัวเลขล้วน 9 หลักท้าย) ตรงกันไหม — กันใช้โค้ดของตัวเองด้วยเบอร์เดียวกัน */
export function samePhone9(a: unknown, b: unknown): boolean {
  const x = String(a ?? "").replace(/\D/g, "");
  const y = String(b ?? "").replace(/\D/g, "");
  return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9);
}

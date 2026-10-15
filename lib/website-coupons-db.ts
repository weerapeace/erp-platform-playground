/**
 * 🎟️ คูปอง — ส่วนที่อ่านฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎคิดเงินอยู่ lib/website-coupons.ts
 * ใช้ที่: /api/public/storefront/coupon (ลูกค้าดูผลล่วงหน้า) · lib/website-orders (รับออเดอร์จริง) · /api/website/coupons (ERP)
 * นับการใช้งาน "ไม่นับออเดอร์ที่ยกเลิก" (สถานะ cancelled) — ยกเลิกออเดอร์แล้วโค้ดกลับมาใช้ได้
 */
import { couponFromRow, couponLabel, evaluateCoupon, normalizeCouponCode, type CouponResult, type CouponUsage, type StoreCoupon } from "@/lib/website-coupons";
import { memberStats, readTiers } from "@/lib/member-points-db";
import type { MemberTier } from "@/lib/member-points";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

const CANCELLED = "cancelled";
const phoneDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function loadCouponByCode(sb: Admin, shopId: string, rawCode: unknown): Promise<StoreCoupon | null> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return null;
  const { data } = await sb.from("store_coupons").select("*").eq("shop_id", shopId).eq("code", code).maybeSingle();
  return data ? couponFromRow(data as Record<string, unknown>) : null;
}

type RedemptionRow = { coupon_id: string; customer_phone: string; store_orders: { status: string } | null };

/** การใช้งานของคูปองหลายใบพร้อมกัน (หน้าจอ ERP) — { couponId: จำนวนครั้งที่ใช้ (ไม่นับยกเลิก) } */
export async function couponUseCounts(sb: Admin, couponIds: string[]): Promise<Record<string, number>> {
  if (!couponIds.length) return {};
  const { data } = await sb.from("store_coupon_redemptions").select("coupon_id, customer_phone, store_orders(status)").in("coupon_id", couponIds);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as unknown as RedemptionRow[]) {
    if (r.store_orders?.status === CANCELLED) continue;
    out[r.coupon_id] = (out[r.coupon_id] ?? 0) + 1;
  }
  return out;
}

/** 👤 ระดับที่สมาชิกคนนี้ถึงแล้ว (ยอดซื้อ 12 เดือน) — ใช้ตรวจคูปองเฉพาะสมาชิก */
async function memberContext(sb: Admin, shopId: string, memberId: string | null | undefined, tiers?: MemberTier[]): Promise<{ member: CouponUsage["member"]; tiers: MemberTier[] }> {
  const list = tiers ?? (await readTiers(sb, shopId));
  if (!memberId) return { member: null, tiers: list };
  const spend = (await memberStats(sb, [memberId])).get(memberId)?.spend12m ?? 0;
  return { member: { reachedTiers: list.filter((t) => spend >= t.minSpend).map((t) => t.key) }, tiers: list };
}

/** สถานะการใช้ของคูปองใบนี้ + เบอร์นี้ (ไม่รู้เบอร์ = เช็กแค่จำนวนรวม) · memberId = สมาชิกที่เข้าสู่ระบบ (ไม่มี = ลูกค้าทั่วไป) */
export async function couponUsage(sb: Admin, coupon: StoreCoupon, rawPhone?: unknown, memberId?: string | null): Promise<CouponUsage> {
  const phone = phoneDigits(rawPhone);
  const { data } = await sb.from("store_coupon_redemptions").select("coupon_id, customer_phone, store_orders(status)").eq("coupon_id", coupon.id);
  const live = ((data ?? []) as unknown as RedemptionRow[]).filter((r) => r.store_orders?.status !== CANCELLED);
  let phoneHasOrders = false;
  if (phone && coupon.newCustomersOnly) {
    const { count } = await sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", coupon.shopId)
      .eq("customer_phone", phone)
      .neq("status", CANCELLED);
    phoneHasOrders = (count ?? 0) > 0;
  }
  const needMember = coupon.membersOnly || !!coupon.minTier;
  const ctx = needMember ? await memberContext(sb, coupon.shopId, memberId) : null;
  return {
    usedCount: live.length,
    phoneUsed: !!phone && live.some((r) => phoneDigits(r.customer_phone) === phone),
    phoneHasOrders,
    member: ctx?.member ?? null,
    minTierName: coupon.minTier ? ctx?.tiers.find((t) => t.key === coupon.minTier)?.name ?? null : null,
  };
}

/** ตรวจโค้ดของร้าน + คิดส่วนลด (ไม่พบโค้ด = บอกตรง ๆ) · memberId = สมาชิกที่เข้าสู่ระบบ (มาจากด่านกุญแจภายในเท่านั้น) */
export async function checkCoupon(sb: Admin, shopId: string, rawCode: unknown, subtotal: number, rawPhone?: unknown, memberId?: string | null): Promise<CouponResult & { coupon?: StoreCoupon }> {
  const coupon = await loadCouponByCode(sb, shopId, rawCode);
  if (!coupon) return { ok: false, error: "ไม่พบโค้ดนี้ — ตรวจตัวสะกดอีกครั้ง" };
  const usage = await couponUsage(sb, coupon, rawPhone, memberId);
  const r = evaluateCoupon(coupon, subtotal, usage);
  return r.ok ? { ...r, coupon } : r;
}

export interface MemberCouponView {
  code: string;
  label: string;
  endsAt: string | null;
  minTierName: string | null;
  /** ระดับถึงแล้ว (ใช้ได้) · false = ต้องเลื่อนระดับก่อน */
  eligible: boolean;
  /** เบอร์ของสมาชิกใช้โค้ดนี้ไปแล้ว (ใช้ได้ครั้งเดียว) */
  used: boolean;
}

/**
 * 👤 คูปองสำหรับสมาชิกที่ "เปิดอยู่" ของร้าน (หน้าบัญชี + ปุ่มลัดตอนชำระเงิน)
 * โชว์เฉพาะคูปองเฉพาะสมาชิก (คูปองทั่วไปเป็นโค้ดลับ/โค้ดป๊อปอัป ไม่ประกาศ) · ระดับไม่ถึง = โชว์แบบล็อก (จูงใจเลื่อนระดับ)
 */
export async function memberCouponList(sb: Admin, shopId: string, memberId: string, phone?: string | null): Promise<MemberCouponView[]> {
  const nowIso = new Date().toISOString();
  const { data } = await sb.from("store_coupons").select("*").eq("shop_id", shopId).eq("active", true).or("members_only.eq.true,min_tier.not.is.null").order("created_at", { ascending: false }).limit(50);
  const coupons = ((data ?? []) as Record<string, unknown>[]).map(couponFromRow).filter((c) => (!c.startsAt || c.startsAt <= nowIso) && (!c.endsAt || c.endsAt >= nowIso));
  if (!coupons.length) return [];
  const ctx = await memberContext(sb, shopId, memberId);
  const counts = await couponUseCounts(sb, coupons.map((c) => c.id));
  const ph = phoneDigits(phone);
  let usedByPhone = new Set<string>();
  if (ph) {
    const { data: red } = await sb.from("store_coupon_redemptions").select("coupon_id, customer_phone, store_orders(status)").in("coupon_id", coupons.map((c) => c.id));
    usedByPhone = new Set(((red ?? []) as unknown as RedemptionRow[]).filter((r) => r.store_orders?.status !== CANCELLED && phoneDigits(r.customer_phone) === ph).map((r) => r.coupon_id));
  }
  return coupons
    .filter((c) => c.usageLimit === null || (counts[c.id] ?? 0) < c.usageLimit)
    .filter((c) => !c.minTier || ctx.tiers.some((t) => t.key === c.minTier))
    .map((c) => ({
      code: c.code,
      label: couponLabel(c),
      endsAt: c.endsAt,
      minTierName: c.minTier ? ctx.tiers.find((t) => t.key === c.minTier)?.name ?? null : null,
      eligible: !c.minTier || !!ctx.member?.reachedTiers.includes(c.minTier),
      used: c.perPhoneOnce && usedByPhone.has(c.id),
    }));
}

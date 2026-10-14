/**
 * 🎟️ คูปอง — ส่วนที่อ่านฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎคิดเงินอยู่ lib/website-coupons.ts
 * ใช้ที่: /api/public/storefront/coupon (ลูกค้าดูผลล่วงหน้า) · lib/website-orders (รับออเดอร์จริง) · /api/website/coupons (ERP)
 * นับการใช้งาน "ไม่นับออเดอร์ที่ยกเลิก" (สถานะ cancelled) — ยกเลิกออเดอร์แล้วโค้ดกลับมาใช้ได้
 */
import { couponFromRow, evaluateCoupon, normalizeCouponCode, type CouponResult, type CouponUsage, type StoreCoupon } from "@/lib/website-coupons";

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

/** สถานะการใช้ของคูปองใบนี้ + เบอร์นี้ (ไม่รู้เบอร์ = เช็กแค่จำนวนรวม) */
export async function couponUsage(sb: Admin, coupon: StoreCoupon, rawPhone?: unknown): Promise<CouponUsage> {
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
  return {
    usedCount: live.length,
    phoneUsed: !!phone && live.some((r) => phoneDigits(r.customer_phone) === phone),
    phoneHasOrders,
  };
}

/** ตรวจโค้ดของร้าน + คิดส่วนลด (ไม่พบโค้ด = บอกตรง ๆ) */
export async function checkCoupon(sb: Admin, shopId: string, rawCode: unknown, subtotal: number, rawPhone?: unknown): Promise<CouponResult & { coupon?: StoreCoupon }> {
  const coupon = await loadCouponByCode(sb, shopId, rawCode);
  if (!coupon) return { ok: false, error: "ไม่พบโค้ดนี้ — ตรวจตัวสะกดอีกครั้ง" };
  const usage = await couponUsage(sb, coupon, rawPhone);
  const r = evaluateCoupon(coupon, subtotal, usage);
  return r.ok ? { ...r, coupon } : r;
}

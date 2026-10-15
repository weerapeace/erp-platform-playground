/**
 * 🎟️ คูปองส่วนลดของเว็บร้าน — กฎกลาง (ฟังก์ชันล้วน ใช้ได้ทั้ง API และหน้าจอ)
 *
 * ตาราง store_coupons (นิยามคูปอง) + store_coupon_redemptions (ใช้ไปกับออเดอร์ไหน) — migration 202610150300
 * ส่วนลด "คิดฝั่งเซิร์ฟเวอร์เท่านั้น" ตอนรับออเดอร์ (lib/website-orders) · หน้าเว็บร้านแค่ขอดูผลล่วงหน้า (/api/public/storefront/coupon)
 * เงินคิดด้วย service กลาง lib/money (หน่วยสตางค์ ปัดเศษ half-up) · ลดเฉพาะค่าสินค้า ไม่ลดค่าส่ง · ไม่เกินยอดสินค้า
 * ข้อความเหตุผลที่ใช้ไม่ได้ = ภาษาคน ลูกค้าเห็นตรง ๆ
 * 👤 คูปองเฉพาะสมาชิก (M5): membersOnly = ต้องเข้าสู่ระบบ · minTier = ระดับขั้นต่ำ (รหัสระดับ store_member_tiers) — ระดับที่ตั้งถูกลบไปแล้ว = ไม่มีใครใช้ได้ (ปลอดภัยกว่าแจกทุกคน)
 */
import { money, percent, toMajor, type Money } from "@/lib/money";

export type CouponKind = "percent" | "fixed";

export interface StoreCoupon {
  id: string;
  shopId: string;
  code: string;
  kind: CouponKind;
  /** percent = 1–90 (%) · fixed = บาท */
  value: number;
  /** ยอดสินค้าขั้นต่ำ (บาท) · 0 = ไม่มี */
  minSubtotal: number;
  /** ลดสูงสุด (บาท) — ใช้กับแบบ % · null = ไม่จำกัด */
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** ใช้ได้ทั้งหมดกี่ครั้ง · null = ไม่จำกัด */
  usageLimit: number | null;
  /** 1 เบอร์ใช้ได้ครั้งเดียว */
  perPhoneOnce: boolean;
  /** เฉพาะลูกค้าใหม่ (เบอร์นี้ยังไม่เคยสั่งกับร้าน) */
  newCustomersOnly: boolean;
  /** 👤 เฉพาะสมาชิกที่เข้าสู่ระบบ */
  membersOnly: boolean;
  /** 👤 ระดับสมาชิกขั้นต่ำ (รหัสระดับ) · null = ทุกระดับ · ตั้ง = เฉพาะสมาชิกด้วย */
  minTier: string | null;
  active: boolean;
  note: string;
}

/** โค้ด: ตัวใหญ่ A-Z 0-9 - _ ยาว 3–30 (ลูกค้าพิมพ์เล็ก/มีช่องว่าง ก็ใช้ได้) */
export function normalizeCouponCode(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 30);
}
export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,30}$/;

const n = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const isoOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** ข้อมูลจากหน้าจอ ERP → คูปองที่บันทึกได้ (บอกว่าผิดตรงไหน ไม่เดาค่าให้) */
export function sanitizeCouponInput(raw: unknown): { ok: true; coupon: Omit<StoreCoupon, "id" | "shopId"> } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const code = normalizeCouponCode(r.code);
  if (!COUPON_CODE_RE.test(code)) return { ok: false, error: "โค้ดต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 3–30 ตัว (ใช้ - หรือ _ ได้) เช่น WELCOME10" };
  const kind: CouponKind = r.kind === "fixed" ? "fixed" : r.kind === "percent" ? "percent" : ("" as CouponKind);
  if (!kind) return { ok: false, error: "เลือกชนิดส่วนลด (เปอร์เซ็นต์ หรือ จำนวนบาท)" };
  const value = n(r.value);
  if (!(value > 0)) return { ok: false, error: "ใส่มูลค่าส่วนลดมากกว่า 0" };
  if (kind === "percent" && (value > 90 || !Number.isInteger(value))) return { ok: false, error: "ส่วนลดแบบเปอร์เซ็นต์ใส่เลขเต็ม 1–90" };
  if (kind === "fixed" && value > 100000) return { ok: false, error: "ส่วนลดเกิน ฿100,000 — ตรวจตัวเลขอีกครั้ง" };
  const minSubtotal = Number.isNaN(n(r.minSubtotal)) ? 0 : n(r.minSubtotal);
  if (minSubtotal < 0) return { ok: false, error: "ยอดขั้นต่ำติดลบไม่ได้" };
  const maxRaw = n(r.maxDiscount);
  const maxDiscount = Number.isNaN(maxRaw) || maxRaw === 0 ? null : maxRaw;
  if (maxDiscount !== null && maxDiscount < 0) return { ok: false, error: "ลดสูงสุดติดลบไม่ได้" };
  const limRaw = n(r.usageLimit);
  const usageLimit = Number.isNaN(limRaw) || limRaw === 0 ? null : Math.floor(limRaw);
  if (usageLimit !== null && usageLimit < 1) return { ok: false, error: "จำนวนครั้งที่ใช้ได้ต้องอย่างน้อย 1 (เว้นว่าง = ไม่จำกัด)" };
  const minTier = String(r.minTier ?? "").trim().toLowerCase() || null;
  if (minTier && !/^[a-z0-9-]{1,20}$/.test(minTier)) return { ok: false, error: "ระดับสมาชิกไม่ถูกต้อง — เลือกจากรายการ" };
  const startsAt = isoOrNull(r.startsAt);
  const endsAt = isoOrNull(r.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, error: "วันหมดอายุต้องอยู่หลังวันเริ่ม" };
  return {
    ok: true,
    coupon: {
      code,
      kind,
      value,
      minSubtotal,
      maxDiscount: kind === "percent" ? maxDiscount : null,
      startsAt,
      endsAt,
      usageLimit,
      perPhoneOnce: r.perPhoneOnce !== false,
      newCustomersOnly: r.newCustomersOnly === true,
      membersOnly: r.membersOnly === true || !!minTier,
      minTier,
      active: r.active !== false,
      note: String(r.note ?? "").trim().slice(0, 200),
    },
  };
}

/** สถานะการใช้งานจริงที่ต้องรู้ตอนตรวจ (นับจากฐานข้อมูล — ไม่นับออเดอร์ที่ยกเลิก) */
export interface CouponUsage {
  /** ใช้ไปแล้วทั้งหมดกี่ครั้ง */
  usedCount: number;
  /** เบอร์นี้เคยใช้โค้ดนี้แล้ว (ไม่รู้เบอร์ = false) */
  phoneUsed: boolean;
  /** เบอร์นี้เคยสั่งกับร้านแล้ว (ไม่รู้เบอร์ = false) */
  phoneHasOrders: boolean;
  /** 👤 สมาชิกที่ใช้โค้ด (null/ไม่ใส่ = ไม่ได้เข้าสู่ระบบ) · reachedTiers = รหัสระดับที่ยอดซื้อถึงแล้ว */
  member?: { reachedTiers: string[] } | null;
  /** ชื่อระดับขั้นต่ำของคูปอง (ไว้บอกลูกค้า) · ไม่พบระดับนี้แล้ว = null */
  minTierName?: string | null;
}

export type CouponResult = { ok: true; discount: number; label: string } | { ok: false; error: string };

const baht = (v: number) => `฿${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** คำอธิบายคูปองแบบสั้น เช่น "ลด 10% (สูงสุด ฿200)" · "ลด ฿100" */
export function couponLabel(c: Pick<StoreCoupon, "kind" | "value" | "maxDiscount" | "minSubtotal">): string {
  const main = c.kind === "percent" ? `ลด ${c.value}%${c.maxDiscount ? ` (สูงสุด ${baht(c.maxDiscount)})` : ""}` : `ลด ${baht(c.value)}`;
  return c.minSubtotal > 0 ? `${main} เมื่อซื้อครบ ${baht(c.minSubtotal)}` : main;
}

/** ตรวจ + คิดส่วนลด (ยอดสินค้า subtotal บาท) — ใช้ตัวเดียวกันทั้งตอนดูล่วงหน้าและตอนรับออเดอร์ */
export function evaluateCoupon(c: StoreCoupon, subtotal: number, usage: CouponUsage, now: Date = new Date()): CouponResult {
  if (!c.active) return { ok: false, error: "โค้ดนี้ปิดใช้งานแล้ว" };
  if (c.startsAt && new Date(c.startsAt) > now) return { ok: false, error: "โค้ดนี้ยังไม่เริ่มใช้" };
  if (c.endsAt && new Date(c.endsAt) < now) return { ok: false, error: "โค้ดนี้หมดอายุแล้ว" };
  if (c.usageLimit !== null && usage.usedCount >= c.usageLimit) return { ok: false, error: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว" };
  if (c.minSubtotal > 0 && subtotal < c.minSubtotal) return { ok: false, error: `ใช้ได้เมื่อซื้อสินค้าครบ ${baht(c.minSubtotal)}` };
  if (c.perPhoneOnce && usage.phoneUsed) return { ok: false, error: "เบอร์นี้ใช้โค้ดนี้ไปแล้ว" };
  if (c.newCustomersOnly && usage.phoneHasOrders) return { ok: false, error: "โค้ดนี้สำหรับลูกค้าที่สั่งครั้งแรกเท่านั้น" };
  if (c.membersOnly || c.minTier) {
    if (!usage.member) return { ok: false, error: "โค้ดนี้สำหรับสมาชิก — เข้าสู่ระบบก่อนใช้" };
    if (c.minTier && !usage.member.reachedTiers.includes(c.minTier)) {
      return { ok: false, error: usage.minTierName ? `โค้ดนี้สำหรับสมาชิกระดับ ${usage.minTierName} ขึ้นไป` : "โค้ดนี้สำหรับสมาชิกระดับที่ร้านกำหนด" };
    }
  }

  const sub: Money = money(subtotal);
  let d: Money = c.kind === "percent" ? percent(sub, c.value) : money(c.value);
  if (c.kind === "percent" && c.maxDiscount !== null) {
    const cap = money(c.maxDiscount);
    if (d.amount > cap.amount) d = cap;
  }
  if (d.amount > sub.amount) d = sub;
  if (d.amount <= 0) return { ok: false, error: "โค้ดนี้ใช้กับตะกร้านี้ไม่ได้" };
  return { ok: true, discount: toMajor(d.amount), label: couponLabel(c) };
}

/** แถวจากตาราง store_coupons → StoreCoupon */
export function couponFromRow(r: Record<string, unknown>): StoreCoupon {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    code: String(r.code),
    kind: r.kind === "fixed" ? "fixed" : "percent",
    value: Number(r.value) || 0,
    minSubtotal: Number(r.min_subtotal) || 0,
    maxDiscount: num(r.max_discount),
    startsAt: (r.starts_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    usageLimit: num(r.usage_limit),
    perPhoneOnce: r.per_phone_once !== false,
    newCustomersOnly: r.new_customers_only === true,
    membersOnly: r.members_only === true || !!r.min_tier,
    minTier: (r.min_tier as string | null) ?? null,
    active: r.active !== false,
    note: String(r.note ?? ""),
  };
}

/** StoreCoupon (ไม่มี id/shop) → แถวสำหรับบันทึก */
export function couponToRow(c: Omit<StoreCoupon, "id" | "shopId">): Record<string, unknown> {
  return {
    code: c.code,
    kind: c.kind,
    value: c.value,
    min_subtotal: c.minSubtotal,
    max_discount: c.maxDiscount,
    starts_at: c.startsAt,
    ends_at: c.endsAt,
    usage_limit: c.usageLimit,
    per_phone_once: c.perPhoneOnce,
    new_customers_only: c.newCustomersOnly,
    members_only: c.membersOnly,
    min_tier: c.minTier,
    active: c.active,
    note: c.note || null,
  };
}

/**
 * ⭐ แต้มสะสม + ระดับสมาชิก — กฎกลาง (ฟังก์ชันล้วน · มี test) · ตั้งค่าที่ ERP แท็บข้อมูลร้าน กลุ่ม ⭐ (SiteInfo points_*)
 *
 * ได้แต้ม: เมื่อออเดอร์ของสมาชิกเป็น "สำเร็จ" = floor(ยอดสินค้าหลังส่วนลด ÷ earnUnit) × ตัวคูณของระดับ (ไม่นับค่าส่ง)
 * ใช้แต้ม: ตอนสั่ง (สมาชิกเท่านั้น) ลดเป็นบาท = แต้ม × pointValue · ไม่เกิน maxRedeemPct% ของยอดสินค้า (หลังคูปอง) · ขั้นต่ำ minRedeem แต้ม
 * ระดับ: ยอดซื้อ (ออเดอร์สำเร็จ ไม่รวมค่าส่ง) ย้อนหลัง 12 เดือน ≥ minSpend ของระดับ → ระดับสูงสุดที่ถึง
 * เงินคิดด้วย lib/money (สตางค์) · ข้อความภาษาคน
 */
import { money, toMajor } from "@/lib/money";

export interface PointsConfig {
  enabled: boolean;
  /** ซื้อครบกี่บาทได้ 1 แต้ม */
  earnUnit: number;
  /** 1 แต้มมีค่ากี่บาทตอนใช้ */
  pointValue: number;
  /** ใช้แต้มลดได้ไม่เกินกี่ % ของยอดสินค้า */
  maxRedeemPct: number;
  /** ใช้ขั้นต่ำครั้งละกี่แต้ม */
  minRedeem: number;
}

export interface MemberTier {
  key: string;
  name: string;
  minSpend: number;
  earnMultiplier: number;
  color: string;
  /** 🎁 สิทธิ์: ลด % ทุกออเดอร์ (0–50 · คิดจากยอดหลังโปร ก่อนคูปอง) — ไม่ตั้ง = 0 */
  discountPct?: number;
  /** 🎁 สิทธิ์: ส่งฟรี (ค่าเก็บปลายทางยังคิด) */
  freeShipping?: boolean;
}

export const DEFAULT_POINTS: Omit<PointsConfig, "enabled"> = { earnUnit: 100, pointValue: 1, maxRedeemPct: 50, minRedeem: 10 };
export const SUGGESTED_TIERS: MemberTier[] = [
  { key: "member", name: "Member", minSpend: 0, earnMultiplier: 1, color: "#9CA3AF" },
  { key: "silver", name: "Silver", minSpend: 5000, earnMultiplier: 1.5, color: "#94A3B8" },
  { key: "gold", name: "Gold", minSpend: 15000, earnMultiplier: 2, color: "#D4A017" },
];

/**
 * 🎁 ส่วนลดตามระดับสมาชิก (บาท) จากยอดหลังโปรโมชัน — สูตรเดียวกับเว็บร้าน (CheckoutClient tierBaht)
 * ไม่มีระดับ / ระดับไม่มีส่วนลด = 0
 */
export function tierPerkDiscount(base: number, tier: Pick<MemberTier, "discountPct"> | null | undefined): number {
  const pct = Number(tier?.discountPct) || 0;
  if (pct <= 0 || !(base > 0)) return 0;
  return Math.round(base * Math.min(50, pct)) / 100;
}

/** ค่าจากที่ตั้ง (SiteInfo) → config ที่ปลอดภัย (ค่าเพี้ยน = ค่าแนะนำ) */
export function pointsConfigFrom(info: { points_enabled?: boolean; points_earn_unit?: number; points_value?: number; points_max_redeem_pct?: number; points_min_redeem?: number }): PointsConfig {
  const n = (v: unknown, fb: number, lo: number, hi: number) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : fb);
  return {
    enabled: info.points_enabled === true,
    earnUnit: n(info.points_earn_unit, DEFAULT_POINTS.earnUnit, 1, 1_000_000),
    pointValue: n(info.points_value, DEFAULT_POINTS.pointValue, 0.01, 10_000),
    maxRedeemPct: n(info.points_max_redeem_pct, DEFAULT_POINTS.maxRedeemPct, 1, 100),
    minRedeem: Math.floor(n(info.points_min_redeem, DEFAULT_POINTS.minRedeem, 1, 1_000_000)),
  };
}

/** ตรวจค่าที่ตั้งตอนบันทึก (เปิดใช้แต้มอยู่) — บอกว่าต้องแก้อะไร ไม่เดาค่าให้ · null = ผ่าน */
export function pointsSettingsProblem(info: { points_enabled?: boolean; points_earn_unit?: number; points_value?: number; points_max_redeem_pct?: number; points_min_redeem?: number }): string | null {
  if (info.points_enabled !== true) return null;
  if (!(Number(info.points_earn_unit) >= 1)) return "แต้มสมาชิก: 'ซื้อครบกี่บาท ได้ 1 แต้ม' ต้องเป็น 1 บาทขึ้นไป";
  if (!(Number(info.points_value) >= 0.01)) return "แต้มสมาชิก: '1 แต้ม ลดได้กี่บาท' ต้องมากกว่า 0";
  const pct = Number(info.points_max_redeem_pct);
  if (!(pct >= 1 && pct <= 100)) return "แต้มสมาชิก: '% สูงสุดที่ใช้แต้มลดได้' ต้องอยู่ระหว่าง 1–100";
  if (!(Number(info.points_min_redeem) >= 1)) return "แต้มสมาชิก: 'ใช้ขั้นต่ำครั้งละกี่แต้ม' ต้องเป็น 1 ขึ้นไป";
  return null;
}

/** แต้มที่ได้จากยอด (บาท) */
export function pointsEarned(eligibleBaht: number, cfg: PointsConfig, multiplier = 1): number {
  if (!cfg.enabled || !(eligibleBaht > 0)) return 0;
  const units = Math.floor(money(eligibleBaht).amount / money(cfg.earnUnit).amount);
  return Math.max(0, Math.floor(units * (multiplier > 0 ? multiplier : 1)));
}

/** ใช้ได้สูงสุดกี่แต้ม กับยอดสินค้านี้ */
export function maxRedeemable(balance: number, subtotalAfterCoupon: number, cfg: PointsConfig): number {
  if (!cfg.enabled || balance <= 0 || subtotalAfterCoupon <= 0) return 0;
  const capBaht = money(subtotalAfterCoupon).amount * (cfg.maxRedeemPct / 100);
  const byCap = Math.floor(capBaht / money(cfg.pointValue).amount);
  return Math.max(0, Math.min(Math.floor(balance), byCap));
}

export type RedeemResult = { ok: true; points: number; discount: number } | { ok: false; error: string };

/** ตรวจการใช้แต้ม + คิดเป็นบาท (ใช้ตัวเดียวกันทั้งหน้าเว็บและตอนรับออเดอร์จริง) */
export function validateRedeem(points: number, balance: number, subtotalAfterCoupon: number, cfg: PointsConfig): RedeemResult {
  const p = Math.floor(Number(points) || 0);
  if (p <= 0) return { ok: true, points: 0, discount: 0 };
  if (!cfg.enabled) return { ok: false, error: "ร้านยังไม่เปิดใช้แต้ม" };
  if (p < cfg.minRedeem) return { ok: false, error: `ใช้แต้มขั้นต่ำครั้งละ ${cfg.minRedeem} แต้ม` };
  if (p > balance) return { ok: false, error: `แต้มไม่พอ (มี ${Math.max(0, Math.floor(balance))} แต้ม)` };
  const max = maxRedeemable(balance, subtotalAfterCoupon, cfg);
  if (p > max) return { ok: false, error: `ใช้ได้สูงสุด ${max} แต้มกับออเดอร์นี้ (ไม่เกิน ${cfg.maxRedeemPct}% ของยอดสินค้า)` };
  return { ok: true, points: p, discount: toMajor(money(cfg.pointValue).amount * p) };
}

/** ระดับตามยอดซื้อ 12 เดือน (ไม่มีระดับตั้งไว้ = null) + ระดับถัดไป */
export function tierFor(spend: number, tiers: MemberTier[]): { tier: MemberTier | null; next: { tier: MemberTier; need: number } | null } {
  const sorted = [...tiers].sort((a, b) => a.minSpend - b.minSpend);
  let tier: MemberTier | null = null;
  for (const t of sorted) if (spend >= t.minSpend) tier = t;
  const nextT = sorted.find((t) => t.minSpend > spend) ?? null;
  return { tier, next: nextT ? { tier: nextT, need: toMajor(money(nextT.minSpend).amount - money(spend).amount) } : null };
}

/** ระดับที่บันทึกได้ (ตรวจข้อมูลจากหน้าจอ ERP) */
export function sanitizeTiers(raw: unknown): { ok: true; tiers: MemberTier[] } | { ok: false; error: string } {
  const list = (Array.isArray(raw) ? raw.slice(0, 10) : []) as Record<string, unknown>[];
  const out: MemberTier[] = [];
  const seen = new Set<string>();
  const keyOf = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
  // รหัสที่ตั้งมาแล้ว (ระดับเดิม) จองไว้ก่อน — ระดับใหม่ชื่อไทย (ทำรหัสจากชื่อไม่ได้) ได้ t1, t2… ที่ยังว่าง
  const taken = new Set(list.map((r) => keyOf(r?.key)).filter(Boolean));
  const names = new Set<string>();
  for (const r of list) {
    const name = String(r?.name ?? "").trim().slice(0, 30);
    if (!name) return { ok: false, error: "ระดับต้องมีชื่อ" };
    if (names.has(name.toLowerCase())) return { ok: false, error: `ชื่อระดับซ้ำ: ${name}` };
    names.add(name.toLowerCase());
    let key = keyOf(r?.key) || keyOf(name);
    if (!key || (!keyOf(r?.key) && taken.has(key))) {
      let i = 1;
      while (taken.has(`t${i}`) || seen.has(`t${i}`)) i++;
      key = `t${i}`;
    }
    if (seen.has(key)) return { ok: false, error: `ชื่อระดับซ้ำ: ${name}` };
    seen.add(key);
    taken.add(key);
    const minSpend = Number(r?.minSpend);
    const mult = Number(r?.earnMultiplier);
    if (!(minSpend >= 0)) return { ok: false, error: `${name}: ยอดซื้อขั้นต่ำต้องเป็นตัวเลข ≥ 0` };
    if (!(mult >= 1 && mult <= 10)) return { ok: false, error: `${name}: ตัวคูณแต้มต้องอยู่ระหว่าง 1–10` };
    const color = /^#[0-9a-fA-F]{6}$/.test(String(r?.color ?? "")) ? String(r.color) : "#9CA3AF";
    const discountPct = r?.discountPct === undefined || r?.discountPct === "" ? 0 : Number(r.discountPct);
    if (!(discountPct >= 0 && discountPct <= 50)) return { ok: false, error: `${name}: ส่วนลดสมาชิกต้องอยู่ระหว่าง 0–50%` };
    out.push({ key, name, minSpend, earnMultiplier: mult, color, discountPct: Math.round(discountPct * 100) / 100, freeShipping: r?.freeShipping === true });
  }
  return { ok: true, tiers: out.sort((a, b) => a.minSpend - b.minSpend) };
}

/**
 * ⭐ ปรับแต้มของออเดอร์ให้ตรงกับสถานะปัจจุบัน (คืนรายการที่ต้องบันทึกเพิ่ม · เรียกซ้ำได้ ไม่บวกซ้ำ)
 *   ได้แต้ม: สำเร็จ = earnTarget · อื่น ๆ = 0       (ปัจจุบัน = รวม earn+revoke ของออเดอร์นี้)
 *   ใช้แต้ม: ยกเลิก = 0 (คืนแต้ม) · อื่น ๆ = -ที่ใช้ตอนสั่ง (ปัจจุบัน = รวม redeem+refund)
 */
export function pointsSyncRows(input: {
  status: string;
  earnTarget: number;
  earnNow: number;
  redeemOriginal: number;
  redeemNow: number;
}): { kind: "earn" | "revoke" | "refund" | "redeem"; delta: number }[] {
  const out: { kind: "earn" | "revoke" | "refund" | "redeem"; delta: number }[] = [];
  const wantEarn = input.status === "completed" ? Math.max(0, Math.floor(input.earnTarget)) : 0;
  const dEarn = wantEarn - input.earnNow;
  if (dEarn > 0) out.push({ kind: "earn", delta: dEarn });
  if (dEarn < 0) out.push({ kind: "revoke", delta: dEarn });
  const wantRedeem = input.status === "cancelled" ? 0 : -Math.abs(input.redeemOriginal);
  const dRedeem = wantRedeem - input.redeemNow;
  if (dRedeem > 0) out.push({ kind: "refund", delta: dRedeem });
  if (dRedeem < 0) out.push({ kind: "redeem", delta: dRedeem });
  return out;
}

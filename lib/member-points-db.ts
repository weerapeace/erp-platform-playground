/**
 * ⭐ แต้มสมาชิก — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎ/ตัวเลขอยู่ lib/member-points.ts
 * เขียนสมุดแต้มผ่านฟังก์ชัน DB ที่ล็อกแถวเท่านั้น (store_points_redeem / _apply / _adjust) — กันทำซ้อนแล้วแต้มเพี้ยน
 * ใช้ที่: createStorefrontOrder (ใช้แต้ม) · /api/website/orders PATCH (ได้/คืนแต้มตามสถานะ) · /api/storefront-member/points · ERP แท็บสมาชิก
 */
import { pointsConfigFrom, pointsEarned, pointsSyncRows, tierFor, type MemberTier, type PointsConfig } from "@/lib/member-points";
import { readSiteInfo } from "@/lib/website-site-info";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const n = (v: unknown) => Number(v) || 0;

export type LedgerKind = "earn" | "redeem" | "refund" | "revoke" | "adjust" | "expire";
export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  earn: "ได้แต้ม",
  redeem: "ใช้แต้ม",
  refund: "คืนแต้ม",
  revoke: "เรียกแต้มคืน",
  adjust: "ร้านปรับแต้ม",
  expire: "แต้มหมดอายุ",
};

export async function readTiers(sb: Admin, shopId: string): Promise<MemberTier[]> {
  const { data } = await sb.from("store_member_tiers").select("key, name, min_spend, earn_multiplier, color, discount_pct, free_shipping").eq("shop_id", shopId).order("min_spend");
  return ((data ?? []) as { key: string; name: string; min_spend: number | string; earn_multiplier: number | string; color: string; discount_pct?: number | string | null; free_shipping?: boolean | null }[]).map((t) => ({
    key: t.key,
    name: t.name,
    minSpend: n(t.min_spend),
    earnMultiplier: n(t.earn_multiplier) || 1,
    color: t.color,
    discountPct: n(t.discount_pct),
    freeShipping: t.free_shipping === true,
  }));
}

/** 🎁 ระดับปัจจุบันของสมาชิก (ยอดซื้อ 12 เดือน) — ใช้คิดสิทธิ์ตอนสั่งซื้อ · ไม่มีระดับ = null */
export async function memberTierNow(sb: Admin, shopId: string, customerId: string): Promise<MemberTier | null> {
  const [tiers, stats] = await Promise.all([readTiers(sb, shopId), memberStats(sb, [customerId])]);
  return tierFor(stats.get(customerId)?.spend12m ?? 0, tiers).tier;
}

export interface MemberStats {
  balance: number;
  spend12m: number;
  orderCount: number;
  orderTotal: number;
}

/**
 * สรุปต่อสมาชิก คิดใน DB (store_member_stats) — แต้มคงเหลือ · ยอดเลื่อนระดับ 12 เดือน · จำนวน/ยอดออเดอร์ (ไม่นับยกเลิก)
 * ⚠️ ห้ามดึงแถวมารวมเองในแอป: API ตัดที่ 1,000 แถว → ยอดเพี้ยนเงียบ ๆ เมื่อข้อมูลเยอะ
 */
export async function memberStats(sb: Admin, customerIds: string[]): Promise<Map<string, MemberStats>> {
  const out = new Map<string, MemberStats>();
  for (let i = 0; i < customerIds.length; i += 500) {
    const { data, error } = await sb.rpc("store_member_stats" as never, { p_customers: customerIds.slice(i, i + 500) } as never);
    if (error) throw new Error("โหลดสรุปสมาชิกไม่สำเร็จ");
    for (const r of (data ?? []) as { customer_id: string; balance: number; spend_12m: unknown; order_count: number; order_total: unknown }[]) {
      out.set(r.customer_id, { balance: r.balance, spend12m: n(r.spend_12m), orderCount: r.order_count, orderTotal: Math.round(n(r.order_total) * 100) / 100 });
    }
  }
  return out;
}

export async function pointsBalance(sb: Admin, customerId: string): Promise<number> {
  return (await memberStats(sb, [customerId])).get(customerId)?.balance ?? 0;
}

/** ยอดที่นับเลื่อนระดับ = ยอดสินค้าหลังส่วนลด (ไม่รวมค่าส่ง) ของออเดอร์ "สำเร็จ" ย้อนหลัง 12 เดือน */
const spendOf = (o: { subtotal: unknown; discount: unknown; points_discount: unknown }) => Math.max(0, n(o.subtotal) - n(o.discount) - n(o.points_discount));

/** ยอดเลื่อนระดับของสมาชิกคนเดียว ไม่นับออเดอร์ที่กำลังคิดแต้ม (ตัวคูณ = ระดับก่อนออเดอร์นี้) */
async function spendBefore(sb: Admin, customerId: string, order: { status: string; created_at: string } & Parameters<typeof spendOf>[0]): Promise<number> {
  const all = (await memberStats(sb, [customerId])).get(customerId)?.spend12m ?? 0;
  const counted = order.status === "completed" && Date.parse(order.created_at) >= Date.now() - YEAR_MS;
  return Math.max(0, Math.round((all - (counted ? spendOf(order) : 0)) * 100) / 100);
}

export interface MemberPointsState {
  enabled: boolean;
  balance: number;
  spend12m: number;
  tier: MemberTier | null;
  next: { tier: MemberTier; need: number } | null;
  tiers: MemberTier[];
  config: Omit<PointsConfig, "enabled">;
}

export async function memberPointsState(sb: Admin, shopId: string, customerId: string): Promise<MemberPointsState> {
  const [info, tiers, stats] = await Promise.all([readSiteInfo(sb, shopId), readTiers(sb, shopId), memberStats(sb, [customerId])]);
  const cfg = pointsConfigFrom(info);
  const balance = stats.get(customerId)?.balance ?? 0;
  const spend = stats.get(customerId)?.spend12m ?? 0;
  const t = tierFor(spend, tiers);
  const { enabled, ...config } = cfg;
  return { enabled, balance, spend12m: spend, tier: t.tier, next: t.next, tiers, config };
}

export interface LedgerEntry {
  id: string;
  delta: number;
  kind: LedgerKind;
  label: string;
  note: string;
  orderNo: string | null;
  createdAt: string;
}

export async function pointsHistory(sb: Admin, customerId: string, limit = 50): Promise<LedgerEntry[]> {
  const { data } = await sb
    .from("store_point_ledger")
    .select("id, delta, kind, note, created_at, store_orders(order_no)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as { id: string; delta: number; kind: LedgerKind; note: string | null; created_at: string; store_orders: { order_no: string } | null }[]).map((r) => ({
    id: r.id,
    delta: r.delta,
    kind: r.kind,
    label: LEDGER_KIND_LABEL[r.kind] ?? r.kind,
    note: r.note ?? "",
    orderNo: r.store_orders?.order_no ?? null,
    createdAt: r.created_at,
  }));
}

/** ใช้แต้มกับออเดอร์ที่เพิ่งสร้าง (ล็อกแถวสมาชิกใน DB) · false = แต้มไม่พอแล้ว (เช่น ใช้ไปกับอีกออเดอร์พร้อมกัน) */
export async function redeemForOrder(sb: Admin, customerId: string, orderId: string, points: number): Promise<boolean> {
  if (points <= 0) return true;
  const { data, error } = await sb.rpc("store_points_redeem" as never, { p_customer: customerId, p_order: orderId, p_points: points } as never);
  if (error) console.error("[member-points] redeem", error);
  return !error && data === true;
}

/**
 * ⭐ ปรับแต้มของออเดอร์ให้ตรงกับสถานะตอนนี้ (เรียกหลังเปลี่ยนสถานะ · เรียกซ้ำได้ ไม่บวกซ้ำ)
 * สำเร็จ = ได้แต้ม (ยอดสินค้าหลังส่วนลด × ตัวคูณระดับ ณ ตอนนั้น) · ถอยจากสำเร็จ = เรียกคืน · ยกเลิก = คืนแต้มที่ใช้ตอนสั่ง
 */
export async function syncOrderPoints(sb: Admin, orderId: string, actor: string): Promise<{ rows: { kind: string; delta: number }[] } | null> {
  // null = ปรับไม่สำเร็จ (DB พัง / ชนกันซ้ำหลายรอบ) → ให้คนเรียกบอกผู้ใช้
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: o } = await sb.from("store_orders").select("id, shop_id, customer_id, status, subtotal, discount, points_discount, points_used, created_at").eq("id", orderId).maybeSingle();
    const order = o as { id: string; shop_id: string; customer_id: string | null; status: string; subtotal: unknown; discount: unknown; points_discount: unknown; points_used: number; created_at: string } | null;
    if (!order?.customer_id) return { rows: [] }; // ไม่ใช่ออเดอร์สมาชิก = ไม่มีแต้ม
    const { data: led } = await sb.from("store_point_ledger").select("kind, delta").eq("order_id", orderId);
    let earnNow = 0;
    let redeemNow = 0;
    for (const r of (led ?? []) as { kind: string; delta: number }[]) {
      if (r.kind === "earn" || r.kind === "revoke") earnNow += r.delta;
      else if (r.kind === "redeem" || r.kind === "refund") redeemNow += r.delta;
    }
    let earnTarget = 0;
    if (order.status === "completed") {
      const [info, tiers, before] = await Promise.all([readSiteInfo(sb, order.shop_id), readTiers(sb, order.shop_id), spendBefore(sb, order.customer_id, order)]);
      const mult = tierFor(before, tiers).tier?.earnMultiplier ?? 1;
      earnTarget = pointsEarned(spendOf(order), pointsConfigFrom(info), mult);
    }
    const rows = pointsSyncRows({ status: order.status, earnTarget, earnNow, redeemOriginal: order.points_used ?? 0, redeemNow });
    if (!rows.length) return { rows };
    const { data, error } = await sb.rpc("store_points_apply" as never, {
      p_order: orderId,
      p_earn_now: earnNow,
      p_redeem_now: redeemNow,
      p_rows: rows,
      p_earned: order.status === "completed" ? earnTarget : 0,
      p_actor: actor,
    } as never);
    if (error) {
      console.error("[member-points] apply", error);
      return null;
    }
    if (data === true) return { rows };
    // มีคนเปลี่ยนพร้อมกัน → อ่านใหม่แล้วคิดอีกรอบ
  }
  return null;
}

/** พนักงานปรับแต้ม (+/-) · null = หักเกินที่มี / ไม่พบสมาชิก */
export async function adjustPoints(sb: Admin, customerId: string, delta: number, note: string, actor: string): Promise<number | null> {
  const { data, error } = await sb.rpc("store_points_adjust" as never, { p_customer: customerId, p_delta: delta, p_note: note, p_actor: actor } as never);
  if (error) {
    console.error("[member-points] adjust", error);
    return null;
  }
  return typeof data === "number" ? data : null;
}

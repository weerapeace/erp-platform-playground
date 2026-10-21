import { describe, it, expect } from "vitest";
import { makeReferralCode, referralCoupon, samePhone9 } from "../website-referral";
import { ensureReferralCode, rewardReferral } from "../website-referral-db";
import { checkCoupon } from "../website-coupons-db";
import { couponFromRow } from "../website-coupons";
import { fakeDb, type Row } from "./fake-db";

/** 🎁 ชวนเพื่อน (ชุด 6 · 2026-10-22) */
type Db = Parameters<typeof checkCoupon>[0];
const SHOP = "shop-1";
const REFERRER = "11111111-0000-0000-0000-000000000001";
const FRIEND = "22222222-0000-0000-0000-000000000002";

const settings = (o: Record<string, string> = {}) =>
  Object.entries({ referral_enabled: "1", referral_friend_discount: "100", referral_min_subtotal: "300", referral_reward_points: "50", points_enabled: "1", ...o }).map(([key, value]) => ({ shop_id: SHOP, key, value }));
const refCoupon: Row = { id: "c-ref", shop_id: SHOP, code: "FABC234", kind: "fixed", value: 1, min_subtotal: 0, per_phone_once: true, new_customers_only: true, members_only: false, active: true, referrer_id: REFERRER };

function setup(o: { settings?: Record<string, string>; friendOrders?: number } = {}) {
  const tables: Record<string, Row[]> = {
    store_settings: settings(o.settings),
    store_coupons: [{ ...refCoupon }],
    store_coupon_redemptions: [],
    store_customers: [{ id: REFERRER, shop_id: SHOP, phone: "0811111111" }],
    store_orders: Array.from({ length: o.friendOrders ?? 0 }, (_, i) => ({ id: `old-${i}`, shop_id: SHOP, customer_phone: "0899999999", status: "completed" })),
  };
  const calls: Record<string, unknown>[] = [];
  const db = fakeDb(tables, { store_points_adjust: (a) => (calls.push(a), 500) }) as unknown as Db;
  return { tables, db, calls };
}

describe("🎁 กฎโค้ดชวนเพื่อน", () => {
  it("โค้ด F + 6 ตัว (ไม่มีตัวสับสน)", () => {
    expect(makeReferralCode(() => 0)).toBe("FAAAAAA");
    expect(makeReferralCode()).toMatch(/^F[A-HJKMNP-Z2-9]{6}$/);
  });
  it("มูลค่าอ่านจากที่ตั้งร้าน · ลูกค้าใหม่ · 1 เบอร์ครั้งเดียว · ร้านปิด = ใช้ไม่ได้", () => {
    const c = referralCoupon(couponFromRow(refCoupon), { referral_enabled: true, referral_friend_discount: 150, referral_min_subtotal: 500, referral_reward_points: 10 });
    expect(c).toMatchObject({ kind: "fixed", value: 150, minSubtotal: 500, newCustomersOnly: true, perPhoneOnce: true, membersOnly: false, active: true });
    expect(referralCoupon(couponFromRow(refCoupon), { referral_enabled: false, referral_friend_discount: 150, referral_min_subtotal: 0, referral_reward_points: 0 }).active).toBe(false);
    expect(samePhone9("+66811111111", "081-111-1111")).toBe(true);
  });
});

describe("🎟️ ตรวจโค้ดชวนเพื่อน (checkCoupon)", () => {
  it("เพื่อนใหม่ ยอดถึงขั้นต่ำ = ลด 100", async () => {
    const r = await checkCoupon(setup().db, SHOP, "fabc234", 1000, "0899999999", FRIEND);
    expect(r).toMatchObject({ ok: true, discount: 100 });
  });
  it("ใช้โค้ดตัวเอง (บัญชีเดียวกัน หรือเบอร์เดียวกัน) ไม่ได้", async () => {
    expect(await checkCoupon(setup().db, SHOP, "FABC234", 1000, "0899999999", REFERRER)).toMatchObject({ ok: false });
    expect(await checkCoupon(setup().db, SHOP, "FABC234", 1000, "+66811111111", null)).toMatchObject({ ok: false, error: expect.stringContaining("ของตัวเอง") });
  });
  it("ร้านปิดชวนเพื่อน = ไม่พบโค้ด · เคยสั่งแล้ว = ไม่ใช่ลูกค้าใหม่ · ยอดไม่ถึงขั้นต่ำ = ไม่ได้", async () => {
    expect(await checkCoupon(setup({ settings: { referral_enabled: "0" } }).db, SHOP, "FABC234", 1000, "0899999999", null)).toMatchObject({ ok: false, error: expect.stringContaining("ไม่พบโค้ด") });
    expect((await checkCoupon(setup({ friendOrders: 1 }).db, SHOP, "FABC234", 1000, "0899999999", null)).ok).toBe(false);
    expect((await checkCoupon(setup().db, SHOP, "FABC234", 200, "0899999999", null)).ok).toBe(false);
  });
});

describe("⭐ ให้แต้มคนชวน (rewardReferral)", () => {
  const withRedemption = (status: string, o: Record<string, string> = {}) => {
    const s = setup({ settings: o });
    s.tables.store_coupon_redemptions.push({ id: "red-1", coupon_id: "c-ref", order_id: "ord-1", referral_points: null, store_coupons: { referrer_id: REFERRER, shop_id: SHOP }, store_orders: { order_no: "LM-0001", status } });
    return s;
  };
  it("ออเดอร์สำเร็จ = ให้แต้มครั้งเดียว (เรียกซ้ำไม่ให้ซ้ำ)", async () => {
    const { db, calls, tables } = withRedemption("completed");
    expect(await rewardReferral(db, "ord-1", "staff:a")).toEqual({ referrerId: REFERRER, points: 50 });
    expect(await rewardReferral(db, "ord-1", "staff:a")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ p_customer: REFERRER, p_delta: 50 });
    expect(tables.store_coupon_redemptions[0].referral_points).toBe(50);
  });
  it("ยังไม่สำเร็จ / ร้านปิดแต้ม / แต้ม 0 = ไม่ให้", async () => {
    const a = withRedemption("shipped");
    expect(await rewardReferral(a.db, "ord-1", "x")).toBeNull();
    const b = withRedemption("completed", { points_enabled: "0" });
    expect(await rewardReferral(b.db, "ord-1", "x")).toBeNull();
    const c = withRedemption("completed", { referral_reward_points: "0" });
    expect(await rewardReferral(c.db, "ord-1", "x")).toBeNull();
    expect(a.calls.length + b.calls.length + c.calls.length).toBe(0);
  });
});

describe("🔑 โค้ดของสมาชิก (ensureReferralCode)", () => {
  it("มีแล้ว = ใช้อันเดิม · ยังไม่มี = สร้างใหม่ครั้งเดียว", async () => {
    const { db, tables } = setup();
    expect(await ensureReferralCode(db, SHOP, REFERRER)).toMatchObject({ id: "c-ref", code: "FABC234" });
    const made = await ensureReferralCode(db, SHOP, FRIEND);
    expect(made?.code).toMatch(/^F[A-Z0-9]{6}$/);
    expect(tables.store_coupons.filter((c) => c.referrer_id === FRIEND)).toHaveLength(1);
    expect(await ensureReferralCode(db, SHOP, FRIEND)).toEqual(made);
  });
});

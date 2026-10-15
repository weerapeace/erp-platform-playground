import { describe, it, expect } from "vitest";
import { checkCoupon, memberCouponList } from "../website-coupons-db";
import { fakeDb, type Row } from "./fake-db";

/** 🎟️ คูปองเฉพาะสมาชิก (M5) — ตัวเชื่อม DB กับฐานข้อมูลจำลอง (กฎคิดเงินทดสอบแยกใน website-coupons.test) */
type Db = Parameters<typeof checkCoupon>[0];
const SHOP = "shop-1";
const coupon = (code: string, extra: Row = {}): Row => ({
  id: `c-${code}`,
  shop_id: SHOP,
  code,
  kind: "percent",
  value: 10,
  min_subtotal: 0,
  max_discount: null,
  starts_at: null,
  ends_at: null,
  usage_limit: null,
  per_phone_once: true,
  new_customers_only: false,
  members_only: false,
  min_tier: null,
  active: true,
  note: "",
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});

function db(spend: Record<string, number>, redemptions: Row[] = []) {
  return fakeDb(
    {
      store_coupons: [
        coupon("ALL10"),
        coupon("MEM10", { members_only: true }),
        coupon("GOLD20", { members_only: true, min_tier: "gold", value: 20 }),
        coupon("GONE5", { members_only: true, min_tier: "diamond" }),
        coupon("OLDMEM", { members_only: true, ends_at: "2026-01-01T00:00:00Z" }),
        coupon("OFFMEM", { members_only: true, active: false }),
      ],
      store_coupon_redemptions: redemptions,
      store_member_tiers: [
        { shop_id: SHOP, key: "member", name: "Member", min_spend: 0, earn_multiplier: 1, color: "#999999" },
        { shop_id: SHOP, key: "gold", name: "Gold", min_spend: 15000, earn_multiplier: 2, color: "#d4a017" },
      ],
      store_orders: [],
    },
    {
      store_member_stats: (a) => (a.p_customers as string[]).map((id) => ({ customer_id: id, balance: 0, spend_12m: spend[id] ?? 0, order_count: 0, order_total: 0 })),
    }
  ) as unknown as Db;
}

describe("checkCoupon + สมาชิก", () => {
  it("ลูกค้าทั่วไป: คูปองปกติใช้ได้ · คูปองสมาชิก = บอกให้เข้าสู่ระบบ", async () => {
    const d = db({});
    expect(await checkCoupon(d, SHOP, "all10", 1000, "0811111111")).toMatchObject({ ok: true, discount: 100 });
    expect(await checkCoupon(d, SHOP, "MEM10", 1000, "0811111111")).toEqual({ ok: false, error: "โค้ดนี้สำหรับสมาชิก — เข้าสู่ระบบก่อนใช้" });
  });
  it("สมาชิก: ใช้คูปองสมาชิกได้ · ระดับไม่ถึง Gold = บอกชื่อระดับ · ถึงแล้วใช้ได้", async () => {
    const d = db({ m1: 3000, m2: 16000 });
    expect(await checkCoupon(d, SHOP, "MEM10", 1000, "", "m1")).toMatchObject({ ok: true, discount: 100 });
    expect(await checkCoupon(d, SHOP, "GOLD20", 1000, "", "m1")).toEqual({ ok: false, error: "โค้ดนี้สำหรับสมาชิกระดับ Gold ขึ้นไป" });
    expect(await checkCoupon(d, SHOP, "GOLD20", 1000, "", "m2")).toMatchObject({ ok: true, discount: 200 });
  });
  it("ระดับที่ตั้งไว้ถูกลบแล้ว = ไม่มีใครใช้ได้", async () => {
    expect(await checkCoupon(db({ m2: 99999 }), SHOP, "GONE5", 1000, "", "m2")).toEqual({ ok: false, error: "โค้ดนี้สำหรับสมาชิกระดับที่ร้านกำหนด" });
  });
});

describe("memberCouponList (หน้าบัญชี + ปุ่มลัดตอนชำระเงิน)", () => {
  it("เฉพาะคูปองสมาชิกที่เปิด/ยังไม่หมดเขต · ระดับไม่ถึง = ล็อก · ระดับถูกลบ = ไม่โชว์ · คูปองทั่วไปไม่ประกาศ", async () => {
    const list = await memberCouponList(db({ m1: 3000 }), SHOP, "m1", "0811111111");
    expect(list.map((c) => c.code).sort()).toEqual(["GOLD20", "MEM10"]);
    expect(list.find((c) => c.code === "GOLD20")).toMatchObject({ eligible: false, minTierName: "Gold", used: false });
    expect(list.find((c) => c.code === "MEM10")).toMatchObject({ eligible: true, minTierName: null, used: false });
  });
  it("ใช้ไปแล้ว (ใช้ได้ครั้งเดียว) = บอกว่าใช้แล้ว · ออเดอร์ที่ยกเลิกไม่นับ", async () => {
    const used = [{ coupon_id: "c-MEM10", customer_phone: "0811111111", store_orders: { status: "completed" } }];
    expect((await memberCouponList(db({ m1: 0 }, used), SHOP, "m1", "081-111-1111")).find((c) => c.code === "MEM10")?.used).toBe(true);
    const cancelled = [{ coupon_id: "c-MEM10", customer_phone: "0811111111", store_orders: { status: "cancelled" } }];
    expect((await memberCouponList(db({ m1: 0 }, cancelled), SHOP, "m1", "0811111111")).find((c) => c.code === "MEM10")?.used).toBe(false);
  });
});

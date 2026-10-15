import { describe, it, expect } from "vitest";
import { syncOrderPoints } from "../member-points-db";

/**
 * ⭐ ตัวเชื่อม "เปลี่ยนสถานะออเดอร์ → ปรับแต้ม" กับฐานข้อมูลจำลองในหน่วยความจำ
 * (ฟังก์ชัน DB จริงทดสอบแยกใน transaction ที่ rollback — ที่นี่ตรวจว่าโค้ดอ่าน/คิด/ส่งถูก)
 */
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, opts: { failApplyOnce?: boolean } = {}) {
  let failNext = !!opts.failApplyOnce;
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
      order: () => q,
      limit: () => q,
      rows: () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r))),
      maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: q.rows(), error: null }),
    };
    return q;
  };
  const ledger = () => tables.store_point_ledger;
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    if (fn === "store_member_stats") {
      const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString();
      return {
        data: (a.p_customers as string[]).map((id) => ({
          customer_id: id,
          balance: ledger().filter((l) => l.customer_id === id).reduce((s, l) => s + (l.delta as number), 0),
          spend_12m: tables.store_orders
            .filter((o) => o.customer_id === id && o.status === "completed" && String(o.created_at) >= yearAgo)
            .reduce((s, o) => s + Math.max(0, (o.subtotal as number) - (o.discount as number) - (o.points_discount as number)), 0),
          order_count: 0,
          order_total: 0,
        })),
        error: null,
      };
    }
    if (fn === "store_points_apply") {
      const o = tables.store_orders.find((x) => x.id === a.p_order)!;
      if (failNext) {
        // จำลองคนอื่นเปลี่ยนพร้อมกัน: แทรกรายการก่อน แล้วตอบว่าไม่ตรง
        failNext = false;
        return { data: false, error: null };
      }
      const mine = ledger().filter((l) => l.order_id === a.p_order);
      const earn = mine.filter((l) => l.kind === "earn" || l.kind === "revoke").reduce((s, l) => s + (l.delta as number), 0);
      const red = mine.filter((l) => l.kind === "redeem" || l.kind === "refund").reduce((s, l) => s + (l.delta as number), 0);
      if (earn !== a.p_earn_now || red !== a.p_redeem_now) return { data: false, error: null };
      for (const r of a.p_rows as { kind: string; delta: number }[]) ledger().push({ customer_id: o.customer_id, order_id: o.id, kind: r.kind, delta: r.delta });
      o.points_earned = a.p_earned;
      return { data: true, error: null };
    }
    throw new Error("rpc " + fn);
  };
  return { from: query, rpc } as unknown as Parameters<typeof syncOrderPoints>[0];
}

const SHOP = "shop-1";
const now = new Date().toISOString();
const settings = (on = true) => [
  { shop_id: SHOP, key: "points_enabled", value: on ? "1" : "0" },
  { shop_id: SHOP, key: "points_earn_unit", value: "100" },
];
const tiers = [
  { shop_id: SHOP, key: "member", name: "Member", min_spend: 0, earn_multiplier: 1, color: "#999999" },
  { shop_id: SHOP, key: "silver", name: "Silver", min_spend: 5000, earn_multiplier: 1.5, color: "#aaaaaa" },
];
const order = (id: string, extra: Row = {}) => ({ id, shop_id: SHOP, customer_id: "c1", status: "pending", subtotal: 1990, discount: 0, points_discount: 0, points_used: 0, points_earned: 0, created_at: now, ...extra });

describe("syncOrderPoints", () => {
  it("สำเร็จ = ได้แต้มตามระดับ 'ก่อน' ออเดอร์นี้ (ไม่นับตัวเอง) · เรียกซ้ำไม่บวกซ้ำ", async () => {
    const t = {
      store_orders: [order("old", { status: "completed", subtotal: 6000 }), order("o1", { status: "completed" })],
      store_point_ledger: [] as Row[],
      store_settings: settings(),
      store_member_tiers: tiers,
    };
    const db = fakeDb(t);
    // ยอดก่อนหน้า 6,000 → Silver ×1.5 · ออเดอร์นี้ ฿1,990 → 19 × 1.5 = 28
    expect(await syncOrderPoints(db, "o1", "staff:x")).toEqual({ rows: [{ kind: "earn", delta: 28 }] });
    expect(t.store_orders[1].points_earned).toBe(28);
    expect(await syncOrderPoints(db, "o1", "staff:x")).toEqual({ rows: [] });
  });

  it("ยอดก่อนหน้ายังไม่ถึง Silver แม้รวมออเดอร์นี้แล้วถึง = ได้ตัวคูณเดิม (×1)", async () => {
    const t = {
      store_orders: [order("old", { status: "completed", subtotal: 4000 }), order("o1", { status: "completed", subtotal: 1990 })],
      store_point_ledger: [] as Row[],
      store_settings: settings(),
      store_member_tiers: tiers,
    };
    expect(await syncOrderPoints(fakeDb(t), "o1", "staff:x")).toEqual({ rows: [{ kind: "earn", delta: 19 }] });
  });

  it("ยกเลิก = เรียกแต้มที่ได้คืน + คืนแต้มที่ใช้ตอนสั่ง", async () => {
    const t = {
      store_orders: [order("o1", { status: "cancelled", points_used: 100, points_discount: 100 })],
      store_point_ledger: [
        { customer_id: "c1", order_id: "o1", kind: "redeem", delta: -100 },
        { customer_id: "c1", order_id: "o1", kind: "earn", delta: 18 },
      ] as Row[],
      store_settings: settings(),
      store_member_tiers: [],
    };
    expect(await syncOrderPoints(fakeDb(t), "o1", "staff:x")).toEqual({
      rows: [
        { kind: "revoke", delta: -18 },
        { kind: "refund", delta: 100 },
      ],
    });
  });

  it("ร้านปิดแต้ม: สำเร็จไม่ได้แต้ม แต่ยกเลิกยังคืนแต้มที่ใช้", async () => {
    const t = {
      store_orders: [order("o1", { status: "completed" }), order("o2", { status: "cancelled", points_used: 50 })],
      store_point_ledger: [{ customer_id: "c1", order_id: "o2", kind: "redeem", delta: -50 }] as Row[],
      store_settings: settings(false),
      store_member_tiers: [],
    };
    const db = fakeDb(t);
    expect(await syncOrderPoints(db, "o1", "staff:x")).toEqual({ rows: [] });
    expect(await syncOrderPoints(db, "o2", "staff:x")).toEqual({ rows: [{ kind: "refund", delta: 50 }] });
  });

  it("ไม่ใช่ออเดอร์สมาชิก = ไม่มีอะไร · ชนกันครั้งแรก = อ่านใหม่แล้วสำเร็จ", async () => {
    const t = {
      store_orders: [order("guest", { customer_id: null, status: "completed" }), order("o1", { status: "completed" })],
      store_point_ledger: [] as Row[],
      store_settings: settings(),
      store_member_tiers: [],
    };
    expect(await syncOrderPoints(fakeDb(t), "guest", "x")).toEqual({ rows: [] });
    expect(await syncOrderPoints(fakeDb(t, { failApplyOnce: true }), "o1", "x")).toEqual({ rows: [{ kind: "earn", delta: 19 }] });
    expect(t.store_point_ledger).toHaveLength(1);
  });
});

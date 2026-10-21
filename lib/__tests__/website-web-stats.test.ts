import { describe, it, expect } from "vitest";
import { abVerdict, bkkDayFrom, cleanAb, cleanExpId, cleanSource, cleanStatEvents, summarizeWebStats } from "../website-web-stats";
import { normalizeBlocks, sanitizeAb, validateBlocks } from "../website-blocks";
import { validateOrderInput } from "../website-orders";

/** 📈 สถิติเว็บร้าน + 🧪 A/B (ชุด 8 · 2026-10-22) */
describe("📈 ตัวนับจากเว็บ", () => {
  it("รับเฉพาะตัวนับที่รู้จัก · ล้างมิติตามชนิด · ≤20 ตัว", () => {
    const ev = cleanStatEvents([
      { m: "session", d: "WWW.Google.com" },
      { m: "pv", d: "ignored" },
      { m: "device", d: "phone" },
      { m: "device", d: "mobile" },
      { m: "landing", d: "/en/product/roar01?email=a@b.co" },
      { m: "landing", d: "https://evil.co/x" },
      { m: "item_view", d: "roar 01!" },
      { m: "ab_x", d: "Hero Test|B" },
      { m: "ab_x", d: "hero|C" },
      { m: "drop_table", d: "x" },
    ]);
    expect(ev).toEqual([
      { m: "session", d: "google.com" },
      { m: "pv", d: "" },
      { m: "device", d: "mobile" },
      { m: "landing", d: "/product/roar01" },
      { m: "item_view", d: "ROAR01" },
      { m: "ab_x", d: "hero-test|B" },
    ]);
    expect(cleanStatEvents(Array.from({ length: 50 }, () => ({ m: "pv" })))).toHaveLength(20);
    expect(cleanStatEvents("nope")).toEqual([]);
  });

  it("แหล่งที่มา/ชื่อการทดสอบ/กลุ่ม A-B", () => {
    expect(cleanSource("")).toBe("direct");
    expect(cleanSource(" FaceBook ")).toBe("facebook");
    expect(cleanExpId("  Hero  Banner!! ")).toBe("hero-banner");
    expect(cleanAb({ "Hero Test": "A", x: "C", "": "B" })).toEqual({ "hero-test": "A" });
    expect(cleanAb(null)).toBeNull();
  });
});

describe("🧪 ตัดสินผล A/B", () => {
  it("คนน้อย = รอ · ต่างชัด = ชนะ · ใกล้กัน = ยังไม่ต่าง", () => {
    expect(abVerdict(50, 5, 500, 50)).toBe("need_more");
    expect(abVerdict(1000, 20, 1000, 60)).toBe("B");
    expect(abVerdict(1000, 60, 1000, 20)).toBe("A");
    expect(abVerdict(1000, 30, 1000, 33)).toBe("no_diff");
  });
});

describe("📊 สรุปทำ Dashboard", () => {
  it("รวมแหล่ง/ขั้น/สินค้า/รายวัน/A-B · ออเดอร์ไม่มีแหล่ง = unknown", () => {
    const rows = [
      { day: "2026-10-20", metric: "session", dim: "google", n: 10 },
      { day: "2026-10-21", metric: "session", dim: "google", n: 5 },
      { day: "2026-10-21", metric: "session", dim: "direct", n: 5 },
      { day: "2026-10-21", metric: "pv", dim: "", n: 40 },
      { day: "2026-10-21", metric: "f_view", dim: "google", n: 12 },
      { day: "2026-10-21", metric: "f_cart", dim: "google", n: 4 },
      { day: "2026-10-21", metric: "f_checkout", dim: "google", n: 2 },
      { day: "2026-10-21", metric: "device", dim: "mobile", n: 15 },
      { day: "2026-10-21", metric: "item_view", dim: "ROAR01", n: 9 },
      { day: "2026-10-21", metric: "item_cart", dim: "ROAR01", n: 3 },
      { day: "2026-10-21", metric: "ab_x", dim: "hero|A", n: 8 },
      { day: "2026-10-21", metric: "ab_x", dim: "hero|B", n: 7 },
      { day: "2026-10-21", metric: "ab_cart", dim: "hero|B", n: 2 },
    ];
    const orders = [
      { day: "2026-10-21", source: "google", total: 1000, ab: { hero: "B" as const } },
      { day: "2026-10-21", source: null, total: 500.5, ab: null },
    ];
    const s = summarizeWebStats(rows, orders);
    expect(s.totals).toEqual({ sessions: 20, pageviews: 40, viewed: 12, carted: 4, checkout: 2, orders: 2, revenue: 1500.5 });
    expect(s.sources[0]).toEqual({ source: "google", sessions: 15, carted: 4, checkout: 2, orders: 1, revenue: 1000 });
    expect(s.sources.find((x) => x.source === "unknown")).toMatchObject({ orders: 1, revenue: 500.5 });
    expect(s.products).toEqual([{ code: "ROAR01", views: 9, carts: 3 }]);
    expect(s.daily).toEqual([
      { day: "2026-10-20", sessions: 10, orders: 0, revenue: 0 },
      { day: "2026-10-21", sessions: 10, orders: 2, revenue: 1500.5 },
    ]);
    expect(s.ab).toEqual([{ exp: "hero", A: { seen: 8, carts: 0, checkouts: 0, orders: 0, revenue: 0 }, B: { seen: 7, carts: 2, checkouts: 0, orders: 1, revenue: 1000 }, verdict: "need_more" }]);
  });

  it("วันเริ่มช่วง = เวลาไทย (ไม่ร่นวัน)", () => {
    // 2026-10-21 23:30 ไทย = 16:30Z
    expect(bkkDayFrom(1, new Date("2026-10-21T16:30:00Z"))).toBe("2026-10-21");
    expect(bkkDayFrom(7, new Date("2026-10-21T17:30:00Z"))).toBe("2026-10-16");
  });
});

describe("🧪 Section A/B + ออเดอร์", () => {
  it("เก็บค่า ab ตอนบันทึก · ค่าเสีย = ทิ้ง · มีแบบเดียว = เตือน", () => {
    expect(sanitizeAb({ exp: "Hero Test", variant: "B" })).toEqual({ exp: "hero-test", variant: "B" });
    expect(sanitizeAb({ exp: "", variant: "A" })).toBeNull();
    const blocks = normalizeBlocks([
      { id: "h1", type: "hero", ab: { exp: "hero", variant: "A" } },
      { id: "t1", type: "rich-text", ab: { exp: "bad", variant: "Z" } },
    ]);
    expect((blocks[0] as { ab?: unknown }).ab).toEqual({ exp: "hero", variant: "A" });
    expect((blocks[1] as { ab?: unknown }).ab).toBeUndefined();
    expect(validateBlocks(blocks).some((i) => i.message.includes('ทดสอบ A/B "hero" มีแค่แบบ A'))).toBe(true);
  });

  it("ออเดอร์รับแหล่ง + กลุ่ม A/B (เว็บรุ่นเก่าไม่ส่ง = ไม่มีช่อง)", () => {
    const good = { items: [{ productId: "11111111-2222-3333-4444-555555555555", qty: 1 }], customer: { name: "Anna", phone: "0812345678" }, ship: { addressLine: "99/9 Sukhumvit" }, paymentMethod: "cod" };
    expect(validateOrderInput({ ...good, source: "Google", ab: { hero: "B", junk: 1 } })).toMatchObject({ ok: true, input: { source: "google", ab: { hero: "B" } } });
    const plain = validateOrderInput(good);
    expect(plain.ok && "source" in plain.input).toBe(false);
  });
});

/**
 * สูตรแท็บ "ลูกค้า" ของหน้าภาพรวมการตลาด — pure + เทสต์ lib/__tests__/marketing-customers-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 5 · แบบ A + ข้อ 1 กลุ่มลูกค้า RFM · 2 ซื้อคู่กันบ่อย · 3 สินค้าที่ทำให้กลับมาซื้อ · 4 ตาราง+ส่งออกรายชื่อ)
 * ตัวตนลูกค้า = ช่องทาง + แบรนด์ (ร้าน) + ชื่อบัญชีผู้ซื้อ (customer_name จากออเดอร์ที่ดึงผ่าน API · Shopee = username)
 *   ข้ามช่องทางจับคู่ไม่ได้ (ไม่มีเบอร์/อีเมล) · ออเดอร์จากอีเมลไม่มีชื่อ → ไม่นับในเรื่องลูกค้า (แต่ใช้หา "ซื้อคู่กัน" ได้)
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export const customerKey = (platform: string, brandId: string | null, name: string) => `${platform}|${brandId ?? ""}|${name.trim().toLowerCase()}`;

export type CustOrder = { id: string; key: string; platform: string; brand_id: string | null; name: string; date: string; value: number };
export type Customer = {
  key: string; platform: string; brand_id: string | null; name: string;
  orders: number; spend: number; first: string; last: string; secondGap: number | null; orderIds: string[];
  /** จำนวน "วันที่ซื้อ" (หลายใบวันเดียวกัน = 1 ครั้ง — ลูกค้าชอบแยกสั่ง) · ใช้ตัดสินซื้อซ้ำ/กลุ่ม */
  visits: number;
};

/** รวมออเดอร์ (ที่นับเป็นยอดขายแล้ว) → ต่อลูกค้า */
export function buildCustomers(orders: readonly CustOrder[]): Customer[] {
  const m = new Map<string, { c: Customer; dates: string[] }>();
  for (const o of orders) {
    let g = m.get(o.key);
    if (!g) { g = { c: { key: o.key, platform: o.platform, brand_id: o.brand_id, name: o.name, orders: 0, spend: 0, first: o.date, last: o.date, secondGap: null, orderIds: [], visits: 0 }, dates: [] }; m.set(o.key, g); }
    g.c.orders++; g.c.spend += o.value; g.c.orderIds.push(o.id); g.dates.push(o.date);
    if (o.date < g.c.first) g.c.first = o.date; if (o.date > g.c.last) g.c.last = o.date;
  }
  return [...m.values()].map(({ c, dates }) => {
    const s = [...new Set(dates)].sort();
    return { ...c, visits: s.length, secondGap: s.length >= 2 ? daysBetween(s[0], s[1]) : null };
  });
}

export type Segment = "champion" | "loyal" | "new" | "at_risk" | "one_time";
export const SEGMENTS: Record<Segment, { label: string; hint: string }> = {
  champion: { label: "ชั้นดี", hint: "ซื้อ 3 วันขึ้นไป (คนละวัน) และเพิ่งซื้อใน 30 วัน" },
  loyal: { label: "ประจำ", hint: "ซื้อ 2 วันขึ้นไป (คนละวัน) และเพิ่งซื้อใน 30 วัน" },
  new: { label: "ใหม่", hint: "ซื้อครั้งแรกใน 30 วันนี้" },
  at_risk: { label: "เสี่ยงหาย", hint: "เคยซื้อซ้ำ แต่เงียบเกิน 30 วัน — ควรส่งโค้ดดึงกลับ" },
  one_time: { label: "ซื้อครั้งเดียวแล้วเงียบ", hint: "ซื้อครั้งเดียว และเงียบเกิน 30 วัน" },
};
/** กลุ่มลูกค้า ณ วัน asOf (กติกาตรง ๆ อธิบายได้ ไม่ใช้คะแนนซับซ้อน — ข้อมูลยังสั้น) */
export function segmentOf(c: Pick<Customer, "visits" | "last">, asOf: string, recentDays = 30): Segment {
  const recent = daysBetween(c.last, asOf) <= recentDays;
  if (c.visits >= 3 && recent) return "champion";
  if (c.visits >= 2) return recent ? "loyal" : "at_risk";
  return recent ? "new" : "one_time";
}

/** สถิติช่วง [from, to]: ลูกค้าที่ซื้อในช่วง · ใหม่ (ซื้อครั้งแรกในช่วง) · กลับมา (เคยซื้อก่อนช่วง) */
export function rangeStats(orders: readonly CustOrder[], customers: readonly Customer[], from: string, to: string) {
  const firstOf = new Map(customers.map((c) => [c.key, c.first]));
  const inRange = orders.filter((o) => o.date >= from && o.date <= to);
  const active = new Map<string, { spend: number; orders: number }>();
  for (const o of inRange) { const g = active.get(o.key) ?? { spend: 0, orders: 0 }; g.spend += o.value; g.orders++; active.set(o.key, g); }
  let newC = 0, retC = 0, retSales = 0, sales = 0;
  for (const [k, g] of active) {
    sales += g.spend;
    if ((firstOf.get(k) ?? from) >= from) newC++; else { retC++; retSales += g.spend; }
  }
  const repeaters = customers.filter((c) => c.visits >= 2);
  const gaps = repeaters.map((c) => c.secondGap).filter((x): x is number => x != null).sort((a, b) => a - b);
  return {
    customers: active.size, newCustomers: newC, returning: retC, sales, perCustomer: active.size ? sales / active.size : 0,
    returningShare: sales > 0 ? retSales / sales : 0,
    repeatRate: customers.length ? repeaters.length / customers.length : 0,
    medianGap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
  };
}

export type BasketItem = { order_id: string; product: string };
/** สินค้าที่ซื้อคู่กัน (ในออเดอร์เดียวกัน · คนละรุ่น) — count = จำนวนออเดอร์ · confidence = % ของออเดอร์ที่มี A แล้วมี B ด้วย */
export function productPairs(items: readonly BasketItem[], opts: { minCount?: number; limit?: number } = {}): { a: string; b: string; count: number; confAB: number; confBA: number }[] {
  const minCount = opts.minCount ?? 3, limit = opts.limit ?? 30;
  const byOrder = new Map<string, Set<string>>();
  for (const it of items) { const s = byOrder.get(it.order_id) ?? new Set<string>(); s.add(it.product); byOrder.set(it.order_id, s); }
  const single = new Map<string, number>(), pair = new Map<string, number>();
  for (const s of byOrder.values()) {
    const ps = [...s].sort();
    for (const p of ps) single.set(p, (single.get(p) ?? 0) + 1);
    if (ps.length > 12) continue;   // ออเดอร์ขายส่งของเยอะ ๆ ไม่นับคู่ (บิดผล)
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const k = `${ps[i]}\u0000${ps[j]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
  }
  return [...pair.entries()].filter(([, n]) => n >= minCount).map(([k, n]) => {
    const [a, b] = k.split("\u0000");
    return { a, b, count: n, confAB: n / (single.get(a) ?? n), confBA: n / (single.get(b) ?? n) };
  }).sort((x, y) => y.count - x.count).slice(0, limit);
}

/** สินค้าชิ้นแรกที่ทำให้ลูกค้ากลับมาซื้อ — เฉพาะลูกค้าที่ซื้อครั้งแรกนานพอ (≥ minAge วันก่อน asOf) · ต่อสินค้าต้องมีลูกค้า ≥ minCustomers */
export function firstProductRepeat(customers: readonly Customer[], firstProducts: Map<string, string[]>, asOf: string, opts: { minAge?: number; minCustomers?: number } = {}): { product: string; customers: number; repeated: number; rate: number }[] {
  const minAge = opts.minAge ?? 21, minCustomers = opts.minCustomers ?? 5;
  const m = new Map<string, { customers: number; repeated: number }>();
  for (const c of customers) {
    if (daysBetween(c.first, asOf) < minAge) continue;
    for (const p of new Set(firstProducts.get(c.key) ?? [])) {
      const g = m.get(p) ?? { customers: 0, repeated: 0 };
      g.customers++; if (c.visits >= 2) g.repeated++;
      m.set(p, g);
    }
  }
  return [...m.entries()].filter(([, g]) => g.customers >= minCustomers).map(([product, g]) => ({ product, ...g, rate: g.repeated / g.customers }))
    .sort((a, b) => b.rate - a.rate || b.customers - a.customers);
}

/** ซ่อนชื่อลูกค้า (คนไม่มีสิทธิ์ดูออเดอร์) → รหัสคงที่ต่อคน */
export function maskedName(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `ลูกค้า #${(h % 1_000_000).toString().padStart(6, "0")}`;
}

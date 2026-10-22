/**
 * 📈 สถิติเว็บร้านของเราเอง (ชุด 8) — กฎกลาง: ตัวนับที่ยอมรับ · ล้างค่า · สรุปทำ Dashboard · ตัดสินผล A/B
 *
 * เว็บร้านยิงตัวนับรวม ๆ (src/lib/site-stats.ts) → POST /api/public/storefront/stats → store_web_stats (นับรายวัน ไม่ระบุตัวคน)
 * ยอดซื้อจริงไม่นับจากเว็บ — อ่านจาก store_orders (source / ab ที่แนบมากับออเดอร์) กันตัวเลขเพี้ยน
 * ERP › เว็บไซต์ › 📈 สถิติ (components/website-stats-panel.tsx · /api/website/web-stats)
 */

/** ตัวนับที่เว็บร้านส่งได้ — อย่างอื่นทิ้ง */
export const STAT_METRICS = {
  session: "รอบเข้าเว็บ (มิติ = แหล่งที่มา)",
  device: "อุปกรณ์ของรอบ (mobile/tablet/desktop)",
  landing: "หน้าแรกที่เข้า (path)",
  pv: "เปิดหน้า",
  f_view: "รอบที่ดูสินค้า (มิติ = แหล่ง)",
  f_cart: "รอบที่ใส่ตะกร้า (มิติ = แหล่ง)",
  f_checkout: "รอบที่เริ่มชำระเงิน (มิติ = แหล่ง)",
  item_view: "ดูสินค้า (มิติ = รหัสรุ่น)",
  item_cart: "ใส่ตะกร้า (มิติ = รหัสรุ่น)",
  item_viewer: "คนดูสินค้า 1 เครื่องต่อรุ่นต่อวัน (มิติ = รหัสรุ่น) — ป้าย 👀 คนดูวันนี้",
  ab_x: "เห็นกลุ่มทดสอบ (มิติ = exp|A)",
  ab_cart: "ใส่ตะกร้า ในกลุ่มทดสอบ",
  ab_checkout: "เริ่มชำระ ในกลุ่มทดสอบ",
} as const;
export type StatMetric = keyof typeof STAT_METRICS;

export interface StatEvent {
  m: StatMetric;
  d: string;
}

const DEVICES = new Set(["mobile", "tablet", "desktop"]);
const SOURCE_RE = /[^a-z0-9._-]/g;

/** แหล่งที่มา: ตัวเล็ก · a-z0-9._- · ≤40 · ว่าง = direct */
export function cleanSource(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase().replace(/^www\./, "").replace(SOURCE_RE, "").slice(0, 40);
  return s || "direct";
}

/** ชื่อการทดสอบ A/B: a-z0-9- ≤30 (ใช้เป็นแอตทริบิวต์/ตัวเลือก CSS ได้) */
export function cleanExpId(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

/** { exp: "A"|"B" } จากเว็บ (≤5 การทดสอบ) — อย่างอื่นทิ้ง · ว่าง = null */
export function cleanAb(raw: unknown): Record<string, "A" | "B"> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, "A" | "B"> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 5)) {
    const id = cleanExpId(k);
    if (id && (v === "A" || v === "B")) out[id] = v;
  }
  return Object.keys(out).length ? out : null;
}

function cleanDim(m: StatMetric, d: unknown): string | null {
  const s = String(d ?? "").trim();
  switch (m) {
    case "pv":
      return "";
    case "session":
    case "f_view":
    case "f_cart":
    case "f_checkout":
      return cleanSource(s);
    case "device":
      return DEVICES.has(s) ? s : null;
    case "landing": {
      // path เท่านั้น ไม่เอา ?query (อาจมีอีเมล/รหัส) · /en/xxx นับรวมกับ /xxx
      const p = s.split(/[?#]/)[0].replace(/^\/en(?=\/|$)/, "") || "/";
      return p.startsWith("/") ? p.slice(0, 80) : null;
    }
    case "item_view":
    case "item_cart":
    case "item_viewer": {
      const c = s.toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 40);
      return c || null;
    }
    case "ab_x":
    case "ab_cart":
    case "ab_checkout": {
      const [exp, v] = s.split("|");
      const id = cleanExpId(exp);
      return id && (v === "A" || v === "B") ? `${id}|${v}` : null;
    }
  }
}

/** ชุดตัวนับจากเว็บ → เฉพาะที่ถูกต้อง (≤ 20 ตัวต่อครั้ง) */
export function cleanStatEvents(raw: unknown): StatEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: StatEvent[] = [];
  for (const e of raw.slice(0, 20)) {
    const o = (e ?? {}) as Record<string, unknown>;
    const m = String(o.m ?? "") as StatMetric;
    if (!(m in STAT_METRICS)) continue;
    const d = cleanDim(m, o.d);
    if (d === null) continue;
    out.push({ m, d });
  }
  return out;
}

/* ─────────── ชื่อแหล่งที่มา (โชว์ใน ERP) ─────────── */

export const SOURCE_LABELS: Record<string, string> = {
  direct: "พิมพ์เข้าเอง / บุ๊กมาร์ก",
  google: "Google",
  facebook: "Facebook",
  instagram: "Instagram",
  line: "LINE",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
  pinterest: "Pinterest",
  shopee: "Shopee",
  lazada: "Lazada",
  bing: "Bing",
  email: "อีเมล",
  unknown: "ไม่ทราบ (ออเดอร์ก่อนเริ่มเก็บ)",
};
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

/* ─────────── สรุปทำ Dashboard ─────────── */

export interface StatRow {
  day: string;
  metric: string;
  dim: string;
  n: number;
}
export interface StatOrder {
  day: string;
  source: string | null;
  total: number;
  ab: Record<string, "A" | "B"> | null;
}

export interface AbVariantStat {
  seen: number;
  carts: number;
  checkouts: number;
  orders: number;
  revenue: number;
}
export type AbVerdict = "need_more" | "no_diff" | "A" | "B";
export interface AbResult {
  exp: string;
  A: AbVariantStat;
  B: AbVariantStat;
  verdict: AbVerdict;
}

export interface WebStatsSummary {
  totals: { sessions: number; pageviews: number; viewed: number; carted: number; checkout: number; orders: number; revenue: number };
  sources: { source: string; sessions: number; carted: number; checkout: number; orders: number; revenue: number }[];
  devices: { device: string; sessions: number }[];
  landing: { path: string; sessions: number }[];
  products: { code: string; views: number; carts: number }[];
  daily: { day: string; sessions: number; orders: number; revenue: number }[];
  ab: AbResult[];
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * ตัดสินผล A/B จากอัตราสั่งซื้อต่อคนที่เห็น (z-test สองสัดส่วน · มั่นใจ 95%)
 * คนเห็นกลุ่มไหนก็ตาม < 100 = "need_more" (ยังน้อยเกินจะสรุป)
 */
export function abVerdict(aSeen: number, aWins: number, bSeen: number, bWins: number): AbVerdict {
  if (aSeen < 100 || bSeen < 100) return "need_more";
  const p1 = aWins / aSeen;
  const p2 = bWins / bSeen;
  const p = (aWins + bWins) / (aSeen + bSeen);
  const se = Math.sqrt(p * (1 - p) * (1 / aSeen + 1 / bSeen));
  if (!se) return "no_diff";
  const z = (p2 - p1) / se;
  if (z >= 1.96) return "B";
  if (z <= -1.96) return "A";
  return "no_diff";
}

function bump<K>(map: Map<K, number>, k: K, n: number) {
  map.set(k, (map.get(k) ?? 0) + n);
}
const desc = <T,>(arr: T[], key: (t: T) => number) => arr.sort((a, b) => key(b) - key(a));

/** แถวสถิติ + ออเดอร์ในช่วงเดียวกัน → ตัวเลขทั้งหน้า Dashboard (ออเดอร์ = ไม่นับที่ยกเลิก · คัดก่อนส่งมา) */
export function summarizeWebStats(rows: StatRow[], orders: StatOrder[]): WebStatsSummary {
  const by = (metric: string) => rows.filter((r) => r.metric === metric);
  const sum = (metric: string) => by(metric).reduce((s, r) => s + r.n, 0);

  // แหล่งที่มา: รอบ / ใส่ตะกร้า / เริ่มชำระ (จากเว็บ) + ออเดอร์/ยอด (จาก DB)
  const src = new Map<string, { sessions: number; carted: number; checkout: number; orders: number; revenue: number }>();
  const row = (s: string) => src.get(s) ?? (src.set(s, { sessions: 0, carted: 0, checkout: 0, orders: 0, revenue: 0 }), src.get(s)!);
  for (const r of by("session")) row(r.dim).sessions += r.n;
  for (const r of by("f_cart")) row(r.dim).carted += r.n;
  for (const r of by("f_checkout")) row(r.dim).checkout += r.n;
  for (const o of orders) {
    const x = row(o.source ? cleanSource(o.source) : "unknown");
    x.orders += 1;
    x.revenue = money(x.revenue + o.total);
  }

  const dev = new Map<string, number>();
  for (const r of by("device")) bump(dev, r.dim, r.n);
  const land = new Map<string, number>();
  for (const r of by("landing")) bump(land, r.dim, r.n);
  const prod = new Map<string, { views: number; carts: number }>();
  for (const r of [...by("item_view"), ...by("item_cart")]) {
    const p = prod.get(r.dim) ?? { views: 0, carts: 0 };
    if (r.metric === "item_view") p.views += r.n;
    else p.carts += r.n;
    prod.set(r.dim, p);
  }

  const days = new Map<string, { sessions: number; orders: number; revenue: number }>();
  const dayRow = (d: string) => days.get(d) ?? (days.set(d, { sessions: 0, orders: 0, revenue: 0 }), days.get(d)!);
  for (const r of by("session")) dayRow(r.day).sessions += r.n;
  for (const o of orders) {
    const d = dayRow(o.day);
    d.orders += 1;
    d.revenue = money(d.revenue + o.total);
  }

  // A/B: เห็น/ตะกร้า/ชำระ จากเว็บ · ออเดอร์/ยอด จาก store_orders.ab
  const ab = new Map<string, { A: AbVariantStat; B: AbVariantStat }>();
  const blank = (): AbVariantStat => ({ seen: 0, carts: 0, checkouts: 0, orders: 0, revenue: 0 });
  const abRow = (exp: string) => ab.get(exp) ?? (ab.set(exp, { A: blank(), B: blank() }), ab.get(exp)!);
  for (const r of rows) {
    if (!r.metric.startsWith("ab_")) continue;
    const [exp, v] = r.dim.split("|");
    if (!exp || (v !== "A" && v !== "B")) continue;
    const s = abRow(exp)[v];
    if (r.metric === "ab_x") s.seen += r.n;
    else if (r.metric === "ab_cart") s.carts += r.n;
    else if (r.metric === "ab_checkout") s.checkouts += r.n;
  }
  for (const o of orders) {
    for (const [exp, v] of Object.entries(o.ab ?? {})) {
      if (v !== "A" && v !== "B") continue;
      const s = abRow(exp)[v];
      s.orders += 1;
      s.revenue = money(s.revenue + o.total);
    }
  }

  return {
    totals: {
      sessions: sum("session"),
      pageviews: sum("pv"),
      viewed: sum("f_view"),
      carted: sum("f_cart"),
      checkout: sum("f_checkout"),
      orders: orders.length,
      revenue: money(orders.reduce((s, o) => s + o.total, 0)),
    },
    sources: desc([...src].map(([source, v]) => ({ source, ...v })), (x) => x.sessions * 1000 + x.orders),
    devices: desc([...dev].map(([device, sessions]) => ({ device, sessions })), (x) => x.sessions),
    landing: desc([...land].map(([path, sessions]) => ({ path, sessions })), (x) => x.sessions).slice(0, 10),
    products: desc([...prod].map(([code, v]) => ({ code, ...v })), (x) => x.views * 1000 + x.carts).slice(0, 20),
    daily: [...days].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    ab: [...ab].map(([exp, v]) => ({ exp, ...v, verdict: abVerdict(v.A.seen, v.A.orders, v.B.seen, v.B.orders) })).sort((a, b) => b.A.seen + b.B.seen - (a.A.seen + a.B.seen)),
  };
}

/** วันที่ (เวลาไทย) ย้อนหลัง n วัน รวมวันนี้ → "YYYY-MM-DD" ของวันแรก */
export function bkkDayFrom(days: number, now = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 3600e3);
  bkk.setUTCDate(bkk.getUTCDate() - (Math.max(1, days) - 1));
  return bkk.toISOString().slice(0, 10);
}

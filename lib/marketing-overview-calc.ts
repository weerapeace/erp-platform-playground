/**
 * สูตรหน้า "ภาพรวมการตลาด" (/marketing/dashboard) — pure + เทสต์ lib/__tests__/marketing-overview-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-23 (แผนการตลาด 33 หน้า → รอบ 1 = หน้าที่ทำได้จากออเดอร์จริง):
 *   ความเร็วถึงเป้า · เทียบช่วงเวลา · แผนที่ความร้อน วัน×ชั่วโมง · จัดกลุ่มเหตุผลยกเลิก (ฝั่งร้าน/ฝั่งลูกค้า)
 *   · สินค้า 80/20 (ABC) · ดาวรุ่ง/กำลังตก · ผลแคมเปญวันพิเศษ (เช่น 11.11) · แจ้งเตือน
 * ยอดขาย = "มูลค่าสินค้า" ชุดเดียวกับแดชบอร์ดช่องทางขาย (lib/platform-dashboard-calc · ตรงกับ Shopee) — ไฟล์นี้ไม่คิดยอดเอง รับค่าที่คิดแล้วมา
 * วันที่ทั้งหมด = วันไทย (UTC+7) · ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

const BKK_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** จำนวนวันจาก a ถึง b แบบรวมทั้งสองวัน ("YYYY-MM-DD") */
export function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;
}
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// ───────────────────────── ความเร็วถึงเป้า ─────────────────────────

export type Pace = {
  target: number | null;
  sales: number;
  pct: number | null;              // ทำได้กี่ % ของเป้า (0-1+)
  daysInMonth: number;
  daysPassed: number;              // นับวันนี้ด้วย
  daysLeft: number;                // ไม่นับวันนี้
  expectedByNow: number | null;    // ควรได้ถึงวันนี้ (เป้า × วันที่ผ่าน / วันทั้งเดือน)
  gap: number | null;              // ขาดจากที่ควรได้ (บวก = ช้ากว่าแผน)
  needPerDay: number | null;       // ต้องขายต่อวันในวันที่เหลือ (รวมวันนี้) ถึงจะถึงเป้า
  avgPerDay: number;               // ทำได้เฉลี่ยต่อวันเดือนนี้
  forecast: number;                // คาดการณ์สิ้นเดือนตามความเร็วตอนนี้
};

/** ยอดเดือนนี้ (1 → วันนี้) เทียบเป้าเดือน */
export function paceToTarget(sales: number, target: number | null, todayYmd: string): Pace {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const passed = d;
  const left = dim - d;
  const avg = passed > 0 ? sales / passed : 0;
  const t = target != null && target > 0 ? target : null;
  const expected = t != null ? (t * passed) / dim : null;
  return {
    target: t, sales, pct: t != null ? sales / t : null, daysInMonth: dim, daysPassed: passed, daysLeft: left,
    expectedByNow: expected, gap: expected != null ? expected - sales : null,
    needPerDay: t != null ? Math.max(0, t - sales) / Math.max(1, left + 1) : null,
    avgPerDay: avg, forecast: avg * dim,
  };
}

// ───────────────────────── เทียบช่วงเวลา ─────────────────────────

/** ช่วงก่อนหน้าที่ยาวเท่ากัน (ติดกันก่อน from) + ช่วงเดียวกันเดือนก่อน + ช่วงเดียวกันปีก่อน */
export function comparePeriods(from: string, to: string): { prev: { from: string; to: string }; lastMonth: { from: string; to: string }; lastYear: { from: string; to: string } } {
  const n = daysInclusive(from, to);
  const backMonths = (ymd: string, k: number) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 - k, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  };
  return {
    prev: { from: shift(from, -n), to: shift(from, -1) },
    lastMonth: { from: backMonths(from, 1), to: backMonths(to, 1) },
    lastYear: { from: backMonths(from, 12), to: backMonths(to, 12) },
  };
}

/** % เปลี่ยนแปลง (null = เทียบไม่ได้ เพราะของเดิมเป็นศูนย์) */
export const changePct = (cur: number, base: number): number | null => (base > 0 ? (cur - base) / base : null);

// ───────────────────────── แผนที่ความร้อน วัน × ชั่วโมง ─────────────────────────

export const WEEKDAYS_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"] as const;

/** [7 วัน (จันทร์ก่อน)][24 ชั่วโมงไทย] → ยอดรวม · ใช้หาช่วงขายดีไว้ตั้งเวลายิงแอด/ไลฟ์ */
export function weekHourHeatmap<T extends { ordered_at?: string | null }>(orders: readonly T[], valueOf: (o: T) => number): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const o of orders) {
    const ms = Date.parse(String(o.ordered_at ?? ""));
    if (!Number.isFinite(ms)) continue;
    const t = new Date(ms + BKK_MS);
    const wd = (t.getUTCDay() + 6) % 7;   // อาทิตย์=0 → จันทร์=0
    grid[wd][t.getUTCHours()] += valueOf(o);
  }
  return grid;
}

/** ช่องที่ขายดีสุด N ช่อง (ไว้เขียนสรุปเป็นคำ) */
export function topHeatCells(grid: number[][], n = 3): { day: number; hour: number; value: number }[] {
  const cells: { day: number; hour: number; value: number }[] = [];
  grid.forEach((row, day) => row.forEach((value, hour) => { if (value > 0) cells.push({ day, hour, value }); }));
  return cells.sort((a, b) => b.value - a.value).slice(0, n);
}

// ───────────────────────── เหตุผลยกเลิก ─────────────────────────

export type CancelGroupKey = "store" | "modify" | "unpaid" | "changed_mind" | "cheaper" | "delivery" | "other";
export const CANCEL_GROUPS: Record<CancelGroupKey, { label: string; storeFault: boolean; hint: string }> = {
  store: { label: "ร้านไม่ส่ง / ของหมด / ไม่ตอบ", storeFault: true, hint: "ความผิดฝั่งร้าน — แก้ได้เอง และกระทบคะแนนร้าน" },
  modify: { label: "ลูกค้าขอแก้ออเดอร์ / ที่อยู่ / โค้ด", storeFault: false, hint: "มักกดสั่งใหม่ — ไม่ได้เสียลูกค้าจริง" },
  unpaid: { label: "ไม่ชำระเงิน", storeFault: false, hint: "สั่งแล้วไม่จ่าย / เกินกำหนดจ่าย" },
  changed_mind: { label: "เปลี่ยนใจ / ไม่ต้องการแล้ว", storeFault: false, hint: "เสียลูกค้าจริง — ดูราคา รอส่งนาน" },
  cheaper: { label: "เจอที่อื่นถูกกว่า", storeFault: false, hint: "สัญญาณเรื่องราคา" },
  delivery: { label: "จัดส่งไม่สำเร็จ / พัสดุหาย", storeFault: false, hint: "ขนส่ง — ดูขนส่งที่ใช้" },
  other: { label: "อื่น ๆ / ไม่ระบุ", storeFault: false, hint: "" },
};

/** จัดเหตุผลยกเลิก (Shopee/TikTok ปนไทย-อังกฤษ) เป็นกลุ่มภาษาคน */
export function cancelReasonGroup(reason: string | null | undefined): CancelGroupKey {
  const r = String(reason ?? "").trim().toLowerCase();
  if (!r || r === "-") return "other";
  if (/seller did not ship|out of stock|not responsive|สินค้าหมด|ผู้ขายไม่จัดส่ง|ร้านไม่ส่ง|ไม่ตอบ/.test(r)) return "store";
  if (/unpaid|payment procedure|เกินกำหนดชำระ|ไม่ชำระ|ยังไม่ชำระ/.test(r)) return "unpaid";
  if (/modify|change delivery address|voucher|เปลี่ยนสี|เปลี่ยนขนาด|เปลี่ยนที่อยู่|แก้ไขคำสั่งซื้อ|โค้ดส่วนลด/.test(r)) return "modify";
  if (/cheaper|ถูกกว่า/.test(r)) return "cheaper";
  if (/failed delivery|lost in transit|จัดส่งพัสดุไม่สำเร็จ|พัสดุสูญหาย/.test(r)) return "delivery";
  if (/don't want|dont want|change of mind|ไม่ต้องการแล้ว|ต้องการสินค้าเร็วขึ้น|เปลี่ยนใจ/.test(r)) return "changed_mind";
  return "other";
}

export type CancelRow = { key: CancelGroupKey; label: string; storeFault: boolean; hint: string; count: number; reasons: { reason: string; count: number }[] };
/** นับเหตุผลยกเลิกตามกลุ่ม (เรียงมาก → น้อย · กลุ่มที่เป็น 0 ไม่ส่ง) */
export function groupCancelReasons(reasons: readonly (string | null | undefined)[]): CancelRow[] {
  const map = new Map<CancelGroupKey, Map<string, number>>();
  for (const raw of reasons) {
    const g = cancelReasonGroup(raw);
    const label = String(raw ?? "").trim() || "ไม่ระบุ";
    const inner = map.get(g) ?? new Map<string, number>();
    inner.set(label, (inner.get(label) ?? 0) + 1);
    map.set(g, inner);
  }
  return [...map.entries()].map(([key, inner]) => ({
    key, ...CANCEL_GROUPS[key],
    count: [...inner.values()].reduce((s, n) => s + n, 0),
    reasons: [...inner.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.count - a.count);
}

// ───────────────────────── สินค้า 80/20 + ดาวรุ่ง/กำลังตก ─────────────────────────

export type AbcClass = "A" | "B" | "C";
/** A = ตัวที่รวมกันทำยอด 80% แรก · B = ถึง 95% · C = ที่เหลือ (เรียงตามยอดมาก → น้อย) */
export function abcClassify<T extends { sales: number }>(rows: readonly T[]): (T & { abc: AbcClass; share: number })[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.sales), 0);
  let cum = 0;
  return [...rows].sort((a, b) => b.sales - a.sales).map((r) => {
    const share = total > 0 ? Math.max(0, r.sales) / total : 0;
    const before = cum;
    cum += share;
    const abc: AbcClass = total <= 0 ? "C" : before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
    return { ...r, abc, share };
  });
}

export type Trend = "rising" | "falling" | "new" | "steady" | "gone";
/**
 * เทียบยอด "ช่วงล่าสุด" กับ "ช่วงก่อนหน้า" ยาวเท่ากัน
 *   ใหม่ = ก่อนหน้าขายไม่ได้ · หาย = ล่าสุดขายไม่ได้ · ขึ้น/ลง ≥ minChange (ตั้งต้น 30%) และยอดฐานต้องถึง minBase (กันตัวขายชิ้นเดียวแกว่ง)
 */
export function trendOf(cur: number, prev: number, opts: { minChange?: number; minBase?: number } = {}): { trend: Trend; change: number | null } {
  const minChange = opts.minChange ?? 0.3, minBase = opts.minBase ?? 0;
  if (prev <= 0 && cur <= 0) return { trend: "steady", change: null };
  if (prev <= 0) return { trend: cur >= minBase ? "new" : "steady", change: null };
  if (cur <= 0) return { trend: prev >= minBase ? "gone" : "steady", change: -1 };
  const change = (cur - prev) / prev;
  if (Math.max(cur, prev) < minBase) return { trend: "steady", change };
  return { trend: change >= minChange ? "rising" : change <= -minChange ? "falling" : "steady", change };
}

// ───────────────────────── แคมเปญวันพิเศษ ─────────────────────────

/** วันเลขเบิ้ล (1.1 … 12.12) + กลางเดือน 15 + วันเงินเดือนออก 25 ที่อยู่ในช่วง from-to · ใหม่ล่าสุดก่อน */
export function campaignDaysBetween(from: string, to: string): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const [fy] = from.split("-").map(Number); const [ty] = to.split("-").map(Number);
  for (let y = fy; y <= ty; y++) {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const add = (d: number, label: string) => { const date = `${y}-${mm}-${String(d).padStart(2, "0")}`; if (date >= from && date <= to) out.push({ date, label }); };
      add(m, `${m}.${m}`);
      add(15, `กลางเดือน 15.${m}`);
      add(25, `เงินเดือนออก 25.${m}`);
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export type CampaignResult = {
  date: string;
  day: number;                  // ยอดวันงาน
  orders: number;
  baseline: number;             // ยอดเฉลี่ยวันปกติ (วันที่ -14 ถึง -8 ก่อนงาน)
  lift: number | null;          // วันงาน ÷ วันปกติ
  preChange: number | null;     // 3 วันก่อนงาน เทียบวันปกติ (ติดลบ = ลูกค้ารอซื้อวันงาน)
  postChange: number | null;    // 3 วันหลังงาน เทียบวันปกติ
  series: { date: string; offset: number; sales: number; orders: number }[];   // -7 … +7
};

/** ผลวันพิเศษจากยอดรายวัน (Map วันที่ → { sales, orders }) */
export function campaignResult(daily: Map<string, { sales: number; orders: number }>, date: string): CampaignResult {
  const at = (off: number) => daily.get(shift(date, off)) ?? { sales: 0, orders: 0 };
  const avg = (offs: number[]) => offs.reduce((s, o) => s + at(o).sales, 0) / offs.length;
  const baseline = avg([-14, -13, -12, -11, -10, -9, -8]);
  const pre = avg([-3, -2, -1]);
  const post = avg([1, 2, 3]);
  const day = at(0);
  return {
    date, day: day.sales, orders: day.orders, baseline,
    lift: baseline > 0 ? day.sales / baseline : null,
    preChange: changePct(pre, baseline), postChange: changePct(post, baseline),
    series: Array.from({ length: 15 }, (_, i) => i - 7).map((offset) => ({ date: shift(date, offset), offset, ...at(offset) })),
  };
}

// ───────────────────────── แจ้งเตือน ─────────────────────────

export type MarketingAlert = { key: string; level: "danger" | "warning" | "info"; title: string; body: string; tab: string };

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");

/**
 * สินค้ากลุ่ม A ที่ "ตกจริง" ควรเตือน — ตก/หยุดขาย และยอด 14 วันหายไปอย่างน้อย ฿2,000 หรือ 0.5% ของยอดรวม (เอาค่าที่มากกว่า)
 * (ทดสอบกับข้อมูลจริง 2026-11-23: ไม่กรองยอดที่หาย → เตือน 71 ตัว มากเกินจนไม่มีใครอ่าน) · เรียงตามยอดที่หายมากสุดก่อน
 */
export function significantFalls<T extends { abc: AbcClass; trend: Trend; cur: number; prev: number }>(rows: readonly T[], totalSales: number): T[] {
  const minLost = Math.max(2000, totalSales * 0.005);
  return rows.filter((r) => r.abc === "A" && (r.trend === "falling" || r.trend === "gone") && r.prev - r.cur >= minLost)
    .sort((a, b) => (b.prev - b.cur) - (a.prev - a.cur));
}

/**
 * กติกาแจ้งเตือน (ใช้ทั้งกล่อง "ต้องจัดการ" บนหน้า และตัวเตือนทุกเช้า /api/cron/marketing-alert)
 *   1) ยอดเดือนนี้ช้ากว่าเป้าเกิน 10% ของที่ควรได้
 *   2) ยอดเมื่อวานต่ำกว่าเฉลี่ย 28 วันก่อนหน้าเกิน 40%
 *   3) ยกเลิกเพราะฝั่งร้าน (ไม่ส่ง/ของหมด/ไม่ตอบ) ใน 7 วัน
 *   4) สินค้ากลุ่ม A ที่กำลังตก
 */
export function buildMarketingAlerts(x: {
  pace: Pace;
  yesterday: number;
  avgDaily28: number;
  storeFaultCancels7d: number;
  fallingA: { name: string; change: number | null }[];
}): MarketingAlert[] {
  const out: MarketingAlert[] = [];
  const p = x.pace;
  if (p.target != null && p.expectedByNow != null && p.gap != null && p.gap > p.expectedByNow * 0.1) {
    out.push({ key: "behind_target", level: "danger", tab: "overview", title: `ยอดช้ากว่าเป้า ${baht(p.gap)}`,
      body: `ทำได้ ${Math.round((p.pct ?? 0) * 100)}% ของเป้า ${baht(p.target)} · ต้องขายวันละ ${baht(p.needPerDay ?? 0)} (ตอนนี้เฉลี่ย ${baht(p.avgPerDay)})` });
  }
  if (x.avgDaily28 > 0 && x.yesterday < x.avgDaily28 * 0.6) {
    const drop = 1 - x.yesterday / x.avgDaily28;
    out.push({ key: "sales_drop", level: "warning", tab: "sales", title: `ยอดเมื่อวานตก ${Math.round(drop * 100)}%`,
      body: `เมื่อวาน ${baht(x.yesterday)} · ปกติวันละ ${baht(x.avgDaily28)} (เฉลี่ย 28 วัน)` });
  }
  if (x.storeFaultCancels7d > 0) {
    out.push({ key: "store_cancel", level: x.storeFaultCancels7d >= 3 ? "danger" : "warning", tab: "cancel", title: `ยกเลิกเพราะฝั่งร้าน ${x.storeFaultCancels7d} ใบ (7 วัน)`,
      body: "ร้านไม่ส่ง / ของหมด / ไม่ตอบแชท — กระทบคะแนนร้าน เช็กสต็อกและการแพ็ค" });
  }
  if (x.fallingA.length) {
    const names = x.fallingA.slice(0, 3).map((f) => `${f.name}${f.change != null ? ` ${Math.round(f.change * 100)}%` : ""}`).join(" · ");
    out.push({ key: "falling_a", level: "info", tab: "products", title: `สินค้าขายดีกำลังตก ${x.fallingA.length} ตัว`, body: names });
  }
  return out;
}

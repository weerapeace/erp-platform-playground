/**
 * สูตรของแดชบอร์ดช่องทางขาย (pure + เทสต์ lib/__tests__/platform-dashboard-calc.test.ts) — ใช้ที่ /api/platform-dashboard
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-22 (รูปแดชบอร์ด 9 ข้อ + ข้อเสริม 1-7):
 *   ยอดขายหลัก = "ราคาสินค้า" แบบหน้าร้าน (Σ จำนวน × ราคาต่อชิ้นหลังส่วนลดร้าน · ตรงกับ Shopee Seller Centre)
 *     + ยอด "ลูกค้าจ่ายจริง" (total ของออเดอร์ · หลังโค้ด Shopee/Coins) เป็นบรรทัดรอง
 *     ออเดอร์ที่ไม่มีรายการสินค้า (เช่น ใบจากเมลรุ่นเก่า) = ใช้ total แทน
 *   ขายดี: เรียงได้ทั้งตามยอด ฿ และตามจำนวนชิ้น · สต๊อกใกล้หมด: เฉพาะ SKU ที่ขายได้ใน 30 วัน + คิดว่าพอขายได้อีกกี่วัน
 *   ยอดตามชั่วโมง (วันเดียว) เทียบวันก่อนหน้า · ยอดเดือนนี้เทียบเดือนก่อน "ช่วงเดียวกัน"
 * วันที่ทั้งหมด = วันไทย (UTC+7) · ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

const BKK_MS = 7 * 3_600_000;

/** วันไทย "YYYY-MM-DD" ของเวลา ISO / ms */
export function bkkYmd(t: string | number | null | undefined): string | null {
  if (t == null) return null;
  const ms = typeof t === "number" ? t : Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms + BKK_MS).toISOString().slice(0, 10) : null;
}
/** ชั่วโมงไทย 0-23 ของเวลา ISO */
export function bkkHour(iso: string | null | undefined): number | null {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? new Date(ms + BKK_MS).getUTCHours() : null;
}
/** บวก/ลบวันของ "YYYY-MM-DD" (คิดแบบ UTC ล้วน กันเวลาไทยร่นวัน) */
export function shiftYmd(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
/** เวลาเริ่มวันไทยของ "YYYY-MM-DD" (ISO) */
export const bkkStartIso = (d: string): string => new Date(Date.parse(`${d}T00:00:00+07:00`)).toISOString();

/**
 * ช่วง "เดือนนี้ถึงวันนี้" + "เดือนก่อน ช่วงเดียวกัน" (วันที่ 1 ถึงวันที่เท่ากัน · เดือนก่อนสั้นกว่า = ถึงสิ้นเดือน)
 * คืน from/to แบบรวมทั้งสองวัน ("YYYY-MM-DD")
 */
export function monthToDate(todayYmd: string): { ym: string; from: string; to: string; prevFrom: string; prevTo: string } {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
  const prevLast = new Date(Date.UTC(py, pm, 0)).getUTCDate();   // วันสุดท้ายของเดือนก่อน
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    ym: `${y}-${pad(m)}`, from: `${y}-${pad(m)}-01`, to: todayYmd,
    prevFrom: `${py}-${pad(pm)}-01`, prevTo: `${py}-${pad(pm)}-${pad(Math.min(d, prevLast))}`,
  };
}

export type ItemLite = { order_id: string; matched_sku_id: string | null; sku_code: string | null; name: string | null; qty: number | null; price: number | null };

/** มูลค่าสินค้าต่อออเดอร์ (Σ จำนวน × ราคา) */
export function itemValueByOrder(items: readonly ItemLite[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.order_id, (m.get(it.order_id) ?? 0) + (Number(it.qty) || 0) * (Number(it.price) || 0));
  return m;
}
/** ยอดของออเดอร์แบบหน้าร้าน — ไม่มีรายการสินค้า = ใช้ยอดที่ลูกค้าจ่าย */
export const orderValue = (o: { id: string; total: number | null }, byOrder: Map<string, number>): number =>
  byOrder.has(o.id) ? (byOrder.get(o.id) as number) : (Number(o.total) || 0);

export type TopProduct = { key: string; name: string; sku: string | null; qty: number; sales: number };
/** ขายดี: รวมตาม SKU ที่จับคู่ (ไม่มี = รหัส/ชื่อบนร้าน) · คืนอันดับต้นทั้ง "ตามชิ้น" และ "ตามยอด" รวมกันไม่ซ้ำ (หน้าเว็บสลับเรียงเอง) */
export function topProducts(items: readonly ItemLite[], n = 10): TopProduct[] {
  const map = new Map<string, TopProduct>();
  for (const it of items) {
    const key = it.matched_sku_id || it.sku_code || it.name || "?";
    const g = map.get(key) ?? { key, name: it.name ?? it.sku_code ?? "—", sku: it.sku_code ?? null, qty: 0, sales: 0 };
    g.qty += Number(it.qty) || 0; g.sales += (Number(it.qty) || 0) * (Number(it.price) || 0);
    map.set(key, g);
  }
  const all = [...map.values()];
  const byQty = [...all].sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, n);
  const bySales = [...all].sort((a, b) => b.sales - a.sales || b.qty - a.qty).slice(0, n);
  const out = new Map<string, TopProduct>();
  for (const t of [...byQty, ...bySales]) out.set(t.key, t);
  return [...out.values()];
}

export type LowStockRow = { skuId: string; available: number; sold30: number; coverDays: number | null };
/**
 * สต๊อกใกล้หมด เฉพาะ SKU ที่ขายได้ใน 30 วัน: พร้อมขาย ≤ maxAvail หรือ พอขายได้อีก ≤ maxCoverDays วัน (ตามความเร็วขาย 30 วัน)
 * เรียง: พอขายได้น้อยวันสุดท้ายก่อน (หมดแล้วมาก่อน)
 */
export function lowStockSelling(sold30: Map<string, number>, available: Map<string, number>, opts: { maxAvail?: number; maxCoverDays?: number; limit?: number } = {}): LowStockRow[] {
  const maxAvail = opts.maxAvail ?? 5, maxCover = opts.maxCoverDays ?? 7, limit = opts.limit ?? 15;
  const out: LowStockRow[] = [];
  for (const [skuId, sold] of sold30) {
    if (sold <= 0) continue;
    const avail = available.get(skuId) ?? 0;
    const perDay = sold / 30;
    const cover = perDay > 0 ? Math.max(0, avail) / perDay : null;
    if (avail <= maxAvail || (cover != null && cover <= maxCover)) out.push({ skuId, available: avail, sold30: sold, coverDays: cover == null ? null : Math.round(cover * 10) / 10 });
  }
  return out.sort((a, b) => (a.coverDays ?? 1e9) - (b.coverDays ?? 1e9) || a.available - b.available).slice(0, limit);
}

/** ยอดตามชั่วโมงไทย 0-23 ของวันหนึ่ง (ค่าต่อออเดอร์ = valueOf) */
export function hourlyBuckets<T extends { ordered_at?: string | null }>(orders: readonly T[], ymd: string, valueOf: (o: T) => number): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const o of orders) {
    if (bkkYmd(o.ordered_at ?? null) !== ymd) continue;
    const h = bkkHour(o.ordered_at);
    if (h != null) out[h] += valueOf(o);
  }
  return out;
}

/** เป้ายอดขายรายเดือน — ui_config `platform_sales_targets` = { "<YYYY-MM>|<brand_id หรือ *>": จำนวนเงิน } */
export const SALES_TARGET_KEY = "platform_sales_targets";
export const salesTargetSlot = (ym: string, brandId: string | null | undefined): string => `${ym}|${brandId || "*"}`;
export function readSalesTarget(v: unknown, ym: string, brandId: string | null | undefined): number | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const n = Number((v as Record<string, unknown>)[salesTargetSlot(ym, brandId)]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** ตั้ง/ลบเป้า (amount ว่าง/≤0 = ลบ) → ก้อนใหม่ (ไม่แก้ตัวเดิม) */
export function writeSalesTarget(v: unknown, ym: string, brandId: string | null | undefined, amount: number | null): Record<string, number> {
  const cur = v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, number>) } : {};
  const slot = salesTargetSlot(ym, brandId);
  if (amount != null && Number.isFinite(amount) && amount > 0) cur[slot] = Math.round(amount); else delete cur[slot];
  return cur;
}

/**
 * เรทเงินกลางรายวัน (daily_rates · เรทหยวน ฿/¥) — กติกาที่หน้าเว็บใช้ร่วมกัน (★ 2026-11-22)
 *   - เรทกลางเก่าแค่ไหน → เตือน "เรทกลางเก่า n วัน" เมื่อเกิน RATE_STALE_DAYS
 *   - ตั้งเรทกลางของวันนี้: วันนี้มีแถวแล้ว (แม้ถูกปิด) = แก้แถวเดิม (rate_date ห้ามซ้ำ) · ยังไม่มี = เพิ่มแถวใหม่ · คืนค่าเดิมไว้ให้ปุ่มย้อนกลับ
 * ใช้ที่: components/fx-rate-quick (ตัวตั้งเรทเงินวันนี้) · หน้าใบสำคัญรับ (กล่องยอดเงิน)
 * เขียนผ่าน API กลาง /api/master-v2/daily-rates (ลงประวัติให้เอง) — ไม่มี API แยก
 */

export const RATE_STALE_DAYS = 3;

export type DailyRateRow = { id: string; rate_date: string; rate: number | string; is_active?: boolean | null };

const ymd = (v: unknown) => String(v ?? "").slice(0, 10);
const dayMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** ห่างกันกี่วัน (to − from) · วันที่ไม่ครบ = null */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = ymd(from), b = ymd(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  return Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
}

/** เรทกลางเก่ากว่าวันอ้างอิงกี่วัน — คืนค่าเฉพาะเมื่อเกินเกณฑ์ (ไม่เกิน/ไม่รู้ = null) */
export function staleRateDays(rateDate: string | null | undefined, refDate: string | null | undefined, limit = RATE_STALE_DAYS): number | null {
  const d = daysBetween(rateDate, refDate);
  return d != null && d > limit ? d : null;
}

/** เรทกลางล่าสุดที่ยังใช้อยู่ */
export function latestActiveRate(rows: DailyRateRow[]): DailyRateRow | null {
  return [...rows].filter((r) => r.is_active !== false && Number(r.rate) > 0).sort((a, b) => ymd(b.rate_date).localeCompare(ymd(a.rate_date)))[0] ?? null;
}

export type DailyRatePlan =
  | { mode: "same" }
  | { mode: "create" }
  | { mode: "update"; id: string; before: { rate: number; is_active: boolean } };

/** จะตั้งเรทกลางของวันนั้นยังไง (rate_date ห้ามซ้ำ — มีแถวอยู่แล้วต้องแก้แถวเดิม) */
export function planSetDailyRate(rows: DailyRateRow[], date: string, rate: number): DailyRatePlan {
  const cur = rows.find((r) => ymd(r.rate_date) === ymd(date));
  if (!cur) return { mode: "create" };
  const active = cur.is_active !== false;
  if (active && Math.abs(Number(cur.rate) - rate) < 1e-9) return { mode: "same" };
  return { mode: "update", id: String(cur.id), before: { rate: Number(cur.rate), is_active: active } };
}

/** เรทที่พิมพ์ใช้ได้ไหม (บวก · ไม่เกิน 4 ตำแหน่ง · กันพิมพ์ผิดหลัก เช่น 52.1 แทน 5.21) */
export function validRate(v: unknown, ref?: number | null): { ok: boolean; rate: number; warn: string | null } {
  const n = Math.round(Number(v) * 10000) / 10000;
  if (!Number.isFinite(n) || n <= 0) return { ok: false, rate: 0, warn: "ใส่เรทเป็นตัวเลขมากกว่า 0" };
  const warn = ref && ref > 0 && (n > ref * 1.5 || n < ref / 1.5) ? `ต่างจากเรทกลาง ${ref} มาก — พิมพ์ผิดหลักไหม?` : null;
  return { ok: true, rate: n, warn };
}

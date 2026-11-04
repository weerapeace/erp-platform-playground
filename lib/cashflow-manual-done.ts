/**
 * "รายการประจำ" เดือนไหนจ่าย/รับแล้ว หรือข้ามไปแล้ว — ของกลาง (ไม่มี import ฝั่งเซิร์ฟเวอร์ ใช้ได้ทั้ง API และเทสต์)
 *
 * เก็บใน china_app_settings skey "cashflow_manual_done" (ที่เก็บค่าตั้งกลาง key/value · ไม่มีตารางใหม่)
 *   { [itemId]: { [period]: "paid" | "skipped" } }   period = "YYYY-MM" (รายเดือน) หรือ "once" (ครั้งเดียว)
 * loadCashflow (lib/cashflow-server) ข้ามงวดที่ติ๊กแล้ว → หายจากต้องจ่าย/ต้องรับ + กราฟ
 * ใช้ที่: POST /api/cashflow/manual-done (cashflow.manage · audit)
 */

export const MANUAL_DONE_KEY = "cashflow_manual_done";
export type ManualDoneMark = "paid" | "skipped";
export type ManualDoneMap = Record<string, Record<string, ManualDoneMark>>;
export type ManualDoneAction = ManualDoneMark | "undo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^(\d{4}-\d{2}|once)$/;
/** เก็บย้อนหลังแค่นี้ (เดือน) — กันค่าโตไม่หยุด · งวดเก่ากว่านี้ไม่โผล่ในหน้าอยู่แล้ว */
export const MANUAL_DONE_KEEP_MONTHS = 13;

export const isValidManualPeriod = (p: unknown): p is string => typeof p === "string" && PERIOD_RE.test(p);

/** อ่านค่าที่เก็บไว้แบบปลอดภัย (ค่าเสีย/ชนิดผิด = ทิ้ง) */
export function cleanManualDone(raw: unknown): ManualDoneMap {
  const out: ManualDoneMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, periods] of Object.entries(raw as Record<string, unknown>)) {
    if (!UUID_RE.test(id) || !periods || typeof periods !== "object" || Array.isArray(periods)) continue;
    const clean: Record<string, ManualDoneMark> = {};
    for (const [p, v] of Object.entries(periods as Record<string, unknown>)) {
      if (isValidManualPeriod(p) && (v === "paid" || v === "skipped")) clean[p] = v;
    }
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

export const manualDoneMark = (map: ManualDoneMap, itemId: string, period: string): ManualDoneMark | null =>
  map[itemId]?.[period] ?? null;

/** ติ๊ก / ยกเลิกติ๊ก → ค่าใหม่ (ไม่แก้ของเดิม) · ตัดเดือนที่เก่ากว่า MANUAL_DONE_KEEP_MONTHS ทิ้งไปด้วย */
export function applyManualDone(map: ManualDoneMap, itemId: string, period: string, action: ManualDoneAction, todayISO: string): ManualDoneMap {
  const next: ManualDoneMap = {};
  const cutoff = monthsAgo(todayISO, MANUAL_DONE_KEEP_MONTHS);
  for (const [id, periods] of Object.entries(map)) {
    const kept = Object.fromEntries(Object.entries(periods).filter(([p]) => p === "once" || p >= cutoff));
    if (Object.keys(kept).length) next[id] = kept as Record<string, ManualDoneMark>;
  }
  const cur = { ...(next[itemId] ?? {}) };
  if (action === "undo") delete cur[period]; else cur[period] = action;
  if (Object.keys(cur).length) next[itemId] = cur; else delete next[itemId];
  return next;
}

/** "YYYY-MM" ของ n เดือนก่อน (ใช้ UTC ล้วน กันเวลาไทยร่นเดือน) */
function monthsAgo(todayISO: string, n: number): string {
  const [y, m] = todayISO.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

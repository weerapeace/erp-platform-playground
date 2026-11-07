/**
 * 📅 การ์ดวันสำคัญ (DateCards) — ส่วน pure: แตกวันที่แบบไทย · ป้าย "อีกกี่วัน / เลยกี่วัน" · เส้นเวลา
 * หน้าจอ: components/date-cards · เทสต์: lib/__tests__/date-cards.test.ts · คู่มือ: docs/date-cards.md
 * วันที่ทั้งหมดเป็น "YYYY-MM-DD" (ไม่มีเวลา) → นับวันด้วย Date.UTC กันเวลาไทย (UTC+7) ร่นวัน
 */
export type DateTone = "ok" | "warn" | "bad" | "muted";
/** since = วันที่ผ่านมาแล้ว (เช่น วันที่สั่ง → "ผ่านมา N วัน") · due = กำหนดการ (วันนัด / Deadline → อีก/เลยกี่วัน) */
export type DateKind = "since" | "due";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"];
const WEEKDAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** "YYYY-MM-DD" → เลขวันแบบ UTC (null = ไม่ใช่วันที่) */
export function dayNumber(iso: string | null | undefined): number | null {
  const m = ISO.exec(String(iso ?? "").slice(0, 10));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / 86400000) : null;
}

/** วันนี้ตามเวลาไทย เป็น "YYYY-MM-DD" */
export function todayIsoTh(now: Date = new Date()): string {
  const th = new Date(now.getTime() + 7 * 3600 * 1000);
  return th.toISOString().slice(0, 10);
}

export type ThaiDateParts = { day: number; month: string; yearShort: string; yearBe: number; weekday: string; weekdayShort: string; text: string };
/** แตกวันที่เป็นชิ้น ๆ ไว้โชว์บนการ์ด เช่น 12 · พ.ย. · 69 · วันพฤหัสฯ */
export function thaiDateParts(iso: string | null | undefined): ThaiDateParts | null {
  const n = dayNumber(iso);
  if (n == null) return null;
  const d = new Date(n * 86400000);
  const yearBe = d.getUTCFullYear() + 543;
  const month = MONTHS[d.getUTCMonth()];
  const wd = d.getUTCDay();
  return {
    day: d.getUTCDate(), month, yearShort: String(yearBe).slice(-2), yearBe,
    weekday: WEEKDAYS[wd], weekdayShort: WEEKDAYS_SHORT[wd],
    text: `${d.getUTCDate()} ${month} ${String(yearBe).slice(-2)}`,
  };
}

/** ป้ายสถานะของวันที่ — muted = งานปิดแล้ว (ไม่เตือนแดง) */
export function dateStatus(iso: string | null | undefined, kind: DateKind, today: string, muted = false): { text: string; tone: DateTone } | null {
  const v = dayNumber(iso), t = dayNumber(today);
  if (v == null || t == null) return null;
  const diff = v - t;
  if (kind === "since") return { text: diff <= 0 ? (diff === 0 ? "วันนี้" : `ผ่านมา ${-diff} วัน`) : `อีก ${diff} วัน`, tone: "muted" };
  if (diff === 0) return { text: "วันนี้", tone: muted ? "muted" : "warn" };
  if (diff < 0) return { text: `เลยมา ${-diff} วัน`, tone: muted ? "muted" : "bad" };
  return { text: `อีก ${diff} วัน`, tone: muted ? "muted" : diff <= 3 ? "warn" : "ok" };
}

/** เส้นเวลา จากวันเริ่ม → วันกำหนด: ผ่านไปกี่ % · กี่วันจากทั้งหมด · เลยกำหนดไหม (null = ข้อมูลไม่พอ/วันกำหนดก่อนวันเริ่ม) */
export function dateTimeline(from: string | null | undefined, to: string | null | undefined, today: string): { pct: number; elapsed: number; total: number; over: boolean } | null {
  const a = dayNumber(from), b = dayNumber(to), t = dayNumber(today);
  if (a == null || b == null || t == null || b <= a) return null;
  const total = b - a, elapsed = t - a;
  return { pct: Math.max(0, Math.min(100, (elapsed / total) * 100)), elapsed, total, over: t > b };
}

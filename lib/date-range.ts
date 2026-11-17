// ============================================================
// date-range — คำนวณปฏิทินเลือก "ช่วงวันที่" (ของกลาง DateRangeInput · pure เทสต์ได้)
// คิดแบบ UTC ล้วน (ไม่เพี้ยนตามเขตเวลาเครื่อง) · "วันนี้" = เวลาไทย (todayBangkok)
// ============================================================
import { addDaysYmd, endOfMonthYmd, todayBangkok } from "@/lib/date";

export type YmdRange = { from: string; to: string };

/** ตารางปฏิทินของเดือน (สัปดาห์เริ่มวันอาทิตย์) — 6 แถว × 7 วัน · ช่องนอกเดือนเป็นวันของเดือนข้าง ๆ */
export function monthGrid(year: number, month0: number): string[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const start = addDaysYmd(first.toISOString().slice(0, 10), -first.getUTCDay());
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) weeks.push(Array.from({ length: 7 }, (_, d) => addDaysYmd(start, w * 7 + d)));
  return weeks;
}

/** จัดช่วงให้ from ≤ to เสมอ (คลิกวันหลังก่อนก็ได้) */
export function orderRange(a: string, b: string): YmdRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export function inRange(ymd: string, r: Partial<YmdRange> | null | undefined): boolean {
  return !!r?.from && !!r?.to && ymd >= r.from && ymd <= r.to;
}

/** จำนวนวันในช่วง (นับทั้งต้นและท้าย) */
export function rangeDays(r: YmdRange): number {
  const [a, b] = [r.from, r.to].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((b - a) / 86_400_000) + 1;
}

/** ช่วงสำเร็จรูป: วันนี้ / 7 วันล่าสุด / 30 วันล่าสุด / เดือนนี้ / เดือนก่อน */
export function rangePresets(now: Date = new Date()): { key: string; label: string; range: YmdRange }[] {
  const today = todayBangkok(now);
  const monthStart = today.slice(0, 8) + "01";
  const prevEnd = addDaysYmd(monthStart, -1);
  const prevStart = prevEnd.slice(0, 8) + "01";
  return [
    { key: "today", label: "วันนี้", range: { from: today, to: today } },
    { key: "7d", label: "7 วันล่าสุด", range: { from: addDaysYmd(today, -6), to: today } },
    { key: "30d", label: "30 วันล่าสุด", range: { from: addDaysYmd(today, -29), to: today } },
    { key: "month", label: "เดือนนี้", range: { from: monthStart, to: endOfMonthYmd(today) } },
    { key: "prev", label: "เดือนก่อน", range: { from: prevStart, to: prevEnd } },
  ];
}

export const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

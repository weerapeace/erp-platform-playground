/**
 * ช่วงเวลา OT (เช่น 10.00–17.00) → จำนวนนาที + หักเวลาพัก
 * ใช้ในฟอร์มลงเวลา (ข้อมูลคำนวณเงินเดือน) — แยกออกมาให้ทดสอบได้และใช้ซ้ำได้
 */

/** พักเที่ยงมาตรฐาน — ยังไม่มีช่องเวลาพักในโปรไฟล์เวลาทำงาน จึงใช้ค่ากลางนี้ไปก่อน */
export const OT_DEFAULT_BREAK = { start: 12 * 60, end: 13 * 60, minutes: 60 };

/** อ่านเวลาได้หลายแบบที่คนพิมพ์จริง: 17:00 · 17.00 · 17 00 · 1700 → นาทีจากเที่ยงคืน */
export function parseClockMinutes(value: string): number | null {
  const t = String(value ?? "").trim().replace(/[.\s]/g, ":");
  const m = t.match(/^(\d{1,2}):(\d{2})$/) ?? t.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** นาทีจากเที่ยงคืน → "10.00" */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}.${String(m % 60).padStart(2, "0")}`;
}

/** ช่วง OT → นาที (ถ้าเวลาสิ้นสุดน้อยกว่าเริ่ม ถือว่าข้ามเที่ยงคืน) */
export function otRangeMinutes(from: string, to: string): number | null {
  const f = parseClockMinutes(from), t = parseClockMinutes(to);
  if (f === null || t === null) return null;
  const diff = t > f ? t - f : t === f ? 0 : t + 1440 - f;
  return diff > 0 ? diff : null;
}

/** ช่วง OT คร่อมเวลาพักทั้งช่วงไหม (เช่น 10.00–17.00 คร่อม 12.00–13.00) — ใช้ติ๊ก "หักเวลาพัก" ให้อัตโนมัติ */
export function otRangeCoversBreak(from: string, to: string, brk = OT_DEFAULT_BREAK): boolean {
  const f = parseClockMinutes(from);
  const total = otRangeMinutes(from, to);
  if (f === null || total === null) return false;
  const end = f + total;
  return [0, 1440].some((day) => f <= brk.start + day && end >= brk.end + day);
}

/** นาที OT หลังหักพัก — คืน null ถ้าพักกินเวลาทั้งช่วง (กรอกผิด) */
export function otNetMinutes(totalMinutes: number, breakMinutes: number): number | null {
  const net = totalMinutes - Math.max(0, Math.round(breakMinutes || 0));
  return net > 0 ? net : null;
}

/** หมายเหตุอัตโนมัติ เช่น "OT 10.00–17.00 หักพัก 60 นาที" — ย้อนดูได้ว่าทำไมได้ 6 ชม. ไม่ใช่ 7 */
export function formatOtRangeNote(from: string, to: string, breakMinutes: number): string {
  const f = parseClockMinutes(from), t = parseClockMinutes(to);
  if (f === null || t === null) return "";
  const brk = Math.max(0, Math.round(breakMinutes || 0));
  return `OT ${formatClock(f)}–${formatClock(t)}${brk > 0 ? ` หักพัก ${brk} นาที` : ""}`;
}

/** อ่านหมายเหตุอัตโนมัติกลับ (ตอนแก้รายการเดิม) → ช่วงเวลา + นาทีพัก + หมายเหตุที่ผู้ใช้พิมพ์เอง */
export function parseOtRangeNote(note: string): { from: string; to: string; breakMinutes: number; rest: string } | null {
  const m = String(note ?? "").match(/^OT (\d{1,2}\.\d{2})–(\d{1,2}\.\d{2})(?: หักพัก (\d+) นาที)?(?: · ([\s\S]*))?$/);
  if (!m) return null;
  return { from: m[1], to: m[2], breakMinutes: Number(m[3] ?? 0), rest: (m[4] ?? "").trim() };
}

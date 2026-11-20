/**
 * ปฏิทินรวมทุกแผนก (แท็บ "รวมทุกปฏิทิน" ใน /calendar) — logic ล้วน (ไม่มี "use client" → API import ได้)
 *
 * แหล่งข้อมูล = ตารางเดิมของแต่ละโมดูล (ไม่มีตารางใหม่) · เลื่อนวัน = เรียก API เดิมของโมดูลนั้น
 *   → สิทธิ์ / workflow / audit log (changes) เป็นของโมดูลเดิมทั้งหมด ไม่เขียนซ้ำที่นี่
 * แหล่งที่ "ดูอย่างเดียว" (movePerm = null) = วันที่ผูกกับเงิน/ลูกค้า (ครบกำหนดบิล · นัดส่ง SO · ของเข้า PO) → กดเปิดไปแก้ที่หน้าเดิม
 * เพิ่มแหล่งใหม่ = เติม CAL_SOURCES + query ใน app/api/calendar/unified/route.ts + moveRequest (ถ้าเลื่อนได้)
 * คู่มือ: docs/unified-calendar.md
 */
import { todayBangkok } from "@/lib/date";

export type CalSourceKey = "plan" | "task" | "content" | "mo" | "design" | "billing" | "sales" | "po";

export type CalSource = {
  key: CalSourceKey; label: string; color: string;
  viewPerm: string;            // ไม่มีสิทธิ์นี้ = ไม่ดึงแหล่งนี้มาเลย (แอดมินผ่านทุกสิทธิ์)
  movePerm: string | null;     // null = ดูอย่างเดียว
  hasBacklog: boolean;         // ดึงรายการที่ยังไม่ลงวันมาไว้กล่อง "ยังไม่กำหนดวัน"
};

export const CAL_SOURCES: CalSource[] = [
  { key: "plan",    label: "แผนงานทีม",     color: "#7c3aed", viewPerm: "tasks.view",     movePerm: "tasks.edit",    hasBacklog: true },
  { key: "task",    label: "งาน Task",      color: "#0d9488", viewPerm: "tasks.view",     movePerm: "tasks.edit",    hasBacklog: true },
  { key: "content", label: "คอนเทนต์",      color: "#db2777", viewPerm: "tasks.view",     movePerm: "tasks.edit",    hasBacklog: true },
  { key: "mo",      label: "ผลิต (นัดส่ง)", color: "#2563eb", viewPerm: "products.view",  movePerm: "products.edit", hasBacklog: false },
  { key: "design",  label: "ใบงานออกแบบ",   color: "#64748b", viewPerm: "products.view",  movePerm: "products.edit", hasBacklog: false },
  { key: "billing", label: "ใบวางบิล",      color: "#d97706", viewPerm: "customers.view", movePerm: null,            hasBacklog: false },
  { key: "sales",   label: "ส่งของ (SO)",   color: "#16a34a", viewPerm: "customers.view", movePerm: null,            hasBacklog: false },
  { key: "po",      label: "ของเข้า (PO)",  color: "#0891b2", viewPerm: "pr.view",        movePerm: null,            hasBacklog: false },
];
export const CAL_SOURCE = Object.fromEntries(CAL_SOURCES.map((s) => [s.key, s])) as Record<CalSourceKey, CalSource>;

export type CalItem = {
  id: string;                  // `${src}:${rawId}` ไม่ซ้ำข้ามแหล่ง
  src: CalSourceKey;
  rawId: string;
  title: string;
  date: string | null;         // YYYY-MM-DD (เวลาไทย) · null = ยังไม่กำหนดวัน
  raw: string | null;          // ค่าเดิมในฐานข้อมูล (timestamp/วันที่) — ใช้คงเวลาเดิม + ย้อนกลับ
  who: string[];               // user id ผู้รับผิดชอบ
  link: string;                // หน้าเดิมของรายการ (เปิดเป็นป๊อป)
  canMove: boolean;
};
export type UnifiedCalendarResponse = {
  data: CalItem[]; people: { id: string; name: string }[];
  sources: { key: CalSourceKey; canMove: boolean }[];   // แหล่งที่ผู้ใช้นี้เห็น
  error: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const isYmd = (s: unknown): s is string => typeof s === "string" && YMD.test(s);

/** timestamp → วันที่เวลาไทย · วันที่ล้วน (date column) → คืนเดิม */
export function bkkDate(v: string | null | undefined): string | null {
  if (!v) return null;
  if (YMD.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : todayBangkok(d);
}

/** เวลาไทย HH:mm ของ timestamp (ไม่มี = null) */
export function bkkTime(v: string | null | undefined): string | null {
  if (!v || YMD.test(v)) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** ค่าใหม่ที่จะบันทึก เมื่อวางรายการลงวัน ymd (null = ล้างวัน) — แหล่งที่เป็น timestamp คงเวลาเดิม */
export function nextValue(src: CalSourceKey, raw: string | null, ymd: string | null): string | null {
  if (!ymd || !YMD.test(ymd)) return null;
  if (src === "plan" || src === "content") {
    const t = bkkTime(raw) ?? (src === "plan" ? "18:00" : "10:00");
    return new Date(`${ymd}T${t}:00+07:00`).toISOString();
  }
  return ymd;
}

/** คำขอไปยัง API เดิมของโมดูล (value = ค่าที่จะบันทึก · ใช้ทั้งเลื่อนวันและย้อนกลับ) */
export function moveRequest(src: CalSourceKey, rawId: string, value: string | null): { url: string; method: "PATCH" | "POST"; body: Record<string, unknown> } | null {
  const id = encodeURIComponent(rawId);
  switch (src) {
    case "plan":    return { url: `/api/team-plan/${id}`,        method: "PATCH", body: { due_at: value } };
    case "task":    return { url: `/api/creative-tasks/${id}`,   method: "PATCH", body: { due_date: value } };
    case "content": return { url: `/api/creative-content/${id}`, method: "PATCH", body: { scheduled_at: value } };
    case "mo":      return { url: `/api/mo/set-due-date`,        method: "POST",  body: { id: rawId, due_date: value } };
    case "design":  return { url: `/api/design-sheets/${id}`,    method: "PATCH", body: { deadline: value } };
    default:        return null;
  }
}

/** ลิงก์หน้าเดิมของรายการ */
export function itemLink(src: CalSourceKey, rawId: string): string {
  const id = encodeURIComponent(rawId);
  switch (src) {
    case "plan":    return `/tasks/plan?item=${id}`;
    case "task":    return `/tasks?task=${id}`;
    case "content": return `/tasks/content-calendar?content=${id}`;
    case "mo":      return `/master/production-dashboard?view=calendar`;
    case "design":  return `/master/design-dashboard?open=${id}`;
    case "billing": return `/billing-notes`;
    case "sales":   return `/sales-orders`;
    case "po":      return `/purchasing/receive`;
  }
}

/** กรองตามแหล่งที่เปิด + คน ("" = ทุกคน · "none" = ยังไม่มีผู้รับผิดชอบ) */
export function filterCalItems(items: CalItem[], hidden: ReadonlySet<CalSourceKey>, person: string): CalItem[] {
  return items.filter((i) => !hidden.has(i.src) && (!person || (person === "none" ? i.who.length === 0 : i.who.includes(person))));
}

/** ช่วงวันที่ที่ต้องโหลดของเดือน (เผื่อสัปดาห์หัว-ท้ายที่ปฏิทินโชว์) · m = 0-11 */
export function monthRange(y: number, m: number): { from: string; to: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  const f = new Date(Date.UTC(y, m, 1 - 7)), t = new Date(Date.UTC(y, m + 1, 7));
  return { from: `${f.getUTCFullYear()}-${p(f.getUTCMonth() + 1)}-${p(f.getUTCDate())}`, to: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}` };
}

/**
 * 📋 แผนงานทีม (Todo ตามความด่วน) — กฎกลาง (pure · ใช้ทั้งหน้าเว็บ, API และตัวตั้งเวลาแจ้งเตือน)
 * เจ้าของขอ 2026-11-01: "ระบบวางแผนงาน เหมือน Todo list จัดตามความสำคัญ งานด่วน/ไม่ด่วน + แจ้งเตือน"
 *
 * เก็บในตารางเช็กลิสต์กลาง erp_record_tasks (ไม่มีตารางใหม่) — module_key "team_plan", record_id "" (ระดับหน้า)
 *   คอลัมน์เดิม: title · description (โน้ต) · status (open/resolved) · priority (urgent/high/normal/low)
 *               · due_at (กำหนด) · assigned_to (ผู้รับผิดชอบ) · created_by (ชื่อคนสร้าง)
 *   metadata.plan = ข้อมูลเสริมของแผนงาน (PlanMeta ด้านล่าง) · metadata.links = ลิงก์ (กฎเดิมของเช็กลิสต์กลาง)
 * เวลาไทย +07:00 คงที่ (ไม่มีเวลาออมแสง) → แปลงวันที่ด้วย todayBangkok
 */
import { addDaysYmd, todayBangkok } from "@/lib/date";
import type { TaskLink } from "@/lib/record-tasks";

export const TEAM_PLAN_MODULE = "team_plan";

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "ด่วนมาก", color: "#E24B4A" },
  high: { label: "ด่วน", color: "#EF9F27" },
  normal: { label: "ปกติ", color: "#378ADD" },
  low: { label: "ไม่ด่วน", color: "#888780" },
};
export const asPriority = (v: unknown): Priority => (PRIORITIES as readonly string[]).includes(String(v)) ? (v as Priority) : "normal";
export const isUrgent = (p: Priority) => p === "urgent" || p === "high";

/** เตือนก่อนถึงกำหนด (ใช้ในรอบแจ้งเตือน) */
export const REMIND_MODES = ["before_1h", "before_1d", "morning", "none"] as const;
export type RemindMode = (typeof REMIND_MODES)[number];
export const REMIND_LABEL: Record<RemindMode, string> = {
  before_1h: "ก่อน 1 ชม.", before_1d: "ก่อน 1 วัน", morning: "เช้าวันนั้น 9:00", none: "ไม่เตือน",
};

/** งานทำซ้ำ — ทุก n วัน/สัปดาห์/เดือน (ติ๊กเสร็จแล้วสร้างรอบถัดไปให้) */
export type RepeatRule = { every: "day" | "week" | "month"; n: number };
export const REPEAT_LABEL = (r: RepeatRule | null) =>
  !r ? "ไม่ทำซ้ำ" : `ทุก ${r.n > 1 ? `${r.n} ` : ""}${{ day: "วัน", week: "สัปดาห์", month: "เดือน" }[r.every]}`;

export type PlanMeta = {
  important: boolean;                               // ตาราง 4 ช่อง: สำคัญ × ด่วน
  star_date: string | null;                         // ⭐ งานหลักของวันนี้ (YYYY-MM-DD) — เกินวันแล้วดับเอง
  waiting: { note: string; since: string } | null;  // รอคนอื่น (เช่น รอลูกค้าตอบ) + เริ่มรอเมื่อ
  repeat: RepeatRule | null;
  remind: RemindMode;
  source: { label: string; href: string } | null;   // มาจากเรื่องไหน (ใบงาน/SKU/โพสต์) → กดเปิดเรื่องเดิม
  created_by_id: string | null;                     // user id คนสร้าง (created_by เดิมเก็บแค่ชื่อ)
};

/** 1 งานที่ API ส่งให้หน้าเว็บ (/api/team-plan) */
export type PlanItem = {
  id: string; title: string; note: string | null; status: string; priority: Priority;
  due_at: string | null; assigned_to: string | null; assigned_name: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  resolved_by: string | null; resolved_at: string | null;
  links: TaskLink[]; plan: PlanMeta;
};
export const isPlanDone = (t: { status: string }) => t.status === "resolved";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** อ่าน/ล้างค่า metadata.plan — ค่าแปลกตัดทิ้ง (ใช้ทั้งตอนรับเข้า API และตอนอ่านออกมา) */
export function normalizePlanMeta(raw: unknown, now: Date = new Date()): PlanMeta {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const w = r.waiting as { note?: unknown; since?: unknown } | null | undefined;
  const rep = r.repeat as { every?: unknown; n?: unknown } | null | undefined;
  const src = r.source as { label?: unknown; href?: unknown } | null | undefined;
  const every = rep && ["day", "week", "month"].includes(String(rep.every)) ? (rep.every as RepeatRule["every"]) : null;
  const href = str(src?.href, 500);
  return {
    important: r.important !== false,
    star_date: typeof r.star_date === "string" && YMD.test(r.star_date) ? r.star_date : null,
    waiting: w && typeof w === "object" ? { note: str(w.note, 120), since: typeof w.since === "string" && !Number.isNaN(Date.parse(w.since)) ? w.since : now.toISOString() } : null,
    repeat: every ? { every, n: Math.min(30, Math.max(1, Math.round(Number(rep!.n) || 1))) } : null,
    remind: (REMIND_MODES as readonly string[]).includes(String(r.remind)) ? (r.remind as RemindMode) : "none",
    // ลิงก์ภายในเว็บเท่านั้น (/…) — กันลิงก์แปลกจากภายนอก
    source: href.startsWith("/") && !href.startsWith("//") ? { label: str(src?.label, 120) || href, href } : null,
    created_by_id: typeof r.created_by_id === "string" ? r.created_by_id : null,
  };
}

// ── วันที่ / กำหนด ──
const bkkYmd = (iso: string) => todayBangkok(new Date(iso));
export const isOverdue = (dueAt: string | null, now: Date = new Date()) => !!dueAt && Date.parse(dueAt) < now.getTime();
/** มีเวลาจริงไหม (ไม่ได้ตั้งเที่ยงคืนไทย = "ทั้งวัน") */
const hasTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(11, 16) !== "00:00";
const hm = (iso: string) => new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(11, 16);
const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "เกินกำหนด 2 วัน" / "วันนี้ 14:00" / "พรุ่งนี้" / "ศ. 7 พ.ย." */
export function dueLabel(dueAt: string | null, now: Date = new Date()): string {
  if (!dueAt) return "";
  const today = todayBangkok(now);
  const day = bkkYmd(dueAt);
  const t = hasTime(dueAt) ? ` ${hm(dueAt)}` : "";
  if (isOverdue(dueAt, now)) {
    const days = Math.round((Date.parse(today) - Date.parse(day)) / 86400e3);
    return days <= 0 ? `เลยเวลา${t}` : `เกินกำหนด ${days} วัน`;
  }
  if (day === today) return `วันนี้${t}`;
  if (day === addDaysYmd(today, 1)) return `พรุ่งนี้${t}`;
  const d = new Date(`${day}T00:00:00Z`);
  return `${TH_DOW[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}${t}`;
}

/** รอมากี่วันแล้ว (ปัดลง) */
export const waitingDays = (since: string, now: Date = new Date()) => Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 86400e3));

/** ตัวเลือกกำหนดด่วน → ISO (เวลาไทย) · "today"/"tomorrow" = 18:00 ของวันนั้น · "friday" = ศุกร์นี้ (วันนี้ศุกร์ = วันนี้) */
export function quickDue(kind: "today" | "tomorrow" | "friday" | "none", now: Date = new Date()): string | null {
  const today = todayBangkok(now);
  let day: string;
  if (kind === "none") return null;
  if (kind === "today") day = today;
  else if (kind === "tomorrow") day = addDaysYmd(today, 1);
  else { const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); day = addDaysYmd(today, (5 - dow + 7) % 7); }
  return new Date(`${day}T18:00:00+07:00`).toISOString();
}

/**
 * รอบถัดไปของงานทำซ้ำ — นับจากกำหนดเดิม (คงเวลาเดิม) เดินหน้าจนเลยตอนนี้
 * ไม่มีกำหนด = นับจากวันนี้ 18:00 · เดือนที่ไม่มีวันนั้น (31) = วันสุดท้ายของเดือน
 */
export function nextDue(dueAt: string | null, rule: RepeatRule, now: Date = new Date()): string {
  let cur = dueAt ? new Date(dueAt) : new Date(`${todayBangkok(now)}T18:00:00+07:00`);
  const step = (d: Date) => {
    if (rule.every === "day") return new Date(d.getTime() + rule.n * 86400e3);
    if (rule.every === "week") return new Date(d.getTime() + rule.n * 7 * 86400e3);
    const b = new Date(d.getTime() + 7 * 3600e3);   // คิดเดือนตามปฏิทินไทย
    const y = b.getUTCFullYear(), m = b.getUTCMonth() + rule.n, dd = b.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const t = new Date(Date.UTC(y, m, Math.min(dd, last), b.getUTCHours(), b.getUTCMinutes()));
    return new Date(t.getTime() - 7 * 3600e3);
  };
  for (let i = 0; i < 400; i++) { cur = step(cur); if (cur.getTime() > now.getTime()) break; }
  return cur.toISOString();
}

// ── ตาราง 4 ช่อง (สำคัญ × ด่วน) ──
export type Quadrant = "do" | "schedule" | "delegate" | "later";
export const QUADRANT_META: Record<Quadrant, { label: string; hint: string }> = {
  do: { label: "สำคัญ + ด่วน", hint: "ทำเลย" },
  schedule: { label: "สำคัญ ไม่ด่วน", hint: "นัดเวลาทำ" },
  delegate: { label: "ด่วน ไม่สำคัญ", hint: "ให้คนอื่นช่วย" },
  later: { label: "ไม่ด่วน ไม่สำคัญ", hint: "ไว้ทีหลัง" },
};
export const quadrantOf = (priority: Priority, important: boolean): Quadrant =>
  important ? (isUrgent(priority) ? "do" : "schedule") : (isUrgent(priority) ? "delegate" : "later");
/** ลากเข้าช่อง → ค่าใหม่ (ความด่วนเดิมที่อยู่ฝั่งเดียวกันแล้ว = คงไว้ ไม่งั้น ด่วน→"ด่วน" / ไม่ด่วน→"ปกติ") */
export function quadrantPatch(q: Quadrant, current: Priority): { priority: Priority; important: boolean } {
  const wantUrgent = q === "do" || q === "delegate";
  const priority = isUrgent(current) === wantUrgent ? current : wantUrgent ? "high" : "normal";
  return { priority, important: q === "do" || q === "schedule" };
}

// ── ⭐ 3 งานหลักของวันนี้ ──
export const MAX_STARS = 3;
export const isStarredToday = (m: PlanMeta, now: Date = new Date()) => m.star_date === todayBangkok(now);
/** ดาววันนี้ของคนนี้ (นับตามผู้รับผิดชอบ · ไม่มีผู้รับผิดชอบ = คนสร้าง) */
export function starCountFor(items: { assigned_to: string | null; status: string; plan: PlanMeta }[], userId: string, now: Date = new Date()): number {
  return items.filter((t) => t.status !== "resolved" && isStarredToday(t.plan, now) && (t.assigned_to ?? t.plan.created_by_id) === userId).length;
}

/** เรียงในช่อง: ⭐ วันนี้ → เกินกำหนด → กำหนดใกล้สุด → ไม่มีกำหนด (เก่าก่อน) */
export function sortPlanItems<T extends { due_at: string | null; created_at: string; plan: PlanMeta }>(items: T[], now: Date = new Date()): T[] {
  const key = (t: T) => [isStarredToday(t.plan, now) ? 0 : 1, t.due_at ? Date.parse(t.due_at) : Number.MAX_SAFE_INTEGER, Date.parse(t.created_at)];
  return [...items].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}

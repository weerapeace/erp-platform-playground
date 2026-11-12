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
import type { ChecklistSummary, TaskLink } from "@/lib/record-tasks";

export const TEAM_PLAN_MODULE = "team_plan";
/** ✅ เช็กลิสต์ในงาน (เจ้าของขอ 2026-11-12) — ข้อละ 1 แถวใน erp_record_tasks (ของกลาง RecordChecklist)
 *  ข้อที่ใช้บ่อย = erp_lookups ชนิด presetType · แม่แบบหลายข้อ = erp_lookups ชนิด templateType (metadata.items) */
export const TEAM_PLAN_CHECK = { moduleKey: "team_plan_check", recordType: "team_plan", presetType: "team_plan_check", templateType: "team_plan_check_tpl" } as const;
/** 📎 ไฟล์แนบ/คอมเมนต์ของงาน — ชนิดรายการในไฟล์แนบกลาง (erp_record_files) และคอมเมนต์กลาง (CommentThread) */
export const TEAM_PLAN_FILES = "team_plan";
/** โน้ตยาวสุด (เก็บเป็น HTML จากกล่องพิมพ์จัดรูปแบบ — มีแท็กปน จึงเผื่อจากข้อความ 4,000 ตัว) */
export const PLAN_NOTE_MAX = 12000;

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
  tags: string[];                                   // 🏷 แท็ก/โปรเจกต์ เช่น "เว็บ ISG" (กรองบนกระดาน) — 2026-11-12
  watchers: PlanWatcher[];                          // 👀 คนติดตาม — กระดิ่งบอกตอนงานเสร็จ
  estimate_min: number | null;                      // ⏱ เวลาที่คาดว่าใช้ (นาที) — รวมเป็นภาระงานต่อวัน
};
export type PlanWatcher = { id: string; name: string };
export const PLAN_TAG_MAX = 8;
export const PLAN_WATCHERS_MAX = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** แท็ก: ตัดช่องว่างซ้ำ · ยาวสุด 30 · ไม่ซ้ำ (ไม่สนตัวพิมพ์) · สูงสุด PLAN_TAG_MAX */
export function cleanPlanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().replace(/^#/, "").slice(0, 30) : "";
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= PLAN_TAG_MAX) break;
  }
  return out;
}
/** คนติดตาม: id ต้องเป็น uuid · ไม่ซ้ำ · สูงสุด PLAN_WATCHERS_MAX */
export function cleanPlanWatchers(raw: unknown): PlanWatcher[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanWatcher[] = [];
  for (const v of raw) {
    const o = (v ?? {}) as { id?: unknown; name?: unknown };
    if (typeof o.id !== "string" || !UUID_RE.test(o.id) || out.some((w) => w.id === o.id)) continue;
    out.push({ id: o.id, name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : "ผู้ใช้" });
    if (out.length >= PLAN_WATCHERS_MAX) break;
  }
  return out;
}
/** เวลาที่คาดว่าใช้ → นาที (5 นาที – 5 วันทำงาน) · ไม่ระบุ/ผิด = null */
export function cleanEstimate(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  return raw === null || raw === undefined || raw === "" || !Number.isFinite(n) || n < 5 ? null : Math.min(n, 40 * 60);
}
/** ตัวเลือกเวลาที่คาดว่าใช้ (นาที) */
export const ESTIMATE_OPTIONS = [15, 30, 60, 120, 240, 480] as const;
/** 90 → "1.5 ชม." · 30 → "30 นาที" · 480 → "1 วัน" */
export function estimateLabel(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} นาที`;
  if (min === 480) return "1 วัน";
  if (min === 240) return "ครึ่งวัน";
  const h = Math.round((min / 60) * 10) / 10;
  return `${h} ชม.`;
}
/** สีของแท็ก (คงที่ต่อชื่อ) */
const TAG_COLORS = ["#7F77DD", "#1D9E75", "#D85A30", "#378ADD", "#D4537E", "#639922", "#BA7517", "#888780"];
export const tagColor = (tag: string) => TAG_COLORS[[...tag.toLowerCase()].reduce((n, c) => n + c.charCodeAt(0), 0) % TAG_COLORS.length];
/** แท็กทั้งหมดที่ใช้อยู่ เรียงตามจำนวนงาน (มากก่อน) — ตัวเลือกกรอง/แนะนำตอนพิมพ์ */
export function planTagCounts(items: { plan: PlanMeta }[]): { tag: string; n: number }[] {
  const m = new Map<string, { tag: string; n: number }>();
  for (const t of items) for (const tag of t.plan.tags) { const k = tag.toLowerCase(); const e = m.get(k); if (e) e.n++; else m.set(k, { tag, n: 1 }); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, "th"));
}
/** ภาระงานวันนี้ของฉัน = งานที่ยังไม่เสร็จ ครบกำหนดวันนี้หรือเลยแล้ว + งานหลักวันนี้ (ดาว) · รวมเวลาที่ประเมิน + จำนวนที่ยังไม่ประเมิน */
export const DAY_CAPACITY_MIN = 8 * 60;
export function myDayLoad(items: { status: string; due_at: string | null; assigned_to: string | null; plan: PlanMeta }[], me: string, now: Date = new Date()): { count: number; minutes: number; unestimated: number } {
  const today = todayBangkok(now);
  const list = items.filter((t) => t.status !== "resolved" && (t.assigned_to ?? t.plan.created_by_id) === me
    && ((t.due_at && bkkYmd(t.due_at) <= today) || t.plan.star_date === today));
  return {
    count: list.length,
    minutes: list.reduce((s, t) => s + (t.plan.estimate_min ?? 0), 0),
    unestimated: list.filter((t) => !t.plan.estimate_min).length,
  };
}

/** 1 งานที่ API ส่งให้หน้าเว็บ (/api/team-plan) */
export type PlanItem = {
  id: string; title: string; note: string | null; status: string; priority: Priority;
  due_at: string | null; assigned_to: string | null; assigned_name: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  resolved_by: string | null; resolved_at: string | null;
  links: TaskLink[]; plan: PlanMeta;
  /** กด "เตือนอีกครั้ง" ไว้ถึงเมื่อไหร่ (metadata.plan_sent.snooze_until) — ตัว Pet ใช้พูดเตือนตอนถึงเวลา */
  snooze_until?: string | null;
  /** สรุปเช็กลิสต์ในงาน (GET /api/team-plan ใส่ให้ · ไม่มีข้อ = null · คำตอบ PATCH ไม่มีช่องนี้ = ใช้ค่าเดิมบนจอ) */
  checklist?: ChecklistSummary | null;
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
    tags: cleanPlanTags(r.tags),
    watchers: cleanPlanWatchers(r.watchers),
    estimate_min: cleanEstimate(r.estimate_min),
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

/** วันที่ (เวลาไทย YYYY-MM-DD) ของกำหนด — ใช้วางงานลงช่องวันในปฏิทิน · ไม่มีกำหนด = null */
export const dueYmd = (dueAt: string | null) => (dueAt ? bkkYmd(dueAt) : null);

/** ลากงานไปวางบนวันในปฏิทิน → กำหนดใหม่ = วันนั้น + เวลาเดิม (ไม่มีเวลาเดิม = 18:00) · วางกลับกล่อง (null) = ไม่มีกำหนด */
export function dueOnDate(dueAt: string | null, ymd: string | null): string | null {
  if (!ymd || !YMD.test(ymd)) return null;
  const time = dueAt && hasTime(dueAt) ? hm(dueAt) : "18:00";
  return new Date(`${ymd}T${time}:00+07:00`).toISOString();
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

// ── รอบแจ้งเตือน (ตัวตั้งเวลาเรียกทุก 15 นาที · lib/team-plan-server runTeamPlanReminders) ──
/** สิ่งที่เตือนไปแล้ว (metadata.plan_sent) — กันเตือนซ้ำ · เปลี่ยนกำหนด = เตือนใหม่ได้ */
export type PlanSent = {
  remind_for?: string | null;    // เตือนก่อนกำหนดไปแล้ว สำหรับกำหนดนี้
  overdue_for?: string | null;   // แจ้งเลยกำหนด (+เลื่อนเป็นด่วน) ไปแล้ว สำหรับกำหนดนี้
  waiting_on?: string | null;    // ตามงาน "รอคนอื่น" ล่าสุดวันไหน (YYYY-MM-DD)
  snooze_until?: string | null;  // กด "อีก 1 ชม. / พรุ่งนี้เช้า" จากมือถือ → เตือนอีกครั้งตอนนี้
  snooze_sent?: string | null;   // เตือนรอบเลื่อนไปแล้ว (= snooze_until ที่ส่งแล้ว)
};
export function normalizePlanSent(raw: unknown): PlanSent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  return { remind_for: s("remind_for"), overdue_for: s("overdue_for"), waiting_on: s("waiting_on"), snooze_until: s("snooze_until"), snooze_sent: s("snooze_sent") };
}

/** เวลาที่ควรเตือนก่อนกำหนด · "เช้าวันนั้น" = 09:00 ของวันกำหนด (กำหนดก่อน 9 โมง = ก่อน 1 ชม.) */
export function remindAt(dueAt: string, mode: RemindMode): Date | null {
  const due = Date.parse(dueAt);
  if (mode === "before_1h") return new Date(due - 3600e3);
  if (mode === "before_1d") return new Date(due - 86400e3);
  if (mode === "morning") {
    const nine = Date.parse(`${todayBangkok(new Date(due))}T09:00:00+07:00`);
    return new Date(nine < due ? nine : due - 3600e3);
  }
  return null;
}

export const WAITING_FOLLOW_DAYS = 2;
export type ReminderNote = { kind: "snooze" | "before" | "overdue" | "waiting"; item_id: string; user_id: string; title: string; body: string; high: boolean };
type RemindItem = { id: string; title: string; status: string; priority: Priority; due_at: string | null; assigned_to: string | null; plan: PlanMeta; sent: PlanSent };

/**
 * รอบเตือน 1 รอบ (pure) — คืนข้อความที่ต้องส่ง + ค่าที่ต้องบันทึกกลับ (กันส่งซ้ำ / เลื่อนเป็นด่วน)
 *   เลื่อนเตือน (จากมือถือ) → ก่อนกำหนด → เลยกำหนด: แจ้ง 1 ครั้ง + ปกติ/ไม่ด่วน เลื่อนเป็น "ด่วน" → รอคนอื่นเกิน 2 วัน: ตามทุก 2 วัน
 *   ผู้รับ = ผู้รับผิดชอบ (ไม่มี = คนสร้าง)
 */
export function planReminders(items: RemindItem[], now: Date = new Date()): { notes: ReminderNote[]; patches: { id: string; priority?: Priority; sent: PlanSent }[] } {
  const notes: ReminderNote[] = [];
  const patches: { id: string; priority?: Priority; sent: PlanSent }[] = [];
  const today = todayBangkok(now);
  for (const t of items) {
    if (t.status === "resolved") continue;
    const user = t.assigned_to ?? t.plan.created_by_id;
    if (!user) continue;
    const sent: PlanSent = { ...t.sent };
    let priority: Priority | undefined;
    const push = (kind: ReminderNote["kind"], title: string, body: string, high = false) => notes.push({ kind, item_id: t.id, user_id: user, title, body, high });
    const due = t.due_at;
    const overdue = isOverdue(due, now);

    if (sent.snooze_until && Date.parse(sent.snooze_until) <= now.getTime() && sent.snooze_sent !== sent.snooze_until) {
      push("snooze", `เตือนอีกครั้ง: ${t.title}`, due ? `กำหนด ${dueLabel(due, now)}` : "ตามที่กดเลื่อนไว้", isUrgent(t.priority));
      sent.snooze_sent = sent.snooze_until;
    }
    if (due && !overdue && t.plan.remind !== "none" && sent.remind_for !== due) {
      const at = remindAt(due, t.plan.remind);
      if (at && at.getTime() <= now.getTime()) {
        push("before", `ใกล้ถึงกำหนด: ${t.title}`, `กำหนด ${dueLabel(due, now)} · ${PRIORITY_META[t.priority].label}`, isUrgent(t.priority));
        sent.remind_for = due;
      }
    }
    if (due && overdue && sent.overdue_for !== due) {
      if (t.priority === "normal" || t.priority === "low") priority = "high";
      push("overdue", `เลยกำหนดแล้ว: ${t.title}`, `กำหนด ${dueLabel(due, now)}${priority ? " · เลื่อนเป็น \"ด่วน\" ให้แล้ว" : ""}`, true);
      sent.overdue_for = due;
      sent.remind_for = due;   // เลยไปแล้ว ไม่ต้องเตือนก่อนกำหนดอีก
    }
    if (t.plan.waiting && waitingDays(t.plan.waiting.since, now) >= WAITING_FOLLOW_DAYS
      && (!sent.waiting_on || Math.round((Date.parse(today) - Date.parse(sent.waiting_on)) / 86400e3) >= WAITING_FOLLOW_DAYS)) {
      push("waiting", `รอมา ${waitingDays(t.plan.waiting.since, now)} วันแล้ว: ${t.title}`, `${t.plan.waiting.note ? `รอ: ${t.plan.waiting.note} — ` : ""}ตามงานหรือยัง?`);
      sent.waiting_on = today;
    }
    if (priority || JSON.stringify(sent) !== JSON.stringify(t.sent)) patches.push({ id: t.id, ...(priority ? { priority } : {}), sent });
  }
  return { notes, patches };
}

/** สรุปเช้า 9:00 — ส่งช่วง 09:00–11:59 ครั้งเดียวต่อวัน (เซิร์ฟเวอร์กันซ้ำ) */
export const isSummaryWindow = (now: Date = new Date()) => { const h = new Date(now.getTime() + 7 * 3600e3).getUTCHours(); return h >= 9 && h < 12; };
/** สรุปงานของคนหนึ่ง (null = ไม่มีอะไรต้องบอก) */
export function planMorningSummary(items: { title: string; status: string; due_at: string | null; assigned_to: string | null; plan: PlanMeta }[], userId: string, now: Date = new Date()): { title: string; body: string } | null {
  const today = todayBangkok(now);
  const mine = items.filter((t) => t.status !== "resolved" && (t.assigned_to ?? t.plan.created_by_id) === userId);
  const stars = mine.filter((t) => t.plan.star_date === today);
  const dueToday = mine.filter((t) => t.due_at && !isOverdue(t.due_at, now) && todayBangkok(new Date(t.due_at)) === today);
  const overdue = mine.filter((t) => isOverdue(t.due_at, now));
  const waiting = mine.filter((t) => t.plan.waiting);
  if (!stars.length && !dueToday.length && !overdue.length) return null;
  const parts = [stars.length && `⭐ งานหลัก ${stars.length}`, dueToday.length && `ครบกำหนดวันนี้ ${dueToday.length}`, overdue.length && `เกินกำหนด ${overdue.length}`, waiting.length && `รอคนอื่น ${waiting.length}`].filter(Boolean);
  const top = [...stars, ...overdue, ...dueToday].filter((t, i, a) => a.indexOf(t) === i).slice(0, 3).map((t) => `• ${t.title}`);
  return { title: `สรุปงานวันนี้ของคุณ (${mine.length} งานค้าง)`, body: [parts.join(" · "), ...top].join("\n") };
}

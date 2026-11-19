/**
 * 🧩 Canvas งานค้างรวม 3 ระบบ บนโหมด "ผังระบบ" ของกระดานแผนงาน — ตรรกะล้วน (ไม่มี React) · เทสต์ lib/__tests__/work-canvas.test.ts
 * เจ้าของเลือก 2026-11-19 แบบ A + ข้อ 1,2,3,4,5,6,7,8,9,12,13,15,17
 *
 *   ชนิดงาน: plan = แผนงานทีม (erp_record_tasks team_plan) · task = งาน Task Manager (erp_creative_tasks) · sheet = ใบงานออกแบบ (design_sheets)
 *   - งาน Task / ใบงาน "เกาะกล่องเอง" ตามสถานะ (ไม่ต้องลาก · ไม่เก็บอะไรเพิ่ม) → กล่องในแถบ "ครีเอทีฟ / ออกแบบ" (WORK_BOXES)
 *     ในผังอื่น ใบงานทั้งหมดไปรวมที่กล่อง ds (ใบงานออกแบบ) ของแผนผังการทำงาน
 *   - งานในแผนทีม เกาะเองด้วยการลาก (plan.linked kind flow_node) — เกาะกล่องในแถบนี้ได้ด้วย (id ขึ้นต้น w_/d_)
 *   - ไม่มีตารางใหม่ · ข้อมูลมาจาก API เดิมของแต่ละระบบ (สิทธิ์ตามระบบนั้น)
 * doc: docs/team-plan.md (หัวข้อ Canvas งานค้างรวม)
 */
import { todayBangkok } from "@/lib/date";
import { PRIORITIES, isOverdue as planOverdue, type PlanItem, type Priority } from "@/lib/team-plan";

export type WorkKind = "plan" | "task" | "sheet";

/** ป้ายสีแยกชนิด (ม่วง = แผน · เขียว = งาน · ส้ม = ใบงาน) */
export const WORK_KIND_META: Record<WorkKind, { label: string; short: string; chip: string; dot: string; icon: string }> = {
  plan: { label: "แผนทีม", short: "แผน", chip: "bg-violet-100 text-violet-800", dot: "#7c3aed", icon: "i:list-check" },
  task: { label: "งาน Task", short: "งาน", chip: "bg-teal-100 text-teal-800", dot: "#0d9488", icon: "i:photo" },
  sheet: { label: "ใบงานออกแบบ", short: "ใบงาน", chip: "bg-amber-100 text-amber-800", dot: "#d97706", icon: "i:ruler" },
};

// ── กล่องในแถบ "ครีเอทีฟ / ออกแบบ" ──
export type WorkBox = { label: string; sub: string; band: 0 | 1; col: number; task?: string[]; sheet?: string[] };
/** สถานะงาน Task / ใบงาน → กล่อง (สถานะใบงานที่ไม่รู้จักแต่ยังไม่ปิด → ตกกล่อง d_design) */
export const WORK_BOXES: Record<string, WorkBox> = {
  w_queue:    { label: "ไอเดีย / รอคิว", sub: "รอคิว · พร้อมทำ", band: 0, col: 0, task: ["backlog", "ready"] },
  w_doing:    { label: "กำลังทำ", sub: "กำลังทำ · ต้องแก้ · ติดปัญหา", band: 0, col: 1, task: ["in_progress", "revision", "blocked"] },
  w_review:   { label: "รอตรวจ", sub: "ส่งตรวจ / รออนุมัติ", band: 0, col: 2, task: ["need_review"] },
  w_publish:  { label: "รอโพสต์", sub: "อนุมัติแล้ว · ตั้งเวลา", band: 0, col: 3, task: ["approved", "scheduled"] },
  d_design:   { label: "ออกแบบ / แก้แบบ", sub: "ใบงานออกแบบ", band: 1, col: 0, sheet: ["design", "revising", "costing"] },
  d_customer: { label: "รอลูกค้า", sub: "รอส่ง · ส่งลูกค้าดู", band: 1, col: 1, sheet: ["quoted", "sent_customer"] },
  d_approved: { label: "ลูกค้าอนุมัติ", sub: "รอตั้ง SKU", band: 1, col: 2, sheet: ["approved"] },
};
export const WORK_BAND_LABELS = ["ครีเอทีฟ / คอนเทนต์ (งาน Task)", "ออกแบบสินค้า (ใบงาน)"] as const;
/** กล่องของแผนผังการทำงานที่ต่อท้ายแถบใบงาน (อนุมัติ → ตั้ง SKU) */
export const WORK_TAIL_NODE = "sku";
export const isWorkBox = (id: string) => id in WORK_BOXES;

/** งาน Task ที่ปิดแล้ว (ไม่นับค้าง) */
export const TASK_CLOSED = new Set(["done", "published", "cancelled"]);
/** ใบงานที่ปิดแล้ว ตอนยังโหลดรายการสถานะจากระบบไม่ได้ (ปกติใช้ is_terminal จาก /api/design-sheets/statuses) */
export const SHEET_CLOSED_FALLBACK = new Set(["sku_created", "cancelled", "state_8"]);

export function taskBox(status: string): string | null {
  if (TASK_CLOSED.has(status)) return null;
  for (const [id, b] of Object.entries(WORK_BOXES)) if (b.task?.includes(status)) return id;
  return "w_queue";
}
export function sheetBox(status: string, closed: Set<string> = SHEET_CLOSED_FALLBACK): string | null {
  if (closed.has(status)) return null;
  for (const [id, b] of Object.entries(WORK_BOXES)) if (b.sheet?.includes(status)) return id;
  return "d_design";
}

// ── รายการงานรวม (ใช้ทั้งถาด ป้ายบนกล่อง และป๊อปรายการ) ──
export type WorkItem = {
  kind: WorkKind;
  /** id ในระบบเดิม (แผน/งาน/ใบงาน) — คีย์ไม่ซ้ำข้ามชนิดใช้ workKey */
  id: string;
  title: string;
  /** วันที่/เวลา ISO (แผน) หรือ YYYY-MM-DD (งาน/ใบงาน) */
  due_at: string | null;
  due_text: string;
  overdue: boolean;
  assigned_name: string | null;
  assigned_ids: string[];
  priority: Priority;
  status: string;
  status_label: string;
  /** กล่องที่เกาะเองตามสถานะ (งาน/ใบงาน) */
  box: string | null;
  /** รออนุมัติ/รอตรวจ/รอคนอื่น — ตัวกรอง "รอตรวจ" */
  review: boolean;
  /** ความคืบหน้างานย่อย 0-100 (งาน Task) */
  progress: number | null;
  /** ⏳ รออะไรอยู่ที่ยังค้าง (ใบงาน) */
  waiting: string[];
  /** รูปปก URL (ถ้ามี) */
  cover: string | null;
  code: string | null;
  plan?: PlanItem;
};
export const workKey = (w: { kind: WorkKind; id: string }) => `${w.kind}:${w.id}`;

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** วันที่ล้วน (YYYY-MM-DD) → เกินกำหนด? + ข้อความ (เกินกำหนด N วัน / วันนี้ / พรุ่งนี้ / 7 ธ.ค.) — เกินเมื่อพ้นวันนั้นแล้ว (เวลาไทย) */
export function ymdDue(ymd: string | null, now: Date = new Date()): { overdue: boolean; text: string } {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return { overdue: false, text: "ไม่มีกำหนด" };
  const d = ymd.slice(0, 10), today = todayBangkok(now);
  const days = Math.round((Date.parse(today) - Date.parse(d)) / 86400e3);
  if (days > 0) return { overdue: true, text: `เกินกำหนด ${days} วัน` };
  if (days === 0) return { overdue: false, text: "วันนี้" };
  if (days === -1) return { overdue: false, text: "พรุ่งนี้" };
  return { overdue: false, text: `${Number(d.slice(8, 10))} ${TH_MON[Number(d.slice(5, 7)) - 1]}` };
}

const asPrio = (v: unknown): Priority => ((PRIORITIES as readonly string[]).includes(String(v)) ? (v as Priority) : "normal");

/** แผนงานทีม → WorkItem (dueText มาจากหน้าแม่ที่มี dueLabel อยู่แล้ว) */
export function planToWork(t: PlanItem, dueText: string, now: Date = new Date()): WorkItem {
  return {
    kind: "plan", id: t.id, title: t.title, due_at: t.due_at, due_text: t.due_at ? dueText : "ไม่มีกำหนด", overdue: planOverdue(t.due_at, now),
    assigned_name: t.assigned_name ?? null, assigned_ids: t.assigned_to ? [t.assigned_to] : [], priority: t.priority,
    status: t.status, status_label: t.plan.waiting ? `รอ: ${t.plan.waiting.note || "คนอื่น"}` : "ยังไม่เสร็จ",
    box: null, review: !!t.plan.waiting, progress: null, waiting: [], cover: null, code: null, plan: t,
  };
}

/** แถวจาก /api/creative-tasks (เฉพาะช่องที่ใช้) */
export type TaskRow = {
  id: string; task_no?: string | null; title: string; status: string; priority?: string; due_date?: string | null;
  assignee_id?: string | null; assignee_label?: string | null; assignees?: { id?: string | null; user_id?: string | null; name?: string | null; label?: string | null }[];
  progress_percent?: number | null; approval_status?: string | null;
};
export function taskToWork(r: TaskRow, statusLabel: (s: string) => string, now: Date = new Date()): WorkItem | null {
  const box = taskBox(r.status);
  if (!box) return null;
  const due = ymdDue(r.due_date ?? null, now);
  const ids = new Set<string>();
  if (r.assignee_id) ids.add(r.assignee_id);
  const names: string[] = [];
  if (r.assignee_label) names.push(r.assignee_label);
  for (const a of r.assignees ?? []) {
    const id = a.user_id ?? a.id; if (id) ids.add(id);
    const n = a.name ?? a.label; if (n && !names.includes(n)) names.push(n);
  }
  return {
    kind: "task", id: r.id, title: r.title, due_at: r.due_date ?? null, due_text: due.text, overdue: due.overdue,
    assigned_name: names.length ? names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "") : null, assigned_ids: [...ids],
    priority: asPrio(r.priority), status: r.status, status_label: statusLabel(r.status), box,
    review: r.status === "need_review" || r.approval_status === "pending", progress: typeof r.progress_percent === "number" ? r.progress_percent : null,
    waiting: [], cover: null, code: r.task_no ?? null,
  };
}

/** แถวจาก /api/design-sheets (เฉพาะช่องที่ใช้) */
export type SheetRow = {
  id: string; code?: string | null; name: string; status: string; deadline?: string | null; cover_url?: string | null;
  waiting_for?: string | null; waiting_items?: { open: string[]; done: number } | null;
};
export function sheetToWork(r: SheetRow, statusLabel: (s: string) => string, closed: Set<string> = SHEET_CLOSED_FALLBACK, now: Date = new Date()): WorkItem | null {
  const box = sheetBox(r.status, closed);
  if (!box) return null;
  const due = ymdDue(r.deadline ?? null, now);
  const waiting = [...(r.waiting_items?.open ?? [])];
  if (r.waiting_for && !waiting.includes(r.waiting_for)) waiting.unshift(r.waiting_for);
  return {
    kind: "sheet", id: r.id, title: r.code ? `${r.code} ${r.name}` : r.name, due_at: r.deadline ?? null, due_text: due.text, overdue: due.overdue,
    assigned_name: null, assigned_ids: [], priority: "normal", status: r.status, status_label: statusLabel(r.status), box,
    review: box === "d_customer", progress: null, waiting, cover: r.cover_url ?? null, code: r.code ?? null,
  };
}

// ── ตัวกรองรวม + แถบสรุป ──
export type WorkFilter = "all" | "me" | "over" | "review";
export const WORK_FILTERS: { key: WorkFilter; label: string; hint: string }[] = [
  { key: "all", label: "ทั้งทีม", hint: "งานค้างทุกชิ้น" },
  { key: "me", label: "ของฉัน", hint: "งานที่ฉันรับผิดชอบ (ใบงานยังไม่มีช่องคนถือ จึงไม่นับ)" },
  { key: "over", label: "เกินกำหนด", hint: "เลยกำหนดส่งแล้ว" },
  { key: "review", label: "รอตรวจ / รอคนอื่น", hint: "งาน Task รอตรวจ · ใบงานรอลูกค้า · แผนที่ตั้งว่ารอคนอื่น" },
];
export function matchWork(w: WorkItem, f: WorkFilter, me: string | null): boolean {
  if (f === "me") return !!me && w.assigned_ids.includes(me);
  if (f === "over") return w.overdue;
  if (f === "review") return w.review;
  return true;
}

export type WorkSummary = { total: number; byKind: Record<WorkKind, number>; overdue: number; review: number; waitingSheets: number };
export function workSummary(list: WorkItem[]): WorkSummary {
  const byKind: Record<WorkKind, number> = { plan: 0, task: 0, sheet: 0 };
  let overdue = 0, review = 0, waitingSheets = 0;
  for (const w of list) {
    byKind[w.kind]++;
    if (w.overdue) overdue++;
    if (w.review) review++;
    if (w.kind === "sheet" && w.waiting.length) waitingSheets++;
  }
  return { total: list.length, byKind, overdue, review, waitingSheets };
}

/** ป้ายบนกล่อง: นับแยกชนิด + มีงานเกินกำหนดไหม */
export function countKinds(list: WorkItem[]): { plan: number; task: number; sheet: number; overdue: boolean } {
  const c = { plan: 0, task: 0, sheet: 0, overdue: false };
  for (const w of list) { c[w.kind]++; if (w.overdue) c.overdue = true; }
  return c;
}

/** ซูมเข้า = กางสถานะย่อยในกล่อง: [ป้ายสถานะ, จำนวน] เรียงมากไปน้อย (เฉพาะงาน/ใบงาน) */
export function statusBreakdown(list: WorkItem[]): { label: string; n: number; kind: WorkKind }[] {
  const m = new Map<string, { label: string; n: number; kind: WorkKind }>();
  for (const w of list) {
    if (w.kind === "plan") continue;
    const k = `${w.kind}:${w.status}`;
    const cur = m.get(k) ?? { label: w.status_label, n: 0, kind: w.kind };
    cur.n++; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

/** เรียงในรายการ: เกินกำหนดก่อน → กำหนดใกล้ → ไม่มีกำหนดท้าย */
export function sortWork(list: WorkItem[]): WorkItem[] {
  const ms = (w: WorkItem) => (w.due_at ? Date.parse(w.due_at.length === 10 ? `${w.due_at}T00:00:00+07:00` : w.due_at) : Number.POSITIVE_INFINITY);
  return [...list].sort((a, b) => Number(b.overdue) - Number(a.overdue) || ms(a) - ms(b) || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
}

// ── มุมมองที่จำต่อคน (ข้อ 15) ──
export type FlowViewPref = { view: string; filter: WorkFilter; onlyPinned: boolean; kinds: WorkKind[] };
export const FLOW_VIEW_PREF_DEFAULT: FlowViewPref = { view: "work", filter: "all", onlyPinned: false, kinds: ["plan", "task", "sheet"] };
export function parseFlowViewPref(v: unknown): FlowViewPref | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const filter = WORK_FILTERS.some((f) => f.key === o.filter) ? (o.filter as WorkFilter) : "all";
  const kinds = Array.isArray(o.kinds) ? (o.kinds.filter((k) => k === "plan" || k === "task" || k === "sheet") as WorkKind[]) : FLOW_VIEW_PREF_DEFAULT.kinds;
  return { view: typeof o.view === "string" && o.view.length <= 20 ? o.view : "work", filter, onlyPinned: o.onlyPinned === true, kinds: kinds.length ? kinds : FLOW_VIEW_PREF_DEFAULT.kinds };
}

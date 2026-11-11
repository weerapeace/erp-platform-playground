/**
 * task-inbox — "งาน Task Manager ที่รอฉัน" สำหรับแท็บ Task ในศูนย์แจ้งเตือน (pure · ไม่ยิง DB · ทดสอบได้)
 *
 * 3 กลุ่ม:
 *   review   = รอคุณตรวจ   งานสถานะรอตรวจ ที่ฉันเป็นผู้ตรวจ/ผู้อนุมัติ (งานที่ไม่ได้ตั้งผู้ตรวจ → คนที่มีสิทธิ์อนุมัติงานเห็น)
 *   revision = ต้องแก้       งานของฉันที่ถูกตีกลับ
 *   assigned = มอบให้คุณ    งานของฉันที่ยังไม่จบ (ไม่นับรอตรวจ/ต้องแก้/อนุมัติแล้ว)
 * เรียง: เกินกำหนดนานสุดก่อน → ใกล้กำหนด → ไม่มีกำหนด · งานค้างเกิน STALE_DAYS วัน พับไว้แยก (กันท่วมแท็บ)
 *
 * ใช้ที่: lib/task-inbox-server (ประกอบผล) · components/work-popup/task-inbox (แสดง)
 */

export type InboxGroup = "review" | "revision" | "assigned";
export const INBOX_GROUPS: { key: InboxGroup; label: string }[] = [
  { key: "review", label: "รอคุณตรวจ" },
  { key: "revision", label: "ต้องแก้ (ของคุณ)" },
  { key: "assigned", label: "มอบให้คุณ" },
];
export const STALE_DAYS = 30;

export type InboxItem = {
  id: string;
  task_no: string | null;
  title: string;
  status: string;
  due_date: string | null;       // YYYY-MM-DD
  updated_at: string | null;
  brand: string | null;
  task_type: string | null;      // ชื่อประเภทงาน (ภาษาคน)
  parent_code: string | null;
  cover_key: string | null;      // r2 key รูปปก (Parent ก่อน → รูปปกงาน)
  has_subtasks: boolean;         // มีงานย่อย = สถานะมาจากงานย่อย (คนทั่วไปไม่มีปุ่มอนุมัติ — เหมือนลิ้นชักงาน)
  checks: number | null;         // จุดที่ตัวเช็กสินค้าเจอ (null = ไม่ผูกสินค้า / ไม่ได้เช็ก)
};
export type InboxPayload = Record<InboxGroup, InboxItem[]>;
export const emptyInbox = (): InboxPayload => ({ review: [], revision: [], assigned: [] });

/** จำนวนที่นับบนแท็บ/ตัว Pet = สิ่งที่ต้องลงมือ (รอตรวจ + ต้องแก้) · "มอบให้คุณ" ไม่นับ (ไม่ใช่เรื่องด่วน) */
export const inboxCount = (p: InboxPayload | null | undefined) => (p ? p.review.length + p.revision.length : 0);

/** วันที่วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export function todayBkk(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
/** เลยกำหนดกี่วัน (บวก = เลย · 0 = วันนี้ · ลบ = ยังไม่ถึง · null = ไม่มีกำหนด) */
export function overdueDays(due: string | null | undefined, today: string): number | null {
  if (!due) return null;
  const d = Date.UTC(+due.slice(0, 4), +due.slice(5, 7) - 1, +due.slice(8, 10));
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((t - d) / 86_400_000);
}
/** ป้ายกำหนดส่งภาษาคน + โทนสี */
export function dueLabel(due: string | null | undefined, today: string): { text: string; tone: "danger" | "warn" | "muted" } {
  const n = overdueDays(due, today);
  if (n == null) return { text: "ไม่มีกำหนดส่ง", tone: "muted" };
  if (n > 0) return { text: `เกินกำหนด ${n} วัน`, tone: "danger" };
  if (n === 0) return { text: "ครบกำหนดวันนี้", tone: "warn" };
  if (n >= -2) return { text: `อีก ${-n} วันครบกำหนด`, tone: "warn" };
  return { text: `กำหนดส่ง ${due}`, tone: "muted" };
}

/** เรียงงาน: เกินกำหนดนานสุดก่อน → ใกล้กำหนด → ไม่มีกำหนด (เรียงตามแก้ล่าสุด) */
export function sortInbox(items: InboxItem[], today: string): InboxItem[] {
  return [...items].sort((a, b) => {
    const x = overdueDays(a.due_date, today), y = overdueDays(b.due_date, today);
    if (x == null && y == null) return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  });
}

/** แยกงานค้างนาน (เกินกำหนดเกิน STALE_DAYS วัน) ออกไปพับไว้ */
export function splitStale(items: InboxItem[], today: string, days = STALE_DAYS): { recent: InboxItem[]; stale: InboxItem[] } {
  const recent: InboxItem[] = [], stale: InboxItem[] = [];
  for (const it of items) ((overdueDays(it.due_date, today) ?? 0) > days ? stale : recent).push(it);
  return { recent, stale };
}

/** แบ่งงานของฉันเข้ากลุ่ม (เรียกฝั่ง server หลังรู้ว่าฉันเกี่ยวกับงานไหนบ้าง) */
export function classifyTask(t: { status: string }, me: { isReviewer: boolean; isAssignee: boolean; canApproveUnassigned: boolean }, terminal: Set<string>): InboxGroup | null {
  if (terminal.has(t.status)) return null;
  if (t.status === "need_review") return me.isReviewer || me.canApproveUnassigned ? "review" : null;
  if (t.status === "revision") return me.isAssignee ? "revision" : null;
  if (t.status === "approved") return null;
  return me.isAssignee ? "assigned" : null;
}

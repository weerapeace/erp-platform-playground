/**
 * ตั๋วงานช่าง Pattern — กติกากลาง (ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์)
 *
 * เส้นทางสถานะ:
 *   รอรับงาน → กำลังทำ → รอตรวจ → เสร็จแล้ว
 *                          ↘ ต้องแก้ → (กำลังทำ / รอตรวจ)
 *   ยกเลิกได้ก่อนเสร็จ (ผู้สั่ง/ผู้จัดการ) · เปิดงานใหม่จากเสร็จ (ผู้จัดการ)
 *
 * ใครทำอะไรได้:
 *   ช่าง (pattern.work)          = รับงาน · ส่งตรวจ · ติ๊กเช็กลิสต์ · แนบไฟล์งาน
 *   ผู้สั่ง (คนเปิดตั๋ว)          = อนุมัติ · ตีกลับ · ยกเลิก · แก้รายละเอียด
 *   ผู้จัดการ (pattern.manage)   = ทำได้ทุกอย่าง + มอบหมายช่าง + เปิดงานใหม่
 * ประตูบันทึกสถานะเดียว = PATCH /api/pattern-tickets/[id] (action: "transition")
 */

export type PatternStatus = "new" | "doing" | "review" | "fix" | "done" | "cancelled";
export type PatternPriority = "normal" | "urgent";

export const PATTERN_STATUSES: { key: PatternStatus; th: string; en: string; cls: string }[] = [
  { key: "new",       th: "รอรับงาน",  en: "New",            cls: "bg-slate-100 text-slate-600 border-slate-200" },
  { key: "doing",     th: "กำลังทำ",   en: "In progress",    cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "review",    th: "รอตรวจ",    en: "In review",      cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "fix",       th: "ต้องแก้",    en: "Needs revision", cls: "bg-red-50 text-red-700 border-red-200" },
  { key: "done",      th: "เสร็จแล้ว",  en: "Done",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "cancelled", th: "ยกเลิก",    en: "Cancelled",      cls: "bg-slate-100 text-slate-400 border-slate-200" },
];
export const patternStatus = (k: string) => PATTERN_STATUSES.find((s) => s.key === k) ?? PATTERN_STATUSES[0];
export const OPEN_STATUSES: PatternStatus[] = ["new", "doing", "review", "fix"];

/** สีของประเภทงาน (ชื่อสีเก็บใน pattern_ticket_types.color) → class tailwind */
export const TYPE_COLOR_CLS: Record<string, string> = {
  violet: "bg-violet-50 text-violet-700",
  teal:   "bg-teal-50 text-teal-700",
  orange: "bg-orange-50 text-orange-700",
  pink:   "bg-pink-50 text-pink-700",
  amber:  "bg-amber-50 text-amber-700",
  blue:   "bg-blue-50 text-blue-700",
  green:  "bg-emerald-50 text-emerald-700",
  slate:  "bg-slate-100 text-slate-600",
};
export const typeColorCls = (c?: string | null) => TYPE_COLOR_CLS[c ?? "slate"] ?? TYPE_COLOR_CLS.slate;

/** ใครเป็นอะไรกับตั๋วใบนี้ */
export type PatternActor = { userId: string | null; canWork: boolean; canManage: boolean; canCreate: boolean };
export type PatternTicketLite = { status: string; requester_id: string | null; assignee_id: string | null };

export type PatternAction = {
  key: "claim" | "submit" | "approve" | "reject" | "resume" | "resubmit" | "cancel" | "reopen";
  to: PatternStatus;
  th: string;
  en: string;
  /** ต้องใส่เหตุผล/คำอธิบาย */
  needNote?: boolean;
  /** ปุ่มหลัก (สีเข้ม) */
  primary?: boolean;
  danger?: boolean;
};

const ACTIONS: Record<PatternAction["key"], PatternAction> = {
  claim:    { key: "claim",    to: "doing",     th: "รับงาน",              en: "Take this job",      primary: true },
  submit:   { key: "submit",   to: "review",    th: "ส่งตรวจ",             en: "Submit for review",  primary: true },
  approve:  { key: "approve",  to: "done",      th: "อนุมัติ งานเสร็จ",      en: "Approve",            primary: true },
  reject:   { key: "reject",   to: "fix",       th: "ตีกลับให้แก้",         en: "Send back",          needNote: true, danger: true },
  resume:   { key: "resume",   to: "doing",     th: "เริ่มแก้งาน",           en: "Start revision" },
  resubmit: { key: "resubmit", to: "review",    th: "แก้แล้ว ส่งตรวจใหม่",   en: "Resubmit",           primary: true },
  cancel:   { key: "cancel",   to: "cancelled", th: "ยกเลิกตั๋ว",           en: "Cancel ticket",      needNote: true, danger: true },
  reopen:   { key: "reopen",   to: "doing",     th: "เปิดงานใหม่",          en: "Reopen",             needNote: true },
};

/** ปุ่มเปลี่ยนสถานะที่คนนี้กดได้กับตั๋วใบนี้ (ลำดับ = ปุ่มหลักมาก่อน) */
export function allowedActions(t: PatternTicketLite, a: PatternActor): PatternAction[] {
  const isRequester = !!a.userId && t.requester_id === a.userId;
  const isAssignee = !!a.userId && t.assignee_id === a.userId;
  const worker = a.canWork && (isAssignee || !t.assignee_id || a.canManage);
  const owner = isRequester || a.canManage;
  const out: PatternAction[] = [];
  switch (t.status) {
    case "new":
      if (a.canWork) out.push(ACTIONS.claim);
      if (owner) out.push(ACTIONS.cancel);
      break;
    case "doing":
      if (worker) out.push(ACTIONS.submit);
      if (owner) out.push(ACTIONS.cancel);
      break;
    case "review":
      if (owner) out.push(ACTIONS.approve, ACTIONS.reject);
      break;
    case "fix":
      if (worker) out.push(ACTIONS.resubmit, ACTIONS.resume);
      if (owner) out.push(ACTIONS.cancel);
      break;
    case "done":
      if (a.canManage) out.push(ACTIONS.reopen);
      break;
  }
  return out;
}

export const patternActionByKey = (k: string): PatternAction | null => (ACTIONS as Record<string, PatternAction>)[k] ?? null;

/** แก้รายละเอียดตั๋ว (ชื่อ/คำอธิบาย/กำหนดส่ง) ได้ไหม — ผู้สั่งหรือผู้จัดการ ก่อนงานเสร็จ */
export function canEditTicket(t: PatternTicketLite, a: PatternActor): boolean {
  if (t.status === "done" || t.status === "cancelled") return a.canManage;
  return a.canManage || (!!a.userId && t.requester_id === a.userId);
}

/** ติ๊กเช็กลิสต์/แนบไฟล์งานได้ไหม — ช่างที่รับงาน (หรือยังไม่มีคนรับ) · ผู้สั่ง · ผู้จัดการ */
export function canWorkOn(t: PatternTicketLite, a: PatternActor): boolean {
  if (t.status === "cancelled") return false;
  if (a.canManage) return true;
  if (!!a.userId && t.requester_id === a.userId) return true;
  return a.canWork && (!t.assignee_id || t.assignee_id === a.userId);
}

/** เลยกำหนดไหม (เทียบวันที่ไทย yyyy-mm-dd · งานปิดแล้วไม่นับ) */
export function isOverdue(due: string | null | undefined, status: string, todayIso: string): boolean {
  if (!due || status === "done" || status === "cancelled") return false;
  return due < todayIso;
}

/** วันนี้ตามเวลาไทย yyyy-mm-dd (กันเพี้ยน timezone) */
export function todayBangkok(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** yyyy-mm-dd → "7 พ.ย." (ไม่เพี้ยน timezone) */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type ChecklistItem = { label: string; done: boolean };
export function checklistFromTemplate(labels: unknown): ChecklistItem[] {
  return (Array.isArray(labels) ? labels : []).map((l) => String(l ?? "").trim()).filter(Boolean).map((label) => ({ label, done: false }));
}
export function cleanChecklist(v: unknown): ChecklistItem[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => ({ label: String((x as ChecklistItem)?.label ?? "").trim().slice(0, 200), done: !!(x as ChecklistItem)?.done }))
    .filter((x) => x.label)
    .slice(0, 50);
}

export type TicketLink = { url: string; label: string };
export function cleanLinks(v: unknown): TicketLink[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => ({ url: String((x as TicketLink)?.url ?? "").trim(), label: String((x as TicketLink)?.label ?? "").trim().slice(0, 150) }))
    .filter((x) => /^https?:\/\//i.test(x.url))
    .slice(0, 30);
}

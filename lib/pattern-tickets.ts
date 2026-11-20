/**
 * ตั๋วงานช่าง Pattern — กติกากลาง (ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์)
 *
 * เส้นทางสถานะ:
 *   รอรับงาน → กำลังทำ → รออนุมัติ → เสร็จแล้ว (อนุมัติ)
 *      ↘ ส่งงานเลย (รับงาน+ส่ง คลิกเดียว)   ↘ ส่งกลับแก้ → (กำลังทำ / รออนุมัติ)
 *   รออนุมัติ → ถอนการส่ง (ช่าง · ก่อนมีคนอนุมัติ) → กำลังทำ
 *   เสร็จแล้ว → ย้อนการอนุมัติ (ผู้จัดการ + เหตุผล) → รออนุมัติ · เปิดงานใหม่ (ผู้จัดการ) → กำลังทำ
 *   ยกเลิกได้ก่อนเสร็จ (ผู้สั่ง/ผู้จัดการ)
 *   (เจ้าของขอ 2026-11-20 "ส่งงานได้ด้วย แต่รออนุมัติ" — ต่อยอดขั้นส่งตรวจเดิม ไม่ได้สร้างระบบอนุมัติใหม่)
 *
 * ใครทำอะไรได้:
 *   ช่าง (pattern.work)          = รับงาน · ส่งงาน · ถอนการส่ง · ติ๊กเช็กลิสต์ · แนบไฟล์งาน
 *   ผู้สั่ง (คนเปิดตั๋ว)          = อนุมัติ · ส่งกลับแก้ · ยกเลิก · แก้รายละเอียด
 *   ผู้จัดการ (pattern.manage)   = ทำได้ทุกอย่าง + มอบหมายช่าง + เปิดงานใหม่ + ย้อนการอนุมัติ
 * ประตูบันทึกสถานะเดียว = PATCH /api/pattern-tickets/[id] (action: "transition")
 */

import { lottieLibraryKey, lottieLibraryValue } from "@/lib/lottie-library";

export type PatternStatus = "new" | "doing" | "review" | "fix" | "done" | "cancelled";
export type PatternPriority = "normal" | "urgent";

export const PATTERN_STATUSES: { key: PatternStatus; th: string; en: string; cls: string }[] = [
  { key: "new",       th: "รอรับงาน",  en: "New",            cls: "bg-slate-100 text-slate-600 border-slate-200" },
  { key: "doing",     th: "กำลังทำ",   en: "In progress",    cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "review",    th: "รออนุมัติ",  en: "Waiting approval", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "fix",       th: "ส่งกลับแก้",  en: "Sent back",      cls: "bg-red-50 text-red-700 border-red-200" },
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
  key: "claim" | "submit" | "approve" | "reject" | "resume" | "resubmit" | "withdraw" | "unapprove" | "cancel" | "reopen";
  to: PatternStatus;
  th: string;
  en: string;
  /** ต้องใส่เหตุผล/คำอธิบาย */
  needNote?: boolean;
  /** เปิดช่องส่งงาน (เช็กไฟล์ที่ต้องส่งกลับ + โน้ตไม่บังคับ) ก่อนยืนยัน */
  submitForm?: boolean;
  /** ปุ่มหลัก (สีเข้ม) */
  primary?: boolean;
  danger?: boolean;
};

const ACTIONS: Record<PatternAction["key"], PatternAction> = {
  claim:     { key: "claim",     to: "doing",     th: "รับงาน",              en: "Take this job" },
  submit:    { key: "submit",    to: "review",    th: "ส่งงาน",              en: "Submit work",        primary: true, submitForm: true },
  approve:   { key: "approve",   to: "done",      th: "อนุมัติ",             en: "Approve",            primary: true },
  reject:    { key: "reject",    to: "fix",       th: "ส่งกลับแก้",           en: "Send back",          needNote: true, danger: true },
  resume:    { key: "resume",    to: "doing",     th: "เริ่มแก้งาน",           en: "Start revision" },
  resubmit:  { key: "resubmit",  to: "review",    th: "แก้แล้ว ส่งใหม่",       en: "Resubmit",           primary: true, submitForm: true },
  withdraw:  { key: "withdraw",  to: "doing",     th: "ถอนการส่ง",           en: "Withdraw" },
  unapprove: { key: "unapprove", to: "review",    th: "ย้อนการอนุมัติ",        en: "Undo approval",      needNote: true },
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
      if (worker) out.push(ACTIONS.submit);   // ส่งงานเลย = รับงาน + ส่ง (ชื่อช่างลงให้เอง)
      if (owner) out.push(ACTIONS.cancel);
      break;
    case "doing":
      if (worker) out.push(ACTIONS.submit);
      if (owner) out.push(ACTIONS.cancel);
      break;
    case "review":
      if (owner) out.push(ACTIONS.approve, ACTIONS.reject);
      if (a.canWork && (isAssignee || a.canManage)) out.push(ACTIONS.withdraw);   // ถอนได้ก่อนมีคนอนุมัติ
      break;
    case "fix":
      if (worker) out.push(ACTIONS.resubmit, ACTIONS.resume);
      if (owner) out.push(ACTIONS.cancel);
      break;
    case "done":
      if (a.canManage) out.push(ACTIONS.unapprove, ACTIONS.reopen);
      break;
  }
  return out;
}

export const patternActionByKey = (k: string): PatternAction | null => (ACTIONS as Record<string, PatternAction>)[k] ?? null;

/** ไฟล์ที่ต้องส่งกลับที่ยังไม่มีในโฟลเดอร์/ลิงก์ของตั๋ว (เทียบนามสกุลไฟล์ · ตัวเล็กใหญ่ไม่สน)
 *  ใช้เตือนตอนส่งงาน — ขาดก็ยังส่งได้ (เจ้าของเลือก 2026-11-20 แบบเตือน ไม่บังคับ) */
export function missingDeliverables(deliverables: string[], fileNames: string[]): string[] {
  const exts = new Set(fileNames.map((n) => (n.match(/\.([A-Za-z0-9]{2,5})(?:[?#].*)?$/)?.[1] ?? "").toUpperCase()).filter(Boolean));
  return cleanDeliverables(deliverables).filter((d) => !exts.has(d));
}

/** ประวัติรอบส่งงาน — จาก audit (action pattern.*) · ส่ง/ส่งใหม่ = รอบ +1 · ถอน/อนุมัติ/ส่งกลับ = ผลของรอบนั้น */
export type PatternRoundEvent = { action: string; actor_name: string | null; note?: string | null; created_at: string };
export type PatternRoundRow = { round: number; kind: "submit" | "withdraw" | "approve" | "reject" | "unapprove"; actor: string; note: string | null; at: string };
const ROUND_KIND: Record<string, PatternRoundRow["kind"]> = {
  "pattern.submit": "submit", "pattern.resubmit": "submit", "pattern.withdraw": "withdraw",
  "pattern.approve": "approve", "pattern.reject": "reject", "pattern.unapprove": "unapprove",
};
export const ROUND_EVENT_ACTIONS = Object.keys(ROUND_KIND);
export function submissionRounds(events: PatternRoundEvent[]): PatternRoundRow[] {
  const out: PatternRoundRow[] = [];
  let round = 0;
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const kind = ROUND_KIND[e.action];
    if (!kind) continue;
    if (kind === "submit") round++;
    out.push({ round: Math.max(round, 1), kind, actor: e.actor_name || "—", note: e.note?.trim() || null, at: e.created_at });
  }
  return out;
}

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

/** ข้อเช็กลิสต์ในตั๋ว · en = คำแปลที่ตั้งไว้ในแม่แบบ (ไม่มี = ใช้ตาราง CHECKLIST_EN) */
export type ChecklistItem = { label: string; done: boolean; en?: string };
/** ข้อในแม่แบบเช็กลิสต์ของประเภทงาน — แบบเดิม = ข้อความไทยล้วน · แบบใหม่ (หน้าตั้งค่า) = { th, en } */
export type TemplateItem = string | { th: string; en?: string };

/** แม่แบบ → รายการ {th, en} (en ว่าง = ลองหาในตาราง CHECKLIST_EN) — ใช้ในหน้าตั้งค่า */
export function templateItems(v: unknown): { th: string; en: string }[] {
  return (Array.isArray(v) ? v : []).map((x) => {
    const th = String(typeof x === "string" ? x : (x as { th?: unknown })?.th ?? "").trim();
    const en = String(typeof x === "string" ? "" : (x as { en?: unknown })?.en ?? "").trim();
    return { th, en: en || CHECKLIST_EN[th] || "" };
  }).filter((x) => x.th);
}
/** ทำความสะอาดแม่แบบก่อนบันทึก (สูงสุด 30 ข้อ) */
export function cleanTemplateChecklist(v: unknown): { th: string; en: string }[] {
  return templateItems(v).map((x) => ({ th: x.th.slice(0, 200), en: x.en.slice(0, 200) })).slice(0, 30);
}
export function checklistFromTemplate(labels: unknown): ChecklistItem[] {
  return templateItems(labels).map(({ th, en }) => (en && en !== CHECKLIST_EN[th] ? { label: th, en, done: false } : { label: th, done: false }));
}
export function cleanChecklist(v: unknown): ChecklistItem[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => {
      const label = String((x as ChecklistItem)?.label ?? "").trim().slice(0, 200);
      const en = String((x as ChecklistItem)?.en ?? "").trim().slice(0, 200);
      return en ? { label, en, done: !!(x as ChecklistItem)?.done } : { label, done: !!(x as ChecklistItem)?.done };
    })
    .filter((x) => x.label)
    .slice(0, 50);
}

/** ไฟล์ที่ช่างต้องส่งกลับ: นามสกุลตัวใหญ่ 2–5 ตัว ไม่ซ้ำ สูงสุด 12 */
export function cleanDeliverables(v: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const s = String(x ?? "").trim().replace(/^\./, "").toUpperCase();
    if (/^[A-Z0-9]{2,5}$/.test(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 12);
}
/** นามสกุลไฟล์ที่ให้เลือกในหน้าตั้งค่า */
export const COMMON_DELIVERABLES = ["DXF", "AI", "PDF", "PSD", "PNG", "JPG", "SVG", "DST", "PES", "XLSX"];

/** key ของประเภทงานใหม่ (ไม่ต้องให้คนตั้ง) */
export const newTypeKey = (now = Date.now()) => `t${now.toString(36)}`;

export type TicketLink = { url: string; label: string };
export function cleanLinks(v: unknown): TicketLink[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => ({ url: String((x as TicketLink)?.url ?? "").trim(), label: String((x as TicketLink)?.label ?? "").trim().slice(0, 150) }))
    .filter((x) => /^https?:\/\//i.test(x.url))
    .slice(0, 30);
}

/* ── ไอคอนประเภทงาน (แผ่นกดเปิดตั๋วบนหน้า /design/pattern-tickets) ──
 * เก็บใน pattern_ticket_types.icon · "i:<ไอคอนเส้น>" = ไอคอนระบบ · "img:pattern-icons/…" = รูปที่ผู้จัดการอัปเอง
 * กลับเป็นไอคอนเดิม = ค่าตั้งต้นตามตารางนี้ (ตรงกับ migration 202611150100) · ประเภทใหม่ที่ไม่อยู่ในตาราง = i:file
 */
export const PATTERN_ICON_FOLDER = "pattern-icons";
/** ไอคอนตั้งต้น = ไอคอนขยับจากคลังกลาง (lib/lottie-library) · ประเภทที่เพิ่มเอง = "อื่นๆ" */
export const DEFAULT_TYPE_ICONS: Record<string, string> = {
  cut: lottieLibraryValue("cut"), block: lottieLibraryValue("block"), sew: lottieLibraryValue("sew"), screen: lottieLibraryValue("screen"),
  laser: lottieLibraryValue("laser"), grade: lottieLibraryValue("grade"), emb: lottieLibraryValue("emb"), other: lottieLibraryValue("other"),
};
export const defaultTypeIcon = (key: string) => DEFAULT_TYPE_ICONS[key] ?? lottieLibraryValue("other");
/** ไอคอนที่ใช้แสดงจริงของประเภท (ว่าง = ตั้งต้น) */
export const typeIconOf = (x: { key: string; icon?: string | null }) => x.icon || defaultTypeIcon(x.key);
/** ชนิดไอคอน: library = Lottie มาตรฐาน (วางบนพื้นสี) · uploaded = รูปที่อัปเอง (พื้นเทาอ่อน ขยายเต็มกรอบ) · line = ไอคอนเส้น */
export type TypeIconKind = "library" | "uploaded" | "line";
export const typeIconKind = (v: string | null | undefined): TypeIconKind => (lottieLibraryKey(v) ? "library" : v?.startsWith("img:") ? "uploaded" : "line");
export const isUploadedTypeIcon = (v: string | null | undefined) => typeIconKind(v) === "uploaded";
/** ขนาดไอคอนในกรอบ box px ตามชนิด */
export const typeIconSize = (v: string | null | undefined, box: number): number | string => {
  const k = typeIconKind(v);
  return k === "uploaded" ? Math.round(box * 0.86) : k === "library" ? Math.round(box * 0.74) : "1em";
};

/** ตรวจค่าไอคอนที่จะบันทึก — ถูก = ค่าที่ใช้ได้ · ว่าง = ค่าตั้งต้นของประเภท · รูปแบบผิด = null (ไม่บันทึก) */
export function cleanTypeIcon(v: unknown, typeKey: string): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return defaultTypeIcon(typeKey);
  if (/^i:[a-z0-9-]{1,40}$/.test(s)) return s;
  if (lottieLibraryKey(s)) return s;
  if (s.startsWith(`img:${PATTERN_ICON_FOLDER}/`) && /^img:[\w\-./]{1,200}$/.test(s) && !s.includes("..")) return s;
  return null;
}

/** นับตั๋วที่ยังไม่ปิดของแต่ละประเภท (ป้าย "ค้าง X" บนแผ่น) */
export function openCountsByType(rows: { type_key: string; status: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if ((OPEN_STATUSES as string[]).includes(r.status)) out[r.type_key] = (out[r.type_key] ?? 0) + 1;
  return out;
}

/* ── กำหนดส่งตั้งต้นตอนเปิดตั๋ว ── ด่วน = วันนี้ · ปกติ = วันนี้ + 3 วัน (นับวันปฏิทิน รวมเสาร์-อาทิตย์ · เวลาไทย) */
export const NORMAL_DUE_DAYS = 3;
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
export function defaultDueDate(urgent: boolean, todayIso: string = todayBangkok()): string {
  return urgent ? todayIso : addDaysIso(todayIso, NORMAL_DUE_DAYS);
}

/* ── โหมด English ──
 * เช็กลิสต์ตั้งต้นใน pattern_ticket_types เก็บเป็นภาษาไทย → แปลอังกฤษด้วยตารางนี้ (ใช้ได้ทั้งแม่แบบ + ตั๋วที่เปิดแล้ว)
 * ข้อที่ไม่อยู่ในตาราง (เพิ่มเอง) = โชว์ภาษาไทยเดิม · แก้แม่แบบในตาราง → เพิ่มคำแปลที่นี่ด้วย
 */
export const CHECKLIST_EN: Record<string, string> = {
  "ขึ้นแบบชิ้นส่วนครบ": "Draft every pattern piece",
  "ใส่เกรนผ้า + รอยบาก": "Add grain lines + notches",
  "ใส่ค่าเย็บ (ระยะเผื่อตะเข็บ)": "Add seam allowance",
  "ระบุจำนวนชิ้นต่อตัว": "State pieces per unit",
  "ส่งไฟล์ให้ห้องตัด": "Send files to the cutting room",
  "วัดขนาดจากแบบตัด": "Measure from the cutting pattern",
  "ระบุวัสดุบล็อก (อะคริลิก/ไม้/เหล็ก)": "Specify block material (acrylic / wood / steel)",
  "ทำจุดเจาะ / ร่องนำ": "Mark drill points / guide slots",
  "ส่งไฟล์ให้ร้านทำบล็อก": "Send files to the block maker",
  "ทดลองใช้กับชิ้นจริง": "Test on a real piece",
  "ลำดับขั้นตอนเย็บ": "Sewing sequence",
  "ระบุชนิดตะเข็บ + ระยะฝีเข็ม": "Specify seam type + stitch length",
  "ระบุด้าย / สีด้าย": "Specify thread / thread colour",
  "ภาพใกล้จุดที่เย็บยาก": "Close-up photos of tricky sewing spots",
  "ผูกขั้นตอนงานเหมา": "Link piecework steps",
  "ไฟล์ vector ขนาดจริง 1:1": "Vector file at actual size 1:1",
  "แยกสี (color separation)": "Colour separation",
  "ระบุรหัสสี Pantone": "Specify Pantone colour codes",
  "ภาพจำลองตำแหน่งบนชิ้นงาน": "Mock-up of the position on the piece",
  "ส่งโรงสกรีน": "Send to the screen printer",
  "แยกเลเยอร์เส้นตัด / เส้นแกะ": "Separate cut / engrave layers",
  "ปิดเส้นทุกรูป (closed path)": "Close every shape (closed paths)",
  "ชดเชยระยะที่เลเซอร์กินเนื้อ (kerf)": "Compensate for laser kerf",
  "จัดวางประหยัดวัสดุ": "Nest to save material",
  "ทดสอบชิ้นแรก": "Test the first piece",
  "ตารางไซซ์อ้างอิง": "Reference size chart",
  "ขยาย / ย่อทุกไซซ์": "Grade up / down every size",
  "ตรวจรอยต่อตรงกัน": "Check that seams match",
  "ส่งไฟล์แยกไซซ์": "Send one file per size",
  "ขนาดจริงบนชิ้นงาน": "Actual size on the piece",
  "ระบุสีด้ายปัก": "Specify embroidery thread colours",
  "แปลงไฟล์จักรปัก": "Convert to embroidery machine file",
  "ปักทดสอบ": "Stitch a test sample",
};
/** ข้อความเช็กลิสต์ตามภาษา — English: คำแปลที่ตั้งในแม่แบบ (itemEn) > ตาราง CHECKLIST_EN > ไทยเดิม */
export const checklistLabel = (label: string, en: boolean, itemEn?: string | null) => (en ? itemEn?.trim() || CHECKLIST_EN[label.trim()] || label : label);

/** ชื่องานตามภาษา — โหมด English ใช้ title_en (แปลอัตโนมัติตอนบันทึก) · ว่าง = ชื่อไทย */
export const ticketTitle = (tk: { title: string; title_en?: string | null }, en: boolean) => (en && tk.title_en?.trim() ? tk.title_en : tk.title);

/** ชื่อประเภทงาน [ตัวใหญ่, ตัวเล็ก] ตามภาษา — English = อังกฤษนำ ไทยตาม */
export const typeLabelPair = (x: { label_th: string; label_en: string }, en: boolean): [string, string] => (en ? [x.label_en, x.label_th] : [x.label_th, x.label_en]);

/* ── Design sheet ที่แนบกับตั๋ว (pattern_tickets.design_sheet_ids) ── */
export const MAX_TICKET_SHEETS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** รายการ id ที่ใช้ได้ (ตัดซ้ำ/ค่าผิดรูปแบบ · ไม่เกิน 20 ใบ) */
export function cleanSheetIds(v: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const s = String(x ?? "").trim().toLowerCase();
    if (UUID_RE.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= MAX_TICKET_SHEETS) break;
  }
  return out;
}
/** เปิดป๊อปดู Design sheet / รุ่นสินค้า (ดูอย่างเดียว) จากตั๋วได้ไหม — ทุกคนที่ดูตั๋วได้ (pattern.view) รวมพนักงาน = ได้
 *  (เจ้าของแก้ 2026-11-06: "พนักงานต้องกดดูได้ แค่เอาปุ่มแก้/เข้าหน้าอื่นออก" — ป๊อปไม่มีปุ่มแก้/ลิงก์ออกอยู่แล้ว)
 *  ด่าน pattern.view อยู่ที่ guardApi ของทุก endpoint · อยากจำกัดอีกในอนาคต = แก้ที่นี่ที่เดียว */
export const canOpenTicketSheet = (_a: { canCreate: boolean; canManage: boolean }) => true;

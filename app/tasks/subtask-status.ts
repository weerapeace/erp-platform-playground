// สถานะงานย่อย — แหล่งเดียวของป้าย 2 ภาษา · จุดสี · ป้ายกรอบ · ลำดับเรียง
// (เดิมแต่ละหน้าเขียนแผนที่เอง 6 ชุด แล้วไม่ตรงกัน เช่น หน้าคิวงานโชว์ "ยังไม่เริ่ม" ให้งานที่ถูกขอแก้)
import { tr } from "@/lib/lang";

export type SubtaskStatusKey = "todo" | "in_progress" | "submitted" | "approved" | "revision_requested" | "canceled";

type Meta = { th: string; en: string; dot: string; badge: string; rank: number };
// rank = ลำดับเรียง "งานของฉัน": กำลังทำบนสุด → ยังไม่เริ่ม → รออนุมัติ → ขอแก้ → อนุมัติแล้ว → ยกเลิก
export const SUBTASK_STATUS: Record<SubtaskStatusKey, Meta> = {
  todo:               { th: "ยังไม่เริ่ม", en: "Not started",        dot: "bg-slate-400",   badge: "bg-slate-50 text-slate-600 border-slate-200",       rank: 1 },
  in_progress:        { th: "กำลังทำ",    en: "In progress",        dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200",          rank: 0 },
  submitted:          { th: "รออนุมัติ",   en: "Pending approval",   dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200",       rank: 2 },
  revision_requested: { th: "ขอแก้",      en: "Revision requested", dot: "bg-orange-500",  badge: "bg-orange-50 text-orange-700 border-orange-200",    rank: 3 },
  approved:           { th: "อนุมัติแล้ว",  en: "Approved",           dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", rank: 4 },
  canceled:           { th: "ยกเลิก",     en: "Canceled",           dot: "bg-slate-300",   badge: "bg-slate-50 text-slate-400 border-slate-200",       rank: 5 },
};

/** ลำดับขั้นที่แสดงในตัวเลือกสถานะ: ยังไม่เริ่ม → กำลังทำ → รออนุมัติ → อนุมัติ → ขอแก้ → ยกเลิก */
export const SUBTASK_STATUS_STEPS: SubtaskStatusKey[] = ["todo", "in_progress", "submitted", "approved", "revision_requested", "canceled"];

// ค่าเก่าในฐานข้อมูล (ก่อนเปลี่ยนชื่อสถานะ) → ค่าปัจจุบัน
const LEGACY: Record<string, SubtaskStatusKey> = { doing: "in_progress", done: "approved", posted: "approved" };

/** แปลงสถานะใด ๆ (รวมค่าเก่า doing/done/posted) เป็นค่าปัจจุบัน — ไม่รู้จัก = ยังไม่เริ่ม */
export function normalizeSubStatus(s: string | null | undefined): SubtaskStatusKey {
  const k = s ?? "";
  if (k in SUBTASK_STATUS) return k as SubtaskStatusKey;
  return LEGACY[k] ?? "todo";
}
export const subStatusLabel = (s: string | null | undefined): string => { const m = SUBTASK_STATUS[normalizeSubStatus(s)]; return tr(m.th, m.en); };
export const subStatusDot = (s: string | null | undefined): string => SUBTASK_STATUS[normalizeSubStatus(s)].dot;
export const subStatusBadge = (s: string | null | undefined): string => SUBTASK_STATUS[normalizeSubStatus(s)].badge;
export const subStatusRank = (s: string | null | undefined): number => SUBTASK_STATUS[normalizeSubStatus(s)].rank;
/** อนุมัติแล้ว (รวมค่าเก่า done/posted) */
export const isSubDone = (s: string | null | undefined): boolean => normalizeSubStatus(s) === "approved";

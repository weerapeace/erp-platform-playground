// ============================================================
// Creative Task Manager — ค่าคงที่กลาง (pure, ใช้ได้ทั้ง client + server)
// ห้าม import server-only ในไฟล์นี้ (UI หยิบไปใช้ทำป้ายสี/ปุ่มเปลี่ยนสถานะ)
// ตารางจริง: erp_creative_tasks / _campaigns / _subtasks / _comments / _attachments
// ============================================================

import { tr } from "./lang";

export type CreativeStatus =
  | "backlog" | "ready" | "in_progress" | "need_review" | "revision"
  | "approved" | "scheduled" | "published" | "done" | "blocked" | "cancelled";

export type CreativePriority = "urgent" | "high" | "normal" | "low";
export type ApprovalStatus = "none" | "pending" | "approved" | "rejected" | "revision";
export type AssetStatus = "missing" | "draft" | "final" | "approved";
// ④ ขั้นตอนใหม่: todo → in_progress → submitted → approved (คงค่าเดิม doing/done/posted ไว้รองรับข้อมูลเก่า)
export type SubtaskStatus = "todo" | "in_progress" | "submitted" | "approved" | "revision_requested" | "canceled" | "doing" | "done" | "posted";

// ---- ป้ายสถานะงาน (label ไทย + คลาส Tailwind) ----
export const STATUS_META: Record<CreativeStatus, { label: string; label_en: string; cls: string; dot: string }> = {
  backlog:     { label: "รอคิว",        label_en: "Queue",       cls: "bg-slate-50 text-slate-600 border-slate-200",     dot: "bg-slate-400" },
  ready:       { label: "พร้อมทำ",      label_en: "Ready",       cls: "bg-sky-50 text-sky-700 border-sky-200",           dot: "bg-sky-500" },
  in_progress: { label: "กำลังทำ",      label_en: "In progress", cls: "bg-indigo-50 text-indigo-700 border-indigo-200",  dot: "bg-indigo-500" },
  need_review: { label: "รอตรวจ",       label_en: "In review",   cls: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  revision:    { label: "ต้องแก้",      label_en: "Needs fix",   cls: "bg-orange-50 text-orange-700 border-orange-200",   dot: "bg-orange-500" },
  approved:    { label: "อนุมัติแล้ว",  label_en: "Approved",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",dot: "bg-emerald-500" },
  scheduled:   { label: "ตั้งเวลาโพสต์", label_en: "Scheduled",   cls: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  published:   { label: "เผยแพร่แล้ว",  label_en: "Published",   cls: "bg-teal-50 text-teal-700 border-teal-200",         dot: "bg-teal-500" },
  done:        { label: "เสร็จ",        label_en: "Done",        cls: "bg-green-50 text-green-700 border-green-200",      dot: "bg-green-500" },
  blocked:     { label: "ติดปัญหา",     label_en: "Blocked",     cls: "bg-red-50 text-red-700 border-red-200",            dot: "bg-red-500" },
  cancelled:   { label: "ยกเลิก",       label_en: "Cancelled",   cls: "bg-slate-100 text-slate-400 border-slate-200",     dot: "bg-slate-300" },
};

export const PRIORITY_META: Record<CreativePriority, { label: string; label_en: string; cls: string }> = {
  urgent: { label: "ด่วนมาก", label_en: "Urgent", cls: "bg-red-50 text-red-700 border-red-200" },
  high:   { label: "ด่วน",    label_en: "High",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
  normal: { label: "ปกติ",    label_en: "Normal", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  low:    { label: "ต่ำ",     label_en: "Low",    cls: "bg-slate-50 text-slate-400 border-slate-200" },
};

/** ลำดับความสำคัญ → ใช้เรียงงานในคิว (เลขน้อย = สำคัญกว่า) */
export const PRIORITY_RANK: Record<CreativePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const APPROVAL_META: Record<ApprovalStatus, { label: string; label_en: string; cls: string }> = {
  none:     { label: "—",        label_en: "—",        cls: "bg-slate-50 text-slate-400 border-slate-200" },
  pending:  { label: "รออนุมัติ", label_en: "Pending",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "อนุมัติ",   label_en: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "ไม่ผ่าน",   label_en: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" },
  revision: { label: "ให้แก้",    label_en: "Revise",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
};

export const ASSET_META: Record<AssetStatus, { label: string; label_en: string; cls: string }> = {
  missing:  { label: "ยังไม่มีไฟล์", label_en: "No file",       cls: "bg-slate-100 text-slate-500 border-slate-200" },
  draft:    { label: "ร่าง",         label_en: "Draft",         cls: "bg-sky-50 text-sky-700 border-sky-200" },
  final:    { label: "ไฟล์จริง",     label_en: "Final",         cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  approved: { label: "อนุมัติไฟล์",  label_en: "File approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// helper: ป้ายตามภาษาปัจจุบัน (reactive ผ่าน tr — component ที่ใช้ useT จะ re-render เมื่อสลับภาษา)
export const priorityLabel = (k: CreativePriority) => tr(PRIORITY_META[k]?.label ?? k, PRIORITY_META[k]?.label_en ?? k);
export const approvalLabel = (k: ApprovalStatus) => tr(APPROVAL_META[k]?.label ?? k, APPROVAL_META[k]?.label_en ?? k);
export const assetLabel = (k: AssetStatus) => tr(ASSET_META[k]?.label ?? k, ASSET_META[k]?.label_en ?? k);
export const statusLabelFb = (k: string) => { const m = STATUS_META[k as CreativeStatus]; return m ? tr(m.label, m.label_en) : k; };

// ---- ประเภทงาน creative ----
export const TASK_TYPES: { value: string; label: string }[] = [
  { value: "photo_shoot",     label: "ถ่ายรูปสินค้า" },
  { value: "photo_edit",      label: "แต่งรูปสินค้า" },
  { value: "product_image",   label: "รูปสินค้า (ปก/Detail)" },
  { value: "banner",          label: "Content Banner" },
  { value: "promote_banner",  label: "Banner โปรโมต" },
  { value: "video",           label: "Video Content" },
  { value: "social_post",     label: "โพสต์ Social" },
  { value: "product_listing", label: "ลงสินค้า Marketplace" },
  { value: "caption",         label: "เขียน Caption" },
  { value: "hashtag",         label: "หา Hashtag" },
  { value: "campaign_plan",   label: "วางแผนแคมเปญ" },
  { value: "approval",        label: "งานอนุมัติ" },
  { value: "other",           label: "อื่น ๆ" },
];

// ---- แพลตฟอร์ม ----
export const PLATFORMS: { value: string; label: string }[] = [
  { value: "shopee",    label: "Shopee" },
  { value: "lazada",    label: "Lazada" },
  { value: "website",   label: "Website" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok",    label: "TikTok" },
  { value: "facebook",  label: "Facebook" },
  { value: "line_oa",   label: "LINE OA" },
  { value: "youtube",   label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "x",         label: "X" },
];

// ---- เส้นทางสถานะ (workflow) — from → สถานะปลายทางที่อนุญาต ----
export const TRANSITIONS: Record<CreativeStatus, CreativeStatus[]> = {
  backlog:     ["ready", "in_progress", "cancelled"],
  ready:       ["in_progress", "cancelled"],
  in_progress: ["need_review", "blocked", "cancelled"],
  need_review: ["approved", "revision", "cancelled"],
  revision:    ["in_progress", "cancelled"],
  approved:    ["scheduled", "published", "done"],
  scheduled:   ["published", "done"],
  published:   ["done"],
  blocked:     ["in_progress", "cancelled"],
  done:        ["in_progress"],
  cancelled:   ["backlog"],
};

/** ปุ่ม action ที่เด่น ๆ ต่อสถานะ (ใช้ใน Queue/Kanban) */
export const PRIMARY_ACTIONS: Record<CreativeStatus, { to: CreativeStatus; label: string }[]> = {
  backlog:     [{ to: "in_progress", label: "▶ เริ่มงาน" }],
  ready:       [{ to: "in_progress", label: "▶ เริ่มงาน" }],
  in_progress: [{ to: "need_review", label: "📤 ส่งตรวจ" }, { to: "blocked", label: "⚠ ติดปัญหา" }],
  need_review: [{ to: "approved", label: "✓ อนุมัติ" }, { to: "revision", label: "↩ ตีกลับแก้" }],
  revision:    [{ to: "in_progress", label: "▶ แก้ต่อ" }],
  approved:    [{ to: "published", label: "🚀 เผยแพร่" }, { to: "scheduled", label: "🗓 ตั้งเวลา" }],
  scheduled:   [{ to: "published", label: "🚀 เผยแพร่" }],
  published:   [{ to: "done", label: "✓ ปิดงาน" }],
  blocked:     [{ to: "in_progress", label: "▶ ทำต่อ" }],
  done:        [{ to: "in_progress", label: "↩ เปิดใหม่" }],
  cancelled:   [{ to: "backlog", label: "↩ เปิดใหม่" }],
};

/** ความคืบหน้าอัตโนมัติตามสถานะ (Option 2 ในสเปค — แก้เองทับได้) */
export const STATUS_PROGRESS: Record<CreativeStatus, number> = {
  backlog: 0, ready: 5, in_progress: 30, need_review: 70, revision: 50,
  approved: 85, scheduled: 90, published: 95, done: 100, blocked: 30, cancelled: 0,
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS as Record<string, string[]>)[from]?.includes(to) ?? false;
}

export const ALL_STATUSES = Object.keys(STATUS_META) as CreativeStatus[];

// ============================================================
// Content / Social module
// ============================================================
export type ContentStatus = "draft" | "ready" | "scheduled" | "published" | "cancelled";

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; label_en: string; cls: string; dot: string }> = {
  draft:     { label: "ร่าง",        label_en: "Draft",     cls: "bg-slate-50 text-slate-600 border-slate-200",      dot: "bg-slate-400" },
  ready:     { label: "พร้อมโพสต์",   label_en: "Ready",     cls: "bg-sky-50 text-sky-700 border-sky-200",            dot: "bg-sky-500" },
  scheduled: { label: "ตั้งเวลาแล้ว", label_en: "Scheduled", cls: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  published: { label: "โพสต์แล้ว",    label_en: "Published", cls: "bg-emerald-50 text-emerald-700 border-emerald-200",dot: "bg-emerald-500" },
  cancelled: { label: "ยกเลิก",      label_en: "Cancelled", cls: "bg-slate-100 text-slate-400 border-slate-200",     dot: "bg-slate-300" },
};
export const contentStatusLabel = (k: ContentStatus) => { const m = CONTENT_STATUS_META[k]; return m ? tr(m.label, m.label_en) : k; };

export const POST_TYPES: { value: string; label: string; label_en: string }[] = [
  { value: "image",  label: "รูปภาพ",    label_en: "Image" },
  { value: "album",  label: "อัลบั้มรูป", label_en: "Album" },
  { value: "video",  label: "วิดีโอ",    label_en: "Video" },
  { value: "reel",   label: "Reel/Short", label_en: "Reel/Short" },
  { value: "story",  label: "Story",      label_en: "Story" },
  { value: "live",   label: "ไลฟ์",      label_en: "Live" },
];
export const postTypeLabel = (v?: string | null) => { const o = POST_TYPES.find((x) => x.value === v); return o ? tr(o.label, o.label_en) : (v ?? ""); };

export const HASHTAG_CATEGORIES: { value: string; label: string; label_en: string }[] = [
  { value: "brand",    label: "แบรนด์",        label_en: "Brand" },
  { value: "product",  label: "สินค้า",        label_en: "Product" },
  { value: "campaign", label: "แคมเปญ",        label_en: "Campaign" },
  { value: "seasonal", label: "ตามฤดู/เทศกาล", label_en: "Seasonal" },
  { value: "platform", label: "แพลตฟอร์ม",     label_en: "Platform" },
  { value: "trend",    label: "เทรนด์",        label_en: "Trend" },
  { value: "general",  label: "ทั่วไป",        label_en: "General" },
];

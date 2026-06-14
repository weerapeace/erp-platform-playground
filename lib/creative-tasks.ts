// ============================================================
// Creative Task Manager — ค่าคงที่กลาง (pure, ใช้ได้ทั้ง client + server)
// ห้าม import server-only ในไฟล์นี้ (UI หยิบไปใช้ทำป้ายสี/ปุ่มเปลี่ยนสถานะ)
// ตารางจริง: erp_creative_tasks / _campaigns / _subtasks / _comments / _attachments
// ============================================================

export type CreativeStatus =
  | "backlog" | "ready" | "in_progress" | "need_review" | "revision"
  | "approved" | "scheduled" | "published" | "done" | "blocked" | "cancelled";

export type CreativePriority = "urgent" | "high" | "normal" | "low";
export type ApprovalStatus = "none" | "pending" | "approved" | "rejected" | "revision";
export type AssetStatus = "missing" | "draft" | "final" | "approved";
export type SubtaskStatus = "todo" | "doing" | "done";

// ---- ป้ายสถานะงาน (label ไทย + คลาส Tailwind) ----
export const STATUS_META: Record<CreativeStatus, { label: string; cls: string; dot: string }> = {
  backlog:     { label: "รอคิว",        cls: "bg-slate-50 text-slate-600 border-slate-200",     dot: "bg-slate-400" },
  ready:       { label: "พร้อมทำ",      cls: "bg-sky-50 text-sky-700 border-sky-200",           dot: "bg-sky-500" },
  in_progress: { label: "กำลังทำ",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200",  dot: "bg-indigo-500" },
  need_review: { label: "รอตรวจ",       cls: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  revision:    { label: "ต้องแก้",      cls: "bg-orange-50 text-orange-700 border-orange-200",   dot: "bg-orange-500" },
  approved:    { label: "อนุมัติแล้ว",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200",dot: "bg-emerald-500" },
  scheduled:   { label: "ตั้งเวลาโพสต์", cls: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  published:   { label: "เผยแพร่แล้ว",  cls: "bg-teal-50 text-teal-700 border-teal-200",         dot: "bg-teal-500" },
  done:        { label: "เสร็จ",        cls: "bg-green-50 text-green-700 border-green-200",      dot: "bg-green-500" },
  blocked:     { label: "ติดปัญหา",     cls: "bg-red-50 text-red-700 border-red-200",            dot: "bg-red-500" },
  cancelled:   { label: "ยกเลิก",       cls: "bg-slate-100 text-slate-400 border-slate-200",     dot: "bg-slate-300" },
};

export const PRIORITY_META: Record<CreativePriority, { label: string; cls: string }> = {
  urgent: { label: "ด่วนมาก", cls: "bg-red-50 text-red-700 border-red-200" },
  high:   { label: "ด่วน",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
  normal: { label: "ปกติ",    cls: "bg-slate-50 text-slate-600 border-slate-200" },
  low:    { label: "ต่ำ",     cls: "bg-slate-50 text-slate-400 border-slate-200" },
};

/** ลำดับความสำคัญ → ใช้เรียงงานในคิว (เลขน้อย = สำคัญกว่า) */
export const PRIORITY_RANK: Record<CreativePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const APPROVAL_META: Record<ApprovalStatus, { label: string; cls: string }> = {
  none:     { label: "—",        cls: "bg-slate-50 text-slate-400 border-slate-200" },
  pending:  { label: "รออนุมัติ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "อนุมัติ",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "ไม่ผ่าน",   cls: "bg-red-50 text-red-700 border-red-200" },
  revision: { label: "ให้แก้",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
};

export const ASSET_META: Record<AssetStatus, { label: string; cls: string }> = {
  missing:  { label: "ยังไม่มีไฟล์", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  draft:    { label: "ร่าง",         cls: "bg-sky-50 text-sky-700 border-sky-200" },
  final:    { label: "ไฟล์จริง",     cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  approved: { label: "อนุมัติไฟล์",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

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

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; cls: string; dot: string }> = {
  draft:     { label: "ร่าง",        cls: "bg-slate-50 text-slate-600 border-slate-200",      dot: "bg-slate-400" },
  ready:     { label: "พร้อมโพสต์",   cls: "bg-sky-50 text-sky-700 border-sky-200",            dot: "bg-sky-500" },
  scheduled: { label: "ตั้งเวลาแล้ว", cls: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  published: { label: "โพสต์แล้ว",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",dot: "bg-emerald-500" },
  cancelled: { label: "ยกเลิก",      cls: "bg-slate-100 text-slate-400 border-slate-200",     dot: "bg-slate-300" },
};

export const POST_TYPES: { value: string; label: string }[] = [
  { value: "image",  label: "รูปภาพ" },
  { value: "album",  label: "อัลบั้มรูป" },
  { value: "video",  label: "วิดีโอ" },
  { value: "reel",   label: "Reel/Short" },
  { value: "story",  label: "Story" },
  { value: "live",   label: "ไลฟ์" },
];

export const HASHTAG_CATEGORIES: { value: string; label: string }[] = [
  { value: "brand",    label: "แบรนด์" },
  { value: "product",  label: "สินค้า" },
  { value: "campaign", label: "แคมเปญ" },
  { value: "seasonal", label: "ตามฤดู/เทศกาล" },
  { value: "platform", label: "แพลตฟอร์ม" },
  { value: "trend",    label: "เทรนด์" },
  { value: "general",  label: "ทั่วไป" },
];

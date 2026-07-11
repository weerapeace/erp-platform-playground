// Loan & OD Playground — status configs (mock)
// แยกสถานะ 4 ชั้นตามสเปกข้อ 2.4: lifecycle / drawdown / repayment health / accounting
// ไฟล์นี้เป็น config ล้วน (ไม่มี JSX) — badge เรนเดอร์ที่ view ด้วย toneClass()

export type StatusTone =
  | "neutral" | "info" | "warning" | "success" | "danger" | "purple" | "muted";

export type StatusMeta = { label: string; icon: string; tone: StatusTone };

// tone → tailwind classes (ป้ายสถานะกลาง) ตาม CLAUDE.md §10
export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  info:    "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  danger:  "bg-red-50 text-red-700 border-red-200",
  purple:  "bg-purple-50 text-purple-700 border-purple-200",
  muted:   "bg-slate-50 text-slate-400 border-slate-200",
};

// ---------- Loan lifecycle ----------
export type LoanLifecycle =
  | "draft" | "pending_approval" | "approved" | "active"
  | "closing_review" | "closed" | "cancelled" | "restructuring";

export const LOAN_LIFECYCLE: Record<LoanLifecycle, StatusMeta> = {
  draft:            { label: "ร่าง",          icon: "📝", tone: "neutral" },
  pending_approval: { label: "รออนุมัติ",      icon: "⏳", tone: "warning" },
  approved:         { label: "อนุมัติแล้ว",     icon: "✅", tone: "info" },
  active:           { label: "ใช้งานอยู่",      icon: "🟢", tone: "success" },
  closing_review:   { label: "กำลังตรวจปิด",   icon: "🔍", tone: "purple" },
  closed:           { label: "ปิดสัญญาแล้ว",    icon: "🔒", tone: "muted" },
  cancelled:        { label: "ยกเลิก",         icon: "🚫", tone: "danger" },
  restructuring:    { label: "ปรับโครงสร้าง",   icon: "🔧", tone: "purple" },
};

// ---------- Drawdown status (ระดับการเบิกวงเงิน) ----------
export type DrawdownStatus = "not_drawn" | "partially_drawn" | "fully_drawn";
export const DRAWDOWN_STATUS: Record<DrawdownStatus, StatusMeta> = {
  not_drawn:       { label: "ยังไม่เบิก",   icon: "○", tone: "neutral" },
  partially_drawn: { label: "เบิกบางส่วน",  icon: "◐", tone: "info" },
  fully_drawn:     { label: "เบิกเต็มวงเงิน", icon: "●", tone: "success" },
};

// ---------- Repayment health (สุขภาพการชำระ) ----------
export type RepaymentHealth = "current" | "due" | "overdue" | "defaulted";
export const REPAYMENT_HEALTH: Record<RepaymentHealth, StatusMeta> = {
  current:   { label: "ปกติ",       icon: "😊", tone: "success" },
  due:       { label: "ใกล้ครบกำหนด", icon: "🔔", tone: "warning" },
  overdue:   { label: "เกินกำหนด",    icon: "⚠️", tone: "danger" },
  defaulted: { label: "ผิดนัดชำระ",   icon: "🛑", tone: "danger" },
};

// ---------- Accounting status (พร้อมส่งบัญชี) ----------
export type AccountingStatus = "not_ready" | "ready" | "exported" | "error";
export const ACCOUNTING_STATUS: Record<AccountingStatus, StatusMeta> = {
  not_ready: { label: "ยังไม่พร้อมส่ง", icon: "…",  tone: "neutral" },
  ready:     { label: "พร้อมส่งบัญชี",   icon: "📤", tone: "info" },
  exported:  { label: "ส่งบัญชีแล้ว",    icon: "✓",  tone: "success" },
  error:     { label: "ส่งไม่สำเร็จ",    icon: "✕",  tone: "danger" },
};

// ---------- Payment workflow ----------
export type PaymentStatus = "draft" | "submitted" | "verified" | "cancelled" | "reversed";
export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  draft:     { label: "ร่าง",       icon: "📝", tone: "neutral" },
  submitted: { label: "ส่งตรวจสอบ",  icon: "📨", tone: "warning" },
  verified:  { label: "ยืนยันแล้ว",  icon: "✅", tone: "success" },
  cancelled: { label: "ยกเลิก",     icon: "🚫", tone: "muted" },
  reversed:  { label: "กลับรายการ",  icon: "↩️", tone: "purple" },
};

// ---------- OD lifecycle ----------
export type ODLifecycle =
  | "draft" | "pending_approval" | "active" | "suspended"
  | "expired" | "closing_review" | "closed";
export const OD_LIFECYCLE: Record<ODLifecycle, StatusMeta> = {
  draft:            { label: "ร่าง",         icon: "📝", tone: "neutral" },
  pending_approval: { label: "รออนุมัติ",     icon: "⏳", tone: "warning" },
  active:           { label: "ใช้งานอยู่",    icon: "🟢", tone: "success" },
  suspended:        { label: "ระงับชั่วคราว", icon: "⏸️", tone: "warning" },
  expired:          { label: "หมดอายุ",      icon: "⌛", tone: "danger" },
  closing_review:   { label: "กำลังตรวจปิด",  icon: "🔍", tone: "purple" },
  closed:           { label: "ปิดวงเงินแล้ว",  icon: "🔒", tone: "muted" },
};

// utilization → tone (แถบใช้วงเงิน OD)
export function utilizationTone(percent: number): StatusTone {
  if (percent >= 100) return "danger";
  if (percent >= 85) return "danger";
  if (percent >= 70) return "warning";
  if (percent >= 50) return "info";
  return "success";
}

export function toneClass(tone: StatusTone): string {
  return TONE_CLASS[tone];
}

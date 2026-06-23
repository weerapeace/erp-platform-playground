/**
 * ของกลาง — ทะเบียนสถานะ (status) แหล่งเดียว ใช้ร่วมกันทั้ง
 *   - StatusBadge (ป้ายในตาราง/รายละเอียด)  → components/data-table
 *   - StatusCards (การ์ดสรุปด้านบน list)     → components/master-crud
 * เดิมแยกเป็น 2 ชุด (STATUS_CONFIG / STATUS_META) ทำให้ป้ายขัดกันเอง (เช่น waiting)
 *
 * รองรับ "ป้ายรายโมดูล": ตั้งค่าทับเฉพาะโมดูลได้ที่ MODULE_STATUS_OVERRIDES
 * โดยไม่กระทบโมดูลอื่น (เช่น บางโมดูล waiting = "รอสั่งซื้อ" แทน "รออนุมัติ")
 *
 * ⚠️ Tailwind ต้องเห็นชื่อคลาสเป็น "ข้อความตรง ๆ" ในไฟล์ → เก็บเป็น literal ใน FAM
 *    (ห้ามประกอบสตริงแบบ `bg-${color}-50` ไม่งั้นคลาสจะถูก purge หาย)
 */

export type StatusStyle = {
  label:  string;
  bg:     string;   // ป้าย: พื้นหลัง / การ์ด: พื้นหลัง
  text:   string;   // สีตัวอักษร
  border: string;   // ป้าย: เส้นขอบ
  ring:   string;   // การ์ด: เส้นขอบเมื่อเลือก
  dot:    string;   // การ์ด: จุดสีนำหน้า
};

// ชุดสีมาตรฐาน (literal — Tailwind safe)
const FAM = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", ring: "ring-emerald-300", dot: "bg-emerald-500" },
  slate:   { bg: "bg-slate-100",  text: "text-slate-600",   border: "border-slate-200",   ring: "ring-slate-300",   dot: "bg-slate-400" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   ring: "ring-amber-300",   dot: "bg-amber-500" },
  red:     { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     ring: "ring-red-300",     dot: "bg-red-500" },
  blue:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    ring: "ring-blue-300",    dot: "bg-blue-500" },
  purple:  { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  ring: "ring-purple-300",  dot: "bg-purple-500" },
} as const;

const S = (label: string, fam: keyof typeof FAM): StatusStyle => ({ label, ...FAM[fam] });

/** ป้าย/สี เริ่มต้น (ยึดตาม StatusBadge เดิม เพื่อไม่ให้ป้ายในตารางเปลี่ยน) */
export const DEFAULT_STATUSES: Record<string, StatusStyle> = {
  // ทั่วไป
  active:           S("Active", "emerald"),
  inactive:         S("Inactive", "slate"),
  draft:            S("ร่าง", "slate"),
  submitted:        S("รออนุมัติ", "amber"),
  waiting_approval: S("รอ Approve", "amber"),
  pending:          S("รอดำเนินการ", "amber"),
  approved:         S("อนุมัติแล้ว", "emerald"),
  rejected:         S("ไม่อนุมัติ", "red"),
  cancelled:        S("ยกเลิก", "red"),
  low_stock:        S("Low Stock", "amber"),
  completed:        S("เสร็จสิ้น", "purple"),
  done:             S("เสร็จสิ้น", "emerald"),
  // จัดซื้อ v2 (purchasing)
  waiting:          S("รออนุมัติ", "amber"),
  rfq_created:      S("ออกใบสั่งซื้อแล้ว", "blue"),
  confirmed:        S("ยืนยันแล้ว", "blue"),
  partial:          S("รับบางส่วน", "amber"),
  received:         S("รับของแล้ว", "emerald"),
  short_closed:     S("ปิดยอดขาด", "slate"),
};

const NEUTRAL: StatusStyle = { label: "", ...FAM.slate };

/**
 * ตั้งค่าป้าย/สี "ทับเฉพาะโมดูล" — key นอกสุด = moduleKey (เช่น "purchase-orders-v2")
 * ใส่เฉพาะ field ที่อยากเปลี่ยน (เช่น { label: "รอสั่งซื้อ" }) ที่เหลือใช้ค่า default
 * ตัวอย่าง:
 *   "purchase-orders-v2": { waiting: { label: "รอสั่งซื้อ" } },
 */
export const MODULE_STATUS_OVERRIDES: Record<string, Record<string, Partial<StatusStyle>>> = {
  // (ยังไม่มี override — โมดูลทั้งหมดใช้ป้ายมาตรฐานเดียวกัน)
};

/** ดึงป้าย/สีของสถานะ — ระบุ moduleKey เพื่อใช้ override รายโมดูล (ถ้ามี) */
export function getStatusStyle(code: string, moduleKey?: string): StatusStyle {
  const base = DEFAULT_STATUSES[code] ?? { ...NEUTRAL, label: code };
  const ov = moduleKey ? MODULE_STATUS_OVERRIDES[moduleKey]?.[code] : undefined;
  return ov ? { ...base, ...ov } : base;
}

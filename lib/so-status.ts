/**
 * ของกลาง — สถานะใบขาย (SO): ป้ายไทย + สี + กลุ่มสถานะ
 *
 * ใช้ทุกที่ที่ต้องแสดง/คิดยอดตามสถานะ SO (ตารางใบขาย · แดชบอร์ดขาย · รายงานรายเดือน)
 * เพิ่ม/แก้ชื่อสถานะที่นี่ที่เดียว ทุกหน้าจะเปลี่ยนตาม — ห้าม hardcode map ซ้ำในหน้า
 */

export type SoStatus =
  | "draft" | "confirmed" | "in_production" | "ready" | "shipped" | "completed" | "cancelled";

export const SO_STATUS: Record<string, { label: string; color: string }> = {
  draft:         { label: "ร่าง",       color: "#888780" },
  confirmed:     { label: "ยืนยันแล้ว", color: "#378ADD" },
  in_production: { label: "กำลังผลิต",  color: "#EF9F27" },
  ready:         { label: "พร้อมส่ง",   color: "#3FB6A8" },
  shipped:       { label: "จัดส่งแล้ว", color: "#1D9E75" },
  completed:     { label: "เสร็จสิ้น",  color: "#639922" },
  cancelled:     { label: "ยกเลิก",     color: "#DC2626" },
};

/** ลำดับการแสดงผล (ตาม workflow) */
export const SO_STATUS_ORDER: SoStatus[] =
  ["draft", "confirmed", "in_production", "ready", "shipped", "completed", "cancelled"];

export const soStatusLabel = (s: string | null | undefined) => SO_STATUS[s ?? ""]?.label ?? s ?? "—";
export const soStatusColor = (s: string | null | undefined) => SO_STATUS[s ?? ""]?.color ?? "#94a3b8";

/** สถานะที่ถือว่า "ขายจริงแล้ว" (ยืนยันขึ้นไป) — ใช้ตอนคิดยอดขาย ไม่นับร่าง/ยกเลิก */
export const SO_ACTIVE_STATUSES: SoStatus[] =
  ["confirmed", "in_production", "ready", "shipped", "completed"];

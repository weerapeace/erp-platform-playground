// ============================================================
// Dashboard Systems — จับคู่ "แจ้งเตือน (event_type) → ระบบ (app_key)"
// ใช้โดยแดชบอร์ดรวมทุกระบบ (/dashboard) — จัดกลุ่มแจ้งเตือนเป็นการ์ดต่อระบบ
// "ระบบ" = แอปใน erp_app_groups (key) → การ์ดใช้ไอคอน/ชื่อ/สิทธิ์ของแอปนั้น
// ============================================================

// event_type → app_key (ระบบที่แจ้งเตือนนี้สังกัด)
export const EVENT_SYSTEM: Record<string, string> = {
  // จัดซื้อ
  "pr_created": "purchasing", "pr.submitted": "purchasing", "pr.approved": "purchasing",
  "pr.rejected": "purchasing", "pr.cancelled": "purchasing",
  // จัดการงาน / ออกแบบ (Creative)
  "task_overdue": "tasks", "task_due_soon": "tasks", "task_assigned": "tasks",
  "task_approve": "tasks", "task_need_review": "tasks", "task_revise": "tasks", "task_mention": "tasks",
  "subtask_assigned": "tasks", "subtask_submitted": "tasks", "subtask_self_join": "tasks",
  // QC
  "qc.pending": "qc", "qc.defect": "qc",
  // ขาย
  "so.confirm": "sales",
  // การเงิน / Subscription
  "subscription.renewal_soon": "subscriptions",
  // อื่น ๆ
  "gif_poke": "misc",
  "security.new_device": "settings",
};

// ป้ายชื่อ event (ภาษาคน) — ใช้ในหน้าตั้งค่าระบบ (เลือกว่าจะแสดงแจ้งเตือนไหน)
export const EVENT_LABEL: Record<string, string> = {
  "pr_created": "ใบขอซื้อใหม่", "pr.submitted": "ส่งใบขอซื้อ", "pr.approved": "อนุมัติใบขอซื้อ",
  "pr.rejected": "ปฏิเสธใบขอซื้อ", "pr.cancelled": "ยกเลิกใบขอซื้อ",
  "task_overdue": "งานเกินกำหนด", "task_due_soon": "งานใกล้ครบกำหนด", "task_assigned": "ได้รับมอบหมายงาน",
  "task_approve": "งานรออนุมัติ", "task_need_review": "งานรอตรวจ", "task_revise": "งานให้แก้ไข", "task_mention": "ถูกกล่าวถึง",
  "subtask_assigned": "ได้รับงานย่อย", "subtask_submitted": "งานย่อยรอตรวจ", "subtask_self_join": "ขอเข้าร่วมงานย่อย",
  "qc.pending": "รอ QC", "qc.defect": "พบของเสีย",
  "so.confirm": "ใบขายรอยืนยัน",
  "subscription.renewal_soon": "ใกล้ต่ออายุ",
  "gif_poke": "ถูกจิ้ม (GIF)",
  "security.new_device": "เข้าจากอุปกรณ์ใหม่",
};

export const eventLabel = (t: string) => EVENT_LABEL[t] ?? t;
export const systemForEvent = (t: string): string => EVENT_SYSTEM[t] ?? "misc";

// สีประจำระบบ (ใช้ในปฏิทิน + จุดสถานะการ์ด) — ต่อ app_key
export const SYSTEM_COLOR: Record<string, string> = {
  purchasing: "#378ADD", tasks: "#7F77DD", design: "#7F77DD", qc: "#1D9E75",
  sales: "#D85A30", production: "#BA7517", dispatch: "#BA7517",
  subscriptions: "#D4537E", "loan-od": "#D4537E", inventory: "#0F6E56",
  marketing: "#185FA5", payroll: "#639922", marketplace: "#185FA5",
  "china-pay": "#993C1D", settings: "#5F5E5A", misc: "#888780", master: "#0F6E56",
};
export const colorForSystem = (appKey: string): string => SYSTEM_COLOR[appKey] ?? "#888780";

// รายการ event ทั้งหมดของแต่ละระบบ (สำหรับหน้าตั้งค่า) — reverse ของ EVENT_SYSTEM
export function eventsForSystem(appKey: string): string[] {
  return Object.keys(EVENT_SYSTEM).filter((e) => EVENT_SYSTEM[e] === appKey);
}

// ตั้งค่าการ์ดระบบ (จาก erp_dashboard_panels)
export type DashboardPanel = {
  app_key: string;
  hidden: boolean;
  enabled_events: string[] | null;   // null = ทุก event; รายการ = เฉพาะที่เลือก
  visible_roles: string[] | null;    // null = ใช้สิทธิ์แอปเดิม; รายการ = override
  sort_order: number | null;
};

// แจ้งเตือนนี้ควรแสดงบนการ์ดระบบไหม (ตามตั้งค่า enabled_events)
export function eventEnabled(panel: DashboardPanel | undefined, eventType: string): boolean {
  if (!panel || panel.enabled_events == null) return true;   // ไม่ตั้ง = แสดงทุก event
  return panel.enabled_events.includes(eventType);
}

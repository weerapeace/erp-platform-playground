// ============================================================
// Dashboard Widgets — หน้าแดชบอร์ดต่อตำแหน่ง (role) — เฟส 3 ของ Role Board
// widget เสริมด้านบน main content: เปิด/ปิด + เรียงลำดับ + มุมมองเริ่มต้น (ต่อ role)
// เก็บใน erp_dashboard_layouts · ไม่มีแถว = ใช้ DEFAULT_LAYOUT (เหมือนเดิม)
// ============================================================

export type DashboardView = "systems" | "planner" | "calendar" | "list" | "executive";

export type DashboardLayout = {
  role_key: string;
  widgets: string[];          // widget เสริมที่เปิด (เรียงลำดับ)
  default_view: DashboardView;
};

// widget เสริมทั้งหมด (ด้านบน main content)
export const ALL_WIDGETS = [
  "goals", "focus", "plan", "kpi", "pinned", "recent", "agenda",
  "saleschart", "lowstock", "production", "finance", "activity", "team", "shortcuts",
] as const;
export type WidgetKey = (typeof ALL_WIDGETS)[number];

export const WIDGET_META: Record<WidgetKey, { label: string; icon: string; desc: string }> = {
  goals: { label: "การ์ดเป้าหมาย", icon: "🎯", desc: "ทางเข้าแอปเป้าหมาย/เก็บเงิน" },
  focus: { label: "โฟกัสวันนี้", icon: "⭐", desc: "5 งานที่ควรทำก่อน (เรียงตามความด่วน)" },
  plan: { label: "แผนวันนี้", icon: "🗒️", desc: "งานที่วางแผนไว้ว่าจะทำวันนี้ + ความคืบหน้า" },
  kpi: { label: "แถบ KPI ตัวเลขจริง", icon: "🔢", desc: "สรุปงานค้าง + เลขจริงรวมทุกระบบ" },
  pinned: { label: "งานปักหมุด", icon: "📌", desc: "งานที่ปักหมุดไว้" },
  recent: { label: "แจ้งเตือนล่าสุด", icon: "🔔", desc: "แจ้งเตือนใหม่ล่าสุด" },
  agenda: { label: "ครบกำหนดสัปดาห์นี้", icon: "📅", desc: "งานมีกำหนดส่งใน 7 วัน" },
  saleschart: { label: "กราฟยอดขาย", icon: "📈", desc: "ยอดขายรวม 14 วันล่าสุด" },
  lowstock: { label: "สต๊อกใกล้หมด", icon: "📦", desc: "สินค้าต่ำกว่าขั้นต่ำ" },
  production: { label: "สถานะผลิต", icon: "🏭", desc: "งานผลิตที่ยังไม่เสร็จ" },
  finance: { label: "การเงินสรุป", icon: "💰", desc: "ต่ออายุ/รายการการเงินใกล้ถึง" },
  activity: { label: "กิจกรรมล่าสุด", icon: "🕐", desc: "ใครทำอะไรล่าสุด (audit)" },
  team: { label: "ภาพรวมทีม", icon: "👥", desc: "งานค้างต่อคนในทีม" },
  shortcuts: { label: "ทางลัดแอป", icon: "⚡", desc: "ปุ่มลัดไปแอปที่เข้าได้" },
};

// ค่าเริ่มต้น (ไม่มี layout ต่อ role) — เท่าพฤติกรรมเดิม: goals + focus ด้านบน, เปิดโหมดการ์ดระบบ
export const DEFAULT_LAYOUT: { widgets: string[]; default_view: DashboardView } = {
  widgets: ["goals", "focus"],
  default_view: "systems",
};

export function layoutForRole(layouts: DashboardLayout[], role: string | undefined | null): { widgets: string[]; default_view: DashboardView } {
  const l = layouts.find((x) => x.role_key === role);
  return l ? { widgets: l.widgets ?? [], default_view: l.default_view ?? "systems" } : DEFAULT_LAYOUT;
}

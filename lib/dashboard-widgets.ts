// ============================================================
// Dashboard Widgets — หน้าแดชบอร์ดต่อตำแหน่ง (role) — เฟส 3 ของ Role Board
// widget เสริมด้านบน main content: เปิด/ปิด + เรียงลำดับ + มุมมองเริ่มต้น (ต่อ role)
// เก็บใน erp_dashboard_layouts · ไม่มีแถว = ใช้ DEFAULT_LAYOUT (เหมือนเดิม)
// ============================================================

export type DashboardView = "systems" | "calendar" | "list";

export type DashboardLayout = {
  role_key: string;
  widgets: string[];          // widget เสริมที่เปิด (เรียงลำดับ)
  default_view: DashboardView;
};

// widget เสริมทั้งหมด (ด้านบน main content)
export const ALL_WIDGETS = ["goals", "focus", "kpi"] as const;
export type WidgetKey = (typeof ALL_WIDGETS)[number];

export const WIDGET_META: Record<WidgetKey, { label: string; icon: string; desc: string }> = {
  goals: { label: "การ์ดเป้าหมาย", icon: "🎯", desc: "ทางเข้าแอปเป้าหมาย/เก็บเงิน" },
  focus: { label: "โฟกัสวันนี้", icon: "⭐", desc: "5 งานที่ควรทำก่อน (เรียงตามความด่วน)" },
  kpi: { label: "แถบ KPI ตัวเลขจริง", icon: "🔢", desc: "สรุปงานค้าง + เลขจริงรวมทุกระบบ" },
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { useRouter } from "next/navigation";

/**
 * ShellPresentContext — บอกลูกหลานว่า "มี PlaygroundShell ครอบอยู่แล้ว"
 * ใช้โดย MasterCRUDPage/MasterPage เพื่อไม่เรนเดอร์ shell ซ้อน
 * เมื่อหน้าอยู่ใต้ layout ร่วม (app/master/layout.tsx, app/m/layout.tsx)
 * → sidebar อยู่นิ่ง ไม่ remount ตอนเปลี่ยนเมนู (ไม่เด้งขึ้นบนสุด)
 */
export const ShellPresentContext = createContext(false);
export const useShellPresent = () => useContext(ShellPresentContext);
import { useAuth, roleLabel, roleColor, AccessDenied } from "@/components/auth";
import { NotificationBell } from "@/components/notification-bell";
import { LangToggle, useT } from "@/components/i18n";
import { LangSync } from "@/components/lang-sync";
import { GlobalSearch } from "@/components/global-search";
import { Logo, BRAND } from "@/components/brand";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts";
import { cachedGetJson } from "@/lib/shell-cache";

// โมดูลที่เปิดเป็น "แอปแยก" (แท็บใหม่ + หน้าโฟกัสเต็ม ใช้ StandaloneShell)
// เพิ่ม href ที่นี่เพื่อให้เมนูเปิดแท็บใหม่ + มีไอคอน ↗
export const STANDALONE_HREFS = new Set<string>(["/tasks"]);

// Sidebar structure ใหม่ — รวมตามการใช้งานจริง (ไม่ใช่ phase dev)
// = "เมนู default" (fallback) ถ้าทะเบียนเมนูใน DB ว่าง/โหลดไม่ได้
export const navGroups = [
  {
    phase: 0,
    label: "หน้าหลัก",
    items: [
      { href: "/apps",      icon: "🏠", labelTH: "App Launcher" },
      { href: "/dashboard", icon: "📊", labelTH: "Dashboard" },
      { href: "/tasks",     icon: "✅", labelTH: "จัดการงาน (Task Manager) ⭐" },
    ],
  },
  {
    phase: 1,
    label: "Master Data ⭐",
    items: [
      { href: "/master/parent-skus", icon: "🧬", labelTH: "Parent SKUs" },
      { href: "/master/skus",        icon: "🏷️", labelTH: "SKUs" },
      { href: "/master/brands",      icon: "🎨", labelTH: "แบรนด์ & ช่างเหมา" },
      { href: "/master/partners",    icon: "🤝", labelTH: "Partners (ลูกค้า/ซัพ)" },
      { href: "/master/customers",   icon: "🧑‍💼", labelTH: "ลูกค้า (Customers)" },
      { href: "/master/suppliers",   icon: "🏢", labelTH: "ผู้ขาย (Suppliers)" },
      { href: "/master/material-groups",   icon: "🧶", labelTH: "กลุ่มวัตถุดิบ (BOM)" },
      { href: "/master/material-slots",    icon: "🧩", labelTH: "Material Slots" },
      { href: "/master/material-families", icon: "🧵", labelTH: "Material Families" },
      { href: "/master/uoms",              icon: "📏", labelTH: "Units (UoM)" },
      { href: "/master/uom-conversions",   icon: "🔄", labelTH: "UoM Conversions" },
      { href: "/master/supplier-items",    icon: "🏷️", labelTH: "Supplier Items" },
      { href: "/master/customer-products", icon: "🧑‍💼", labelTH: "Customer Products" },
      { href: "/master/marketplace-skus",  icon: "🛒", labelTH: "Marketplace SKU Map" },
      { href: "/admin/customers",    icon: "🧑‍💼", labelTH: "ลูกค้า (legacy)" },
      { href: "/admin/suppliers",    icon: "🏢", labelTH: "ผู้จำหน่าย (legacy)" },
      { href: "/admin/employees",    icon: "🪪", labelTH: "พนักงาน" },
      { href: "/admin/warehouses",   icon: "🏭", labelTH: "คลังสินค้า" },
      { href: "/admin/departments",  icon: "🗃️", labelTH: "แผนก" },
      { href: "/admin/units",        icon: "📏", labelTH: "หน่วยนับ" },
      { href: "/admin/taxes",        icon: "💰", labelTH: "ภาษี" },
    ],
  },
  {
    phase: 1,
    label: "💰 Payroll (HR) ⭐",
    items: [
      { href: "/payroll/dashboard", icon: "📊", labelTH: "ภาพรวมเงินเดือน" },
      { href: "/payroll/employees", icon: "🪪", labelTH: "พนักงาน (Payroll)" },
      { href: "/payroll/contracts", icon: "📄", labelTH: "สัญญาจ้าง (Payroll)" },
      { href: "/payroll/periods",   icon: "🗓️", labelTH: "งวดเงินเดือน" },
      { href: "/payroll/review",    icon: "✅", labelTH: "ตรวจสอบเงินเดือน" },
      { href: "/payroll/calc-verify", icon: "🧮", labelTH: "เทียบยอดคำนวณ" },
      { href: "/payroll/calc-run", icon: "▶️", labelTH: "คำนวณงวด (พรีวิว)" },
      { href: "/payroll/payslips",  icon: "🧾", labelTH: "สลิปเงินเดือน" },
      { href: "/payroll/payments",  icon: "🏦", labelTH: "รอบจ่ายเงิน" },
      { href: "/payroll/attendance", icon: "⏰", labelTH: "เวลาเข้าออก" },
      { href: "/payroll/recurring", icon: "🔁", labelTH: "เงินประจำ" },
      { href: "/payroll/requests",  icon: "📨", labelTH: "คำขอพนักงาน" },
      { href: "/payroll/departments", icon: "🗂️", labelTH: "แผนก (Payroll)" },
      { href: "/payroll/companies", icon: "🏢", labelTH: "บริษัท (Payroll)" },
      { href: "/payroll/work-time-profiles", icon: "🕐", labelTH: "โปรไฟล์เวลาทำงาน" },
      { href: "/payroll/employee-settings", icon: "⚙️", labelTH: "ตั้งค่าเงินเดือนรายคน" },
    ],
  },
  {
    phase: 2,
    label: "Operations",
    items: [
      { href: "/purchasing",         icon: "🛍️", labelTH: "ขอซื้อ (ช้อปปิ้ง) ⭐" },
      { href: "/m/purchase-requests-v2", icon: "📋", labelTH: "ใบขอซื้อ v2 (PR)" },
      { href: "/m/purchase-orders-v2", icon: "🧾", labelTH: "ใบสั่งซื้อ v2 (PO) ⭐" },
      { href: "/purchasing/receive", icon: "📥", labelTH: "รับสินค้าเข้า ⭐" },
      { href: "/m/goods-receipts-v2", icon: "📦", labelTH: "ใบรับสินค้า v2 (GR)" },
      { href: "/purchasing/receive-history", icon: "📜", labelTH: "ประวัติการรับสินค้า" },
      { href: "/inventory/sku-stock", icon: "📊", labelTH: "ยอดคงเหลือ SKU ⭐" },
      { href: "/m/product-groups",   icon: "🧺", labelTH: "Product Groups" },
      { href: "/m/product-variations", icon: "🎨", labelTH: "Product Variations" },
      { href: "/purchase-requests", icon: "📋", labelTH: "ใบขอซื้อ (PR) legacy" },
      { href: "/purchase-orders",   icon: "🛒", labelTH: "ใบสั่งซื้อ (PO)" },
      { href: "/quotations",        icon: "📄", labelTH: "ใบเสนอราคา (QT)" },
      { href: "/sales-orders",      icon: "🧾", labelTH: "ใบขาย (SO)" },
      { href: "/billing-notes",     icon: "📑", labelTH: "ใบวางบิล" },
      { href: "/master/carton-labels", icon: "🏷️", labelTH: "ใบปะหน้ากล่อง" },
      { href: "/inventory",         icon: "🗄️", labelTH: "คลังสินค้า/Stock" },
      { href: "/accounting",        icon: "📒", labelTH: "บัญชี (GL/งบทดลอง)" },
    ],
  },
  {
    phase: 2,
    label: "📦 Inventory (Phase 3)",
    items: [
      { href: "/master/stock-locations",   icon: "📍", labelTH: "Stock Locations" },
      { href: "/master/stock-lots",        icon: "🏷️", labelTH: "Stock Lots" },
      { href: "/master/stock-lpns",        icon: "📦", labelTH: "Stock LPN + QR" },
      { href: "/master/stock-counts",      icon: "🔢", labelTH: "Stock Count" },
      { href: "/master/stock-adjustments", icon: "⚖️", labelTH: "Stock Adjustments" },
    ],
  },
  {
    phase: 2,
    label: "📐 BOM & MRP (Phase 4,6)",
    items: [
      { href: "/master/bom-headers",           icon: "📐", labelTH: "BOM (สูตรผลิต)" },
      { href: "/master/bom-lines",             icon: "📋", labelTH: "BOM Lines" },
      { href: "/master/material-requirements", icon: "📊", labelTH: "MRP / ของขาด" },
    ],
  },
  {
    phase: 2,
    label: "🛒 Sales/Purchase v2 (Phase 5)",
    items: [
      // ซ่อนหน้าเดโม่งานขายที่ซ้ำซ้อน (ตารางเปล่า ไม่มี line/workflow) — ใช้ "ใบขาย (SO)" ตัวจริงแทน
      // ตาราง quotations / sales_orders ใน DB ยังคงอยู่ (ไม่ลบ) — แค่ซ่อนลิงก์
      // { href: "/master/quotations",      icon: "📄", labelTH: "Quotations" },
      // { href: "/master/sales-orders-v2", icon: "🧾", labelTH: "Sales Orders (v2)" },
      { href: "/master/goods-receipts",  icon: "📥", labelTH: "Goods Receipts" },
      { href: "/master/deliveries",      icon: "🚚", labelTH: "Deliveries" },
    ],
  },
  {
    phase: 2,
    label: "🏭 Production (Phase 7,8)",
    items: [
      { href: "/master/manufacturing-orders", icon: "🏭", labelTH: "Manufacturing Orders" },
      { href: "/master/work-submissions",      icon: "📤", labelTH: "ตารางส่งงาน" },
      { href: "/master/production-jobs",       icon: "🧰", labelTH: "Production Jobs" },
      { href: "/master/work-centers",          icon: "🏗️", labelTH: "Work Centers" },
      { href: "/master/routings",              icon: "🔀", labelTH: "Routings" },
      { href: "/master/pattern-versions",      icon: "🧷", labelTH: "Pattern Versions" },
      { href: "/master/cutting-jobs",          icon: "✂️", labelTH: "Cutting Jobs" },
    ],
  },
  {
    phase: 2,
    label: "✅ QC & Tasks (Phase 9)",
    items: [
      { href: "/master/qc-warehouse",   icon: "🏭", labelTH: "โกดัง QC (simulator)" },
      { href: "/master/qc-inspections", icon: "✅", labelTH: "QC Inspections" },
      { href: "/master/defect-logs",    icon: "⚠️", labelTH: "Defect Logs" },
      { href: "/master/rework-jobs",    icon: "🔧", labelTH: "Rework Jobs" },
      { href: "/master/task-templates", icon: "📝", labelTH: "Task Templates" },
    ],
  },
  {
    phase: 3,
    label: "⚙️ Settings",
    items: [
      // Governance
      { href: "/master/logic",            icon: "📚", labelTH: "Logic Registry (ทะเบียนกฎ)" },
      { href: "/admin/create-table",      icon: "➕", labelTH: "สร้างโมดูลใหม่" },
      // Schema + Field config (sprint 1+)
      { href: "/admin/schema-sync",       icon: "🗂️", labelTH: "Schema Sync + Field Registry" },
      { href: "/admin/lookups",           icon: "📚", labelTH: "Lookups (relation values)" },
      { href: "/admin/form-builder",      icon: "🧩", labelTH: "ออกแบบฟอร์ม" },
      { href: "/admin/table-layouts",     icon: "🎚️", labelTH: "Table Layouts" },
      { href: "/admin/saved-views",       icon: "📑", labelTH: "Saved Views" },
      // Permissions
      { href: "/admin/users",             icon: "👥", labelTH: "ผู้ใช้ระบบ" },
      { href: "/admin/roles-permissions", icon: "🔐", labelTH: "Roles & Permissions" },
      { href: "/admin/menu",              icon: "🧭", labelTH: "จัดการเมนู" },
      // Business rules
      { href: "/admin/workflows",         icon: "⚙️", labelTH: "Workflow" },
      { href: "/admin/approval-rules",    icon: "✋", labelTH: "กฎการอนุมัติ" },
      { href: "/admin/validation-rules",  icon: "✅", labelTH: "Validation Rules" },
      { href: "/admin/numbering",         icon: "🔢", labelTH: "เลขที่เอกสาร" },
      { href: "/admin/notification-rules", icon: "📨", labelTH: "Notification Rules" },
      { href: "/admin/report-templates",  icon: "🖨️", labelTH: "Report Templates" },
      // Tools
      { href: "/admin/plugins",           icon: "🔌", labelTH: "Plugins" },
      { href: "/admin/import",            icon: "📥", labelTH: "Import ข้อมูล" },
      { href: "/admin/audit-log",         icon: "📜", labelTH: "ประวัติการใช้งาน" },
    ],
  },
  // F21: ลบ section "🧪 Playground (Dev)" — ย้าย demo ไป app/_demos (ไม่ build)
  // เพื่อลด worker bundle → cold start เร็วขึ้น → กัน 1102 (Free plan CPU 10ms)
];

// แถวเมนูจากทะเบียน (DB) — ของกลาง
export type MenuRow = {
  id?: string; section: string; section_order: number; sort_order: number;
  icon: string | null; icon_url?: string | null; label: string; href: string;
  show_in_sidebar: boolean; show_in_launcher: boolean;
  permission_key: string | null; is_active: boolean;
  app_keys?: string[];   // โมดูลใหญ่ (App) ที่เมนูนี้สังกัด — many-to-many
  module_key?: string | null;   // โมดูลที่เมนูนี้ผูก (สำหรับหมวด ⚙ ตั้งค่า) — ตั้งที่ /admin/menu
};

// โมดูลใหญ่ (App) — tabs บนสุด
export type AppGroup = { id?: string; key: string; label: string; icon: string | null; icon_url?: string | null; sort_order: number; permission_key: string | null; is_active: boolean };

// หมวดเมนู (ไอคอน/ลำดับ ต่อแอป) — จาก /api/menu/sections
export type MenuSectionRow = { app_key: string; name: string; icon: string | null; icon_url: string | null; sort_order: number };
type SectionMeta = { icon: string | null; iconUrl: string | null; order: number };

// ไอคอนแอป (รูปอัปโหลด icon_url ก่อน → ไม่งั้น emoji) — ใช้ในแถบแท็บแอปด้านบน
function AppTabIcon({ icon, iconUrl }: { icon: string | null; iconUrl?: string | null }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(iconUrl)}&w=40`} alt="" className="w-[18px] h-[18px] rounded object-contain shrink-0" />;
  }
  return <span>{icon ?? "📦"}</span>;
}

// map section (default nav) → app key — สำหรับ "นำเข้าเมนูเริ่มต้น"
function sectionToApp(label: string): string {
  if (label === "หน้าหลัก") return "home";
  if (label.includes("Master Data")) return "master";
  if (label === "Operations") return "purchasing";
  if (label.includes("Inventory")) return "inventory";
  if (label.includes("BOM") || label.includes("Production") || label.includes("QC")) return "production";
  if (label.includes("Sales/Purchase")) return "sales";
  if (label.includes("Settings")) return "settings";
  return "home";
}

// แปลง navGroups (default) → แถวสำหรับ "นำเข้าเมนูเริ่มต้น" ลงทะเบียน
export const DEFAULT_MENU_ITEMS: MenuRow[] = navGroups.flatMap((g, gi) =>
  g.items.map((it, ii) => ({
    section: g.label,
    section_order: (gi + 1) * 10,
    sort_order: (ii + 1) * 10,
    icon: it.icon,
    label: it.labelTH,
    href: it.href,
    show_in_sidebar: true,
    show_in_launcher: g.phase !== 3,   // Settings ไม่ขึ้น launcher โดย default
    permission_key: null,
    is_active: true,
    app_keys: [sectionToApp(g.label)],
  })),
);

// จัด MenuRow[] (จากทะเบียน) → กลุ่มสำหรับ render sidebar
// ลำดับ + ไอคอนหมวด: ใช้ทะเบียนหมวด (secMeta ต่อแอป) ถ้ามี ไม่งั้น fallback section_order ของ item (ไม่มีไอคอน)
function groupMenuRows(rows: MenuRow[], secMeta?: Map<string, SectionMeta>): { label: string; icon?: string | null; iconUrl?: string | null; items: { href: string; icon: string; labelTH: string; permission?: string | null }[] }[] {
  const bySection = new Map<string, { order: number; items: MenuRow[] }>();
  for (const r of rows) {
    const meta = secMeta?.get(r.section);
    const g = bySection.get(r.section) ?? { order: meta?.order ?? r.section_order, items: [] };
    g.items.push(r); bySection.set(r.section, g);
  }
  return [...bySection.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, g]) => ({
      label,
      icon: secMeta?.get(label)?.icon ?? null,
      iconUrl: secMeta?.get(label)?.iconUrl ?? null,
      items: g.items.sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({ href: r.href, icon: r.icon ?? "•", labelTH: r.label, permission: r.permission_key })),
    }));
}

// route → App สำรอง: สำหรับหน้าจริงที่ลิงก์ไม่ตรงกับ href ในเมนู (เช่น /master/quotations redirect → /quotations)
// ใช้ตอน sync แถบ App/sidebar ให้ตรงกับหน้าที่เปิด เมื่อหา match จากเมนูไม่เจอ
// หน้า default ต่อแอป (เปิดหัวเมนูแล้วไปหน้านี้ก่อน แทนเมนูตัวแรกตาม sort_order)
const APP_DEFAULT_HREF: Record<string, string> = { production: "/master/manufacturing-orders" };

// หน้าที่เปิด "เต็มจอ" อัตโนมัติ (ซ่อน sidebar + แถบ App) — มีปุ่ม toggle กางคืน
const FOCUS_ROUTES = ["/master/work-board"];

const ROUTE_APP_FALLBACK: { prefix: string; app: string }[] = [
  { prefix: "/quotations", app: "sales" },
  { prefix: "/sales-orders", app: "sales" },
  { prefix: "/billing-notes", app: "sales" },
  { prefix: "/purchase-requests", app: "purchasing" },
  { prefix: "/purchase-orders", app: "purchasing" },
  { prefix: "/purchasing", app: "purchasing" },
  { prefix: "/inventory", app: "inventory" },
  { prefix: "/payroll", app: "payroll" },
  { prefix: "/tasks", app: "tasks" },
  { prefix: "/app/china-pay", app: "china-pay" },
  { prefix: "/dashboard", app: "home" },
];

// default groups (fallback) → รูปแบบเดียวกับ groupMenuRows
const DEFAULT_GROUPS = navGroups.map((g) => ({
  label: g.label,
  items: g.items.map((it) => ({ href: it.href, icon: it.icon, labelTH: it.labelTH, permission: null as string | null })),
}));

const readySections = [
  "/apps",
  "/master/parent-skus",
  "/master/skus",
  "/master/brands",
  "/master/partners",
  "/master/customers",
  "/master/suppliers",
  "/master/logic",
  "/master/material-groups",
  "/master/material-slots",
  "/master/material-families",
  "/master/uoms",
  "/master/uom-conversions",
  "/master/supplier-items",
  "/master/customer-products",
  "/master/marketplace-skus",
  "/master/stock-locations",
  "/master/stock-lots",
  "/master/stock-lpns",
  "/master/stock-counts",
  "/master/stock-adjustments",
  "/master/bom-headers",
  "/master/bom-lines",
  "/master/material-requirements",
  "/master/quotations",
  "/master/sales-orders-v2",
  "/master/goods-receipts",
  "/master/deliveries",
  "/master/manufacturing-orders",
  "/master/work-submissions",
  "/master/production-jobs",
  "/master/work-centers",
  "/master/routings",
  "/master/pattern-versions",
  "/master/cutting-jobs",
  "/master/qc-warehouse",
  "/master/carton-labels",
  "/master/qc-inspections",
  "/master/defect-logs",
  "/master/rework-jobs",
  "/master/task-templates",
  "/purchasing",
  "/m/product-groups",
  "/m/product-variations",
  "/m/purchase-requests-v2",
  "/m/purchase-orders-v2",
  "/purchasing/receive",
  "/m/goods-receipts-v2",
  "/purchasing/receive-history",
  "/inventory/sku-stock",
  "/admin/create-table",
  "/admin/schema-sync",
  "/dashboard",
  "/purchase-requests",
  "/quotations",
  "/sales-orders",
  "/billing-notes",
  "/purchase-orders",
  "/inventory",
  "/admin/users",
  "/admin/roles-permissions",
  "/admin/menu",
  "/admin/customers",
  "/admin/suppliers",
  "/admin/employees",
  "/admin/warehouses",
  "/admin/departments",
  "/admin/units",
  "/admin/taxes",
  "/admin/field-registry",
  "/admin/form-builder",
  "/admin/numbering",
  "/admin/validation-rules",
  "/admin/notification-rules",
  "/admin/approval-rules",
  "/admin/workflows",
  "/admin/saved-views",
  "/admin/report-templates",
  "/admin/plugins",
  "/admin/table-layouts",
  "/admin/import",
  "/admin/calculator-preview",
  "/admin/audit-log",
];

export function PlaygroundShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, user, ready, permsReady } = useAuth();
  const router = useRouter();
  // ยังไม่ได้ login → เด้งไปหน้าเข้าสู่ระบบ (ของกลาง — ทุกหน้าในเชลล์)
  useEffect(() => {
    if (ready && !user && pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, pathname, router]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // พับเมนูซ้าย (desktop) — เหลือไอคอน เอาเมาส์วางแล้วกาง · จำค่าใน localStorage · จอเล็ก default พับ
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navHover, setNavHover] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("nav_collapsed");
    if (saved === "1" || saved === "0") setNavCollapsed(saved === "1");
    else if (typeof window !== "undefined" && window.innerWidth < 1024) setNavCollapsed(true);   // จอเล็ก → พับให้
  }, []);
  const toggleNavCollapsed = () => setNavCollapsed((c) => { const n = !c; localStorage.setItem("nav_collapsed", n ? "1" : "0"); return n; });

  // focus mode — บางหน้า (บอร์ดจ่ายงาน) ซ่อน sidebar + แถบ App ให้ทำงานเต็มจอ (มีปุ่ม toggle กางคืน)
  const onFocusRoute = FOCUS_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  const [focus, setFocus] = useState(false);
  useEffect(() => { setFocus(FOCUS_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))); }, [pathname]);
  const navExpanded = !navCollapsed || navHover;   // กางจริงเมื่อ ไม่พับ หรือ กำลัง hover
  // embed mode — เปิดหน้าในกรอบแอปเดี่ยว (?embed=1) → ซ่อน sidebar/แถบ App ของ shell (กันเมนูซ้อน)
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try { setEmbed(new URLSearchParams(window.location.search).get("embed") === "1"); } catch { /* ignore */ }
  }, []);
  const [menuRows, setMenuRows] = useState<MenuRow[] | null>(null);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [sections, setSections] = useState<MenuSectionRow[]>([]);   // ไอคอน/ลำดับหมวด (ต่อแอป)
  const [activeApp, setActiveAppState] = useState<string | null>(null);
  const setActiveApp = (k: string | null) => {
    setActiveAppState(k);
    try { if (k) localStorage.setItem("erp-active-app", k); else localStorage.removeItem("erp-active-app"); } catch { /* ignore */ }
  };

  // โหลดทะเบียนเมนู + โมดูลใหญ่ (App) จาก DB — ถ้าว่าง/พลาด ใช้ default ในโค้ด
  useEffect(() => {
    let alive = true;
    // แคชข้ามการเปลี่ยนหน้า (lib/shell-cache) — ไม่ยิง 3 API นี้ซ้ำทุกหน้า → เปลี่ยนหน้าไวขึ้น + ลด contention
    cachedGetJson<{ data?: MenuRow[] }>("/api/menu").then((j) => {
      if (alive && Array.isArray(j.data)) setMenuRows(j.data as MenuRow[]);
    }).catch(() => { if (alive) setMenuRows([]); });
    cachedGetJson<{ data?: MenuSectionRow[] }>("/api/menu/sections").then((j) => {
      if (alive && Array.isArray(j.data)) setSections(j.data as MenuSectionRow[]);
    }).catch(() => { /* ไม่มีหมวด = ใช้ section_order เดิม ไม่มีไอคอน */ });
    cachedGetJson<{ data?: AppGroup[] }>("/api/menu/apps").then((j) => {
      if (!alive || !Array.isArray(j.data)) return;
      const apps = (j.data as AppGroup[]).filter((a) => a.is_active);
      setAppGroups(apps);
      try {
        const saved = localStorage.getItem("erp-active-app");
        setActiveAppState(saved && apps.some((a) => a.key === saved) ? saved : (apps[0]?.key ?? null));
      } catch { setActiveAppState(apps[0]?.key ?? null); }
    }).catch(() => { if (alive) setAppGroups([]); });
    return () => { alive = false; };
  }, []);


  // หน้าแรกของโมดูลใหญ่ (App) = เมนูย่อยตัวบนสุดของหมวดนั้น (ตามลำดับใน /admin/menu)
  const firstHrefForApp = (key: string): string | null => {
    if (!menuRows) return null;
    const its = menuRows
      .filter((r) => r.is_active && r.show_in_sidebar && (r.app_keys ?? []).includes(key)
        && (!r.permission_key || can(r.permission_key as Parameters<typeof can>[0])))
      .sort((a, b) => a.sort_order - b.sort_order);
    // หน้า default ของบางแอป (override ลำดับเมนู) — เช่น เปิด "ผลิต" ให้ไปใบสั่งผลิต (MO) ก่อน
    const pref = APP_DEFAULT_HREF[key];
    if (pref && its.some((r) => r.href === pref)) return pref;
    return its[0]?.href ?? null;
  };

  // ซิงก์ App ที่เลือก (หัวบน + sidebar) ให้ตรงกับ "หน้าที่เปิดอยู่" อัตโนมัติ
  // จับคู่ pathname กับเมนู (ตรงเป๊ะ หรือขึ้นต้นตรงกัน) → สลับ App ให้ตรงหน้า
  useEffect(() => {
    if (!menuRows || menuRows.length === 0 || appGroups.length === 0) return;
    const matches = menuRows.filter((r) =>
      r.is_active && r.href && (pathname === r.href || pathname.startsWith(r.href + "/")));
    let target: string | undefined;
    if (matches.length > 0) {
      const best = matches.sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0];
      const keys = best.app_keys ?? [];
      if (activeApp && keys.includes(activeApp)) return;   // App ปัจจุบันถูกต้องแล้ว → ไม่กระตุก
      target = keys.find((k) => appGroups.some((a) => a.key === k));
    } else {
      // หา match จากตารางสำรอง (หน้าจริงที่ลิงก์ไม่ตรงเมนู)
      const fb = ROUTE_APP_FALLBACK
        .filter((f) => pathname === f.prefix || pathname.startsWith(f.prefix + "/"))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (!fb) return;                                     // หน้าไม่รู้จัก → คงค่าเดิม (ไม่สลับมั่ว)
      if (activeApp === fb.app) return;
      if (appGroups.some((a) => a.key === fb.app)) target = fb.app;
    }
    // ใช้ setActiveApp (เซฟลง localStorage ด้วย) — กัน "เด้งกลับแอปเดิม" ตอนเปลี่ยนหน้า
    // (Shell mount ใหม่ทุกหน้า → อ่าน activeApp จาก localStorage; ถ้า effect แก้แล้วไม่เซฟ
    //  ค่าจะค้างที่แอปที่กดแท็บล่าสุด พอเข้าหน้าที่ใช้ได้หลายแอปเลยเด้งกลับ)
    if (target && target !== activeApp) setActiveApp(target);
  }, [pathname, menuRows, appGroups, activeApp]);

  // กลุ่มเมนูที่จะแสดง: จากทะเบียน (ถ้ามี) ไม่งั้น default — แล้วกรองตามสิทธิ์ + show_in_sidebar
  const navGroupsToShow = (() => {
    const fromRegistry = menuRows && menuRows.length > 0;
    let rows = fromRegistry ? menuRows!.filter((r) => r.is_active && r.show_in_sidebar) : null;
    // กรองตามโมดูลใหญ่ (App) ที่เลือก — ถ้ามี App + เลือกอยู่
    if (rows && activeApp && appGroups.length > 0) {
      rows = rows.filter((r) => (r.app_keys ?? []).includes(activeApp));
    }
    // ทะเบียนหมวด (ไอคอน/ลำดับ) ของแอปที่เปิดอยู่ → ใช้จัดลำดับ + แสดงไอคอนหัวหมวด
    const secMeta = new Map<string, SectionMeta>();
    if (activeApp) for (const s of sections) if (s.app_key === activeApp) secMeta.set(s.name, { icon: s.icon, iconUrl: s.icon_url, order: s.sort_order });
    const groups = rows ? groupMenuRows(rows, secMeta) : DEFAULT_GROUPS;
    return groups
      .map((g) => ({
        label: g.label,
        icon: (g as { icon?: string | null }).icon ?? null,
        iconUrl: (g as { iconUrl?: string | null }).iconUrl ?? null,
        items: g.items.filter((it) => !it.permission || can(it.permission as Parameters<typeof can>[0])),
      }))
      .filter((g) => g.items.length > 0);
  })();

  // เมนูของแอปปัจจุบัน (flatten) → ใช้ทำแถบล่างบนมือถือ/แท็บเล็ต (< xl) แทน side rail
  const bottomItems = navGroupsToShow.flatMap((g) => g.items).slice(0, 4);

  // ---- App access guard (เฟส 2) — กันเข้าตรง URL เข้า app ที่ไม่มีสิทธิ์ ----
  // หา "app ของหน้าที่เปิดอยู่" จาก pathname (เมนู → ROUTE_APP_FALLBACK)
  const currentAppKey: string | null = (() => {
    if (menuRows && menuRows.length > 0) {
      const matches = menuRows.filter((r) => r.is_active && r.href && (pathname === r.href || pathname.startsWith(r.href + "/")));
      if (matches.length > 0) {
        const best = matches.sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0];
        // หน้าที่อยู่หลายแอป (เช่น SKUs อยู่ทั้ง master+purchasing) → ยึดแอปที่เปิดอยู่ก่อน
        // (ไม่งั้น favicon/ชื่อแท็บ/ตัวกันสิทธิ์จะเดาเป็น app_key ตัวแรกเสมอ = เด้งเป็น Master Data)
        const valid = (best.app_keys ?? []).filter((x) => appGroups.some((a) => a.key === x));
        if (valid.length) return (activeApp && valid.includes(activeApp)) ? activeApp : valid[0];
      }
    }
    const fb = ROUTE_APP_FALLBACK
      .filter((f) => pathname === f.prefix || pathname.startsWith(f.prefix + "/"))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    return fb?.app ?? null;
  })();
  // บล็อกเฉพาะเมื่อ: login แล้ว + สิทธิ์ DB โหลดสำเร็จ (permsReady) + app นี้ล็อกด้วยสิทธิ์ + ไม่มีสิทธิ์
  // (permsReady = false → ไม่บล็อก กันพลาดตอนใช้ค่าสำรอง · ข้อมูลยังปลอดภัยที่ API guard)
  const blockedAppLabel: string | null = (() => {
    if (!user || !ready || !permsReady || !currentAppKey) return null;
    const ag = appGroups.find((a) => a.key === currentAppKey);
    if (!ag?.permission_key) return null;
    return can(ag.permission_key as Parameters<typeof can>[0]) ? null : ag.label;
  })();

  // ไอคอนแท็บ (favicon) + ชื่อแท็บ ตาม "แอปของหน้าปัจจุบัน" → เปิดหลายแท็บแยกออกได้
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ag = currentAppKey ? appGroups.find((a) => a.key === currentAppKey) : null;
    document.title = ag ? `${ag.label} · ERP` : "ERP Platform";
    let href: string | null = null;
    if (ag?.icon_url) href = `/api/r2-image?key=${encodeURIComponent(ag.icon_url)}&w=64`;
    else if (ag?.icon) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="34" font-size="52" text-anchor="middle" dominant-baseline="central">${ag.icon}</text></svg>`;
      href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>("link#dynamic-app-favicon");
    if (!link) { link = document.createElement("link"); link.id = "dynamic-app-favicon"; link.rel = "icon"; document.head.appendChild(link); }
    link.href = href;
  }, [currentAppKey, appGroups]);

  // ปิด mobile nav อัตโนมัติเมื่อเปลี่ยนหน้า
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  // Global hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === "INPUT"
        || document.activeElement?.tagName === "TEXTAREA"
        || (document.activeElement as HTMLElement)?.isContentEditable;
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";

      if (isCmdK) {
        e.preventDefault();
        setSearchOpen(o => !o);
      } else if (e.key === "/" && !isInput) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "?" && !isInput) {
        e.preventDefault();
        setHelpOpen(o => !o);
      } else if (e.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ระหว่างเด้งไป /login (ยังไม่ login) — ไม่ต้องโชว์เชลล์
  if (ready && !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">กำลังไปหน้าเข้าสู่ระบบ…</div>;
  }

  // embed mode (เปิดในกรอบแอปเดี่ยว) — โชว์แค่เนื้อหา ไม่มี sidebar/แถบ App (เมนูมาจากเชลล์แอปเดี่ยวแทน)
  if (embed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ShellPresentContext.Provider value={true}>
          {blockedAppLabel
            ? <AccessDenied message={`คุณไม่มีสิทธิ์เข้าถึงแอป "${blockedAppLabel}" — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์`} />
            : children}
        </ShellPresentContext.Provider>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Skip to content (a11y) */}
      <a href="#main-content" className="skip-to-content">ข้ามไปยังเนื้อหาหลัก</a>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* ปุ่มสลับเต็มจอ — โชว์เฉพาะหน้าที่เปิดเต็มจอได้ (เช่น บอร์ดจ่ายงาน) */}
      {onFocusRoute && (
        <button onClick={() => setFocus((f) => !f)} title={focus ? "แสดงเมนู (ออกจากเต็มจอ)" : "ซ่อนเมนู (เต็มจอ)"}
          className="fixed bottom-4 left-4 z-[60] h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 shadow-md hover:bg-slate-50 text-sm text-slate-600">
          {focus ? "☰ เมนู" : "⛶ เต็มจอ"}
        </button>
      )}

      {/* Mobile topbar */}
      <header className="xl:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-200 h-12 flex items-center justify-between px-3">
        <button onClick={() => setMobileNavOpen(true)} aria-label="เปิดเมนู"
          className="p-2 -ml-1 rounded hover:bg-slate-100">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link href="/" className="flex items-center gap-1.5">
          <Logo size={22} />
          <span className="text-sm font-bold text-slate-900">{BRAND.name}</span>
        </Link>
        <button onClick={() => setSearchOpen(true)} aria-label="ค้นหา" className="p-2 -mr-1 rounded hover:bg-slate-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      </header>

      {/* Backdrop (mobile only when nav open) */}
      {mobileNavOpen && (
        <div onClick={() => setMobileNavOpen(false)}
          className="xl:hidden fixed inset-0 z-40 bg-slate-900/40"
          aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={() => navCollapsed && setNavHover(true)}
        onMouseLeave={() => setNavHover(false)}
        className={`
        ${focus ? "!hidden" : ""}
        bg-white border-r border-slate-200 flex flex-col
        w-64 ${navExpanded ? "xl:w-56" : "xl:w-16"} flex-shrink-0
        fixed xl:sticky top-0 h-screen z-50 xl:z-auto
        overflow-y-auto overflow-x-hidden
        transition-[width,transform] duration-200 ease-out
        ${mobileNavOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0"}
      `} aria-label="เมนูหลัก">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2.5 text-slate-600 hover:text-slate-900 transition-colors group min-w-0 flex-1">
            <Logo size={28} className="flex-shrink-0 group-hover:scale-105 transition-transform" />
            {navExpanded && <div className="leading-tight min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{BRAND.name}</div>
              <div className="text-[10px] text-slate-400">Playground</div>
            </div>}
          </Link>
          {/* ปุ่มพับ/กาง (desktop) */}
          {navExpanded && <button onClick={toggleNavCollapsed} title={navCollapsed ? "ปักหมุดให้กางค้าง" : "พับเมนู"}
            className="hidden md:flex w-6 h-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">{navCollapsed ? "»" : "«"}</button>}
        </div>

        {/* Global search + Help buttons */}
        <div className="px-3 pt-3 space-y-1.5">
          <button onClick={() => setSearchOpen(true)} title="ค้นหา (⌘K)"
            className={`w-full flex items-center gap-2 h-8 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors ${navExpanded ? "px-2.5" : "justify-center px-0"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {navExpanded && <><span className="flex-1 text-left">ค้นหา...</span>
            <kbd className="text-[9px] font-mono bg-white border border-slate-200 px-1 rounded text-slate-400">⌘K</kbd></>}
          </button>
          {navExpanded && <button onClick={() => setHelpOpen(true)}
            className="w-full flex items-center gap-2 h-7 px-2.5 text-[11px] text-slate-500 hover:bg-slate-50 rounded-lg transition-colors">
            <span>⌨️</span>
            <span className="flex-1 text-left">Keyboard Shortcuts</span>
            <kbd className="text-[9px] font-mono bg-slate-100 border border-slate-200 px-1 rounded text-slate-400">?</kbd>
          </button>}
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroupsToShow.map((group) => (
            <div key={group.label}>
              {navExpanded
                ? <div className="px-2 mb-1 flex items-center gap-1.5">
                    {group.iconUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/r2-image?key=${encodeURIComponent(group.iconUrl)}`} alt="" className="w-3.5 h-3.5 rounded object-contain shrink-0" />
                      : group.icon ? <span className="text-xs leading-none shrink-0">{group.icon}</span> : null}
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</span>
                  </div>
                : <div className="mx-2 mb-1 border-t border-slate-100" />}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const isReady = readySections.includes(item.href);
                  const isStandalone = STANDALONE_HREFS.has(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      target={isStandalone ? "_blank" : undefined}
                      rel={isStandalone ? "noopener" : undefined}
                      title={!navExpanded ? item.labelTH : isStandalone ? "เปิดเป็นแอปแยกในแท็บใหม่" : undefined}
                      className={`flex items-center gap-2.5 py-2 rounded-lg text-sm transition-colors ${navExpanded ? "px-2.5" : "px-0 justify-center"} ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <span className="text-base leading-none relative">{item.icon}
                        {!navExpanded && isReady && !isActive && <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full" />}
                      </span>
                      {navExpanded && <>
                        <span className="flex-1 leading-tight">{item.labelTH}</span>
                        {isStandalone && <span className="text-[11px] text-slate-400 flex-shrink-0" aria-hidden>↗</span>}
                        {isReady && !isActive && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />}
                      </>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* (เดิม) หมวด "⚙ ตั้งค่า" อัตโนมัติถูกเอาออกแล้ว — ให้เพิ่มเมนูตั้งค่าเองที่ /admin/menu */}
        </nav>

        <UserSwitcher collapsed={!navExpanded} />
      </aside>

      {/* Content */}
      {/* หมายเหตุ: ห้ามใส่ overflow-y-auto ที่ main — root เป็น min-h-screen (เลื่อนที่ body)
          overflow บน main จะกลายเป็น scrollport ปลอมที่ไม่เคยเลื่อน ทำให้ sticky ทุกตัวข้างในตาย */}
      <main id="main-content" className="flex-1 min-w-0 pt-12 xl:pt-0 pb-16 xl:pb-0 flex flex-col" tabIndex={-1}>
        {/* โมดูลใหญ่ (App) tabs — ข้างบนสุด (โชว์เมื่อมีทะเบียนเมนูแล้ว · ซ่อนตอน focus mode) */}
        {!focus && appGroups.length > 0 && menuRows && menuRows.length > 0 && (
          <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-3 hidden xl:flex items-center gap-1 overflow-x-auto">
            {appGroups
              .filter((a) => !a.permission_key || can(a.permission_key as Parameters<typeof can>[0]))
              .map((a) => {
                const href = firstHrefForApp(a.key);   // หน้าแรกของหมวด — เป็นลิงก์จริง คลิกขวา open new tab ได้
                const cls = `flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  activeApp === a.key
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`;
                return href ? (
                  <Link key={a.key} href={href} onClick={() => setActiveApp(a.key)} className={cls}>
                    <AppTabIcon icon={a.icon} iconUrl={a.icon_url} /><span>{a.label}</span>
                  </Link>
                ) : (
                  <button key={a.key} onClick={() => setActiveApp(a.key)} className={cls}>
                    <AppTabIcon icon={a.icon} iconUrl={a.icon_url} /><span>{a.label}</span>
                  </button>
                );
              })}
            <a href="/apps" className="ml-auto px-3 py-2.5 text-xs text-slate-400 hover:text-slate-700 whitespace-nowrap">⊞ ทุก App</a>
          </div>
        )}
        <div className="flex-1">
          <ShellPresentContext.Provider value={true}>
            {blockedAppLabel
              ? <AccessDenied message={`คุณไม่มีสิทธิ์เข้าถึงแอป "${blockedAppLabel}" — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์`} />
              : children}
          </ShellPresentContext.Provider>
        </div>
      </main>

      {/* แถบเมนูล่าง (< xl: มือถือ/แท็บเล็ต) — เมนูของแอปปัจจุบันเป็นแท็บล่าง แทน side rail (เลือกหน้าได้ง่าย) */}
      {!focus && bottomItems.length > 0 && (
        <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="เมนูล่าง">
          {bottomItems.map((it) => {
            const on = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 ${on ? "text-blue-600" : "text-slate-500"}`}>
                <span className="text-lg leading-none">{it.icon}</span>
                <span className="text-[10px] truncate max-w-full px-1">{it.labelTH}</span>
              </Link>
            );
          })}
          <button onClick={() => setMobileNavOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-slate-500" aria-label="เมนูทั้งหมด">
            <span className="text-lg leading-none">☰</span>
            <span className="text-[10px]">เพิ่มเติม</span>
          </button>
        </nav>
      )}
    </div>
  );
}

// ---- User box (Supabase Auth) ----

function UserSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { user, logout, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useT();

  if (!ready) {
    return <div className="p-3 border-t border-slate-100"><div className="h-9 bg-slate-100 rounded-lg animate-pulse" /></div>;
  }

  if (!user) {
    return (
      <div className="p-3 border-t border-slate-100">
        <div className="text-xs text-slate-400 text-center mb-2">ยังไม่ได้เข้าสู่ระบบ</div>
        <Link href="/login" className="block w-full text-center h-8 leading-8 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  const initials = user.name.charAt(0).toUpperCase();
  const avatar = user.avatar ? (user.avatar.startsWith("http") ? user.avatar : `/api/r2-image?key=${encodeURIComponent(user.avatar)}`) : null;

  return (
    <div className="p-3 border-t border-slate-100 relative">
      <LangSync />
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(!open)} title={collapsed ? user.name : undefined}
          className={`flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left ${collapsed ? "justify-center" : ""}`}>
          {avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200" />
            : <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">{initials}</span>}
          {!collapsed && <>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-800 truncate">{user.name}</div>
              <span className={`inline-block text-[10px] px-1.5 rounded-full border ${roleColor(user.role)}`}>{roleLabel(user.role)}</span>
            </div>
            <span className="text-slate-400 text-xs">⋯</span>
          </>}
        </button>
        {!collapsed && <NotificationBell />}
      </div>

      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
          <Link href="/profile" onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">👤 {t("โปรไฟล์ของฉัน", "My Profile")}</Link>
          <Link href="/account/security" onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">🔐 {t("ความปลอดภัย (อุปกรณ์ที่เข้าใช้)", "Security (devices)")}</Link>
          <div className="px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">🌐 ภาษา / Language</span>
            <LangToggle />
          </div>
          <button onClick={async () => { setOpen(false); await logout(); router.push("/login"); }}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">{t("ออกจากระบบ", "Log out")}</button>
        </div>
      )}
    </div>
  );
}

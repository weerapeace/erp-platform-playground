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
import { useAuth, roleLabel, roleColor } from "@/components/auth";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { Logo, BRAND } from "@/components/brand";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts";
import { apiFetch } from "@/lib/api";

// Sidebar structure ใหม่ — รวมตามการใช้งานจริง (ไม่ใช่ phase dev)
// = "เมนู default" (fallback) ถ้าทะเบียนเมนูใน DB ว่าง/โหลดไม่ได้
export const navGroups = [
  {
    phase: 0,
    label: "หน้าหลัก",
    items: [
      { href: "/apps",      icon: "🏠", labelTH: "App Launcher" },
      { href: "/dashboard", icon: "📊", labelTH: "Dashboard" },
    ],
  },
  {
    phase: 1,
    label: "Master Data ⭐",
    items: [
      { href: "/master/parent-skus", icon: "🧬", labelTH: "Parent SKUs" },
      { href: "/master/skus",        icon: "🏷️", labelTH: "SKUs" },
      { href: "/master/partners",    icon: "🤝", labelTH: "Partners (ลูกค้า/ซัพ)" },
      { href: "/master/customers",   icon: "🧑‍💼", labelTH: "ลูกค้า (Customers)" },
      { href: "/master/suppliers",   icon: "🏢", labelTH: "ผู้ขาย (Suppliers)" },
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
    phase: 2,
    label: "Operations",
    items: [
      { href: "/purchasing",         icon: "🛍️", labelTH: "ขอซื้อ (ช้อปปิ้ง) ⭐" },
      { href: "/m/purchase-requests-v2", icon: "📋", labelTH: "ใบขอซื้อ v2 (PR)" },
      { href: "/m/purchase-orders-v2", icon: "🧾", labelTH: "ใบสั่งซื้อ v2 (PO) ⭐" },
      { href: "/purchasing/receive", icon: "📥", labelTH: "รับสินค้าเข้า ⭐" },
      { href: "/m/goods-receipts-v2", icon: "📦", labelTH: "ใบรับสินค้า v2 (GR)" },
      { href: "/m/product-groups",   icon: "🧺", labelTH: "Product Groups" },
      { href: "/m/product-variations", icon: "🎨", labelTH: "Product Variations" },
      { href: "/purchase-requests", icon: "📋", labelTH: "ใบขอซื้อ (PR) legacy" },
      { href: "/purchase-orders",   icon: "🛒", labelTH: "ใบสั่งซื้อ (PO)" },
      { href: "/sales-orders",      icon: "🧾", labelTH: "ใบขาย (SO)" },
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
      { href: "/master/quotations",      icon: "📄", labelTH: "Quotations" },
      { href: "/master/sales-orders-v2", icon: "🧾", labelTH: "Sales Orders (v2)" },
      { href: "/master/goods-receipts",  icon: "📥", labelTH: "Goods Receipts" },
      { href: "/master/deliveries",      icon: "🚚", labelTH: "Deliveries" },
    ],
  },
  {
    phase: 2,
    label: "🏭 Production (Phase 7,8)",
    items: [
      { href: "/master/manufacturing-orders", icon: "🏭", labelTH: "Manufacturing Orders" },
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
      { href: "/admin/field-registry",    icon: "📋", labelTH: "Field Registry (legacy)" },
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
  icon: string | null; label: string; href: string;
  show_in_sidebar: boolean; show_in_launcher: boolean;
  permission_key: string | null; is_active: boolean;
  app_keys?: string[];   // โมดูลใหญ่ (App) ที่เมนูนี้สังกัด — many-to-many
};

// โมดูลใหญ่ (App) — tabs บนสุด
export type AppGroup = { id?: string; key: string; label: string; icon: string | null; sort_order: number; permission_key: string | null; is_active: boolean };

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

// จัด MenuRow[] (จากทะเบียน) → กลุ่มสำหรับ render sidebar (เรียงตาม section_order/sort_order)
function groupMenuRows(rows: MenuRow[]): { label: string; items: { href: string; icon: string; labelTH: string; permission?: string | null }[] }[] {
  const bySection = new Map<string, { order: number; items: MenuRow[] }>();
  for (const r of rows) {
    const g = bySection.get(r.section) ?? { order: r.section_order, items: [] };
    g.items.push(r); bySection.set(r.section, g);
  }
  return [...bySection.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, g]) => ({
      label,
      items: g.items.sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({ href: r.href, icon: r.icon ?? "•", labelTH: r.label, permission: r.permission_key })),
    }));
}

// default groups (fallback) → รูปแบบเดียวกับ groupMenuRows
const DEFAULT_GROUPS = navGroups.map((g) => ({
  label: g.label,
  items: g.items.map((it) => ({ href: it.href, icon: it.icon, labelTH: it.labelTH, permission: null as string | null })),
}));

const readySections = [
  "/apps",
  "/master/parent-skus",
  "/master/skus",
  "/master/partners",
  "/master/customers",
  "/master/suppliers",
  "/master/logic",
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
  "/master/production-jobs",
  "/master/work-centers",
  "/master/routings",
  "/master/pattern-versions",
  "/master/cutting-jobs",
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
  "/admin/create-table",
  "/admin/schema-sync",
  "/dashboard",
  "/purchase-requests",
  "/sales-orders",
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
  const { can, user, ready } = useAuth();
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
  const [menuRows, setMenuRows] = useState<MenuRow[] | null>(null);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [activeApp, setActiveAppState] = useState<string | null>(null);
  const setActiveApp = (k: string | null) => {
    setActiveAppState(k);
    try { if (k) localStorage.setItem("erp-active-app", k); else localStorage.removeItem("erp-active-app"); } catch { /* ignore */ }
  };

  // โหลดทะเบียนเมนู + โมดูลใหญ่ (App) จาก DB — ถ้าว่าง/พลาด ใช้ default ในโค้ด
  useEffect(() => {
    let alive = true;
    apiFetch("/api/menu").then((r) => r.json()).then((j) => {
      if (alive && Array.isArray(j.data)) setMenuRows(j.data as MenuRow[]);
    }).catch(() => { if (alive) setMenuRows([]); });
    apiFetch("/api/menu/apps").then((r) => r.json()).then((j) => {
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

  // กลุ่มเมนูที่จะแสดง: จากทะเบียน (ถ้ามี) ไม่งั้น default — แล้วกรองตามสิทธิ์ + show_in_sidebar
  const navGroupsToShow = (() => {
    const fromRegistry = menuRows && menuRows.length > 0;
    let rows = fromRegistry ? menuRows!.filter((r) => r.is_active && r.show_in_sidebar) : null;
    // กรองตามโมดูลใหญ่ (App) ที่เลือก — ถ้ามี App + เลือกอยู่
    if (rows && activeApp && appGroups.length > 0) {
      rows = rows.filter((r) => (r.app_keys ?? []).includes(activeApp));
    }
    const groups = rows ? groupMenuRows(rows) : DEFAULT_GROUPS;
    return groups
      .map((g) => ({
        label: g.label,
        items: g.items.filter((it) => !it.permission || can(it.permission as Parameters<typeof can>[0])),
      }))
      .filter((g) => g.items.length > 0);
  })();

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

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Skip to content (a11y) */}
      <a href="#main-content" className="skip-to-content">ข้ามไปยังเนื้อหาหลัก</a>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Mobile topbar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-200 h-12 flex items-center justify-between px-3">
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
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40"
          aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside className={`
        bg-white border-r border-slate-200 flex flex-col
        w-64 md:w-56 flex-shrink-0
        fixed md:sticky top-0 h-screen z-50 md:z-auto
        overflow-y-auto
        transition-transform duration-200 ease-out
        ${mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `} aria-label="เมนูหลัก">
        <div className="p-4 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-2.5 text-slate-600 hover:text-slate-900 transition-colors group">
            <Logo size={28} className="flex-shrink-0 group-hover:scale-105 transition-transform" />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{BRAND.name}</div>
              <div className="text-[10px] text-slate-400">Playground</div>
            </div>
          </Link>
        </div>

        {/* Global search + Help buttons */}
        <div className="px-3 pt-3 space-y-1.5">
          <button onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 h-8 px-2.5 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <span className="flex-1 text-left">ค้นหา...</span>
            <kbd className="text-[9px] font-mono bg-white border border-slate-200 px-1 rounded text-slate-400">⌘K</kbd>
          </button>
          <button onClick={() => setHelpOpen(true)}
            className="w-full flex items-center gap-2 h-7 px-2.5 text-[11px] text-slate-500 hover:bg-slate-50 rounded-lg transition-colors">
            <span>⌨️</span>
            <span className="flex-1 text-left">Keyboard Shortcuts</span>
            <kbd className="text-[9px] font-mono bg-slate-100 border border-slate-200 px-1 rounded text-slate-400">?</kbd>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroupsToShow.map((group) => (
            <div key={group.label}>
              <div className="px-2 mb-1 flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const isReady = readySections.includes(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="flex-1 leading-tight">{item.labelTH}</span>
                      {isReady && !isActive && (
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <UserSwitcher />
      </aside>

      {/* Content */}
      <main id="main-content" className="flex-1 overflow-y-auto pt-12 md:pt-0 flex flex-col" tabIndex={-1}>
        {/* โมดูลใหญ่ (App) tabs — ข้างบนสุด (โชว์เมื่อมีทะเบียนเมนูแล้ว) */}
        {appGroups.length > 0 && menuRows && menuRows.length > 0 && (
          <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-3 flex items-center gap-1 overflow-x-auto">
            {appGroups
              .filter((a) => !a.permission_key || can(a.permission_key as Parameters<typeof can>[0]))
              .map((a) => (
                <button key={a.key} onClick={() => setActiveApp(a.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    activeApp === a.key
                      ? "border-blue-600 text-blue-700 font-medium"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}>
                  <span>{a.icon ?? "📦"}</span><span>{a.label}</span>
                </button>
              ))}
            <a href="/apps" className="ml-auto px-3 py-2.5 text-xs text-slate-400 hover:text-slate-700 whitespace-nowrap">⊞ ทุก App</a>
          </div>
        )}
        <div className="flex-1">
          <ShellPresentContext.Provider value={true}>{children}</ShellPresentContext.Provider>
        </div>
      </main>
    </div>
  );
}

// ---- User box (Supabase Auth) ----

function UserSwitcher() {
  const { user, logout, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

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

  return (
    <div className="p-3 border-t border-slate-100 relative">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
          <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">{initials}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-800 truncate">{user.name}</div>
            <span className={`inline-block text-[10px] px-1.5 rounded-full border ${roleColor(user.role)}`}>{roleLabel(user.role)}</span>
          </div>
          <span className="text-slate-400 text-xs">⋯</span>
        </button>
        <NotificationBell />
      </div>

      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
          <button onClick={async () => { setOpen(false); await logout(); router.push("/login"); }}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">ออกจากระบบ</button>
        </div>
      )}
    </div>
  );
}

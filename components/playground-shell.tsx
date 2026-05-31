"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleLabel, roleColor } from "@/components/auth";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { Logo, BRAND } from "@/components/brand";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts";

const navGroups = [
  {
    phase: 0,
    label: "Overview",
    items: [{ href: "/dashboard", icon: "📊", labelTH: "ภาพรวมระบบ" }],
  },
  {
    phase: 3,
    label: "Design System",
    items: [{ href: "/design-system", icon: "🎨", labelTH: "ระบบดีไซน์" }],
  },
  {
    phase: 4,
    label: "UI Components",
    items: [{ href: "/components-preview", icon: "🧩", labelTH: "ชิ้นส่วน UI" }],
  },
  {
    phase: 5,
    label: "DataTable",
    items: [{ href: "/table-playground", icon: "📊", labelTH: "ตารางกลาง" }],
  },
  {
    phase: 6,
    label: "Forms & Modals",
    items: [
      { href: "/form-playground", icon: "📝", labelTH: "ฟอร์มกลาง" },
      { href: "/popup-playground", icon: "🪟", labelTH: "Popup กลาง" },
      { href: "/picker-playground", icon: "🔍", labelTH: "ตัวเลือกข้อมูล" },
    ],
  },
  {
    phase: 7,
    label: "Core Logic",
    items: [
      { href: "/plugin-playground", icon: "🔌", labelTH: "ระบบ Plugin" },
      { href: "/permission-preview", icon: "🔒", labelTH: "ระบบสิทธิ์" },
      { href: "/workflow-playground", icon: "⚙️", labelTH: "ระบบอนุมัติ" },
    ],
  },
  {
    phase: 8,
    label: "Files & Reports",
    items: [
      { href: "/file-upload-preview", icon: "📁", labelTH: "ไฟล์และรูปภาพ" },
      { href: "/report-preview", icon: "🖨️", labelTH: "รายงานและพิมพ์" },
    ],
  },
  {
    phase: 8,
    label: "Example Modules",
    items: [
      { href: "/products-demo", icon: "📦", labelTH: "สินค้า (Products)" },
      { href: "/products-crud", icon: "✏️", labelTH: "สินค้า CRUD จริง" },
      { href: "/purchase-request-demo", icon: "📋", labelTH: "ใบขอซื้อ (Demo)" },
      { href: "/purchase-requests", icon: "🛒", labelTH: "ใบขอซื้อ จริง" },
      { href: "/sales-orders", icon: "🧾", labelTH: "ใบสั่งขาย (SO)" },
      { href: "/purchase-orders", icon: "📦", labelTH: "ใบสั่งซื้อ (PO)" },
      { href: "/inventory", icon: "🗄", labelTH: "Inventory" },
    ],
  },
  {
    phase: 9,
    label: "Admin",
    items: [
      { href: "/admin/users", icon: "👥", labelTH: "ผู้ใช้ระบบ" },
      { href: "/admin/roles-permissions", icon: "🔐", labelTH: "Roles & Permissions" },
      { href: "/admin/customers", icon: "🧑‍💼", labelTH: "ลูกค้า" },
      { href: "/admin/suppliers", icon: "🏢", labelTH: "ผู้จำหน่าย" },
      { href: "/admin/employees", icon: "🪪", labelTH: "พนักงาน" },
      { href: "/admin/warehouses", icon: "🏭", labelTH: "คลังสินค้า" },
      { href: "/admin/departments", icon: "🗃️", labelTH: "แผนก" },
      { href: "/admin/units", icon: "📏", labelTH: "หน่วยนับ" },
      { href: "/admin/taxes", icon: "💰", labelTH: "ภาษี" },
      { href: "/admin/field-registry", icon: "🗂️", labelTH: "ทะเบียน Field" },
      { href: "/admin/form-builder", icon: "🧩", labelTH: "ออกแบบฟอร์ม" },
      { href: "/admin/numbering", icon: "🔢", labelTH: "เลขที่เอกสาร" },
      { href: "/admin/validation-rules", icon: "✅", labelTH: "Validation Rules" },
      { href: "/admin/notification-rules", icon: "📨", labelTH: "Notification Rules" },
      { href: "/admin/approval-rules", icon: "✋", labelTH: "กฎการอนุมัติ" },
      { href: "/admin/workflows", icon: "⚙️", labelTH: "Workflow" },
      { href: "/admin/saved-views", icon: "📑", labelTH: "Saved Views" },
      { href: "/admin/report-templates", icon: "🖨️", labelTH: "Report Templates" },
      { href: "/admin/plugins", icon: "🔌", labelTH: "Plugin Registry" },
      { href: "/admin/table-layouts", icon: "🎚️", labelTH: "Table Layouts" },
      { href: "/admin/import", icon: "📥", labelTH: "Import ข้อมูล" },
      { href: "/admin/calculator-preview", icon: "💰", labelTH: "Calculator" },
      { href: "/admin/audit-log", icon: "📜", labelTH: "ประวัติการใช้งาน" },
    ],
  },
];

const readySections = [
  "/dashboard",
  "/design-system",
  "/components-preview",
  "/table-playground",
  "/form-playground",
  "/popup-playground",
  "/picker-playground",
  "/permission-preview",
  "/workflow-playground",
  "/plugin-playground",
  "/file-upload-preview",
  "/report-preview",
  "/products-demo",
  "/products-crud",
  "/purchase-request-demo",
  "/purchase-requests",
  "/sales-orders",
  "/purchase-orders",
  "/inventory",
  "/admin/users",
  "/admin/roles-permissions",
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
          {navGroups.map((group) => (
            <div key={group.phase}>
              <div className="px-2 mb-1 flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Phase {group.phase}
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
      <main id="main-content" className="flex-1 overflow-y-auto pt-12 md:pt-0" tabIndex={-1}>
        {children}
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

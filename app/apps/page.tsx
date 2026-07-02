"use client";

/**
 * App Launcher — หน้ารวมโมดูลแบบ Odoo
 *
 * Standalone page (ไม่ใช้ PlaygroundShell sidebar) — ออกแบบให้รู้สึกเป็น "หน้า home" ของ ERP
 * ผู้ใช้เปิดมาเจอตารางไอคอนใหญ่ ๆ คลิกเข้าโมดูลได้ — เหมือน Odoo App Launcher
 *
 * เปิดที่:  /apps
 */

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo, BRAND } from "@/components/brand";
import { useAuth, roleLabel, roleColor } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { MenuRow, AppGroup } from "@/components/playground-shell";

// สีไล่เฉดสำหรับ tile ที่มาจากทะเบียนเมนู (วนสี)
const TILE_COLORS = [
  "from-orange-500 to-amber-500", "from-violet-500 to-purple-500", "from-emerald-500 to-teal-500",
  "from-blue-500 to-blue-600", "from-rose-500 to-rose-600", "from-cyan-500 to-cyan-600",
  "from-indigo-500 to-indigo-600", "from-pink-500 to-pink-600", "from-teal-500 to-teal-600", "from-fuchsia-500 to-fuchsia-600",
];

// ============================================================
// App registry — รายการโมดูลที่จะแสดงในหน้า launcher
// ============================================================

type AppStatus = "live" | "beta" | "soon";

type AppEntry = {
  key:        string;
  icon:       string;        // emoji (เปลี่ยนเป็น SVG ทีหลังได้)
  name:       string;        // ภาษาไทย
  subtitle:   string;        // คำอธิบายสั้น
  href:       string;
  category:   string;        // ใช้จัดกลุ่ม
  color:      string;        // tailwind gradient classes
  status:     AppStatus;
};

const APPS: AppEntry[] = [
  // ============= Master Data v2 (ของจริงจาก Odoo) =============
  {
    key: "parent-skus", icon: "🧬", name: "Parent SKUs", subtitle: "Product Templates (v2)",
    href: "/master/parent-skus", category: "Master Data v2",
    color: "from-orange-500 to-amber-500", status: "live",
  },
  {
    key: "skus", icon: "🏷️", name: "SKUs", subtitle: "Product Variants (v2)",
    href: "/master/skus", category: "Master Data v2",
    color: "from-violet-500 to-purple-500", status: "live",
  },
  {
    key: "partners", icon: "🤝", name: "Partners", subtitle: "Customers + Suppliers (v2)",
    href: "/master/partners", category: "Master Data v2",
    color: "from-emerald-500 to-teal-500", status: "live",
  },

  // ============= Operations (การปฏิบัติงาน) =============
  {
    key: "products", icon: "📦", name: "สินค้า", subtitle: "Products & Catalog",
    href: "/products-crud", category: "Operations",
    color: "from-blue-500 to-blue-600", status: "live",
  },
  {
    key: "purchase-requests", icon: "📋", name: "ใบขอซื้อ", subtitle: "Purchase Requests",
    href: "/purchase-requests", category: "Operations",
    color: "from-indigo-500 to-indigo-600", status: "live",
  },
  {
    key: "purchase-orders", icon: "🛒", name: "ใบสั่งซื้อ", subtitle: "Purchase Orders",
    href: "/purchase-orders", category: "Operations",
    color: "from-violet-500 to-violet-600", status: "live",
  },
  {
    key: "sales-orders", icon: "🧾", name: "ใบสั่งขาย", subtitle: "Sales Orders",
    href: "/sales-orders", category: "Operations",
    color: "from-emerald-500 to-emerald-600", status: "live",
  },
  {
    key: "inventory", icon: "🗄️", name: "คลังสินค้า", subtitle: "Inventory",
    href: "/inventory", category: "Operations",
    color: "from-amber-500 to-amber-600", status: "live",
  },

  // ============= Master Data (ข้อมูลหลัก) =============
  {
    key: "customers", icon: "🧑‍💼", name: "ลูกค้า", subtitle: "Customers",
    href: "/admin/customers", category: "Master Data",
    color: "from-rose-500 to-rose-600", status: "live",
  },
  {
    key: "suppliers", icon: "🏢", name: "ผู้จำหน่าย", subtitle: "Suppliers",
    href: "/admin/suppliers", category: "Master Data",
    color: "from-pink-500 to-pink-600", status: "live",
  },
  {
    key: "employees", icon: "🪪", name: "พนักงาน", subtitle: "Employees",
    href: "/admin/employees", category: "Master Data",
    color: "from-fuchsia-500 to-fuchsia-600", status: "live",
  },
  {
    key: "warehouses", icon: "🏭", name: "คลัง", subtitle: "Warehouses",
    href: "/admin/warehouses", category: "Master Data",
    color: "from-orange-500 to-orange-600", status: "live",
  },

  // ============= Tools (เครื่องมือ) =============
  {
    key: "dashboard", icon: "📊", name: "ภาพรวมระบบ", subtitle: "Dashboard",
    href: "/dashboard", category: "Tools",
    color: "from-cyan-500 to-cyan-600", status: "live",
  },
  {
    key: "audit-log", icon: "📜", name: "ประวัติการใช้งาน", subtitle: "Audit Log",
    href: "/admin/audit-log", category: "Tools",
    color: "from-slate-500 to-slate-600", status: "live",
  },
  {
    key: "import", icon: "📥", name: "Import ข้อมูล", subtitle: "Import Wizard",
    href: "/admin/import", category: "Tools",
    color: "from-teal-500 to-teal-600", status: "live",
  },
  {
    key: "reports", icon: "🖨️", name: "รายงาน", subtitle: "Reports & Print",
    href: "/report-preview", category: "Tools",
    color: "from-sky-500 to-sky-600", status: "live",
  },

  // ============= Admin (ผู้ดูแลระบบ) =============
  {
    key: "schema-sync", icon: "🗂️", name: "Schema Sync", subtitle: "Field Registry v2 ⭐",
    href: "/admin/schema-sync", category: "Admin",
    color: "from-orange-600 to-red-600", status: "live",
  },
  {
    key: "users", icon: "👥", name: "ผู้ใช้ระบบ", subtitle: "Users & Access",
    href: "/admin/users", category: "Admin",
    color: "from-purple-500 to-purple-600", status: "live",
  },
  {
    key: "roles", icon: "🔐", name: "สิทธิ์การใช้งาน", subtitle: "Roles & Permissions",
    href: "/admin/roles-permissions", category: "Admin",
    color: "from-stone-600 to-stone-700", status: "live",
  },
  {
    key: "workflows", icon: "⚙️", name: "Workflow", subtitle: "Status & Approval Flow",
    href: "/admin/workflows", category: "Admin",
    color: "from-zinc-600 to-zinc-700", status: "live",
  },
  {
    key: "approvals", icon: "✋", name: "กฎอนุมัติ", subtitle: "Approval Rules",
    href: "/admin/approval-rules", category: "Admin",
    color: "from-neutral-600 to-neutral-700", status: "live",
  },
  {
    key: "form-builder", icon: "🧩", name: "ออกแบบฟอร์ม", subtitle: "Form Builder",
    href: "/admin/form-builder", category: "Admin",
    color: "from-slate-600 to-slate-700", status: "live",
  },
  {
    key: "line-members", icon: "LINE", name: "LINE พนักงาน", subtitle: "Employee Portal Binding",
    href: "/payroll/line-members", category: "Admin",
    color: "from-emerald-500 to-green-600", status: "live",
  },

  // ============= Coming Soon (เร็ว ๆ นี้) =============
  {
    key: "leave", icon: "🌴", name: "ใบขอลา", subtitle: "Leave Requests",
    href: "#", category: "Coming Soon",
    color: "from-green-400 to-green-500", status: "soon",
  },
  {
    key: "payroll", icon: "💵", name: "เงินเดือน", subtitle: "Payroll",
    href: "#", category: "Coming Soon",
    color: "from-yellow-400 to-yellow-500", status: "soon",
  },
  {
    key: "accounting", icon: "📒", name: "บัญชี", subtitle: "Accounting",
    href: "#", category: "Coming Soon",
    color: "from-red-400 to-red-500", status: "soon",
  },
  {
    key: "crm", icon: "🤝", name: "CRM", subtitle: "Lead & Opportunity",
    href: "#", category: "Coming Soon",
    color: "from-lime-400 to-lime-500", status: "soon",
  },
];

const CATEGORY_ORDER = ["Master Data v2", "Operations", "Master Data", "Tools", "Admin", "Coming Soon"];

const CATEGORY_LABEL: Record<string, string> = {
  "Master Data v2": "Master Data v2 ⭐ ใหม่",
  "Operations":     "การปฏิบัติงาน",
  "Master Data":    "ข้อมูลหลัก (เดิม)",
  "Tools":          "เครื่องมือ",
  "Admin":          "ผู้ดูแลระบบ",
  "Coming Soon":    "เร็ว ๆ นี้",
};

// ============================================================
// Page
// ============================================================

export default function AppLauncherPage() {
  const { user, ready, logout, can } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuRows, setMenuRows] = useState<MenuRow[] | null>(null);
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);   // แอป (ล็อก/ไม่ล็อก) — กรอง tile ตามสิทธิ์เข้าแอป

  // จำนวนงานค้างของฉัน (สำหรับการ์ด "งานของฉัน")
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    apiFetch("/api/notifications?limit=1").then((r) => r.json()).then((j) => {
      if (alive && typeof j.unread_count === "number") setPending(j.unread_count);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // โหลดทะเบียนเมนู → สร้าง tile จาก item ที่ตั้ง "โชว์ใน Launcher" (+ มีสิทธิ์); ไม่มี → ใช้ APPS default
  useEffect(() => {
    let alive = true;
    apiFetch("/api/menu").then((r) => r.json()).then((j) => {
      if (alive && Array.isArray(j.data)) setMenuRows(j.data as MenuRow[]);
    }).catch(() => { if (alive) setMenuRows([]); });
    // รายชื่อแอป (+permission_key) — ใช้ซ่อน tile ของแอปที่ถูกล็อกและไม่มีสิทธิ์ (เช่น Payroll สำหรับพนักงาน)
    apiFetch("/api/menu/apps").then((r) => r.json()).then((j) => {
      if (alive && Array.isArray(j.data)) setAppGroups((j.data as AppGroup[]).filter((a) => a.is_active));
    }).catch(() => { /* โหลดไม่ได้ = ไม่กรองด้วยแอป */ });
    return () => { alive = false; };
  }, []);

  const appList: AppEntry[] = useMemo(() => {
    if (!menuRows || menuRows.length === 0) return APPS;  // fallback
    // แอปที่เข้าได้ = ไม่ล็อก หรือมีสิทธิ์ตามล็อก (admin มีครบในชุด perms อยู่แล้ว)
    const okApps = new Set(appGroups.filter((a) => !a.permission_key || can(a.permission_key as Parameters<typeof can>[0])).map((a) => a.key));
    const hasGroups = appGroups.length > 0;
    return menuRows
      .filter((r) => r.is_active && r.show_in_launcher
        && r.href !== "/apps"   // ไม่โชว์การ์ด launcher เอง (ลิงก์มาหน้าเดิม → กดแล้วเหมือนไม่ทำงาน)
        && (!r.permission_key || can(r.permission_key as Parameters<typeof can>[0]))
        // เมนูที่สังกัดแอปถูกล็อก → ซ่อน (เว้นแต่สังกัดแอปอื่นที่เข้าได้ด้วย)
        && (!hasGroups || !r.app_keys?.length || r.app_keys.some((k) => okApps.has(k))))
      .map((r, i) => ({
        key: r.href, icon: r.icon ?? "📄", name: r.label, subtitle: r.section,
        href: r.href, category: r.section, color: TILE_COLORS[i % TILE_COLORS.length], status: "live" as AppStatus,
      }));
  }, [menuRows, can, appGroups]);

  // greeting ตามเวลา
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "อรุณสวัสดิ์";
    if (h < 17) return "สวัสดีตอนบ่าย";
    return "สวัสดีตอนเย็น";
  }, []);

  // filter apps by query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return appList;
    return appList.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.subtitle.toLowerCase().includes(q) ||
      a.key.includes(q)
    );
  }, [query, appList]);

  // group by category — เรียงตาม CATEGORY_ORDER ถ้ารู้จัก ไม่งั้นตามลำดับที่เจอ (รองรับ section จากทะเบียน)
  const grouped = useMemo(() => {
    const map = new Map<string, AppEntry[]>();
    const order: string[] = [];
    for (const a of filtered) {
      if (!map.has(a.category)) { map.set(a.category, []); order.push(a.category); }
      map.get(a.category)!.push(a);
    }
    const known = CATEGORY_ORDER.filter((c) => map.has(c));
    const unknown = order.filter((c) => !CATEGORY_ORDER.includes(c));
    return [...known, ...unknown].map((c) => ({ category: c, apps: map.get(c)! }));
  }, [filtered]);

  // Esc ปิด user menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* ============= Top bar ============= */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b border-slate-200/70">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/apps" className="flex items-center gap-2.5">
            <Logo size={28} />
            <div className="leading-tight">
              <div className="text-sm font-bold text-slate-900">{BRAND.name}</div>
              <div className="text-[10px] text-slate-400 -mt-0.5">App Launcher</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <span>🧪</span>
              <span>Playground</span>
            </Link>

            {ready && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-slate-700 max-w-[120px] truncate">
                    {user.name}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="text-sm font-semibold text-slate-800 truncate">{user.name}</div>
                      <div className="text-xs text-slate-500 truncate">{user.email}</div>
                      <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border ${roleColor(user.role)}`}>
                        {roleLabel(user.role)}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                        router.push("/login");
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            ) : ready ? (
              <Link
                href="/login"
                className="inline-flex items-center h-8 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                เข้าสู่ระบบ
              </Link>
            ) : (
              <div className="w-20 h-8 bg-slate-100 rounded-lg animate-pulse" />
            )}
          </div>
        </div>
      </header>

      {/* ============= Hero / Greeting ============= */}
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-6">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            {greeting}{user?.name ? `, ${user.name}` : ""} 👋
          </h1>
          <p className="mt-2 text-slate-500 text-sm sm:text-base">
            เลือกแอปที่ต้องการใช้งาน หรือพิมพ์ค้นหา
          </p>
        </div>

        {/* ============= Search ============= */}
        <div className="mt-6 max-w-md mx-auto">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาแอป… (เช่น 'สินค้า', 'ลูกค้า')"
              className="w-full h-11 pl-11 pr-4 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center"
                aria-label="ล้างค้นหา"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ============= งานของฉัน (การ์ดเด่น → Dashboard) ============= */}
      <section className="max-w-7xl mx-auto px-6 pb-2">
        <Link href="/dashboard"
          className="group flex items-center gap-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white px-5 py-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white text-2xl flex items-center justify-center shrink-0 shadow">🏠</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900">งานของฉัน</span>
              {pending !== null && pending > 0 && (
                <span className="text-[11px] font-semibold text-white bg-red-500 px-2 py-0.5 rounded-full">{pending} งานค้าง</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {pending === null ? "สรุปงานที่มอบหมายให้คุณ + ภาพรวมทีม"
                : pending > 0 ? `คุณมีงานค้าง ${pending} รายการ — คลิกเพื่อดูและจัดการ`
                : "ไม่มีงานค้าง เยี่ยมมาก! 🎉 — คลิกดูภาพรวม"}
            </p>
          </div>
          <span className="text-blue-500 text-lg shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      </section>

      {/* ============= App grid (grouped) ============= */}
      <main className="max-w-7xl mx-auto px-6 pb-16">
        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3 opacity-40">🔍</div>
            <p className="text-slate-500 text-sm">ไม่พบแอปที่ตรงกับ &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(({ category, apps }) => (
              <section key={category}>
                <div className="flex items-baseline gap-3 mb-4 px-1">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {CATEGORY_LABEL[category] ?? category}
                  </h2>
                  <span className="text-[10px] text-slate-400">
                    {apps.length} แอป
                  </span>
                  <div className="flex-1 h-px bg-slate-200/70" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {apps.map((app) => (
                    <AppTile key={app.key} app={app} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* ============= Footer ============= */}
      <footer className="border-t border-slate-200/70 bg-white/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-400">
          <span>{BRAND.name} — ระบบ ERP ของกลาง</span>
          <Link href="/" className="hover:text-slate-700 transition-colors">
            🧪 เปิด Playground (สำหรับ dev)
          </Link>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// AppTile — การ์ดแอป 1 ใบ
// ============================================================

function AppTile({ app }: { app: AppEntry }) {
  const disabled = app.status === "soon" || app.href === "#";

  const inner = (
    <>
      {/* icon block สี gradient */}
      <div
        className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center text-2xl shadow-sm mb-3 group-hover:scale-105 group-hover:shadow-md transition-all duration-200`}
      >
        <span className="drop-shadow-sm">{app.icon}</span>
      </div>

      <div className="text-sm font-semibold text-slate-900 leading-tight">
        {app.name}
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5 leading-tight truncate">
        {app.subtitle}
      </div>

      {app.status === "soon" && (
        <span className="absolute top-2 right-2 inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 rounded-full">
          เร็ว ๆ นี้
        </span>
      )}
      {app.status === "beta" && (
        <span className="absolute top-2 right-2 inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-full">
          BETA
        </span>
      )}
    </>
  );

  const className = `
    group relative flex flex-col items-start p-4 sm:p-5
    bg-white border border-slate-200/70 rounded-2xl
    transition-all duration-200
    ${disabled
      ? "opacity-60 cursor-not-allowed"
      : "hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
    }
  `;

  if (disabled) {
    return (
      <div className={className} aria-disabled="true">
        {inner}
      </div>
    );
  }

  return (
    <Link href={app.href} className={className}>
      {inner}
    </Link>
  );
}

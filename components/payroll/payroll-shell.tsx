"use client";

/**
 * PayrollShell — เปลือกแอปเดี่ยว (standalone) ของโมดูลเงินเดือน
 * โฟกัสเฉพาะงาน payroll: ไม่มี sidebar ERP รก ๆ — มี nav ของ payroll เอง + ปุ่มกลับ ERP เต็ม
 * ใช้ผ่าน app/payroll/layout.tsx (ตั้ง ShellPresentContext=true → MasterCRUDPage ไม่ห่อ shell ซ้ำ)
 * ยังเป็น worker/Supabase เดียวกัน + ใช้ของกลางเหมือนเดิม
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, BRAND } from "@/components/brand";
import { useAuth, roleLabel } from "@/components/auth";
import { NotificationBell } from "@/components/notification-bell";
import { PayrollPeriodProvider, usePayrollPeriod } from "@/components/payroll/payroll-period-context";
import { cachedGetJson } from "@/lib/shell-cache";

type NavItem = { href: string; icon: string; label: string; icon_url?: string | null };
type NavGroup = { group: string; items: NavItem[] };

// fallback (ใช้เมื่อโหลดเมนูกลางไม่ได้) — เมนูจริงดึงจาก /admin/menu (erp_menu_items + sections) ผ่าน useEffect ด้านล่าง
const FALLBACK_NAV: NavGroup[] = [
  { group: "ภาพรวม", items: [
    { href: "/payroll/dashboard", icon: "📊", label: "ภาพรวมเงินเดือน" },
  ] },
  { group: "ข้อมูลพนักงาน", items: [
    { href: "/payroll/employees", icon: "🪪", label: "พนักงาน" },
    { href: "/payroll/board", icon: "🗂️", label: "ผังพนักงาน (บอร์ด)" },
    { href: "/payroll/contracts", icon: "📄", label: "สัญญาจ้าง" },
    { href: "/payroll/resignations", icon: "📤", label: "แจ้งลาออก" },
    { href: "/payroll/warnings", icon: "⚠️", label: "ใบเตือนพนักงาน" },
    { href: "/payroll/line-members", icon: "LINE", label: "LINE พนักงาน" },
  ] },
  { group: "คำนวณเงินเดือน", items: [
    { href: "/payroll/periods", icon: "🗓️", label: "งวดเงินเดือน" },
    { href: "/payroll/manual-input", icon: "✏️", label: "ข้อมูลคำนวณ" },
    { href: "/payroll/review", icon: "✅", label: "ตรวจสอบเงินเดือน" },
    { href: "/payroll/calc-verify", icon: "🧮", label: "เทียบยอดคำนวณ" },
    { href: "/payroll/calc-run", icon: "▶️", label: "คำนวณงวด (พรีวิว)" },
    { href: "/payroll/payslips", icon: "🧾", label: "สลิปเงินเดือน" },
    { href: "/payroll/payments", icon: "🏦", label: "รอบจ่ายเงิน" },
    { href: "/payroll/exports", icon: "📤", label: "ส่งออกไฟล์เงินเดือน" },
    { href: "/payroll/attendance", icon: "⏰", label: "เวลาเข้าออก" },
    { href: "/payroll/recurring", icon: "🔁", label: "เงินประจำ" },
  ] },
  { group: "ตั้งค่า", items: [
    { href: "/payroll/settings", icon: "⚙️", label: "ศูนย์ตั้งค่า Payroll" },
    { href: "/payroll/employee-settings", icon: "⚙️", label: "ตั้งค่าเงินเดือนรายคน" },
    { href: "/payroll/employee-setting-templates", icon: "🧩", label: "Template รายคน" },
    { href: "/payroll/requests", icon: "📨", label: "คำขอพนักงาน" },
    { href: "/payroll/departments", icon: "🗂️", label: "แผนก" },
    { href: "/payroll/positions", icon: "🏷️", label: "ตำแหน่งงาน" },
    { href: "/payroll/cost-centers", icon: "🏦", label: "ศูนย์ต้นทุน" },
    { href: "/payroll/companies", icon: "🏢", label: "บริษัท" },
    { href: "/payroll/work-time-profiles", icon: "🕐", label: "โปรไฟล์เวลาทำงาน" },
    { href: "/payroll/public-holidays", icon: "🎌", label: "วันหยุดพิเศษ" },
  ] },
];

function PayrollPeriodSwitcher() {
  const { periods, periodId, selectedPeriod, setPeriodId, loading } = usePayrollPeriod();
  if (!periods.length && !loading) return null;

  return (
    <div className="hidden md:flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">งวดปัจจุบัน</span>
      <select
        value={periodId}
        onChange={(e) => setPeriodId(e.target.value)}
        disabled={loading || !periods.length}
        className="h-7 max-w-[220px] bg-transparent text-xs font-semibold text-slate-700 outline-none disabled:opacity-50"
      >
        {!periodId && <option value="">เลือกงวด</option>}
        {periods.map((p) => (
          <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>
        ))}
      </select>
      {selectedPeriod && (
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
          {selectedPeriod.status}
        </span>
      )}
    </div>
  );
}

function PayrollShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // เมนูจริงดึงจากระบบกลาง (/admin/menu) — แก้ไอคอน/ลำดับ/หมวด/ซ่อน-แสดง ได้เองที่นั่น
  const [nav, setNav] = useState<NavGroup[]>(FALLBACK_NAV);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mi, ms] = await Promise.all([
          cachedGetJson<{ data: Array<Record<string, unknown>> }>("/api/menu"),
          cachedGetJson<{ data: Array<Record<string, unknown>> }>("/api/menu/sections"),
        ]);
        const items = (mi?.data ?? []).filter((r) =>
          Array.isArray(r.app_keys) && (r.app_keys as string[]).includes("payroll") && r.is_active !== false && r.show_in_sidebar !== false);
        if (!items.length) return; // ไม่มีข้อมูล → คงใช้ fallback
        const secOrder = new Map<string, number>();
        (ms?.data ?? []).filter((s) => s.app_key === "payroll").forEach((s) => secOrder.set(String(s.name), Number(s.sort_order) || 100));
        const bySection = new Map<string, { order: number; items: NavItem[] }>();
        items.forEach((r) => {
          const sec = String(r.section || "อื่น ๆ");
          const g = bySection.get(sec) ?? { order: secOrder.get(sec) ?? (Number(r.section_order) || 100), items: [] };
          g.items.push({ href: String(r.href), icon: String(r.icon || "•"), label: String(r.label), icon_url: (r.icon_url as string) ?? null });
          bySection.set(sec, g);
        });
        const groups = Array.from(bySection.entries()).sort((a, b) => a[1].order - b[1].order).map(([group, g]) => ({ group, items: g.items }));
        if (alive && groups.length) setNav(groups);
      } catch { /* คง fallback */ }
    })();
    return () => { alive = false; };
  }, []);

  const Sidebar = (
    <nav className="flex flex-col gap-4 p-3">
      {nav.map((g) => (
        <div key={g.group}>
          <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>
          <div className="space-y-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    active ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-slate-600 hover:bg-slate-100"}`}>
                  <span className="text-base">
                    {it.icon_url
                      ? <img src={it.icon_url} alt="" className="inline-block h-4 w-4 object-contain align-[-2px]" />
                      : it.icon}
                  </span>
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Topbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="h-14 px-3 sm:px-4 flex items-center gap-3">
          <button onClick={() => setOpen((v) => !v)} className="lg:hidden p-2 -ml-1 text-slate-500 hover:bg-slate-100 rounded-lg" aria-label="เมนู">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Logo size={26} className="flex-shrink-0" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 hidden sm:block" />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">💰 เงินเดือน (Payroll)</div>
              <div className="text-[10px] text-slate-400">{BRAND.name} · โหมดแอปแยก</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <PayrollPeriodSwitcher />
            <NotificationBell />
            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="leading-tight text-right">
                  <div className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{roleLabel(user.role)}</div>
                </div>
              </div>
            )}
            <Link href="/apps" className="h-9 px-3 hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap">
              ← ERP เต็ม
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block w-60 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">{Sidebar}</aside>

        {/* Sidebar — mobile drawer */}
        {open && (
          <>
            <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
            <aside className="lg:hidden fixed left-0 top-14 bottom-0 z-40 w-64 bg-white border-r border-slate-200 overflow-y-auto">{Sidebar}</aside>
          </>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

export function PayrollShell({ children }: { children: React.ReactNode }) {
  return (
    <PayrollPeriodProvider>
      <PayrollShellInner>{children}</PayrollShellInner>
    </PayrollPeriodProvider>
  );
}

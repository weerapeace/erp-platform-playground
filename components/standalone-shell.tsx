"use client";

// ============================================================
// StandaloneShell — เปลือกหน้า "แอปแยกโฟกัสเต็ม" (ของกลาง)
// ใช้กับโมดูลหลักที่อยากเปิดเป็นแท็บแยก standalone (เช่น Task Manager)
// - ไม่มี sidebar ERP รก ๆ — มี topbar ของตัวเอง
// - ยังเป็นแอป/worker เดียวกัน + ใช้ของกลาง + Supabase เดียวกัน
//   (แชร์ SKU/Parent SKU ผ่าน API กลางเหมือนเดิม ไม่ต้อง sync)
// วิธีใช้: หน้า module ครอบด้วย <StandaloneShell title=... icon=...>{children}</StandaloneShell>
// แทนการครอบด้วย <PlaygroundShell>
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { Logo, BRAND } from "@/components/brand";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { useAuth, roleLabel } from "@/components/auth";

export function StandaloneShell({
  title, icon, accent = "violet", children,
}: {
  title: string;
  icon?: string;
  accent?: "violet" | "blue" | "emerald" | "slate";
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const dot = { violet: "bg-violet-500", blue: "bg-blue-500", emerald: "bg-emerald-500", slate: "bg-slate-500" }[accent];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top bar — โฟกัส ไม่มี sidebar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="h-14 px-4 flex items-center gap-3">
          {/* แบรนด์ + ชื่อโมดูล */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo size={26} className="flex-shrink-0" />
            <span className={`h-1.5 w-1.5 rounded-full ${dot} hidden sm:block`} />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                {icon && <span>{icon}</span>}{title}
              </div>
              <div className="text-[10px] text-slate-400">{BRAND.name} · โหมดแอปแยก</div>
            </div>
          </div>

          {/* ค้นหา (ของกลาง) */}
          <button onClick={() => setSearchOpen(true)}
            className="ml-2 hidden md:flex items-center gap-2 h-9 px-3 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors min-w-[180px]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <span className="flex-1 text-left">ค้นหา...</span>
            <kbd className="text-[9px] font-mono bg-white border border-slate-200 px-1 rounded text-slate-400">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="leading-tight text-right">
                  <div className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{roleLabel(user.role)}</div>
                </div>
              </div>
            )}
            {/* กลับเข้า ERP เต็ม (แท็บเดิม) */}
            <Link href="/apps" className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap">
              ⊞ <span className="hidden sm:inline">ทุก App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col">{children}</main>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

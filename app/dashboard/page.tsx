"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityEntry } from "@/components/activity-feed";
import { useAuth, roleLabel } from "@/components/auth";
import type { DashboardStats, DashboardResponse } from "@/app/api/dashboard/route";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats,    setStats]    = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then(r => r.json()) as Promise<DashboardResponse>,
      fetch("/api/audit-logs?limit=8").then(r => r.json()) as Promise<AuditLogsResponse>,
    ]).then(([d, a]) => {
      setStats(d.data);
      setActivity(a.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const baht = (n: number) => "฿" + n.toLocaleString("th-TH");

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-slate-900">
          ภาพรวมระบบ {user && <span className="text-slate-400 font-normal text-lg">· สวัสดี {user.name}</span>}
        </h1>
        <p className="text-slate-500 mt-1">
          {user ? `คุณเข้าใช้งานในบทบาท ${roleLabel(user.role)}` : "ยังไม่ได้เข้าสู่ระบบ"} — สรุปข้อมูลล่าสุดของ Products และ Purchase Request
        </p>
      </div>

      <div className="px-8 py-6 space-y-6">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : !stats ? (
          <div className="text-center py-12 text-slate-400">โหลดข้อมูลไม่ได้</div>
        ) : (
          <>
            {/* ---- Products stats ---- */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">สินค้า (Products)</h2>
                <Link href="/products-crud" className="text-xs text-blue-600 hover:underline">จัดการสินค้า →</Link>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="📦" label="สินค้าทั้งหมด" value={stats.products_total} tone="blue" href="/products-crud" />
                <StatCard icon="✅" label="ใช้งานอยู่" value={stats.products_active} tone="emerald" />
                <StatCard icon="⚠️" label="สต็อกต่ำ (<10)" value={stats.products_low_stock} tone="amber" />
                <StatCard icon="💰" label="มูลค่าสต็อกรวม" value={baht(stats.products_value)} tone="slate" small />
              </div>
            </section>

            {/* ---- PR stats ---- */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">ใบขอซื้อ (Purchase Request)</h2>
                <Link href="/purchase-requests" className="text-xs text-blue-600 hover:underline">จัดการใบขอซื้อ →</Link>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="📝" label="ร่าง" value={stats.pr_draft} tone="slate" href="/purchase-requests" />
                <StatCard icon="⏳" label="รออนุมัติ" value={stats.pr_submitted} tone="amber" href="/purchase-requests" badge={stats.pr_submitted > 0 ? "ต้องดำเนินการ" : undefined} />
                <StatCard icon="✅" label="อนุมัติแล้ว" value={stats.pr_approved} tone="emerald" />
                <StatCard icon="❌" label="ปฏิเสธ" value={stats.pr_rejected} tone="red" />
              </div>
              {/* amounts */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs text-emerald-600 mb-1">มูลค่าที่อนุมัติแล้ว</p>
                  <p className="text-2xl font-bold text-emerald-700 tabular-nums">{baht(stats.pr_approved_amount)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-600 mb-1">มูลค่ารออนุมัติ</p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums">{baht(stats.pr_pending_amount)}</p>
                </div>
              </div>
            </section>

            {/* ---- bottom: categories + activity ---- */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top categories */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">หมวดหมู่สินค้ายอดนิยม</h2>
                {stats.top_categories.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีข้อมูล</p>
                ) : (
                  <div className="space-y-3">
                    {stats.top_categories.map((c, i) => {
                      const max = stats.top_categories[0].count;
                      const pct = Math.round((c.count / max) * 100);
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-700 truncate mr-2">{c.name}</span>
                            <span className="text-slate-500 tabular-nums shrink-0">{c.count}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-700">กิจกรรมล่าสุด</h2>
                  <span className="text-xs text-slate-400">วันนี้ {stats.activity_today} รายการ</span>
                </div>
                <ActivityFeed entries={activity} compact showEntityName emptyMessage="ยังไม่มีกิจกรรม" />
              </div>
            </div>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}

// ---- Stat card ----

function StatCard({
  icon, label, value, tone, href, small, badge,
}: {
  icon: string; label: string; value: number | string;
  tone: "blue" | "emerald" | "amber" | "red" | "slate";
  href?: string; small?: boolean; badge?: string;
}) {
  const tones = {
    blue:    "hover:border-blue-300",
    emerald: "hover:border-emerald-300",
    amber:   "hover:border-amber-300",
    red:     "hover:border-red-300",
    slate:   "hover:border-slate-300",
  };
  const valColor = {
    blue: "text-blue-700", emerald: "text-emerald-700", amber: "text-amber-700",
    red: "text-red-600", slate: "text-slate-800",
  };
  const inner = (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 transition-colors ${href ? `cursor-pointer ${tones[tone]}` : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {badge && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{badge}</span>}
      </div>
      <p className={`${small ? "text-xl" : "text-3xl"} font-bold tabular-nums ${valColor[tone]}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

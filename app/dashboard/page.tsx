"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityEntry } from "@/components/activity-feed";
import { useAuth, roleLabel } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Notification, NotificationsResponse } from "@/app/api/notifications/route";
import type { DashboardStats, DashboardResponse } from "@/app/api/dashboard/route";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";

// ---- Event type → icon (ครอบคลุม event ที่ไหลเข้ามาจริง) ----
const EVENT_ICON: Record<string, string> = {
  "pr_created":          "🛒",
  "pr.submitted":        "🛒",
  "pr.approved":         "✅",
  "pr.rejected":         "❌",
  "pr.cancelled":        "⊘",
  "subtask_assigned":    "📋",
  "subtask_submitted":   "📤",
  "task_assigned":       "📋",
  "task_due_soon":       "⏰",
  "task_revise":         "✏️",
  "so.confirm":          "🧾",
  "security.new_device": "🔐",
};
const iconFor = (t: string) => EVENT_ICON[t] ?? "🔔";

// ---- time helpers ----
function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)      return "เมื่อสักครู่";
  if (diff < 3600)    return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest  = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "วันนี้";
  if (same(d, yest))  return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

const isSnoozed = (n: Notification) => !!n.snoozed_until && new Date(n.snoozed_until).getTime() > Date.now();
const isPinned  = (n: Notification) => !!n.pinned_at;

// ---- snooze presets ----
function snoozePresets(): { label: string; until: string }[] {
  const now = new Date();
  const inHours = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
  const tomorrow9 = () => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); };
  const nextWeek9 = () => { const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d.toISOString(); };
  return [
    { label: "อีก 1 ชั่วโมง",   until: inHours(1) },
    { label: "อีก 3 ชั่วโมง",   until: inHours(3) },
    { label: "พรุ่งนี้ 9 โมง",   until: tomorrow9() },
    { label: "สัปดาห์หน้า",     until: nextWeek9() },
  ];
}

type Tab = "unread" | "pinned" | "all" | "snoozed";

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ---- notifications (งานของฉัน) ----
  const [items, setItems]     = useState<Notification[]>([]);
  const [unread, setUnread]   = useState(0);
  const [loadingN, setLoadingN] = useState(true);
  const [errN, setErrN]       = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>("unread");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoadingN(true); setErrN(null);
    try {
      const res  = await apiFetch("/api/notifications?limit=100&include_snoozed=true");
      const json: NotificationsResponse = await res.json();
      if (json.error) { setErrN(json.error); }
      else {
        setItems(json.data);
        setUnread(json.unread_count);
        setLastRefreshed(new Date());
      }
    } catch {
      setErrN("โหลดการแจ้งเตือนไม่ได้ กรุณาลองรีเฟรช");
    } finally { setLoadingN(false); }
  }, [user]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // ---- ภาพรวมระบบ (ของเดิม) ----
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [errStats, setErrStats] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

  const loadOverview = useCallback(() => {
    setErrStats(false);
    Promise.all([
      fetch("/api/dashboard").then(r => r.json()) as Promise<DashboardResponse>,
      fetch("/api/audit-logs?limit=8").then(r => r.json()) as Promise<AuditLogsResponse>,
    ]).then(([d, a]) => {
      if (d.data) setStats(d.data); else setErrStats(true);
      setActivity(a.data ?? []);
    }).catch(() => setErrStats(true));
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  // ---- optimistic mutations ----
  const patch = async (body: Record<string, unknown>) => {
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { loadNotifications(); }
  };

  const openItem = (n: Notification) => {
    if (!n.read_at) {
      setItems(p => p.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnread(c => Math.max(0, c - 1));
      patch({ id: n.id });
    }
    if (n.link_url) router.push(n.link_url);
  };

  const togglePin = (n: Notification) => {
    const next = !isPinned(n);
    setItems(p => p.map(x => x.id === n.id ? { ...x, pinned_at: next ? new Date().toISOString() : null } : x));
    patch({ id: n.id, action: "pin", value: next });
  };

  const snooze = (n: Notification, until: string | null) => {
    setSnoozeOpen(null);
    setItems(p => p.map(x => x.id === n.id ? { ...x, snoozed_until: until } : x));
    // ถ้าเลื่อน notification ที่ยังไม่อ่าน ให้จำนวนงานค้างลดลงทันที
    if (until && !n.read_at) setUnread(c => Math.max(0, c - 1));
    if (!until && !n.read_at) setUnread(c => c + 1);
    patch({ id: n.id, action: "snooze", until });
  };

  const markAllRead = () => {
    setItems(p => p.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    setUnread(0);
    patch({ all: true });
  };

  // ---- tab filtering ----
  const counts = useMemo(() => ({
    unread:  items.filter(n => !n.read_at && !isSnoozed(n)).length,
    pinned:  items.filter(isPinned).length,
    snoozed: items.filter(isSnoozed).length,
  }), [items]);

  const visible = useMemo(() => {
    let list: Notification[];
    if (tab === "unread")       list = items.filter(n => !n.read_at && !isSnoozed(n));
    else if (tab === "pinned")  list = items.filter(isPinned);
    else if (tab === "snoozed") list = items.filter(isSnoozed);
    else                        list = items.filter(n => !isSnoozed(n));
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [items, tab]);

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of visible) {
      const k = dayLabel(n.created_at);
      (map.get(k) ?? map.set(k, []).get(k)!).push(n);
    }
    return Array.from(map.entries());
  }, [visible]);

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <PlaygroundShell>
      {/* ---- Header ---- */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              สวัสดี {firstName || "ผู้ใช้"} 👋
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {unread > 0
                ? <>คุณมีงานค้าง <span className="font-semibold text-slate-700">{unread}</span> รายการ</>
                : "ไม่มีงานค้าง เยี่ยมมาก! 🎉"}
              {user && <span className="text-slate-400"> · บทบาท {roleLabel(user.role)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {lastRefreshed && <span className="hidden sm:inline">อัปเดต {lastRefreshed.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button onClick={loadNotifications} disabled={loadingN}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <span className={loadingN ? "animate-spin" : ""}>🔄</span> รีเฟรช
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-5 max-w-4xl">
        {/* ---- Tabs ---- */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <TabBtn active={tab === "unread"}  onClick={() => setTab("unread")}  label="ยังไม่อ่าน" count={counts.unread} />
          <TabBtn active={tab === "pinned"}  onClick={() => setTab("pinned")}  label="📌 ปักหมุด"  count={counts.pinned} />
          <TabBtn active={tab === "all"}     onClick={() => setTab("all")}     label="ทั้งหมด" />
          <TabBtn active={tab === "snoozed"} onClick={() => setTab("snoozed")} label="💤 เลื่อนไว้" count={counts.snoozed} />
          <div className="flex-1" />
          {counts.unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline px-2">อ่านทั้งหมด</button>
          )}
        </div>

        {/* ---- Notification feed ---- */}
        {errN ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{errN}</span>
            <button onClick={loadNotifications} className="text-red-600 underline shrink-0 ml-3">ลองใหม่</button>
          </div>
        ) : loadingN && items.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="space-y-5">
            {groups.map(([label, list]) => (
              <div key={label}>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">{label}</div>
                <div className="space-y-2">
                  {list.map(n => (
                    <NotifRow key={n.id} n={n}
                      snoozeOpen={snoozeOpen === n.id}
                      onOpen={() => openItem(n)}
                      onTogglePin={() => togglePin(n)}
                      onSnoozeMenu={() => setSnoozeOpen(o => o === n.id ? null : n.id)}
                      onSnooze={(until) => snooze(n, until)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- ภาพรวมระบบ (ของเดิม พับเก็บได้) ---- */}
        <div className="pt-2">
          <button onClick={() => setShowOverview(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <span className="text-sm font-semibold text-slate-700">📊 ภาพรวมระบบ (สินค้า / ใบขอซื้อ)</span>
            <span className="text-slate-400 text-sm">{showOverview ? "▲ ซ่อน" : "▼ แสดง"}</span>
          </button>
          {showOverview && (
            <div className="mt-4">
              <SystemOverview stats={stats} activity={activity} err={errStats} onRetry={loadOverview} />
            </div>
          )}
        </div>
      </div>
    </PlaygroundShell>
  );
}

// ---- Tab button ----
function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick}
      className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
        active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}>
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-white/25" : "bg-slate-200 text-slate-600"}`}>{count}</span>
      )}
    </button>
  );
}

// ---- Notification row ----
function NotifRow({
  n, snoozeOpen, onOpen, onTogglePin, onSnoozeMenu, onSnooze,
}: {
  n: Notification;
  snoozeOpen: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onSnoozeMenu: () => void;
  onSnooze: (until: string | null) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const unreadRow = !n.read_at;
  const pinned = isPinned(n);
  const snoozed = isSnoozed(n);
  const priBar = n.priority === "high" ? "border-l-red-400" : n.priority === "low" ? "border-l-slate-200" : "border-l-blue-400";

  useEffect(() => {
    if (!snoozeOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onSnoozeMenu(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [snoozeOpen, onSnoozeMenu]);

  return (
    <div className={`relative bg-white rounded-xl border border-slate-200 border-l-4 ${priBar} ${unreadRow ? "bg-blue-50/30" : ""} hover:shadow-sm transition-shadow`}>
      <div className="flex gap-3 p-3">
        <button onClick={onOpen} className="flex gap-3 flex-1 min-w-0 text-left">
          <div className="text-xl leading-none mt-0.5 shrink-0">{iconFor(n.event_type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {pinned && <span className="text-xs shrink-0" title="ปักหมุด">📌</span>}
              <span className={`text-sm ${unreadRow ? "font-semibold text-slate-900" : "text-slate-700"} truncate`}>{n.title}</span>
            </div>
            {n.body && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</div>}
            <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
              <span>{relTime(n.created_at)}</span>
              {snoozed && <span className="text-amber-600">💤 เลื่อนถึง {new Date(n.snoozed_until!).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
              {n.link_url && <span className="text-blue-500">เปิดดู →</span>}
            </div>
          </div>
        </button>

        {/* actions */}
        <div className="flex items-start gap-0.5 shrink-0">
          <button onClick={onTogglePin} title={pinned ? "เลิกปักหมุด" : "ปักหมุด"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 ${pinned ? "opacity-100" : "opacity-40 hover:opacity-100"}`}>📌</button>
          <div className="relative" ref={menuRef}>
            <button onClick={onSnoozeMenu} title="เลื่อนดูทีหลัง"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 opacity-40 hover:opacity-100">💤</button>
            {snoozeOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                {snoozed ? (
                  <button onClick={() => onSnooze(null)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">↩ เลิกเลื่อน (กลับมาแสดง)</button>
                ) : (
                  snoozePresets().map(p => (
                    <button key={p.label} onClick={() => onSnooze(p.until)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">{p.label}</button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Empty state (ต่อแท็บ) ----
function EmptyState({ tab }: { tab: Tab }) {
  const map: Record<Tab, { icon: string; text: string }> = {
    unread:  { icon: "🎉", text: "ไม่มีงานค้าง เยี่ยมมาก!" },
    pinned:  { icon: "📌", text: "ยังไม่มีงานที่ปักหมุดไว้" },
    all:     { icon: "🔔", text: "ยังไม่มีการแจ้งเตือน" },
    snoozed: { icon: "💤", text: "ไม่มีงานที่เลื่อนไว้" },
  };
  const { icon, text } = map[tab];
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-200 py-14 text-center">
      <div className="text-4xl mb-3 opacity-40">{icon}</div>
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

// ---- System overview (ของเดิม ยกมาไว้ล่าง) ----
function SystemOverview({ stats, activity, err, onRetry }: {
  stats: DashboardStats | null; activity: ActivityEntry[]; err: boolean; onRetry: () => void;
}) {
  const baht = (n: number) => "฿" + n.toLocaleString("th-TH");

  if (err) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between">
      <span>โหลดภาพรวมระบบไม่ได้</span>
      <button onClick={onRetry} className="text-red-600 underline shrink-0 ml-3">ลองใหม่</button>
    </div>
  );
  if (!stats) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
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

      <div className="grid lg:grid-cols-2 gap-6">
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

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">กิจกรรมล่าสุด</h2>
            <span className="text-xs text-slate-400">วันนี้ {stats.activity_today} รายการ</span>
          </div>
          <ActivityFeed entries={activity} compact showEntityName emptyMessage="ยังไม่มีกิจกรรม" />
        </div>
      </div>
    </div>
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
    blue: "hover:border-blue-300", emerald: "hover:border-emerald-300",
    amber: "hover:border-amber-300", red: "hover:border-red-300", slate: "hover:border-slate-300",
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

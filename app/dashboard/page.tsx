"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityEntry } from "@/components/activity-feed";
import { useAuth, roleLabel } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Notification, NotificationsResponse, TeamNotification, TeamNotificationsResponse } from "@/app/api/notifications/route";
import type { DashboardStats, DashboardResponse } from "@/app/api/dashboard/route";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";
import { SystemCards, type SystemApp } from "./system-cards";
import { DashboardCalendar } from "./dashboard-calendar";
import { PanelConfigModal } from "./panel-config-modal";
import { systemForEvent, type DashboardPanel } from "@/lib/dashboard-systems";
import { KpiStrip } from "./kpi-strip";
import { ExecutiveView } from "./executive-view";
import { EmbedModal } from "@/components/embed-modal";
import { PinnedWidget, RecentWidget, AgendaWidget, FinanceWidget, ActivityWidget, TeamWidget, ShortcutsWidget, StatWidget, SalesChartWidget } from "./widgets";
import { layoutForRole, type DashboardLayout, type DashboardView } from "@/lib/dashboard-widgets";

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

// ป้าย/ไอคอน หัวกลุ่ม module (ใช้ในแท็บ "รายการ" — จัดกลุ่มตามระบบ) · ใช้ชื่อแอปจริงถ้ามี
const MODULE_LABEL: Record<string, string> = {
  purchasing: "จัดซื้อ", tasks: "จัดการงาน / ออกแบบ", qc: "QC", sales: "ขาย", production: "ผลิต",
  subscriptions: "สมาชิก / ต่ออายุ", settings: "ความปลอดภัย", misc: "อื่น ๆ",
};
const MODULE_ICON: Record<string, string> = {
  purchasing: "🛒", tasks: "🗂️", qc: "✅", sales: "💰", production: "🏭",
  subscriptions: "🔔", settings: "⚙️", misc: "📌",
};

// ---- time helpers ----
function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)      return "เมื่อสักครู่";
  if (diff < 3600)    return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
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

type Tab = "unread" | "pinned" | "all" | "snoozed" | "team";

export default function DashboardPage() {
  const { user, can } = useAuth();

  // ---- แดชบอร์ดรวมทุกระบบ: view + scope + ระบบ + ตั้งค่าการ์ด ----
  const [view, setView]   = useState<DashboardView>("systems");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [layouts, setLayouts] = useState<DashboardLayout[]>([]);   // หน้าแดชบอร์ดต่อ role (เฟส 3)
  const [layoutsLoaded, setLayoutsLoaded] = useState(false);
  const viewInitRef = useRef(false);   // ตั้งมุมมองเริ่มต้นจาก layout ของ role แค่ครั้งเดียว
  const [apps, setApps]   = useState<(SystemApp & { permission_key: string | null })[]>([]);
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});   // "งานค้างจริง" ต่อระบบ (เฟส 4)
  const [salesTrend, setSalesTrend] = useState<{ d: string; sales: number }[]>([]);   // widget กราฟยอดขาย
  const [configApp, setConfigApp] = useState<SystemApp | null>(null);
  const [listFilter, setListFilter] = useState<string | null>(null);   // กรอง list ตามระบบ (จาก "ดูทั้งหมด")

  useEffect(() => {
    apiFetch("/api/menu/apps").then((r) => r.json())
      .then((j) => setApps(((j.data ?? []) as (SystemApp & { permission_key: string | null; is_active?: boolean })[])
        .filter((a) => a.is_active !== false && a.key !== "home")))
      .catch(() => { /* ใช้แบบไม่มีการ์ดระบบไปก่อน */ });
    apiFetch("/api/dashboard/panels").then((r) => r.json())
      .then((j) => setPanels((j.data ?? []) as DashboardPanel[]))
      .catch(() => { /* ไม่มีตั้งค่า = ใช้ค่าเริ่มต้น */ });
    apiFetch("/api/dashboard/metrics").then((r) => r.json())
      .then((j) => setMetrics((j.data ?? {}) as Record<string, number>))
      .catch(() => { /* ไม่มีเลขจริง = โชว์แค่จำนวนแจ้งเตือน */ });
    apiFetch("/api/dashboard/layouts").then((r) => r.json())
      .then((j) => setLayouts((j.data ?? []) as DashboardLayout[]))
      .catch(() => { /* ไม่มี layout = ใช้ค่าเริ่มต้น */ })
      .finally(() => setLayoutsLoaded(true));
    apiFetch("/api/dashboard/sales-trend").then((r) => r.json())
      .then((j) => setSalesTrend((j.data ?? []) as { d: string; sales: number }[]))
      .catch(() => { /* ไม่มีข้อมูลยอดขาย */ });
  }, []);

  // ---- notifications (งานของฉัน) ----
  const [items, setItems]     = useState<Notification[]>([]);
  const [unread, setUnread]   = useState(0);
  const [loadingN, setLoadingN] = useState(true);
  const [errN, setErrN]       = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>("unread");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null);
  const [linkModal, setLinkModal] = useState<{ url: string; title: string } | null>(null);   // เปิดลิงก์แจ้งเตือนเป็น popup (ฝังหน้าจริง)

  // ---- ภาพรวมทีม (owner/manager เท่านั้น) ----
  const [teamItems, setTeamItems]     = useState<TeamNotification[]>([]);
  const [teamAllowed, setTeamAllowed] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);

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

  const loadTeam = useCallback(async () => {
    if (!user) return;
    setTeamLoading(true);
    try {
      const res  = await apiFetch("/api/notifications?scope=team&limit=300");
      const json: TeamNotificationsResponse = await res.json();
      setTeamAllowed(!!json.allowed);
      setTeamItems(json.data ?? []);
    } catch { /* silent — ไม่มีสิทธิ์/โหลดไม่ได้ ก็แค่ไม่โชว์แท็บ */ }
    finally { setTeamLoading(false); }
  }, [user]);
  useEffect(() => { loadTeam(); }, [loadTeam]);

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
    if (n.link_url) setLinkModal({ url: n.link_url, title: n.title });   // เปิดเป็น popup (ฝังหน้าจริง) แทนเด้งออก
  };

  // ✓ ปิดงานจากการ์ด (mark read แต่ไม่เปิดหน้า) — เอาออกจาก "งานค้าง"
  const markDone = (n: Notification) => {
    if (n.read_at) return;
    setItems(p => p.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    setUnread(c => Math.max(0, c - 1));
    patch({ id: n.id });
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
    if (listFilter) list = list.filter(n => systemForEvent(n.event_type) === listFilter);
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [items, tab, listFilter]);

  // จัดกลุ่ม "รายการที่ต้องจัดการ / อนุมัติ" ตาม module (ระบบ) — มาก→น้อย
  const moduleGroups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of visible) {
      const k = systemForEvent(n.event_type);
      (map.get(k) ?? map.set(k, []).get(k)!).push(n);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [visible]);

  // ---- 🎯 โฟกัสวันนี้ — จัดอันดับงานที่ควรทำก่อน (จากงานค้างทั้งหมด) ----
  const focusItems = useMemo(() => {
    const now = Date.now();
    const score = (n: Notification) => {
      let s = 0;
      if (isPinned(n)) s += 300;                              // ปักหมุด = สำคัญสุด
      if (n.due_at) {
        const d = new Date(n.due_at).getTime();
        if (d < now) s += 250;                                // เกินกำหนด
        else if (d - now < 86_400_000) s += 120;              // ครบใน 24 ชม.
      }
      s += n.priority === "high" ? 100 : n.priority === "low" ? 0 : 10;
      if (!n.read_at) s += 30;
      const ageH = (now - new Date(n.created_at).getTime()) / 3_600_000;
      s += Math.max(0, 48 - ageH) * 0.5;                      // งานใหม่ๆ ดันขึ้นเล็กน้อย
      return s;
    };
    return items
      .filter(n => !n.read_at && !isSnoozed(n))
      .map(n => ({ n, s: score(n) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map(x => x.n);
  }, [items]);

  const firstName = user?.name?.split(" ")[0] ?? "";

  // ---- ระบบที่ user เห็นได้ (ต่อยอดสิทธิ์แอปเดิม + ตั้งค่าซ่อน/role override) ----
  const panelMap = useMemo(() => new Map(panels.map(p => [p.app_key, p])), [panels]);
  const visibleApps = useMemo(() => apps.filter(a => {
    const p = panelMap.get(a.key);
    if (p?.hidden) return false;
    if (p?.visible_roles && p.visible_roles.length && user?.role !== "admin" && !p.visible_roles.includes(user?.role ?? "")) return false;
    if (a.permission_key && !can(a.permission_key as Parameters<typeof can>[0])) return false;
    return true;
  }), [apps, panelMap, user, can]);
  const isAdmin = user?.role === "admin" || can("admin.users" as Parameters<typeof can>[0]);
  const scopeList: Notification[] = scope === "team" ? teamItems : items;
  // เปิดงาน: ของฉัน = mark read + ไป · ทีม = ไปอย่างเดียว (ไม่แตะสถานะคนอื่น)
  const openAny = (n: Notification) => { if (scope === "mine") openItem(n); else if (n.link_url) setLinkModal({ url: n.link_url, title: n.title }); };

  // หน้าแดชบอร์ดตาม role (เฟส 3): widget เสริม + มุมมองเริ่มต้น (ไม่มี layout = ค่าเริ่มต้นเดิม)
  const myLayout = useMemo(() => layoutForRole(layouts, user?.role), [layouts, user]);
  useEffect(() => {
    if (viewInitRef.current || !user || !layoutsLoaded) return;
    setView(myLayout.default_view);
    viewInitRef.current = true;
  }, [user, layoutsLoaded, myLayout]);

  return (
    <PlaygroundShell>
      {/* ---- Header ---- */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-4xl mx-auto w-full flex flex-wrap items-start justify-between gap-3">
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
            <button onClick={() => { loadNotifications(); loadTeam(); }} disabled={loadingN}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <span className={loadingN ? "animate-spin" : ""}>🔄</span> รีเฟรช
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-5 max-w-4xl mx-auto w-full">
        {/* ---- widget เสริม (เรียง/เปิด-ปิด ตามหน้าแดชบอร์ดของตำแหน่ง — เฟส 3) ---- */}
        {/* มุมมองผู้บริหารเป็นหน้าเต็มของตัวเอง ไม่โชว์ widget strip ซ้ำ */}
        {view !== "executive" && myLayout.widgets.map((w) => {
          if (w === "goals") return <GoalsEntryCard key="goals" />;
          if (w === "kpi") return <KpiStrip key="kpi" unread={unread} metrics={metrics} apps={visibleApps} />;
          if (w === "focus") return (scope === "mine" && view === "systems" && focusItems.length > 0)
            ? <FocusBand key="focus" items={focusItems} onOpen={openItem} /> : null;
          if (w === "pinned") return <PinnedWidget key="pinned" items={items} onOpen={openItem} />;
          if (w === "recent") return <RecentWidget key="recent" items={items} onOpen={openItem} />;
          if (w === "agenda") return <AgendaWidget key="agenda" items={items} onOpen={openItem} />;
          if (w === "finance") return <FinanceWidget key="finance" items={items} onOpen={openItem} />;
          if (w === "activity") return <ActivityWidget key="activity" activity={activity} />;
          if (w === "team") return teamAllowed ? <TeamWidget key="team" teamItems={teamItems} /> : null;
          if (w === "shortcuts") return <ShortcutsWidget key="shortcuts" apps={visibleApps} />;
          if (w === "lowstock") return <StatWidget key="lowstock" icon="📦" title="สต๊อกใกล้หมด" value={stats?.products_low_stock ?? 0} unit="รายการ" href="/inventory" hint="สินค้าต่ำกว่าขั้นต่ำ" />;
          if (w === "production") return <StatWidget key="production" icon="🏭" title="สถานะผลิต" value={metrics.production ?? 0} unit="งานยังไม่เสร็จ" href="/master/manufacturing-orders" />;
          if (w === "saleschart") return <SalesChartWidget key="saleschart" data={salesTrend} />;
          return null;
        })}

        {/* ---- view switcher + สลับของฉัน/ทีม ---- */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
            {([
              ...(isAdmin ? [["executive", "👔 ผู้บริหาร"]] : []),
              ["systems", "🗂️ การ์ดระบบ"], ["calendar", "📅 ปฏิทิน"], ["list", "📋 รายการ"],
            ] as [DashboardView, string][]).map(([v, l]) => (
              <button key={v} onClick={() => { setView(v); if (v !== "list") setListFilter(null); }}
                className={`text-xs sm:text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
            ))}
          </div>
          {teamAllowed && (
            <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setScope("mine")} className={`text-xs sm:text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${scope === "mine" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>🙋 ของฉัน</button>
              <button onClick={() => setScope("team")} className={`text-xs sm:text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${scope === "team" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>👥 ทีม</button>
            </div>
          )}
          <div className="flex-1" />
          {view === "list" && scope === "mine" && counts.unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline px-2">อ่านทั้งหมด</button>
          )}
        </div>

        {/* ---- เนื้อหาตามโหมด ---- */}
        {view === "executive" ? (
          <ExecutiveView />
        ) : view === "systems" ? (
          <SystemCards apps={visibleApps} list={scopeList} panels={panelMap} metrics={metrics} team={scope === "team"} isAdmin={isAdmin}
            onOpen={openAny}
            onDone={scope === "mine" ? markDone : undefined}
            onConfig={isAdmin ? (k) => setConfigApp(visibleApps.find(a => a.key === k) ?? null) : undefined}
            onSeeAll={(k) => { setView("list"); setListFilter(k); setTab("all"); }} />
        ) : view === "calendar" ? (
          <DashboardCalendar apps={visibleApps} list={scopeList} team={scope === "team"} onOpen={openAny} />
        ) : scope === "team" ? (
          <TeamView items={teamItems} loading={teamLoading} onOpen={(n) => { if (n.link_url) setLinkModal({ url: n.link_url, title: n.title }); }} />
        ) : (
          <>
            {listFilter && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">กรองระบบ:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
                  {visibleApps.find(a => a.key === listFilter)?.label ?? listFilter}
                  <button onClick={() => setListFilter(null)} className="hover:text-blue-900">✕</button>
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <TabBtn active={tab === "unread"}  onClick={() => setTab("unread")}  label="ยังไม่อ่าน" count={counts.unread} />
              <TabBtn active={tab === "pinned"}  onClick={() => setTab("pinned")}  label="📌 ปักหมุด"  count={counts.pinned} />
              <TabBtn active={tab === "all"}     onClick={() => setTab("all")}     label="ทั้งหมด" />
              <TabBtn active={tab === "snoozed"} onClick={() => setTab("snoozed")} label="💤 เลื่อนไว้" count={counts.snoozed} />
            </div>
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
                {moduleGroups.map(([key, list]) => (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="text-base leading-none">{MODULE_ICON[key] ?? "📌"}</span>
                      <span className="text-sm font-semibold text-slate-700">{visibleApps.find(a => a.key === key)?.label ?? MODULE_LABEL[key] ?? key}</span>
                      <span className="text-[11px] text-slate-400">{list.length} รายการที่ต้องจัดการ</span>
                    </div>
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
          </>
        )}

        {/* ---- ภาพรวมระบบ (ของเดิม พับเก็บได้) — ซ่อนในมุมมองผู้บริหาร ---- */}
        {view !== "executive" && <div className="pt-2">
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
        </div>}
      </div>

      {/* ⚙️ ตั้งค่าการ์ดระบบ (แอดมิน) */}
      {configApp && (
        <PanelConfigModal app={configApp} panel={panelMap.get(configApp.key)}
          onClose={() => setConfigApp(null)}
          onSaved={(p) => setPanels((ps) => [...ps.filter((x) => x.app_key !== p.app_key), p])} />
      )}

      {/* 🔗 กดแจ้งเตือน → เปิดลิงก์เป็น popup (ฝังหน้าจริง ไม่หลุดออกจาก Dashboard) */}
      {linkModal && <EmbedModal url={linkModal.url} title={linkModal.title} onClose={() => setLinkModal(null)} />}
    </PlaygroundShell>
  );
}

// ---- ทางเข้าแอปเป้าหมาย (การ์ดบน Dashboard) ----
function GoalsEntryCard() {
  return (
    <Link href="/goals"
      className="flex items-center gap-3 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3 hover:border-violet-300 hover:shadow-sm transition-all">
      <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-xl shrink-0">🎯</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800">เป้าหมาย &amp; เก็บเงิน</div>
        <div className="text-xs text-slate-500 truncate">ตั้งเป้า · เก็บเงิน/คำนวณ · ออกกำลังกาย · สะสมเหรียญ</div>
      </div>
      <span className="text-violet-600 text-sm font-medium shrink-0">เปิดแอป →</span>
    </Link>
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
    team:    { icon: "👥", text: "ยังไม่มีงานของทีม" },
  };
  const { icon, text } = map[tab];
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-200 py-14 text-center">
      <div className="text-4xl mb-3 opacity-40">{icon}</div>
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

// ---- 🎯 Today Focus band ----
function FocusBand({ items, onOpen }: { items: Notification[]; onOpen: (n: Notification) => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-sm">🎯</span>
        <span className="text-sm font-semibold text-slate-800">โฟกัสวันนี้</span>
        <span className="text-[11px] text-slate-500">{items.length} งานที่ควรทำก่อน</span>
      </div>
      <div className="space-y-1.5">
        {items.map((n, i) => (
          <button key={n.id} onClick={() => onOpen(n)}
            className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/70 hover:bg-white border border-amber-100 hover:border-amber-200 transition-colors">
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="text-base shrink-0">{iconFor(n.event_type)}</span>
            <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate">{n.title}</span>
            {n.priority === "high" && <span className="text-[9px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">ด่วน</span>}
            {isPinned(n) && <span className="text-xs shrink-0" title="ปักหมุด">📌</span>}
            <span className="text-[10px] text-slate-400 shrink-0">{relTime(n.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Team overview (owner/manager) ----
type TeamPerson = { id: string; name: string; color: string | null; items: TeamNotification[]; unread: number };

function TeamView({ items, loading, onOpen }: {
  items: TeamNotification[]; loading: boolean; onOpen: (n: TeamNotification) => void;
}) {
  const people = useMemo<TeamPerson[]>(() => {
    const map = new Map<string, TeamPerson>();
    for (const n of items) {
      if (!map.has(n.user_id)) map.set(n.user_id, { id: n.user_id, name: n.recipient_name, color: n.recipient_color, items: [], unread: 0 });
      map.get(n.user_id)!.items.push(n);
    }
    const arr = Array.from(map.values());
    for (const p of arr) p.unread = p.items.filter(n => !n.read_at && !isSnoozed(n)).length;
    arr.sort((a, b) => b.unread - a.unread || a.name.localeCompare(b.name, "th"));
    return arr;
  }, [items]);

  if (loading && items.length === 0)
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}</div>;
  if (people.length === 0)
    return <div className="bg-white rounded-xl border border-dashed border-slate-200 py-14 text-center"><div className="text-4xl mb-3 opacity-40">👥</div><p className="text-sm text-slate-400">ยังไม่มีงานของทีม</p></div>;

  const totalUnread = people.reduce((s, p) => s + p.unread, 0);
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 px-1">{people.length} คน · งานค้างรวม <span className="font-semibold text-slate-700">{totalUnread}</span> รายการ</div>
      {people.map(p => <TeamPersonCard key={p.id} person={p} onOpen={onOpen} />)}
    </div>
  );
}

function TeamPersonCard({ person, onOpen }: { person: TeamPerson; onOpen: (n: TeamNotification) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? person.items : person.items.slice(0, 5);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: person.color || "#64748b" }}>{person.name.charAt(0).toUpperCase()}</span>
        <span className="text-sm font-medium text-slate-800 flex-1 truncate">{person.name}</span>
        {person.unread > 0
          ? <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">ค้าง {person.unread}</span>
          : <span className="text-[10px] text-emerald-600">✓ ไม่มีค้าง</span>}
      </div>
      <div className="divide-y divide-slate-50">
        {shown.map(n => (
          <button key={n.id} onClick={() => onOpen(n)}
            className="w-full text-left px-4 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors">
            <span className="text-base shrink-0">{iconFor(n.event_type)}</span>
            <span className={`flex-1 min-w-0 text-xs truncate ${!n.read_at ? "font-semibold text-slate-800" : "text-slate-600"}`}>{n.title}</span>
            {!n.read_at && !isSnoozed(n) && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
            <span className="text-[10px] text-slate-400 shrink-0">{relTime(n.created_at)}</span>
          </button>
        ))}
      </div>
      {person.items.length > 5 && (
        <button onClick={() => setExpanded(e => !e)}
          className="w-full text-[11px] text-slate-500 hover:bg-slate-50 py-1.5 border-t border-slate-100">
          {expanded ? "ย่อ" : `+ อีก ${person.items.length - 5} รายการ`}
        </button>
      )}
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

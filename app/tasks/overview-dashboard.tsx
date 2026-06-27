"use client";

// ============================================================
// Overview Dashboard — หน้าแรกของแอป "จัดการงาน" (รวมตารางงานในตัว + แต่งเองได้ต่อคน)
// Hero ทักทาย (ธีมแต่งได้) + การ์ดสรุป (= ตัวกรอง, ไอคอน/สีแต่งได้) + ตารางกลางกรองตามการ์ด (ซ้าย 2/3) + แคมเปญ (ขวา 1/3) + ทางลัด
// ของกลาง: reuse ข้อมูลที่หน้า /tasks โหลดอยู่แล้ว + DataTable กลาง · ธีมต่อคนจาก user_ui_prefs
// ============================================================

import { useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { DataTable } from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { isTerminal } from "./use-statuses";
import { taskTypeLabel } from "./use-options";
import { isOverdue, type CreativeTask, type Campaign, type MySubtask, type BrandOption } from "./data";
import { CAMPAIGN_STATUS } from "./campaigns/campaign-drawer";
import { OverviewCustomizer, CARD_COLORS, heroStyle, type OverviewTheme, type CardKey, type CardTheme } from "./overview-customizer";

const CSTATUS = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.value, s]));

export type OvFilter = "all" | "mine" | "review" | "overdue";
type Counts = { total: number; mine: number; overdue: number; review: number };

export function OverviewDashboard({
  userName, counts, myTasks, mySubs, campaigns, tasks, brands, columns, filter, isAdmin,
  theme, canUpload, onThemeChange,
  onFilter, onOpenTask, onCreate, onOpenKnowledge,
}: {
  userName?: string;
  counts: Counts;
  myTasks: CreativeTask[];
  mySubs: MySubtask[];
  campaigns: Campaign[];
  tasks: CreativeTask[];
  brands: BrandOption[];
  columns: ColumnDef<CreativeTask>[];
  filter: OvFilter;
  isAdmin: boolean;
  theme: OverviewTheme;
  canUpload: boolean;
  onThemeChange: (t: OverviewTheme) => void;
  onFilter: (f: OvFilter) => void;
  onOpenTask: (id: string) => void;
  onCreate: () => void;
  onOpenKnowledge: () => void;
}) {
  const t = useT();
  const [customizing, setCustomizing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");    // ประเภทงาน (Tab) — "" = ทั้งหมด
  const [brandFilter, setBrandFilter] = useState("");  // แบรนด์ (ชิป) — "" = ทั้งหมด

  // งานของฉัน = งานหลักของฉัน ∪ งานที่มีงานย่อย (subtask) ของฉัน
  const myTaskIds = useMemo(() => {
    const s = new Set(myTasks.map((tk) => tk.id));
    for (const sub of mySubs) if (sub.task_id) s.add(sub.task_id);
    return s;
  }, [myTasks, mySubs]);
  const mineCount = myTaskIds.size;

  // ประเภทงานที่ "มีจริง" ในข้อมูล (no hardcode) → ทำ Tabs · เรียงตามชื่อ
  const typeOptions = useMemo(() => {
    const present = new Set<string>();
    for (const tk of tasks) if (tk.task_type) present.add(tk.task_type);
    return [...present].map((v) => ({ value: v, label: taskTypeLabel(v) || v })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [tasks]);

  // ตาราง: การ์ด (สถานะ/ของฉัน) × ประเภท × แบรนด์ — ซ้อนกันได้
  const filteredTasks = useMemo(() => {
    let arr = filter === "mine" ? tasks.filter((tk) => myTaskIds.has(tk.id))
      : filter === "review" ? tasks.filter((tk) => tk.status === "need_review")
      : filter === "overdue" ? tasks.filter(isOverdue)
      : tasks;
    if (typeFilter) arr = arr.filter((tk) => tk.task_type === typeFilter);
    if (brandFilter) arr = arr.filter((tk) => tk.brand_id === brandFilter);
    return arr;
  }, [filter, typeFilter, brandFilter, tasks, myTaskIds]);
  const filterLabel = filter === "mine" ? t("งานของฉัน", "My tasks") : filter === "review" ? t("รอตรวจ/อนุมัติ", "In review") : filter === "overdue" ? t("เกินกำหนด", "Overdue") : t("งานทั้งหมด", "All tasks");

  // นับงานที่ยังไม่ปิดต่อแคมเปญ + แคมเปญที่กำลังทำ
  const openByCampaign = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tk of tasks) if (tk.campaign_id && !isTerminal(tk.status)) m[tk.campaign_id] = (m[tk.campaign_id] ?? 0) + 1;
    return m;
  }, [tasks]);
  const activeCampaigns = useMemo(() => campaigns
    .filter((c) => c.status === "active" || c.status === "planning")
    .sort((a, b) => (openByCampaign[b.id] ?? 0) - (openByCampaign[a.id] ?? 0))
    .slice(0, 6), [campaigns, openByCampaign]);

  const heroLine = mineCount > 0
    ? `${t("คุณมีงานในมือ", "You have")} ${mineCount} ${t("งาน", "tasks on your plate")}${counts.overdue ? ` · ${t("เกินกำหนด", "overdue")} ${counts.overdue}` : ""}`
    : t("ไม่มีงานค้างในมือคุณตอนนี้ 🎉", "Nothing on your plate right now 🎉");

  const cardMeta: { key: CardKey; value: number; label: string }[] = [
    { key: "all", value: counts.total, label: t("งานทั้งหมด", "All tasks") },
    { key: "mine", value: mineCount, label: t("งานของฉัน", "My tasks") },
    { key: "review", value: counts.review, label: t("รอตรวจ/อนุมัติ", "In review") },
    { key: "overdue", value: counts.overdue, label: t("เกินกำหนด", "Overdue") },
  ];

  const heroImage = theme.hero.mode === "image" && !!theme.hero.imageUrl;

  return (
    <div className="space-y-6">
      {/* Hero (ธีมแต่งได้) */}
      <div className="relative rounded-2xl overflow-hidden shadow-sm text-white" style={heroStyle(theme.hero)}>
        {heroImage && <div className="absolute inset-0 bg-black/35" />}
        <div className="relative p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold drop-shadow-sm">{userName ? `${t("สวัสดี", "Hi")} ${userName} 👋` : `${t("สวัสดี", "Hi")} 👋`}</h2>
            <p className="text-white/90 text-sm mt-1 drop-shadow-sm">{heroLine}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setCustomizing(true)} title={t("แต่งหน้านี้ของฉัน", "Customize my overview")}
              className="h-9 px-3 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg backdrop-blur-sm">🎨 {t("แต่งหน้า", "Customize")}</button>
            <button onClick={onCreate} className="h-11 px-5 bg-white text-violet-700 font-semibold rounded-xl shadow hover:bg-violet-50">＋ {t("สร้างงานใหม่", "New task")}</button>
          </div>
        </div>
      </div>

      {/* ทางลัด — แถบปุ่มเล็กแนวนอน ใต้ Hero (กว้างเท่ากล่องม่วง) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 mr-0.5">{t("ทางลัด", "Shortcuts")}</span>
        <ShortcutPill icon="📣" label={t("แคมเปญ", "Campaigns")} href="/tasks/campaigns" />
        <ShortcutPill icon="📱" label={t("คอนเทนต์", "Content")} href="/tasks/content" />
        <ShortcutPill icon="🔁" label={t("เทมเพลต", "Templates")} href="/tasks/templates" />
        <ShortcutPill icon="📚" label={t("คลังความรู้", "Knowledge")} onClick={onOpenKnowledge} />
        {isAdmin && <ShortcutPill icon="⚙️" label={t("ตั้งค่า", "Settings")} href="/tasks/settings" />}
      </div>

      {/* การ์ดสรุป = ตัวกรองตาราง (ไอคอน/สีแต่งได้) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cardMeta.map((m) => (
          <SummaryCard key={m.key} card={theme.cards[m.key]} value={m.value} label={m.label}
            active={filter === m.key} hint={filter === m.key ? t("● กรองอยู่", "● filtering") : t("กดเพื่อกรอง", "tap to filter")}
            onClick={() => onFilter(m.key)} />
        ))}
      </div>

      {/* สองคอลัมน์: ตาราง (ซ้าย 2/3) + แคมเปญที่กำลังทำ (ขวา 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 min-w-0 space-y-2">
          {mySubs.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
              🧩 {t("งานย่อยของฉัน", "My subtasks")} {mySubs.length} {t("รายการ", "items")} · {t('ดูในแท็บ "คิวงานของฉัน"', 'see the "My queue" tab')}
            </div>
          )}

          {/* ตัวกรองด่วน: ประเภทงาน (Tabs, จากข้อมูลจริง) + แบรนด์ (ชิป) — ซ้อนกับการ์ดด้านบน */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <FilterTab active={!typeFilter} onClick={() => setTypeFilter("")} label={t("ทุกประเภท", "All types")} />
              {typeOptions.map((o) => (
                <FilterTab key={o.value} active={typeFilter === o.value} onClick={() => setTypeFilter(o.value)} label={o.label} />
              ))}
            </div>
            {brands.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 mr-0.5">{t("แบรนด์", "Brand")}:</span>
                <BrandChip active={!brandFilter} onClick={() => setBrandFilter("")} label={t("ทั้งหมด", "All")} />
                {brands.map((b) => (
                  <BrandChip key={b.id} active={brandFilter === b.id} color={b.color} onClick={() => setBrandFilter(b.id)} label={b.name} />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <DataTable<CreativeTask>
              data={filteredTasks} columns={columns}
              title={`${filterLabel} (${filteredTasks.length})`}
              emptyMessage={t("ไม่มีงานในตัวกรองนี้", "No tasks in this filter")}
              searchPlaceholder={t("ค้นหา เลขที่ / ชื่องาน / ผู้รับผิดชอบ...", "Search no. / title / assignee...")}
              searchableKeys={["task_no", "title", "assignee_label", "brand_label", "sku_code"]}
              tableId="creative-tasks" exportFilename="งาน-creative"
              enableCards
              cardConfig={{ primary: "title", subtitle: "task_no", badges: ["status", "priority"], lines: ["assignee_label", "due_date", "brand_label"] }}
              onRowClick={(row) => onOpenTask(row.id)}
            />
          </div>
        </div>

        {/* แคมเปญที่กำลังทำ */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">📣 {t("แคมเปญที่กำลังทำ", "Active campaigns")}</p>
            <a href="/tasks/campaigns" className="text-xs font-medium text-violet-700 hover:underline">{t("ดูทั้งหมด", "See all")} →</a>
          </div>
          <div className="p-2">
            {activeCampaigns.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-3xl mb-1">📣</div>
                <p className="text-slate-500 text-sm">{t("ยังไม่มีแคมเปญที่กำลังทำ", "No active campaigns")}</p>
                <a href="/tasks/campaigns" className="mt-3 inline-flex items-center h-9 px-4 bg-violet-50 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-100">＋ {t("สร้างแคมเปญ", "New campaign")}</a>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeCampaigns.map((c) => {
                  const st = CSTATUS[c.status];
                  const open = openByCampaign[c.id] ?? 0;
                  return (
                    <a key={c.id} href={`/tasks/campaigns/${c.id}`} className="block w-full text-left p-3 rounded-lg border border-slate-100 hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${st?.cls ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>{st?.label ?? c.status}</span>
                        {open > 0 && <span className="text-[11px] text-slate-500">{open} {t("งานค้าง", "open")}</span>}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1.5 line-clamp-2">{c.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                        {c.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span>}
                        {(c.start_date || c.end_date) && <span>🗓 {c.start_date ?? "?"} → {c.end_date ?? "?"}</span>}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <OverviewCustomizer open={customizing} theme={theme} canUpload={canUpload} onChange={onThemeChange} onClose={() => setCustomizing(false)} />
    </div>
  );
}

function SummaryCard({ card, value, label, active, hint, onClick }: { card: CardTheme; value: number; label: string; active?: boolean; hint: string; onClick: () => void }) {
  const c = CARD_COLORS[card.color] ?? CARD_COLORS.slate;
  return (
    <button onClick={onClick} className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm hover:brightness-[0.98] ${c.box} ${active ? `ring-2 ${c.ring}` : ""}`}>
      <div className="flex items-center justify-between">
        {card.iconUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/api/r2-image?key=${encodeURIComponent(card.iconUrl)}`} alt="" className="w-6 h-6 object-contain" />
          : <span className="text-lg">{card.icon}</span>}
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-sm font-medium mt-1">{label}</p>
      <p className="text-[11px] opacity-70 mt-0.5">{hint}</p>
    </button>
  );
}

function FilterTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`shrink-0 h-7 px-3 rounded-full text-xs font-medium transition-colors ${active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>;
}

function BrandChip({ active, color, onClick, label }: { active: boolean; color?: string | null; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border transition-colors ${active ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color || "#cbd5e1" }} />}{label}
    </button>
  );
}

// ทางลัดแบบปุ่ม pill เล็ก (แนวนอน ใต้ Hero)
function ShortcutPill({ icon, label, href, onClick }: { icon: string; label: string; href?: string; onClick?: () => void }) {
  const cls = "inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600 shadow-sm hover:border-violet-300 hover:bg-violet-50/40 transition-colors";
  const inner = <><span className="text-base">{icon}</span><span>{label}</span></>;
  return href
    ? <a href={href} className={cls}>{inner}</a>
    : <button onClick={onClick} className={cls}>{inner}</button>;
}

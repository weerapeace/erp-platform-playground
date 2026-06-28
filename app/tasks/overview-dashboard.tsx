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
import { taskTypeLabel, useCreativeOptions } from "./use-options";
import { isOverdue, type CreativeTask, type Campaign, type MySubtask, type BrandOption } from "./data";
import { CAMPAIGN_STATUS } from "./campaigns/campaign-drawer";
import { OverviewCustomizer, CARD_COLORS, heroStyle, pageStyle, type OverviewTheme, type CardKey, type CardTheme } from "./overview-customizer";

const CSTATUS = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.value, s]));

// ป้าย/จุดสีสถานะงานย่อย (ให้ตรงกับ SUB_STEPS ในงานย่อย) — ใช้ตอนกดการ์ด "งานของฉัน" โชว์งานย่อย
const SUB_LABEL: Record<string, string> = { todo: "ยังไม่เริ่ม", in_progress: "กำลังทำ", submitted: "รออนุมัติ", approved: "อนุมัติแล้ว", revision_requested: "ขอแก้", canceled: "ยกเลิก", doing: "กำลังทำ", done: "อนุมัติแล้ว", posted: "อนุมัติแล้ว" };
const SUB_DOT: Record<string, string> = { todo: "bg-slate-400", in_progress: "bg-blue-500", submitted: "bg-amber-500", approved: "bg-emerald-500", revision_requested: "bg-orange-500", canceled: "bg-slate-300", doing: "bg-blue-500", done: "bg-emerald-500", posted: "bg-emerald-500" };

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

  // โหลดตัวเลือกประเภทงานจาก DB → ใช้ label สด (ผูกเป็น dependency ให้ชิปอัปเดตเมื่อโหลดเสร็จ)
  const { taskTypes } = useCreativeOptions();
  const typeLabelMap = useMemo(() => Object.fromEntries(taskTypes.map((o) => [o.value, o.label])), [taskTypes]);
  // ประเภทงานที่ "มีจริง" ในข้อมูล (no hardcode) → ทำ Tabs · เรียงตามชื่อ
  const typeOptions = useMemo(() => {
    const present = new Set<string>();
    for (const tk of tasks) if (tk.task_type) present.add(tk.task_type);
    return [...present].map((v) => ({ value: v, label: typeLabelMap[v] || taskTypeLabel(v) || v })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [tasks, typeLabelMap]);

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
  // ทักทายตามเวลา (ใช้เมื่อไม่ได้ตั้งข้อความเอง)
  const hr = new Date().getHours();
  const greetWord = hr < 12 ? t("สวัสดีตอนเช้า", "Good morning") : hr < 17 ? t("สวัสดีตอนบ่าย", "Good afternoon") : t("สวัสดีตอนเย็น", "Good evening");
  const defaultTitle = `${greetWord}${userName ? " " + userName : ""} 👋`;

  const cardMeta: { key: CardKey; value: number; label: string }[] = [
    { key: "all", value: counts.total, label: t("งานทั้งหมด", "All tasks") },
    { key: "mine", value: mineCount, label: t("งานของฉัน", "My tasks") },
    { key: "review", value: counts.review, label: t("รอตรวจ/อนุมัติ", "In review") },
    { key: "overdue", value: counts.overdue, label: t("เกินกำหนด", "Overdue") },
  ];

  const heroImage = theme.hero.mode === "image" && !!theme.hero.imageUrl;

  const hasPageBg = theme.page.mode !== "none";
  return (
    <div className={`relative ${hasPageBg ? "rounded-2xl p-3 sm:p-4" : ""}`} style={pageStyle(theme.page)}>
      {theme.page.mode === "image" && <div className="absolute inset-0 rounded-2xl bg-white/45 pointer-events-none" />}
      <div className="relative space-y-6">
      {/* Hero (ธีมแต่งได้) */}
      <div className="relative rounded-2xl overflow-hidden shadow-sm text-white" style={heroStyle(theme.hero)}>
        {heroImage && <div className="absolute inset-0 bg-black/35" />}
        <div className="relative p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold drop-shadow-sm" style={{ color: theme.hero.textColor }}>{theme.hero.title || defaultTitle}</h2>
            <p className="text-sm mt-1 drop-shadow-sm opacity-90" style={{ color: theme.hero.textColor }}>{theme.hero.subtitle || heroLine}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setCustomizing(true)} title={t("แต่งหน้านี้ของฉัน", "Customize my overview")}
              className="h-9 px-3 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg backdrop-blur-sm">🎨 {t("แต่งหน้า", "Customize")}</button>
            <button onClick={onCreate} className="h-11 px-5 bg-white text-violet-700 font-semibold rounded-xl shadow hover:bg-violet-50">＋ {t("สร้างงานใหม่", "New task")}</button>
          </div>
        </div>
      </div>

      {/* ทางลัด — แถบปุ่มเล็กแนวนอน ใต้ Hero (กว้างเท่ากล่องม่วง) */}
      {theme.show.shortcuts && (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 mr-0.5">{t("ทางลัด", "Shortcuts")}</span>
        <ShortcutPill icon="📣" label={t("แคมเปญ", "Campaigns")} href="/tasks/campaigns" />
        <ShortcutPill icon="📱" label={t("คอนเทนต์", "Content")} href="/tasks/content" />
        <ShortcutPill icon="🔁" label={t("เทมเพลต", "Templates")} href="/tasks/templates" />
        <ShortcutPill icon="📚" label={t("คลังความรู้", "Knowledge")} onClick={onOpenKnowledge} />
        {isAdmin && <ShortcutPill icon="⚙️" label={t("ตั้งค่า", "Settings")} href="/tasks/settings" />}
      </div>
      )}

      {/* การ์ดสรุป = ตัวกรองตาราง (ไอคอน/สีแต่งได้) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cardMeta.map((m) => (
          <SummaryCard key={m.key} card={theme.cards[m.key]} value={m.value} label={theme.cards[m.key].label || m.label}
            active={filter === m.key} hint={filter === m.key ? t("● กรองอยู่", "● filtering") : t("กดเพื่อกรอง", "tap to filter")}
            onClick={() => onFilter(m.key)} />
        ))}
      </div>

      {/* สองคอลัมน์: ตาราง (ซ้าย 2/3) + แคมเปญที่กำลังทำ (ขวา 1/3) · ซ่อนแคมเปญ → ตารางเต็มกว้าง */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className={`${theme.show.campaigns ? "lg:col-span-2" : "lg:col-span-3"} min-w-0 space-y-2`}>
          {mySubs.length > 0 && (
            filter === "mine" ? (
              // กดการ์ด "งานของฉัน" → โชว์งานย่อยของฉันเต็มๆ (เหมือนแท็บคิวงานของฉัน) กดเปิดงานแม่ได้
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-2">🧩 {t("งานย่อยของฉัน", "My subtasks")} ({mySubs.length})</p>
                <div className="space-y-1.5">
                  {mySubs.map((s) => (
                    <button key={s.id} onClick={() => onOpenTask(s.task_id)} title={t("กดเพื่อเปิดงาน → เริ่ม/ส่งงาน", "Click to open task → start / submit")}
                      className="w-full flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2 hover:border-violet-200 text-left">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${SUB_DOT[s.status] ?? "bg-slate-400"}`} title={SUB_LABEL[s.status] ?? t("ยังไม่เริ่ม", "Not started")} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-700">{s.title}</span>
                        <span className="ml-2 text-[10px] text-slate-400">{SUB_LABEL[s.status] ?? t("ยังไม่เริ่ม", "Not started")}</span>
                        {s.required_before_next && <span className="ml-2 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">{t("ต้องเสร็จก่อน", "Must finish first")}</span>}
                        <div className="text-xs text-slate-400 truncate">↳ {s.task_no ? <span className="font-mono">{s.task_no}</span> : null} {s.task_title}</div>
                      </div>
                      {s.due_date && <span className="text-xs text-slate-400 shrink-0">{s.due_date}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
                🧩 {t("งานย่อยของฉัน", "My subtasks")} {mySubs.length} {t("รายการ", "items")} · {t('กดการ์ด "งานของฉัน" เพื่อดูงานย่อย', 'tap the "My tasks" card to see subtasks')}
              </div>
            )
          )}

          {/* ตัวกรองด่วน: ประเภทงาน (Tabs, จากข้อมูลจริง) + แบรนด์ (ชิป) — ซ้อนกับการ์ดด้านบน */}
          {theme.show.filters && (
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
          )}

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
        {theme.show.campaigns && (
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
        )}
      </div>

      <OverviewCustomizer open={customizing} theme={theme} canUpload={canUpload} isAdmin={isAdmin} onChange={onThemeChange} onClose={() => setCustomizing(false)} />
      </div>
    </div>
  );
}

function SummaryCard({ card, value, label, active, hint, onClick }: { card: CardTheme; value: number; label: string; active?: boolean; hint: string; onClick: () => void }) {
  const c = CARD_COLORS[card.color] ?? CARD_COLORS.slate;
  // โหมดรูปเต็ม — รูปพื้นหลังการ์ด + ฉากดำจาง + ตัวอักษรขาว
  if (card.bgUrl) {
    return (
      <button onClick={onClick} className={`relative text-left rounded-xl border overflow-hidden p-4 min-h-[92px] transition-all hover:shadow-sm ${active ? `ring-2 ${c.ring} border-transparent` : "border-slate-200"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/r2-image?key=${encodeURIComponent(card.bgUrl)}&w=400`} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative text-white">
          <div className="flex items-center justify-between">
            {card.iconUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/r2-image?key=${encodeURIComponent(card.iconUrl)}`} alt="" className="w-6 h-6 object-contain drop-shadow" />
              : <span className="text-lg drop-shadow">{card.icon}</span>}
            <span className="text-2xl font-bold tabular-nums drop-shadow">{value}</span>
          </div>
          <p className="text-sm font-medium mt-1 drop-shadow">{label}</p>
          <p className="text-[11px] opacity-85 mt-0.5">{hint}</p>
        </div>
      </button>
    );
  }
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

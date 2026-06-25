"use client";

// ============================================================
// Overview Dashboard — หน้าแรกของแอป "จัดการงาน"
// แดชบอร์ดสรุป: ทักทาย + การ์ดสรุป (ทั้งหมด/ของฉัน/รอตรวจ/เกินกำหนด)
//   + งานของฉันที่ต้องทำ + แคมเปญที่กำลังทำ + ปุ่มทางลัด
// ของกลาง: reuse ข้อมูลที่หน้า /tasks โหลดอยู่แล้ว (ไม่เพิ่ม API = ไม่กระทบความเร็ว)
// ============================================================

import { useMemo } from "react";
import { useT } from "@/components/i18n";
import { PriorityBadge, StatusBadge } from "./task-detail-drawer";
import { taskTypeLabel } from "./use-options";
import { isTerminal } from "./use-statuses";
import { PRIORITY_RANK, isOverdue, type CreativeTask, type Campaign, type MySubtask } from "./data";
import { CAMPAIGN_STATUS } from "./campaigns/campaign-drawer";

const CSTATUS = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.value, s]));

export type DashView = "queue" | "table" | "kanban" | "canvas";
export type DashQuick = "" | "review" | "overdue";

type Counts = { total: number; mine: number; overdue: number; review: number };

export function OverviewDashboard({
  userName, counts, myTasks, mySubs, campaigns, tasks, isAdmin,
  onOpenTask, onCreate, onGotoView, onOpenCampaign, onGotoHref, onOpenKnowledge,
}: {
  userName?: string;
  counts: Counts;
  myTasks: CreativeTask[];
  mySubs: MySubtask[];
  campaigns: Campaign[];
  tasks: CreativeTask[];
  isAdmin: boolean;
  onOpenTask: (id: string) => void;
  onCreate: () => void;
  onGotoView: (view: DashView, quick?: DashQuick) => void;
  onOpenCampaign: (id: string) => void;
  onGotoHref: (href: string) => void;
  onOpenKnowledge: () => void;
}) {
  const t = useT();

  // งานของฉันที่ต้องทำ — ตัดงานปิดแล้ว เรียงตามความสำคัญ + กำหนดส่ง เอา 6 อันแรก
  const myQueueTop = useMemo(() => [...myTasks]
    .filter((tk) => !isTerminal(tk.status))
    .sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (pr !== 0) return pr;
      return (a.due_date || "9999").localeCompare(b.due_date || "9999");
    })
    .slice(0, 6), [myTasks]);

  // นับงานที่ยังไม่ปิดต่อแคมเปญ (จากงานที่โหลดมาแล้ว)
  const openByCampaign = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tk of tasks) if (tk.campaign_id && !isTerminal(tk.status)) m[tk.campaign_id] = (m[tk.campaign_id] ?? 0) + 1;
    return m;
  }, [tasks]);

  // แคมเปญที่กำลังทำ (วางแผน/กำลังทำ) เรียงตามจำนวนงานค้างมากก่อน เอา 5 อันแรก
  const activeCampaigns = useMemo(() => campaigns
    .filter((c) => c.status === "active" || c.status === "planning")
    .sort((a, b) => (openByCampaign[b.id] ?? 0) - (openByCampaign[a.id] ?? 0))
    .slice(0, 5), [campaigns, openByCampaign]);

  const heroLine = counts.mine > 0
    ? `${t("คุณมีงานในมือ", "You have")} ${counts.mine} ${t("งาน", "tasks on your plate")}${counts.overdue ? ` · ${t("เกินกำหนด", "overdue")} ${counts.overdue}` : ""}`
    : t("ไม่มีงานค้างในมือคุณตอนนี้ 🎉", "Nothing on your plate right now 🎉");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white p-6 sm:p-7 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-violet-100 text-sm">{t("ภาพรวมงาน Creative", "Creative work overview")}</p>
          <h2 className="text-xl sm:text-2xl font-bold mt-0.5">{userName ? `${t("สวัสดี", "Hi")} ${userName} 👋` : `${t("สวัสดี", "Hi")} 👋`}</h2>
          <p className="text-violet-100/90 text-sm mt-1">{heroLine}</p>
        </div>
        <button onClick={onCreate} className="h-11 px-5 bg-white text-violet-700 font-semibold rounded-xl shadow hover:bg-violet-50 shrink-0">＋ {t("สร้างงานใหม่", "New task")}</button>
      </div>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon="📋" tone="slate" value={counts.total} label={t("งานทั้งหมด", "All tasks")} hint={t("เปิดตารางงาน", "Open table")} onClick={() => onGotoView("table")} />
        <SummaryCard icon="🙋" tone="violet" value={counts.mine} label={t("งานของฉัน", "My tasks")} hint={t("คิวงานของฉัน", "My queue")} onClick={() => onGotoView("queue")} />
        <SummaryCard icon="🟡" tone="amber" value={counts.review} label={t("รอตรวจ/อนุมัติ", "In review")} hint={t("ดูที่รอตรวจ", "See review")} onClick={() => onGotoView("table", "review")} />
        <SummaryCard icon="⚠️" tone="red" value={counts.overdue} label={t("เกินกำหนด", "Overdue")} hint={t("ดูงานเกินกำหนด", "See overdue")} onClick={() => onGotoView("table", "overdue")} />
      </div>

      {/* สองคอลัมน์: งานของฉัน + แคมเปญที่กำลังทำ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* งานของฉันที่ต้องทำ */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">🙋 {t("งานของฉันที่ต้องทำ", "My tasks to do")}</p>
            <button onClick={() => onGotoView("queue")} className="text-xs font-medium text-violet-700 hover:underline">{t("ดูทั้งหมด", "See all")} →</button>
          </div>
          <div className="p-2">
            {mySubs.length > 0 && (
              <button onClick={() => onGotoView("queue")} className="w-full mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-left hover:bg-amber-100/70">
                <span>🧩</span>
                <span className="text-xs text-amber-800 font-medium">{t("งานย่อยของฉัน", "My subtasks")} {mySubs.length} {t("รายการ", "items")}</span>
                <span className="ml-auto text-xs text-amber-600">→</span>
              </button>
            )}
            {myQueueTop.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-3xl mb-1">🎉</div>
                <p className="text-slate-500 text-sm font-medium">{t("ไม่มีงานค้างในคิวของคุณ", "Your queue is clear")}</p>
                <button onClick={onCreate} className="mt-3 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างงาน", "New task")}</button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {myQueueTop.map((task) => {
                  const od = isOverdue(task);
                  return (
                    <button key={task.id} onClick={() => onOpenTask(task.id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PriorityBadge priority={task.priority} />
                          <StatusBadge status={task.status} />
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate mt-0.5">{task.title}</p>
                        <p className="text-xs text-slate-400 truncate">
                          <span className="font-mono">{task.task_no}</span>
                          {task.task_type && <span> · {taskTypeLabel(task.task_type)}</span>}
                          {task.brand_label && <span> · {task.brand_label}</span>}
                          {task.sku_code && <span> · 📦 {task.sku_code}</span>}
                        </p>
                      </div>
                      {task.due_date && <span className={`text-xs shrink-0 ${od ? "text-red-600 font-semibold" : "text-slate-400"}`}>{od ? "⚠ " : ""}{task.due_date}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* แคมเปญที่กำลังทำ */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">📣 {t("แคมเปญที่กำลังทำ", "Active campaigns")}</p>
            <button onClick={() => onGotoHref("/tasks/campaigns")} className="text-xs font-medium text-violet-700 hover:underline">{t("ดูทั้งหมด", "See all")} →</button>
          </div>
          <div className="p-2">
            {activeCampaigns.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-3xl mb-1">📣</div>
                <p className="text-slate-500 text-sm">{t("ยังไม่มีแคมเปญที่กำลังทำ", "No active campaigns")}</p>
                <button onClick={() => onGotoHref("/tasks/campaigns")} className="mt-3 h-9 px-4 bg-violet-50 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-100">＋ {t("สร้างแคมเปญ", "New campaign")}</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeCampaigns.map((c) => {
                  const st = CSTATUS[c.status];
                  const open = openByCampaign[c.id] ?? 0;
                  return (
                    <button key={c.id} onClick={() => onOpenCampaign(c.id)} className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${st?.cls ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>{st?.label ?? c.status}</span>
                        {open > 0 && <span className="text-[11px] text-slate-500">{open} {t("งานค้าง", "open")}</span>}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1.5 line-clamp-2">{c.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                        {c.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span>}
                        {(c.start_date || c.end_date) && <span>🗓 {c.start_date ?? "?"} → {c.end_date ?? "?"}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ทางลัด */}
      <div>
        <p className="text-sm font-semibold text-slate-500 mb-2">{t("ทางลัด", "Shortcuts")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <ShortcutBtn icon="📋" label={t("ตารางงานทั้งหมด", "All tasks")} onClick={() => onGotoView("table")} />
          <ShortcutBtn icon="📣" label={t("แคมเปญ", "Campaigns")} onClick={() => onGotoHref("/tasks/campaigns")} />
          <ShortcutBtn icon="📱" label={t("คอนเทนต์", "Content")} onClick={() => onGotoHref("/tasks/content")} />
          <ShortcutBtn icon="🔁" label={t("เทมเพลต", "Templates")} onClick={() => onGotoHref("/tasks/templates")} />
          <ShortcutBtn icon="📚" label={t("คลังความรู้", "Knowledge")} onClick={onOpenKnowledge} />
          {isAdmin && <ShortcutBtn icon="⚙️" label={t("ตั้งค่า", "Settings")} onClick={() => onGotoHref("/tasks/settings")} />}
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  slate: "bg-slate-50 border-slate-200 text-slate-700",
  violet: "bg-violet-50 border-violet-200 text-violet-700",
  amber: "bg-amber-50 border-amber-200 text-amber-700",
  red: "bg-red-50 border-red-200 text-red-700",
};
function SummaryCard({ icon, tone, value, label, hint, onClick }: { icon: string; tone: keyof typeof TONE | string; value: number; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm hover:brightness-[0.98] ${TONE[tone] ?? TONE.slate}`}>
      <div className="flex items-center justify-between">
        <span className="text-lg">{icon}</span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-sm font-medium mt-1">{label}</p>
      <p className="text-[11px] opacity-70 mt-0.5">{hint} →</p>
    </button>
  );
}

function ShortcutBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1.5 h-24 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-slate-600 text-center px-2">{label}</span>
    </button>
  );
}

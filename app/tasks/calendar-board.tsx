"use client";

// ============================================================
// CalendarBoard — มุมมองปฏิทิน (งานเรียงตามกำหนดส่ง) สำหรับโมดูลงาน Creative
// ใช้ข้อมูล tasks ที่หน้า /tasks โหลดอยู่แล้ว (ไม่ยิง API เพิ่ม)
// 2026-11-20: ย้ายมาใช้ปฏิทินกลาง ScheduleBoard (เต็มจอ · กล่อง "ยังไม่ลงวัน" ขวา · ลากเปลี่ยนวัน · +N กดได้
//   · เดือน/สัปดาห์/รายการ · ค้นหา · ความแน่น · เลือกหลายงาน · วันหยุด · พิมพ์) + ป๊อปดูงาน (เลื่อนวัน/เปลี่ยนสถานะ/เปิดเต็ม)
// ============================================================
import { ScheduleBoard } from "@/components/schedule-board";
import { useViewportLayout } from "@/components/device-view";
import { statusMeta, isTerminal, transitionsFrom } from "./use-statuses";
import { isOverdue, type CreativeTask } from "./data";
import { Icon } from "@/components/icon";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { usePushToast } from "@/components/toast";
import { listRecurring, type RecurringRule } from "./data";

// งานประจำย้ายมาจัดการที่ปฏิทิน (เจ้าของขอ 2026-11-22 · เดิมอยู่หน้าเทมเพลต) — ตัวฟอร์มเดิม RecurringTab ใช้ต่อ
const RecurringTab = dynamic(() => import("./templates/templates-tabs").then((m) => m.RecurringTab), { ssr: false });

// รายการในปฏิทิน = งานจริง + "รอบถัดไป" ของงานประจำ (ชิปเส้นประ · ลากไม่ได้ · กดเปิดตัวจัดการงานประจำ)
type CalItem = { id: string; kind: "task"; t: CreativeTask } | { id: string; kind: "rec"; r: RecurringRule };
const FREQ_TH: Record<string, string> = { daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน", yearly: "ทุกปี" };

export function CalendarBoard({ tasks, onCardClick, onSetDue, onSetDueMany, onStatus }: {
  tasks: CreativeTask[];
  onCardClick: (id: string) => void;
  onSetDue?: (task: CreativeTask, date: string | null) => void;
  onSetDueMany?: (tasks: CreativeTask[], deltaDays: number | null) => void;
  onStatus?: (task: CreativeTask, toKey: string) => void;
}) {
  const layout = useViewportLayout();
  const pushToast = usePushToast();
  // งานประจำ: โหลดกฎ (ไม่สั่งสร้างงาน) · ?recurring=1 = เปิดตัวจัดการทันที (ลิงก์จากหน้าเทมเพลตเดิม)
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [recOpen, setRecOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("recurring") === "1");
  const loadRules = useCallback(() => { listRecurring().then((r) => setRules(r.data)).catch(() => setRules([])); }, []);
  useEffect(() => { loadRules(); }, [loadRules]);
  // งานที่ปิดแล้วและไม่มีวัน ไม่ต้องรกกล่อง "ยังไม่ลงวัน"
  const items: CalItem[] = [
    ...tasks.filter((t) => t.due_date || !isTerminal(t.status)).map((t) => ({ id: t.id, kind: "task" as const, t })),
    ...rules.filter((r) => r.is_active && r.next_run).map((r) => ({ id: `rec:${r.id}`, kind: "rec" as const, r })),
  ];
  const recChip = (r: RecurringRule) => (
    <button type="button" onClick={() => setRecOpen(true)} title={`งานประจำ: ${r.name} · ${FREQ_TH[r.frequency] ?? r.frequency}`}
      className="block w-full truncate rounded border border-dashed border-violet-300 bg-white px-1.5 py-0.5 text-left text-[11px] leading-tight text-violet-700 hover:bg-violet-50">
      <Icon value="i:repeat" className="mr-1" />{r.name}
    </button>
  );
  const chipCls = (t: CreativeTask) => isOverdue(t) ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-violet-50 hover:border-violet-200";
  const who = (t: CreativeTask) => (t.assignees?.length ? t.assignees.map((a) => a.label).join(", ") : t.assignee_label) || "ยังไม่มีผู้รับผิดชอบ";

  return (
    <>
    <ScheduleBoard<CalItem>
      items={items}
      toolbarExtra={
        <button type="button" onClick={() => setRecOpen(true)} title="ตั้ง/แก้/หยุดงานประจำ (สร้างงานซ้ำตามรอบ)"
          className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-violet-50 hover:border-violet-200">
          <Icon value="i:repeat" className="mr-1" />งานประจำ{rules.length ? ` (${rules.filter((r) => r.is_active).length})` : ""}
        </button>
      }
      layout={layout}
      maxPerDay={4}
      backlogTitle="ยังไม่ลงวันส่ง"
      printTitle="ปฏิทินงาน"
      getDate={(i) => (i.kind === "rec" ? i.r.next_run!.slice(0, 10) : i.t.due_date ? String(i.t.due_date).slice(0, 10) : null)}
      onSchedule={(i, d) => { if (i.kind === "task") onSetDue?.(i.t, d); }}
      onScheduleMany={onSetDueMany ? (list, delta) => onSetDueMany(list.flatMap((i) => (i.kind === "task" ? [i.t] : [])), delta) : undefined}
      getSearchText={(i) => (i.kind === "rec" ? `งานประจำ ${i.r.name}` : `${i.t.task_no ?? ""} ${i.t.title} ${i.t.product_name ?? ""} ${who(i.t)}`)}
      getDotColor={(i) => (i.kind === "rec" ? "#c4b5fd" : isOverdue(i.t) ? "#ef4444" : "#8b5cf6")}
      hint={onSetDue ? "ลากงานไปวันอื่นเพื่อเปลี่ยนวันส่ง · ลากเข้ากล่องขวา = ไม่กำหนดวัน · กดงานเพื่อดู/จัดการ" : "กดงานเพื่อดูรายละเอียด"}
      renderChip={(i) => i.kind === "rec" ? recChip(i.r) : ((t) => (
        <button type="button" onClick={() => onCardClick(t.id)} title={`${t.task_no ?? ""} ${t.title}`}
          className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight ${chipCls(t)}`}>
          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${statusMeta(t.status).dot}`} />{t.title}
        </button>
      ))(i.t)}
      renderCard={(i) => i.kind === "rec" ? recChip(i.r) : ((t) => (
        <button type="button" onClick={() => onCardClick(t.id)}
          className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs ${chipCls(t)}`}>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusMeta(t.status).dot}`} />{statusMeta(t.status).label}
            {t.task_no && <span className="ml-auto font-mono">{t.task_no}</span>}
          </div>
          <div className="truncate">{t.title}</div>
        </button>
      ))(i.t)}
      renderPopView={(i, close) => {
        if (i.kind === "rec") return (
          <div className="space-y-2 text-xs">
            <div className="text-sm font-semibold text-slate-800"><Icon value="i:repeat" className="mr-1" />{i.r.name}</div>
            <div className="text-slate-500">งานประจำ · {FREQ_TH[i.r.frequency] ?? i.r.frequency} · รอบถัดไป {i.r.next_run?.slice(0, 10)}</div>
            <button type="button" onClick={() => { close(); setRecOpen(true); }} className="h-8 w-full rounded-lg bg-violet-600 text-white hover:bg-violet-700">จัดการงานประจำ</button>
          </div>
        );
        const t = i.t;
        const m = statusMeta(t.status);
        const next = transitionsFrom(t.status);
        return (
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                {t.task_no && <div className="font-mono text-[10px] text-slate-400">{t.task_no}</div>}
                <div className="text-sm font-semibold leading-snug text-slate-800">{t.title}</div>
              </div>
              <button type="button" onClick={close} aria-label="ปิด" className="ml-auto shrink-0 text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>
              <span><Icon value="i:user" className="mr-1" />{who(t)}</span>
              {t.product_name && <span className="truncate"><Icon value="i:package" className="mr-1" />{t.product_name}</span>}
            </div>
            {onSetDue && (
              <label className="flex items-center gap-1.5">
                <span className="shrink-0 text-slate-500"><Icon value="i:calendar" className="mr-1" />วันส่ง</span>
                <input type="date" value={t.due_date ? String(t.due_date).slice(0, 10) : ""} onChange={(e) => onSetDue(t, e.target.value || null)}
                  className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs" />
              </label>
            )}
            {onStatus && next.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {next.map((tr) => (
                  <button key={tr.to_key} type="button" onClick={() => { onStatus(t, tr.to_key); close(); }}
                    className="h-7 rounded-md border border-slate-200 px-2 hover:bg-violet-50 hover:border-violet-200">{tr.label || statusMeta(tr.to_key).label}</button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => { close(); onCardClick(t.id); }} className="h-8 w-full rounded-lg bg-violet-600 text-white hover:bg-violet-700">เปิดรายละเอียดเต็ม<Icon value="i:external-link" className="ml-1" /></button>
          </div>
        );
      }}
    />
    <ERPModal open={recOpen} onClose={() => { setRecOpen(false); loadRules(); }} title="งานประจำ — สร้างงานซ้ำตามรอบ" size="xl">
      {recOpen && <RecurringTab pushToast={pushToast} />}
    </ERPModal>
    </>
  );
}

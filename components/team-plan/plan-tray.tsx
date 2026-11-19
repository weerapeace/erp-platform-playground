"use client";
/**
 * 🗂️ ถาดงานด้านขวาของกระดานแผนงาน (ใช้ทั้ง "กระดาน" วาดอิสระ และ "ผังระบบ") — เจ้าของขอ 2026-11-19 "อยากให้ถาดงานไปอยู่ด้านขวา"
 *   - PC: คอลัมน์ขวา พับเป็นแถบแคบได้ (จำต่อเครื่อง) · มือถือ: ลิ้นชักเลื่อนจากขวา (หน้าแม่คุมเปิด/ปิด ด้วย mobileOpen)
 *   - แท็บ (หน้าแม่กำหนด) · ค้นหา · เรียงตามกำหนด/ความด่วน
 *   - การ์ด: กด = onPick · ลาก = dataTransfer "text/plan-id" · renderExtra = ปุ่มเพิ่มใต้การ์ด (เช่น "วางที่…?" · "เกาะกับ…")
 * doc: docs/team-plan.md
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { dueLabel, isOverdue, PRIORITY_META, type Priority } from "@/lib/team-plan";
import { sortTray, type TraySort } from "@/lib/team-plan-flow";

/** ของที่ถาดโชว์ได้ (งานในแผน หรืองานจากระบบอื่นที่แปลงรูปแล้ว เช่น WorkItem ใน lib/work-canvas) */
export type TrayItem = { id: string; title: string; due_at: string | null; assigned_name?: string | null; priority: Priority; due_text?: string; overdue?: boolean };
export type TrayTab<T extends TrayItem = TrayItem> = { key: string; label: string; filter: (t: T) => boolean };
const FOLD_KEY = "team-plan-tray-fold";

export function PlanTray<T extends TrayItem>({ items, tabs, title = "งานในแผน", selectedId, onPick, renderExtra, renderLead, keyOf = (t) => t.id, canDrag, footer, mobileOpen, onMobileClose, emptyText, height }: {
  items: T[];
  tabs: TrayTab<T>[];
  title?: string;
  /** คีย์ของการ์ดที่เลือกอยู่ (ตาม keyOf) */
  selectedId?: string | null;
  onPick?: (t: T) => void;
  renderExtra?: (t: T) => ReactNode;
  /** ของหน้าชื่อ (เช่น ป้ายชนิดงาน / รูปปก) */
  renderLead?: (t: T) => ReactNode;
  keyOf?: (t: T) => string;
  /** ลากได้ไหม (ไม่ส่ง = ลากได้ทุกใบ) — ลาก = dataTransfer "text/plan-id" */
  canDrag?: (t: T) => boolean;
  footer?: ReactNode;
  mobileOpen: boolean;
  onMobileClose: () => void;
  emptyText?: string;
  /** ความสูงบน PC (เท่ากระดาน) */
  height: string;
}) {
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<TraySort>("due");
  const [fold, setFold] = useState(false);
  useEffect(() => { try { setFold(localStorage.getItem(FOLD_KEY) === "1"); } catch { /* โหมดส่วนตัว */ } }, []);
  const setFolded = (v: boolean) => { setFold(v); try { localStorage.setItem(FOLD_KEY, v ? "1" : "0"); } catch { /* จำไม่ได้ก็ไม่เป็นไร */ } };

  const cur = tabs.find((x) => x.key === tab) ?? tabs[0];
  const counts = useMemo(() => Object.fromEntries(tabs.map((x) => [x.key, items.filter(x.filter).length])), [items, tabs]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortTray(items.filter((t) => (cur ? cur.filter(t) : true) && (!s || t.title.toLowerCase().includes(s) || (t.assigned_name ?? "").toLowerCase().includes(s))), sort);
  }, [items, cur, q, sort]);

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className="text-xs text-slate-400">{counts[cur?.key ?? ""] ?? 0}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setSort(sort === "due" ? "priority" : "due")} title="สลับการเรียง"
          className="inline-flex h-6 items-center gap-0.5 rounded border border-slate-200 px-1.5 text-[11px] text-slate-500 hover:bg-slate-50">
          ⇅ {sort === "due" ? "กำหนด" : "ความด่วน"}
        </button>
        <button type="button" onClick={() => setFolded(true)} className="hidden h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 md:inline-flex" title="พับถาด" aria-label="พับถาด">›</button>
        <button type="button" onClick={onMobileClose} className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 md:hidden" aria-label="ปิด"><Icon name="cancel" /></button>
      </div>
      {tabs.length > 1 && (
        <div className="flex gap-1 px-3 pb-1.5">
          {tabs.map((x) => (
            <button key={x.key} type="button" onClick={() => setTab(x.key)}
              className={`rounded px-2 py-0.5 text-[11px] ${x.key === cur?.key ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100"}`}>
              {x.label} <span className="opacity-60">{counts[x.key]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="px-3 pb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหางาน / คนทำ"
          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {list.length === 0
          ? <p className="py-2 text-xs text-slate-400">{q ? "ไม่พบงานที่ค้นหา" : emptyText ?? "ไม่มีงานในแท็บนี้"}</p>
          : list.map((t) => {
            const over = t.overdue ?? isOverdue(t.due_at);
            const drag = canDrag ? canDrag(t) : true;
            const k = keyOf(t);
            return (
              <div key={k} draggable={drag} onClick={() => onPick?.(t)}
                onDragStart={drag ? (e) => { e.dataTransfer.setData("text/plan-id", t.id); e.dataTransfer.effectAllowed = "copy"; } : undefined}
                title={`${t.title}${t.assigned_name ? ` — ${t.assigned_name}` : ""}`}
                className={`${drag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} rounded-lg border border-l-4 bg-white px-2 py-1.5 text-left hover:border-violet-300 ${selectedId === k ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200"}`}
                style={{ borderLeftColor: over ? "#dc2626" : PRIORITY_META[t.priority].color }}>
                <span className="flex items-start gap-1.5">
                  {renderLead?.(t)}
                  <span className="line-clamp-2 min-w-0 flex-1 text-xs text-slate-800">{t.title}</span>
                </span>
                <span className={`block text-[11px] ${over ? "text-rose-600" : "text-slate-400"}`}>
                  {t.due_text ?? (t.due_at ? dueLabel(t.due_at) : "ไม่มีกำหนด")}{t.assigned_name ? ` · ${t.assigned_name}` : ""}
                </span>
                {renderExtra?.(t)}
              </div>
            );
          })}
      </div>
      {footer && <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">{footer}</div>}
    </div>
  );

  return (
    <>
      {/* PC: คอลัมน์ขวา / แถบพับ */}
      {fold ? (
        <button type="button" onClick={() => setFolded(false)} style={{ height }} title="เปิดถาดงาน"
          className="hidden w-8 shrink-0 flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white pt-2 text-slate-500 hover:bg-slate-50 md:flex">
          <span>‹</span><span className="text-xs [writing-mode:vertical-rl]">{title} {items.length}</span>
        </button>
      ) : (
        <aside style={{ height }} className="hidden w-64 shrink-0 rounded-xl border border-slate-200 bg-white md:block">{body}</aside>
      )}
      {/* มือถือ: ลิ้นชักจากขวา */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="ปิดถาดงาน" className="absolute inset-0 bg-black/30" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 right-0 w-[85vw] max-w-xs bg-white shadow-xl">{body}</aside>
        </div>
      )}
    </>
  );
}

"use client";
/**
 * 📋 แผนงานทีม (ของกลาง) — กระดาน Todo จัดตามความด่วน 4 ช่อง / ตาราง 4 ช่อง (สำคัญ × ด่วน)
 *   ใช้ที่ /tasks/plan (เมนู "แผนงาน" ในแอปจัดการงาน)
 *   - เพิ่มงานเร็ว: พิมพ์ + Enter · เลือกความด่วน / กำหนด / ผู้รับผิดชอบ / เตือน
 *   - ลากการ์ดข้ามช่อง = เปลี่ยนความด่วน (หรือ สำคัญ×ด่วน ในตาราง 4 ช่อง)
 *   - ⭐ งานหลักวันนี้ (สูงสุด 3 งานต่อคน) · ⏸ รอคนอื่น · 🔁 ทำซ้ำ · 🔔 เตือน · ลิงก์กลับเรื่องเดิม
 *   - ทั้งทีม / ของฉัน + ตัวกรอง (⭐ วันนี้ / รอคนอื่น / เกินกำหนด) · จำมุมมองต่อคน
 *   - 📅 ปฏิทิน (ของกลาง ScheduleBoard): ลากงานลงวัน = ตั้งกำหนดวันนั้น (คงเวลาเดิม) · ลากกลับกล่อง = ไม่กำหนดวัน
 * ข้อมูล: /api/team-plan (lib/team-plan-client) · กฎ: lib/team-plan · doc: docs/team-plan.md
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { RecordChecklistChip, WhoChip } from "@/components/record-tasks/checklist";
import { noteToText } from "@/lib/rich-note";
import type { ChecklistSummary } from "@/lib/record-tasks";
import { useViewPref } from "@/lib/use-view-pref";
import { ScheduleBoard } from "@/components/schedule-board";
import { useViewportLayout } from "@/components/device-view";
import {
  dueLabel, dueOnDate, dueYmd, isOverdue, isPlanDone, isStarredToday, MAX_STARS, PRIORITIES, PRIORITY_META, QUADRANT_META, quadrantOf, quadrantPatch,
  REMIND_LABEL, REPEAT_LABEL, sortPlanItems, TEAM_PLAN_CHECK, waitingDays, estimateLabel, planTagCounts, myDayLoad, DAY_CAPACITY_MIN,
  type PlanItem, type Priority, type Quadrant,
} from "@/lib/team-plan";
import { createPlanItem, listPlanItems, patchPlanItem, type PlanPatch } from "@/lib/team-plan-client";
import { PlanEditModal } from "./edit-modal";
import { PlanTagChip } from "./tag-input";
import { PlanDraftFields, usePlanDraft } from "./draft-fields";
import { AiSplitModal } from "./ai-split-modal";

const VIEWS = ["priority", "matrix", "calendar"] as const;
export type PlanView = (typeof VIEWS)[number];
const SCOPES = ["all", "me"] as const;
type Filter = "" | "star" | "waiting" | "overdue";
const QUADRANTS: Quadrant[] = ["do", "schedule", "delegate", "later"];
const chip = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap";

/** initialView = เปิดมุมมองนี้ก่อน (เช่น ฝังในปฏิทินรวม ?view=calendar) โดยไม่ทับค่าที่ผู้ใช้จำไว้ */
export function TeamPlanBoard({ initialItemId, initialView }: { initialItemId?: string | null; initialView?: PlanView | null }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const me = user?.id ?? "";
  const canAdd = can("tasks.create");
  const canEdit = can("tasks.edit");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const viewPref = useViewPref<PlanView>("team_plan_view", VIEWS, "priority");
  const [forcedView, setForcedView] = useState<PlanView | null>(initialView ?? null);
  const viewport = useViewportLayout();
  const scopePref = useViewPref<(typeof SCOPES)[number]>("team_plan_scope", SCOPES, "all");
  const view = forcedView ?? viewPref.view, scope = scopePref.view;
  const pickView = (v: PlanView) => { setForcedView(null); viewPref.setView(v); void viewPref.saveDefault(v); };
  const [filter, setFilter] = useState<Filter>("");
  const [tagFilter, setTagFilter] = useState("");   // 🏷 กรองตามแท็ก (ว่าง = ทุกงาน)
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setItems(await listPlanItems()); } catch (e) { setErr(e instanceof Error ? e.message : "โหลดแผนงานไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // เปิดจากกระดิ่ง (?item=) → เปิดป๊อปงานนั้นเลย
  useEffect(() => {
    if (!initialItemId || !items) return;
    const hit = items.find((t) => t.id === initialItemId);
    if (hit) setEditing(hit);
  }, [initialItemId, items]);

  const upsert = (list: PlanItem[]) => setItems((cur) => {
    const map = new Map((cur ?? []).map((t) => [t.id, t]));
    // คำตอบ PATCH ไม่มีสรุปเช็กลิสต์ (checklist = undefined) → ใช้ค่าเดิมบนจอ
    for (const t of list) { const prev = map.get(t.id); map.set(t.id, t.checklist === undefined && prev ? { ...t, checklist: prev.checklist } : t); }
    return [...map.values()];
  });
  /** เช็กลิสต์ในงานเปลี่ยน (จากป๊อป/ป้ายบนการ์ด) → อัปเดตป้าย "2/4" */
  const setChecklist = (id: string, s: ChecklistSummary) => setItems((cur) => (cur ?? []).map((t) => (t.id === id ? { ...t, checklist: s } : t)));
  /** แก้ 1 งาน — เปลี่ยนบนจอทันที (optimistic) แล้วค่อยบันทึก · ไม่ผ่าน = คืนค่าเดิม */
  const update = async (t: PlanItem, p: PlanPatch, optimistic?: Partial<PlanItem>) => {
    if (optimistic) upsert([{ ...t, ...optimistic, plan: { ...t.plan, ...(optimistic.plan ?? {}) } }]);
    try {
      const { item, next } = await patchPlanItem(t.id, p);
      upsert(next ? [item, next] : [item]);
      if (next) toast.success(`งานทำซ้ำ — สร้างรอบถัดไปแล้ว (${dueLabel(next.due_at)})`);
      return item;
    } catch (e) {
      upsert([t]);
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return null;
    }
  };

  const mine = (t: PlanItem) => (t.assigned_to ?? t.plan.created_by_id) === me;
  const inScope = (t: PlanItem) => scope === "all" || mine(t);
  const all = items ?? [];
  const open = sortPlanItems(all.filter((t) => !isPlanDone(t) && inScope(t)));
  const tagCounts = planTagCounts(open);
  const tagOn = tagFilter && tagCounts.some((x) => x.tag.toLowerCase() === tagFilter.toLowerCase()) ? tagFilter : "";   // แท็กที่เลือกหายไปแล้ว = ไม่กรอง
  const shown = open.filter((t) =>
    (filter === "star" ? isStarredToday(t.plan) : filter === "waiting" ? !!t.plan.waiting : filter === "overdue" ? isOverdue(t.due_at) : true)
    && (!tagOn || t.plan.tags.some((g) => g.toLowerCase() === tagOn.toLowerCase())));
  const load2 = myDayLoad(all, me);
  const sumEst = (list: PlanItem[]) => list.reduce((s, t) => s + (t.plan.estimate_min ?? 0), 0);
  const done = all.filter((t) => isPlanDone(t) && inScope(t)).sort((a, b) => Date.parse(b.resolved_at ?? b.updated_at) - Date.parse(a.resolved_at ?? a.updated_at));
  const myStars = sortPlanItems(all.filter((t) => !isPlanDone(t) && mine(t) && isStarredToday(t.plan)));

  // ── ลากข้ามช่อง ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const t = all.find((x) => x.id === String(e.active.id));
    const over = e.over ? String(e.over.id) : "";
    if (!t || !over) return;
    if (over.startsWith("p:")) {
      const p = over.slice(2) as Priority;
      if (p !== t.priority) void update(t, { priority: p }, { priority: p });
    } else if (over.startsWith("q:")) {
      const q = over.slice(2) as Quadrant;
      if (q === quadrantOf(t.priority, t.plan.important)) return;
      const np = quadrantPatch(q, t.priority);
      void update(t, np, { priority: np.priority, plan: { ...t.plan, important: np.important } });
    }
  };
  const dragging = dragId ? all.find((t) => t.id === dragId) ?? null : null;

  const cardProps = { me, canEdit, onOpen: setEditing, onUpdate: update, onChecklist: setChecklist, onTag: (g: string) => setTagFilter((cur) => (cur.toLowerCase() === g.toLowerCase() ? "" : g)) };
  const columns: { id: string; title: ReactNode; hint?: string; list: PlanItem[] }[] = view === "priority"
    ? PRIORITIES.map((p) => ({
        id: `p:${p}`, list: shown.filter((t) => t.priority === p),
        title: <><span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_META[p].color }} />{PRIORITY_META[p].label}{estTag(shown.filter((t) => t.priority === p))}</>,
      }))
    : QUADRANTS.map((q) => { const list = shown.filter((t) => quadrantOf(t.priority, t.plan.important) === q); return { id: `q:${q}`, title: <>{QUADRANT_META[q].label}{estTag(list)}</>, hint: QUADRANT_META[q].hint, list }; });

  function estTag(list: PlanItem[]) { const m = sumEst(list); return m ? <span className="ml-1 text-[11px] font-normal text-slate-400" title="รวมเวลาที่คาดว่าใช้ของงานในช่องนี้">~{estimateLabel(m)}</span> : null; }
  const seg = (on: boolean) => `h-8 px-3 text-xs ${on ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`;
  const filterChip = (f: Filter, label: ReactNode, n: number) => (
    <button type="button" onClick={() => setFilter(filter === f ? "" : f)}
      className={`h-8 rounded-full border px-3 text-xs ${filter === f ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {label} <span className="text-slate-400">{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          <button type="button" className={seg(view === "priority")} onClick={() => pickView("priority")}>ตามความด่วน</button>
          <button type="button" className={seg(view === "matrix")} onClick={() => pickView("matrix")}>ตาราง 4 ช่อง</button>
          <button type="button" className={seg(view === "calendar")} onClick={() => pickView("calendar")}><Icon name="calendar" /> ปฏิทิน</button>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          <button type="button" className={seg(scope === "all")} onClick={() => { scopePref.setView("all"); void scopePref.saveDefault("all"); }}>ทั้งทีม</button>
          <button type="button" className={seg(scope === "me")} onClick={() => { scopePref.setView("me"); void scopePref.saveDefault("me"); }}>ของฉัน</button>
        </div>
        {filterChip("star", <><Icon name="star" /> งานหลักวันนี้</>, open.filter((t) => isStarredToday(t.plan)).length)}
        {filterChip("waiting", <><Icon name="waiting" /> รอคนอื่น</>, open.filter((t) => t.plan.waiting).length)}
        {filterChip("overdue", <><Icon name="warning" /> เกินกำหนด</>, open.filter((t) => isOverdue(t.due_at)).length)}
        <button type="button" onClick={() => void load()} title="โหลดใหม่" className="ml-auto h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-500 hover:bg-slate-50"><Icon name="refresh" /></button>
      </div>
      {/* 🏷 กรองตามแท็ก (โชว์เมื่อมีงานที่ใส่แท็ก) */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500"><Icon name="tag" /> แท็ก:</span>
          {tagCounts.slice(0, 20).map(({ tag, n }) => (
            <span key={tag} className="inline-flex items-center gap-0.5">
              <PlanTagChip tag={tag} active={tagOn.toLowerCase() === tag.toLowerCase()} onClick={() => setTagFilter(tagOn.toLowerCase() === tag.toLowerCase() ? "" : tag)} />
              <span className="text-[11px] text-slate-400">{n}</span>
            </span>
          ))}
          {tagOn && <button type="button" onClick={() => setTagFilter("")} className="text-xs text-violet-700 hover:underline">ล้างตัวกรองแท็ก</button>}
        </div>
      )}

      {/* ⭐ งานหลักวันนี้ของฉัน */}
      {items && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-amber-800"><Icon name="star" /> งานหลักวันนี้ของฉัน</span>
            <span className="text-xs text-amber-700/80">{myStars.length}/{MAX_STARS} · {myStars.length < MAX_STARS ? `กด ☆ บนการ์ดเพื่อเลือกอีก ${MAX_STARS - myStars.length} งาน` : "ครบแล้ว — โฟกัส 3 งานนี้ก่อน"}</span>
            {load2.count > 0 && (
              <span className={`ml-auto text-xs ${load2.minutes > DAY_CAPACITY_MIN ? "font-medium text-rose-600" : "text-amber-700/80"}`}
                title="งานของฉันที่ครบกำหนดวันนี้หรือเลยแล้ว + งานหลักวันนี้ · รวมเวลาที่คาดว่าใช้">
                <Icon name="clock" /> วันนี้ของฉัน {load2.count} งาน{load2.minutes ? ` · ~${estimateLabel(load2.minutes)}` : ""}{load2.unestimated ? ` (ยังไม่ประเมิน ${load2.unestimated})` : ""}{load2.minutes > DAY_CAPACITY_MIN ? " — เกิน 8 ชม. ลองเลื่อนบางงาน" : ""}
              </span>
            )}
          </div>
          {myStars.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {myStars.map((t) => (
                <button key={t.id} type="button" onClick={() => setEditing(t)} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:border-amber-400">
                  {t.title}{t.due_at && <span className={`ml-1 ${isOverdue(t.due_at) ? "text-rose-600" : "text-slate-400"}`}>· {dueLabel(t.due_at)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canAdd && <QuickAdd me={me} meName={user?.name ?? ""} onAdded={(t) => upsert([t])} />}

      {err ? <ErrorState title="โหลดแผนงานไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !items ? <LoadingState />
        : all.length === 0 ? <EmptyState title="ยังไม่มีงานในแผน" hint="พิมพ์งานแรกในช่องด้านบน แล้วกด Enter — เลือกความด่วน กำหนด และคนรับผิดชอบได้" />
        : view === "calendar" ? (
          <ScheduleBoard<PlanItem>
            items={shown} layout={viewport} backlogTitle="ยังไม่กำหนดวัน"
            hint={canEdit ? "ลากงานไปวางบนวัน = ตั้งกำหนดวันนั้น (คงเวลาเดิม · ไม่มีเวลา = 18:00) · ลากกลับกล่อง = ไม่กำหนดวัน" : undefined}
            getDate={(t) => dueYmd(t.due_at)}
            onSchedule={(t, date) => {
              if (!canEdit) return;
              const due = dueOnDate(t.due_at, date);
              if (due !== t.due_at) void update(t, { due_at: due }, { due_at: due });
            }}
            renderCard={(t) => <PlanCardView t={t} {...cardProps} />}
            renderChip={(t) => (
              <button type="button" onClick={() => setEditing(t)} title={t.assigned_name ? `${t.title} — ${t.assigned_name}` : t.title}
                className={`block w-full truncate rounded border-l-2 px-1 py-0.5 text-left text-[11px] hover:bg-violet-50 ${isOverdue(t.due_at) ? "bg-rose-50 text-rose-700" : "bg-white text-slate-700"}`}
                style={{ borderLeftColor: PRIORITY_META[t.priority].color }}>
                {isStarredToday(t.plan) ? "★ " : ""}{t.title}
              </button>
            )}
            filters={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label, color: PRIORITY_META[p].color }))}
            getFilter={(t) => t.priority}
            getSearchText={(t) => `${t.title} ${t.assigned_name ?? ""}`}
            getDotColor={(t) => PRIORITY_META[t.priority].color}
          />
        )
        : (
          <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
            <div className={`grid gap-3 ${view === "priority" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2"}`}>
              {columns.map((c) => (
                <Column key={c.id} id={c.id} title={c.title} hint={c.hint} count={c.list.length}>
                  {c.list.map((t) => <PlanCard key={t.id} t={t} {...cardProps} />)}
                </Column>
              ))}
            </div>
            <DragOverlay dropAnimation={null}>{dragging && <div className="w-64 rotate-1 opacity-90"><PlanCardView t={dragging} {...cardProps} /></div>}</DragOverlay>
          </DndContext>
        )}

      {/* เสร็จแล้ว (7 วันล่าสุด) */}
      {done.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setShowDone((s) => !s)} className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
            {showDone ? "▾" : "▸"} เสร็จแล้ว {done.length} งาน (7 วันล่าสุด)
          </button>
          {showDone && (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {done.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <input type="checkbox" checked disabled={!canEdit} className="h-4 w-4 accent-emerald-600"
                    onChange={() => void update(t, { status: "open" }, { status: "open" })} title="กดเพื่อยกเลิกว่าเสร็จ" />
                  <span className="min-w-0 flex-1 truncate text-slate-400 line-through">{t.title}</span>
                  <span className="text-[11px] text-slate-400">{t.resolved_by}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <PlanEditModal item={all.find((t) => t.id === editing.id) ?? editing} canEdit={canEdit} me={me}
          onClose={() => setEditing(null)}
          onSaved={(list) => upsert(list)}
          onDeleted={(id) => { setItems((cur) => (cur ?? []).filter((t) => t.id !== id)); setEditing(null); }}
          onChecklist={setChecklist} tagSuggestions={planTagCounts(all).map((x) => x.tag)}
          onDuplicated={(copy) => { upsert([copy]); setEditing(copy); }} />
      )}
    </div>
  );
}

function Column({ id, title, hint, count, children }: { id: string; title: ReactNode; hint?: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`min-h-[160px] rounded-xl p-2 transition ${isOver ? "bg-violet-50 ring-2 ring-violet-300" : "bg-slate-100/70"}`}>
      <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-slate-700">
        {title}<span className="text-xs font-normal text-slate-400">{count}</span>
        {hint && <span className="ml-auto text-[11px] font-normal text-slate-500">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
      {count === 0 && <div className="px-1 py-6 text-center text-xs text-slate-400">ลากการ์ดมาวางที่นี่</div>}
    </div>
  );
}

type CardProps = { t: PlanItem; me: string; canEdit: boolean; onOpen: (t: PlanItem) => void; onUpdate: (t: PlanItem, p: PlanPatch, o?: Partial<PlanItem>) => Promise<PlanItem | null>; onChecklist?: (id: string, s: ChecklistSummary) => void; onTag?: (tag: string) => void };

function PlanCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.t.id, disabled: !props.canEdit });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? "opacity-30" : ""}>
      <PlanCardView {...props} />
    </div>
  );
}

/** หน้าตาการ์ด (ใช้ทั้งในช่องและตอนกำลังลาก) */
function PlanCardView({ t, canEdit, onOpen, onUpdate, onChecklist, onTag }: CardProps) {
  const overdue = isOverdue(t.due_at);
  const starred = isStarredToday(t.plan);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();   // ปุ่มบนการ์ดไม่ให้เริ่มลาก/เปิดป๊อป
  return (
    <div onClick={() => onOpen(t)} className={`cursor-pointer rounded-lg border bg-white px-2.5 py-2 text-sm shadow-sm hover:border-violet-300 ${overdue ? "border-rose-200" : "border-slate-200"}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={false} disabled={!canEdit} onPointerDown={stop} onClick={stop} title="ติ๊กว่าเสร็จ"
          onChange={() => void onUpdate(t, { status: "resolved" }, { status: "resolved", resolved_at: new Date().toISOString() })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
        <span className="min-w-0 flex-1 break-words text-slate-800">{t.title}</span>
        <button type="button" disabled={!canEdit} onPointerDown={stop} title={starred ? "เอาออกจากงานหลักวันนี้" : "ปักเป็นงานหลักวันนี้ (สูงสุด 3 งาน)"}
          onClick={(e) => { stop(e); void onUpdate(t, { star: !starred }); }}
          className={`shrink-0 text-base leading-none ${starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>{starred ? "★" : "☆"}</button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
        {t.due_at && <span className={`${chip} ${overdue ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}><Icon name="calendar" /> {dueLabel(t.due_at)}</span>}
        {t.assigned_name && <WhoChip name={t.assigned_name} compact />}
        {t.plan.waiting && <span className={`${chip} bg-amber-50 text-amber-800`} title="รอคนอื่น"><Icon name="waiting" /> รอ{t.plan.waiting.note ? `: ${t.plan.waiting.note}` : ""} · {waitingDays(t.plan.waiting.since)} วัน</span>}
        {t.plan.repeat && <span className={`${chip} bg-slate-100 text-slate-600`}><Icon name="repeat" /> {REPEAT_LABEL(t.plan.repeat)}</span>}
        {t.plan.remind !== "none" && t.due_at && <span className={`${chip} bg-slate-100 text-slate-500`} title={`เตือน ${REMIND_LABEL[t.plan.remind]}`}><Icon name="notify" /></span>}
        {t.plan.source && <a href={t.plan.source.href} onPointerDown={stop} onClick={stop} className={`${chip} bg-blue-50 text-blue-700 hover:underline`}><Icon name="link" /> {t.plan.source.label}</a>}
        {t.plan.estimate_min && <span className={`${chip} bg-slate-100 text-slate-600`} title="เวลาที่คาดว่าใช้"><Icon name="clock" /> ~{estimateLabel(t.plan.estimate_min)}</span>}
        {t.plan.watchers.length > 0 && <span className={`${chip} bg-slate-100 text-slate-500`} title={`คนติดตาม: ${t.plan.watchers.map((w) => w.name).join(", ")}`}><Icon name="view" /> {t.plan.watchers.length}</span>}
        {t.plan.tags.map((g) => <span key={g} onPointerDown={stop} onClick={stop}><PlanTagChip tag={g} onClick={onTag ? () => onTag(g) : undefined} /></span>)}
        {t.checklist && <RecordChecklistChip variant="progress" moduleKey={TEAM_PLAN_CHECK.moduleKey} recordType={TEAM_PLAN_CHECK.recordType} recordId={t.id}
          canEdit={canEdit} summary={t.checklist} onChange={(s) => onChecklist?.(t.id, s)} />}
        {t.note && <span className={`${chip} bg-slate-100 text-slate-500`} title={noteToText(t.note)}><Icon name="note" /></span>}
      </div>
    </div>
  );
}

/** เพิ่มงานเร็ว — พิมพ์ + Enter (ช่องตั้งค่าใช้ของกลาง PlanDraftFields) · ✨ AI แตกงานจากข้อความยาว */
function QuickAdd({ me, meName, onAdded }: { me: string; meName: string; onAdded: (t: PlanItem) => void }) {
  const toast = useToast();
  const draft = usePlanDraft();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const submit = async () => {
    if (!title.trim()) { setErr("พิมพ์ชื่องานก่อน"); return; }
    if (draft.problem) { setErr(draft.problem); return; }
    setBusy(true);
    try {
      const t = await createPlanItem(draft.toDraft(title.trim(), me || null));
      onAdded(t);
      setTitle(""); setErr(null);
      if (draft.s.who && draft.s.who.id !== me) toast.success(`มอบงานให้ ${draft.s.who.name} แล้ว — เขาจะได้แจ้งเตือน`);
    } catch (e) { setErr(e instanceof Error ? e.message : "เพิ่มงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex gap-2">
        <input value={title} maxLength={300} onChange={(e) => { setTitle(e.target.value); setErr(null); }} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="เพิ่มงาน เช่น สั่งผ้าก้างปลาเพิ่ม แล้วกด Enter" aria-label="ชื่องาน"
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        <button type="button" onClick={() => void submit()} disabled={busy} className="h-9 shrink-0 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          <Icon name="add" /> เพิ่ม
        </button>
        <button type="button" onClick={() => setAiOpen(true)} title="วางข้อความยาว (แชทลูกค้า / โน้ตประชุม) ให้ AI แตกเป็นงานทีละข้อ"
          className="h-9 shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm text-violet-700 hover:bg-violet-100">
          <Icon name="ai" /> AI แตกงาน
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
      <div className="mt-2"><PlanDraftFields draft={draft} meName={meName} /></div>
      {aiOpen && <AiSplitModal me={me} onClose={() => setAiOpen(false)} onAdded={(list) => list.forEach(onAdded)} />}
    </div>
  );
}

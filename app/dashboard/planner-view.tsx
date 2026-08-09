"use client";

// ============================================================
// มุมมอง "แผนงาน" (Personal Planner) บน /dashboard
//
// ซ้าย  = กล่องงานเข้า: งานที่ยังไม่ได้วางแผน รวมจาก 4 แหล่ง
//         แจ้งเตือนของฉัน · งานย่อยที่ฉันรับผิดชอบ (Task Manager) · เดดไลน์จากปฏิทินรวม · พิมพ์เอง
// ขวา   = กระดาน 4 ช่อง: วันนี้ / พรุ่งนี้ / สัปดาห์นี้ / รอไว้ก่อน — ลากวางได้ ติ๊กเสร็จได้
//
// เก็บที่ตาราง erp_plan_items ผ่านของกลาง lib/planner + lib/planner-client (ส่วนตัวล้วน RLS เจ้าของคนเดียว)
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { apiFetch } from "@/lib/api";
import { useSWRLite } from "@/lib/swr-lite";
import { colorForSystem, systemForEvent } from "@/lib/dashboard-systems";
import {
  PLAN_BUCKETS, PLAN_CACHE_KEY, groupPlan, plannedKeys, planSourceKey, todayProgress, displayBucket,
  type PlanBucket, type PlanDraft, type PlanItem,
} from "@/lib/planner";
import { addToPlan, closeDay, deletePlanItem, listPlan, movePlanItems, patchPlanItem } from "@/lib/planner-client";
import type { Notification } from "@/app/api/notifications/route";
import type { CalendarEvent } from "@/app/api/calendar/events/route";

// ---- งานหนึ่งใบในกล่องงานเข้า (ยังไม่ได้วางแผน) ----
type InboxItem = {
  key:         string;            // source_type:source_id
  title:       string;
  source_type: PlanDraft["source_type"];
  source_id:   string;
  link:        string | null;
  module:      string | null;
  due_at:      string | null;
  sub:         string | null;     // บรรทัดรอง (เลขเอกสาร/ชื่องานแม่)
};

const MODULE_FALLBACK: Record<string, string> = {
  purchasing: "จัดซื้อ", tasks: "งาน / ออกแบบ", qc: "QC", sales: "ขาย", production: "ผลิต",
  design: "ออกแบบ", billing: "ใบวางบิล", subscriptions: "ต่ออายุ", settings: "ความปลอดภัย", misc: "อื่น ๆ",
};

const dayMs = 86_400_000;
const isSnoozed = (n: Notification) => !!n.snoozed_until && new Date(n.snoozed_until).getTime() > Date.now();

function dueLabel(iso: string): string {
  const d = new Date(iso).getTime(), now = Date.now();
  const days = Math.round((d - now) / dayMs);
  if (d < now) { const ad = Math.abs(days); return ad ? `เกินกำหนด ${ad} วัน` : "เกินกำหนด"; }
  if (days === 0) return "ครบกำหนดวันนี้";
  if (days === 1) return "ครบกำหนดพรุ่งนี้";
  return `ครบกำหนด ${new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`;
}
const isOverdue = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now();

// ============================================================
// การ์ด
// ============================================================

function ModuleChip({ module, apps }: { module: string | null; apps: { key: string; label: string }[] }) {
  if (!module) return null;
  const label = apps.find((a) => a.key === module)?.label ?? MODULE_FALLBACK[module] ?? module;
  const color = colorForSystem(module);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{ background: `${color}18`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{label}
    </span>
  );
}

function InboxCard({ item, apps, onQuickAdd, busy }: {
  item: InboxItem; apps: { key: string; label: string }[]; onQuickAdd: (bucket: PlanBucket) => void; busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `inbox:${item.key}` });
  return (
    <div className={`group rounded-lg border border-slate-200 bg-white p-2.5 ${isDragging ? "opacity-40" : ""} ${busy ? "opacity-60" : ""}`}>
      <div ref={setNodeRef} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <ModuleChip module={item.module} apps={apps} />
          {item.due_at && (
            <span className={`text-[10px] ${isOverdue(item.due_at) ? "text-red-600 font-medium" : "text-slate-400"}`}>{dueLabel(item.due_at)}</span>
          )}
        </div>
        <div className="text-[13px] text-slate-700 leading-snug">{item.title}</div>
        {item.sub && <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.sub}</div>}
      </div>
      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button type="button" disabled={busy} onClick={() => onQuickAdd("today")}
          className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">+ วันนี้</button>
        <button type="button" disabled={busy} onClick={() => onQuickAdd("tomorrow")}
          className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">+ พรุ่งนี้</button>
        <button type="button" disabled={busy} onClick={() => onQuickAdd("later")}
          className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">+ รอไว้</button>
      </div>
    </div>
  );
}

function PlanCardBody({ item, apps, dragging }: { item: PlanItem; apps: { key: string; label: string }[]; dragging?: boolean }) {
  return (
    <div className={`text-[13px] leading-snug ${item.done_at ? "text-slate-400 line-through" : "text-slate-700"} ${dragging ? "opacity-90" : ""}`}>
      {item.title}
    </div>
  );
}

function PlanCard({ item, apps, onToggle, onOpen, onRemove, busy }: {
  item: PlanItem; apps: { key: string; label: string }[];
  onToggle: () => void; onOpen: () => void; onRemove: () => void; busy: boolean;
}) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: item.id });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `slot:${item.id}` });
  return (
    <div ref={dropRef} className={`group rounded-lg border bg-white p-2 transition-colors
      ${isOver ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"} ${isDragging ? "opacity-40" : ""} ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onToggle} disabled={busy} aria-label={item.done_at ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "ทำเครื่องหมายว่าเสร็จแล้ว"}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] transition-colors
            ${item.done_at ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-emerald-400"}`}>
          {item.done_at ? "✓" : ""}
        </button>
        <div ref={dragRef} {...listeners} {...attributes} className="flex-1 min-w-0 cursor-grab active:cursor-grabbing touch-none">
          <PlanCardBody item={item} apps={apps} />
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <ModuleChip module={item.module} apps={apps} />
            {item.due_at && !item.done_at && (
              <span className={`text-[10px] ${isOverdue(item.due_at) ? "text-red-600 font-medium" : "text-slate-400"}`}>{dueLabel(item.due_at)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {item.link && (
            <button type="button" onClick={onOpen} title="เปิดหน้างาน" aria-label="เปิดหน้างาน"
              className="text-[11px] text-slate-400 hover:text-blue-600 px-1">↗</button>
          )}
          <button type="button" onClick={onRemove} disabled={busy} title="เอาออกจากแผน" aria-label="เอาออกจากแผน"
            className="text-[11px] text-slate-300 hover:text-red-500 px-1 disabled:opacity-50">✕</button>
        </div>
      </div>
    </div>
  );
}

function BucketColumn({ bucket, items, apps, onToggle, onOpen, onRemove, busyIds }: {
  bucket: typeof PLAN_BUCKETS[number]; items: PlanItem[]; apps: { key: string; label: string }[];
  onToggle: (it: PlanItem) => void; onOpen: (it: PlanItem) => void; onRemove: (it: PlanItem) => void; busyIds: Set<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket.key });
  const done = items.filter((i) => i.done_at).length;
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-white rounded-t-xl border border-b-0 border-slate-200">
        <span className="text-sm font-semibold text-slate-700">{bucket.icon} {bucket.label}</span>
        <span className="text-[11px] text-slate-400">{done > 0 ? `${done}/${items.length}` : items.length || ""}</span>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 min-h-[110px] space-y-2 p-2 rounded-b-xl border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-blue-50" : "bg-slate-50/60"}`}>
        {items.map((it) => (
          <PlanCard key={it.id} item={it} apps={apps} busy={busyIds.has(it.id)}
            onToggle={() => onToggle(it)} onOpen={() => onOpen(it)} onRemove={() => onRemove(it)} />
        ))}
        {items.length === 0 && (
          <div className="h-16 flex items-center justify-center text-[11px] text-slate-300 border-2 border-dashed border-slate-200 rounded-lg px-2 text-center">
            ลากงานมาวางที่นี่
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// มุมมองหลัก
// ============================================================

export function PlannerView({ notifications, apps, onOpenLink }: {
  notifications: Notification[];
  apps: { key: string; label: string }[];
  onOpenLink: (url: string, title: string) => void;
}) {
  // แผนงานเก็บใน cache กลาง (useSWRLite) — widget "แผนวันนี้" ใช้ key เดียวกัน จึงไม่ยิงซ้ำและอัปเดตพร้อมกัน
  const { data, loading, error, revalidate, mutate } = useSWRLite<PlanItem[]>(PLAN_CACHE_KEY, listPlan, { dedupeMs: 3000 });
  const plan = useMemo(() => data ?? [], [data]);
  const planRef = useRef<PlanItem[]>(plan);
  planRef.current = plan;
  const setPlan = useCallback((updater: PlanItem[] | ((prev: PlanItem[]) => PlanItem[])) => {
    const next = typeof updater === "function" ? (updater as (p: PlanItem[]) => PlanItem[])(planRef.current) : updater;
    planRef.current = next;
    mutate(next);
  }, [mutate]);

  const [subs, setSubs]         = useState<InboxItem[]>([]);
  const [cal, setCal]           = useState<InboxItem[]>([]);
  const [busyIds, setBusyIds]   = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [closing, setClosing]   = useState(false);
  const [flash, setFlash]       = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 4000);
  }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const mark = (id: string, on: boolean) =>
    setBusyIds((prev) => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });

  // ---- งานเข้าจากระบบอื่น (แผนงานเองโหลดผ่าน useSWRLite ด้านบน) ----
  useEffect(() => {
    let alive = true;
    {
      // งานย่อยที่ฉันรับผิดชอบ (ไม่มีสิทธิ์ tasks.view ก็แค่ไม่มีข้อมูลส่วนนี้ ไม่ทำให้หน้าพัง)
      apiFetch("/api/creative-tasks/my-subtasks").then((r) => r.json()).then((j) => {
        if (!alive) return;
        const rows = (j.data ?? []) as { id: string; title: string; due_date: string | null; task_id: string; task_no: string | null; task_title: string | null }[];
        setSubs(rows.map((r) => ({
          key: planSourceKey("subtask", r.id), title: r.title, source_type: "subtask" as const, source_id: r.id,
          link: `/tasks?task=${r.task_id}`, module: "tasks", due_at: r.due_date,
          sub: [r.task_no, r.task_title].filter(Boolean).join(" · ") || null,
        })));
      }).catch(() => { /* ไม่มีสิทธิ์/ล้มเหลว = ข้ามแหล่งนี้ */ });

      // เดดไลน์จากปฏิทินรวม 14 วันข้างหน้า
      const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      apiFetch(`/api/calendar/events?from=${ymd(new Date())}&to=${ymd(new Date(Date.now() + 14 * dayMs))}`)
        .then((r) => r.json()).then((j) => {
          if (!alive) return;
          const rows = (j.data ?? []) as CalendarEvent[];
          setCal(rows.map((e) => ({
            key: planSourceKey("calendar", e.id), title: e.title, source_type: "calendar" as const, source_id: e.id,
            link: e.link || null, module: e.module, due_at: e.date, sub: null,
          })));
        }).catch(() => { /* ปฏิทินล้ม = ข้ามแหล่งนี้ */ });
    }
    return () => { alive = false; };
  }, []);

  // ---- กล่องงานเข้า: รวม 3 แหล่งระบบ แล้วตัดที่วางแผนไปแล้วออก ----
  const planned = useMemo(() => plannedKeys(plan), [plan]);
  const inbox = useMemo(() => {
    const fromNotif: InboxItem[] = notifications
      .filter((n) => !n.read_at && !isSnoozed(n))
      .map((n) => ({
        key: planSourceKey("notification", n.id), title: n.title, source_type: "notification" as const, source_id: n.id,
        link: n.link_url, module: systemForEvent(n.event_type), due_at: n.due_at, sub: null,
      }));
    const all = [...fromNotif, ...subs, ...cal].filter((i) => !planned.has(i.key));
    // เรียง: เกินกำหนด → ใกล้ครบกำหนด → ไม่มีกำหนด
    return all.sort((a, b) => {
      const av = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bv = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
  }, [notifications, subs, cal, planned]);

  const grouped  = useMemo(() => groupPlan(plan), [plan]);
  const progress = useMemo(() => todayProgress(plan), [plan]);

  // ---- ปักงานเข้าแผน ----
  const putInPlan = useCallback(async (item: InboxItem, bucket: PlanBucket) => {
    mark(item.key, true);
    try {
      const rows = await addToPlan({
        title: item.title, bucket, source_type: item.source_type, source_id: item.source_id,
        link: item.link, module: item.module, due_at: item.due_at,
      });
      setPlan((prev) => [...prev, ...rows]);
      if (!rows.length) await revalidate(true);   // มีอยู่แล้ว → ดึงของจริงมาให้ตรง
    } catch (e) {
      say(e instanceof Error ? e.message : "ใส่แผนไม่สำเร็จ");
    } finally { mark(item.key, false); }
  }, [revalidate, say, setPlan]);

  const addManual = useCallback(async (bucket: PlanBucket = "today") => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    try {
      const rows = await addToPlan({ title, bucket, source_type: "manual" });
      setPlan((prev) => [...prev, ...rows]);
    } catch (e) {
      setNewTitle(title);
      say(e instanceof Error ? e.message : "เพิ่มงานไม่สำเร็จ");
    }
  }, [newTitle, say]);

  // ---- ติ๊กเสร็จ / เอาออก ----
  const toggleDone = useCallback(async (it: PlanItem) => {
    const done_at = it.done_at ? null : new Date().toISOString();
    setPlan((prev) => prev.map((x) => (x.id === it.id ? { ...x, done_at } : x)));
    mark(it.id, true);
    try { await patchPlanItem(it.id, { done_at }); }
    catch (e) {
      setPlan((prev) => prev.map((x) => (x.id === it.id ? { ...x, done_at: it.done_at } : x)));
      say(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { mark(it.id, false); }
  }, [say]);

  const removeItem = useCallback(async (it: PlanItem) => {
    const before = plan;
    setPlan((prev) => prev.filter((x) => x.id !== it.id));
    try { await deletePlanItem(it.id); }
    catch (e) { setPlan(before); say(e instanceof Error ? e.message : "เอาออกไม่สำเร็จ"); }
  }, [plan, say]);

  // ---- ปิดวัน ----
  const onCloseDay = useCallback(async () => {
    setClosing(true);
    try {
      const r = await closeDay(true);
      setPlan(r.data);
      say(r.archived || r.carried
        ? `ปิดวันแล้ว — เก็บงานที่ทำเสร็จ ${r.archived} งาน${r.carried ? ` · ยกงานค้าง ${r.carried} งานไปพรุ่งนี้` : ""}`
        : "ยังไม่มีอะไรให้ปิด — แผนวันนี้ว่างอยู่");
    } catch (e) {
      say(e instanceof Error ? e.message : "ปิดวันไม่สำเร็จ");
    } finally { setClosing(false); }
  }, [say]);

  // ---- ลากวาง ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const onDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : "";
    if (!overId) return;
    const activeKey = String(e.active.id);

    // ปลายทาง: ช่อง หรือ การ์ดใบหนึ่ง (= แทรกก่อนใบนั้น)
    let toBucket: PlanBucket | null = null;
    let insertAt = -1;
    if (overId.startsWith("slot:")) {
      const target = plan.find((x) => x.id === overId.slice(5));
      if (!target) return;
      toBucket = displayBucket(target);
      insertAt = (grouped[toBucket] ?? []).findIndex((x) => x.id === target.id);
    } else if (PLAN_BUCKETS.some((b) => b.key === overId)) {
      toBucket = overId as PlanBucket;
    }
    if (!toBucket) return;

    // จากกล่องงานเข้า → ปักเข้าแผน
    if (activeKey.startsWith("inbox:")) {
      const item = inbox.find((i) => `inbox:${i.key}` === activeKey);
      if (item) await putInPlan(item, toBucket);
      return;
    }

    // ย้าย/เรียงในกระดาน
    const moving = plan.find((x) => x.id === activeKey);
    if (!moving) return;
    const fromBucket = displayBucket(moving);
    const target = (grouped[toBucket] ?? []).filter((x) => x.id !== moving.id);
    const at = insertAt < 0 ? target.length : insertAt;
    target.splice(at, 0, moving);

    const moves = target.map((x, i) => ({ id: x.id, bucket: toBucket as PlanBucket, sort_order: i }));
    const changed = moves.filter((m) => {
      const cur = plan.find((x) => x.id === m.id);
      return !cur || cur.sort_order !== m.sort_order || displayBucket(cur) !== m.bucket;
    });
    if (!changed.length) return;

    const before = plan;
    setPlan((prev) => prev.map((x) => {
      const m = changed.find((c) => c.id === x.id);
      return m ? { ...x, bucket: m.bucket, sort_order: m.sort_order, plan_date: m.bucket === "today" || m.bucket === "tomorrow" ? x.plan_date : null } : x;
    }));
    try {
      const rows = await movePlanItems(changed);
      if (rows.length) setPlan((prev) => prev.map((x) => rows.find((r) => r.id === x.id) ?? x));
    } catch (err) {
      setPlan(before);
      say(err instanceof Error ? err.message : "ย้ายงานไม่สำเร็จ");
    }
    void fromBucket;
  }, [plan, grouped, inbox, putInPlan, say]);

  const dragging = useMemo(() => {
    if (!activeId) return null;
    if (activeId.startsWith("inbox:")) {
      const i = inbox.find((x) => `inbox:${x.key}` === activeId);
      return i ? <div className="rounded-lg border border-slate-300 bg-white p-2 text-[13px] text-slate-700 shadow-lg w-56">{i.title}</div> : null;
    }
    const p = plan.find((x) => x.id === activeId);
    return p ? <div className="rounded-lg border border-slate-300 bg-white p-2 text-[13px] text-slate-700 shadow-lg w-56">{p.title}</div> : null;
  }, [activeId, inbox, plan]);

  // ---- states ----
  if (loading && !plan.length) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-4">
        <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (error && !plan.length) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">เปิดแผนงานไม่สำเร็จ · {error.message}</p>
        <button onClick={() => void revalidate(true)}
          className="mt-3 text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-100">ลองใหม่</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* แถบสรุปวันนี้ + ปิดวัน */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-2.5">
        <span className="text-sm text-slate-600">
          {progress.total === 0
            ? "ยังไม่ได้วางแผนวันนี้ — ลากงานจากกล่องซ้ายมาช่อง “วันนี้” ได้เลย"
            : <>วันนี้ทำไปแล้ว <span className="font-semibold text-slate-800">{progress.done}</span> จาก {progress.total} งาน</>}
        </span>
        {progress.total > 0 && (
          <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        )}
        <div className="flex-1" />
        <button onClick={onCloseDay} disabled={closing}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {closing ? "กำลังปิดวัน…" : "🌙 ปิดวัน — เก็บงานเสร็จ ยกงานค้างไปพรุ่งนี้"}
        </button>
      </div>

      {flash && (
        <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{flash}</div>
      )}

      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-4 items-start">

          {/* ---- กล่องงานเข้า ---- */}
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-slate-800">📥 งานเข้า</span>
              <span className="text-[11px] text-slate-400">ยังไม่ได้วางแผน</span>
              {inbox.length > 0 && <span className="ml-auto text-[11px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{inbox.length}</span>}
            </div>

            <div className="flex gap-1.5 mb-3">
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addManual("today"); } }}
                placeholder="เพิ่มงานของฉันเอง เช่น โทรหาซัพ"
                className="flex-1 min-w-0 text-[13px] px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
              <button onClick={() => void addManual("today")} disabled={!newTitle.trim()}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40">เพิ่ม</button>
            </div>

            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-0.5">
              {inbox.map((item) => (
                <InboxCard key={item.key} item={item} apps={apps} busy={busyIds.has(item.key)}
                  onQuickAdd={(b) => void putInPlan(item, b)} />
              ))}
              {inbox.length === 0 && (
                <div className="py-8 text-center">
                  <div className="text-2xl mb-1">🎉</div>
                  <p className="text-xs text-slate-400">วางแผนครบทุกงานแล้ว<br />งานใหม่จะเด้งมาที่นี่เอง</p>
                </div>
              )}
            </div>
          </div>

          {/* ---- กระดาน 4 ช่อง ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLAN_BUCKETS.map((b) => (
              <BucketColumn key={b.key} bucket={b} items={grouped[b.key]} apps={apps} busyIds={busyIds}
                onToggle={toggleDone} onRemove={removeItem}
                onOpen={(it) => { if (it.link) onOpenLink(it.link, it.title); }} />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>{dragging}</DragOverlay>
      </DndContext>
    </div>
  );
}

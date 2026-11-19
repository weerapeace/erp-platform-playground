"use client";
/**
 * 🧭 โหมด "ผังระบบ" ของกระดานแผนงาน = Canvas งานค้างรวม 3 ระบบ
 *   รอบแรก (2026-11-19 แบบ C + ไอเดีย 1-15): งานในแผนเกาะกล่องแผนผังการทำงาน (lib/flow-map) · ถาดขวา · ย้อนกลับ
 *   ขยาย (2026-11-19 แบบ A + ข้อ 1-9,12,13,15,17): รวมงาน Task + ใบงานออกแบบ
 *     - ผัง "ครีเอทีฟ / ออกแบบ" (lib/work-canvas WORK_BOXES): งาน Task / ใบงาน เกาะกล่องเองตามสถานะ · ในผังอื่น ใบงานรวมที่กล่อง "ใบงานออกแบบ"
 *     - ป้ายบนกล่องแยกสี 3 ชนิด · กล่องขอบแดง = มีงานเกินกำหนด · ซูมเข้า (≥ 130%) กล่องกางเป็นสถานะย่อย
 *     - ตัวกรองรวม ทั้งทีม / ของฉัน / เกินกำหนด / รอตรวจ · กดป้ายชนิดในแถบสรุป = ซ่อน/โชว์ชนิดนั้น · จำมุมมองต่อคน
 *     - ถาดขวา 4 แท็บ (แผนยังไม่เกาะ · แผนทั้งหมด · งาน · ใบงาน) + ค้นหา + พับได้
 *     - ทำงานจากรายการบนกล่อง: แผน = ติ๊กเสร็จ/เอาออก · งาน Task = เปลี่ยนสถานะตามเส้นทางเดิม (applyTaskTransition) · ใบงาน = ดูรออะไรอยู่
 *       กด = เปิดหน้าต่างเดิมของระบบนั้น (ป๊อปงานในแผน / TaskDetailDrawer / DesignSheetsDetail) · ทุกการเปลี่ยนมี "ย้อนกลับ"
 *   ตัวกระดาน = ของกลาง FlowchartBoard (ชั้นล็อก = กล่องระบบ · วาดเสริมได้ entity team_plan_flow/<แท็บผัง>) · เต็มจอ = FullscreenStage (หน้าแม่)
 * doc: docs/team-plan.md
 */
import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent as RMouseEvent } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@xyflow/react";
import { Icon } from "@/components/icon";
import { useToast, usePushToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { LoadingState } from "@/components/state-views";
import type { FlowLockedLayer } from "@/components/flowchart-board";
import type { LockedLine } from "@/lib/flowchart-locked";
import { FLOW_AREA_LABEL, FLOW_EDGE_TYPES, FLOW_EDGES, FLOW_NODES, FLOW_VIEWS } from "@/lib/flow-map";
import { FM_BAND_LABELS, FM_CX, FM_H, FM_W, fmBox, isRecentEdge, layoutFlowView } from "@/lib/flow-map-layout";
import { dueLabel, type PlanItem } from "@/lib/team-plan";
import { patchPlanItem } from "@/lib/team-plan-client";
import { useUserPref } from "@/lib/use-user-pref";
import {
  flowNodeLabel, flowPinsOf, initialOf, suggestFlowNode, withFlowPin, withoutFlowPin,
} from "@/lib/team-plan-flow";
import {
  countKinds, FLOW_VIEW_PREF_DEFAULT, matchWork, parseFlowViewPref, planToWork, sortWork, statusBreakdown, WORK_BAND_LABELS, WORK_BOXES,
  WORK_FILTERS, WORK_KIND_META, WORK_TAIL_NODE, workKey, workSummary, type FlowViewPref, type WorkFilter, type WorkItem, type WorkKind,
} from "@/lib/work-canvas";
import { applyTaskTransition } from "@/app/tasks/task-actions";
import { deleteTask } from "@/app/tasks/data";
import { statusLabel as taskStatusLabel, transitionBetween, transitionsFrom } from "@/app/tasks/use-statuses";
import { AddToPlanModal } from "./add-to-plan";
import { PlanTray, type TrayTab } from "./plan-tray";
import { useWorkSources } from "./use-work-sources";

const FlowchartBoard = dynamic(() => import("@/components/flowchart-board").then((m) => m.FlowchartBoard), { ssr: false, loading: () => <LoadingState /> });
const TaskDetailDrawer = dynamic(() => import("@/app/tasks/task-detail-drawer").then((m) => m.TaskDetailDrawer), { ssr: false });
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });

/** แท็บผังที่ใช้ในแผนงาน (ผังการเงินเห็นเฉพาะผู้มีสิทธิ์ — ไม่เอามาที่นี่) */
const PLAN_FLOW_VIEWS = FLOW_VIEWS.filter((v) => !v.finance);
const WORK_VIEW = "work";
const HEIGHT = "calc(100vh - 300px)";
/** ซูมเข้าถึงเท่านี้ = กล่องกางเป็นสถานะย่อย (ข้อ 9) */
const EXPAND_ZOOM = 1.3;
const KINDS: WorkKind[] = ["plan", "task", "sheet"];

// ── ผัง "ครีเอทีฟ / ออกแบบ" (วาดจาก WORK_BOXES · ไม่อยู่ในแผนผังการทำงานหลัก) ──
const WB_Y = [40, 196];
const workBoxRect = (id: string) => {
  const b = WORK_BOXES[id];
  if (b) return { x: FM_CX[b.col], y: WB_Y[b.band], w: FM_W, h: FM_H };
  return { x: FM_CX[3], y: WB_Y[1], w: FM_W, h: FM_H };   // กล่องท้ายแถบใบงาน = SKU
};
const WORK_VIEW_IDS = [...Object.keys(WORK_BOXES), WORK_TAIL_NODE];
const WORK_LINES: [string, string][] = [["w_queue", "w_doing"], ["w_doing", "w_review"], ["w_review", "w_publish"], ["d_design", "d_customer"], ["d_customer", "d_approved"], ["d_approved", WORK_TAIL_NODE]];

type Pop = { node: string; x: number; y: number } | null;
type Opened = { kind: "task" | "sheet"; id: string } | null;

/** ซูมปัจจุบันของกระดาน (อ่านจาก React Flow — renderBox อยู่ใน provider ของกระดาน) */
function useBoardZoom() { return useStore((s) => s.transform[2]); }

/** กล่อง 1 กล่อง: ชื่อ · ป้ายนับแยกสี · ซูมเข้า = สถานะย่อย */
function WorkBoxView({ label, sub, list, dim, lit, hover, over, canAdd, onBadge, onBadgeLeave, onAdd }: {
  label: string; sub: string; list: WorkItem[]; dim: boolean; lit: boolean; hover: boolean; over: boolean; canAdd: boolean;
  onBadge: (e: RMouseEvent) => void; onBadgeLeave: () => void; onAdd: () => void;
}) {
  const zoom = useBoardZoom();
  const c = countKinds(list);
  const people = [...new Set(list.map((t) => t.assigned_name ?? "").filter(Boolean))].slice(0, 3);
  const expand = zoom >= EXPAND_ZOOM && list.some((w) => w.kind !== "plan");
  const parts = expand ? statusBreakdown(list).slice(0, 3) : [];
  return (
    <div className={`group relative flex h-full w-full flex-col items-center justify-center rounded-lg border px-1 text-center transition-opacity
      ${hover ? "border-violet-500 bg-violet-100 ring-2 ring-violet-300" : over ? "border-rose-500 bg-white ring-1 ring-rose-300" : "border-indigo-200 bg-indigo-50"}
      ${lit ? "ring-2 ring-violet-500" : ""} ${dim ? "opacity-30" : ""}`}>
      <span className="text-[13px] font-semibold leading-tight text-indigo-950">{label}</span>
      {!expand && <span className="text-[10px] leading-tight text-indigo-500">{sub}</span>}
      {expand && (
        <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
          {parts.map((p) => <span key={`${p.kind}${p.label}`} className={`rounded px-1 text-[8px] leading-3 ${WORK_KIND_META[p.kind].chip}`}>{p.label} {p.n}</span>)}
        </span>
      )}
      {list.length > 0 && (
        <button type="button" onMouseEnter={onBadge} onMouseLeave={onBadgeLeave} onClick={(e) => { e.stopPropagation(); onBadge(e); }}
          className={`mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1 text-[10px] font-medium leading-4 shadow-sm ${over ? "ring-1 ring-rose-300" : ""}`}>
          {KINDS.map((k) => c[k] > 0 && <span key={k} className={`rounded-full px-1 ${WORK_KIND_META[k].chip}`} title={WORK_KIND_META[k].label}>{c[k]}</span>)}
          <span className="ml-0.5 flex">{people.map((p) => <span key={p} title={p} className="-ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-violet-200 text-[8px] text-violet-800 first:ml-0">{initialOf(p)}</span>)}</span>
        </button>
      )}
      {canAdd && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAdd(); }} title={`สร้างงานใหม่ที่เกาะ ${label}`}
          className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 text-[10px] text-violet-700 shadow-sm hover:bg-violet-50 group-hover:block">+ งาน</button>
      )}
    </div>
  );
}

export function PlanFlowBoard({ items, canEdit, onOpen, onUpsert, fill = false }: {
  items: PlanItem[];
  canEdit: boolean;
  onOpen: (t: PlanItem) => void;
  onUpsert: (list: PlanItem[]) => void;
  /** โหมดเต็มจอ (FullscreenStage ของหน้าแม่) */
  fill?: boolean;
}) {
  const toast = useToast();
  const pushToast = usePushToast();
  const { user } = useAuth();
  const me = user?.id ?? null;
  const src = useWorkSources(true);
  const [pref, setPref] = useUserPref<FlowViewPref>("team_plan_flow_pref", FLOW_VIEW_PREF_DEFAULT, parseFlowViewPref);
  const viewKey = pref.view === WORK_VIEW || PLAN_FLOW_VIEWS.some((v) => v.key === pref.view) ? pref.view : WORK_VIEW;
  const isWork = viewKey === WORK_VIEW;
  const view = isWork ? null : PLAN_FLOW_VIEWS.find((v) => v.key === viewKey) ?? PLAN_FLOW_VIEWS[0];
  const drawn = useMemo(() => (view ? layoutFlowView(view) : []), [view]);
  const { filter, onlyPinned } = pref;
  const kinds = useMemo(() => new Set(pref.kinds), [pref.kinds]);
  const patchPref = (p: Partial<FlowViewPref>) => setPref({ ...pref, ...p });
  const [selKey, setSelKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [menuFor, setMenuFor] = useState<PlanItem | null>(null);
  const [menuQ, setMenuQ] = useState("");
  const [addAt, setAddAt] = useState<string | null>(null);
  const [overNode, setOverNode] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [opened, setOpened] = useState<Opened>(null);
  const itemsRef = useRef(items); itemsRef.current = items;
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useMemo(() => items.filter((t) => t.status !== "resolved"), [items]);
  const inView = useMemo(() => new Set(isWork ? WORK_VIEW_IDS : Object.keys(view?.pos ?? {})), [isWork, view]);

  // ── งานรวม 3 ชนิด → กล่อง ──
  const planWork = useMemo(() => open.map((t) => planToWork(t, t.due_at ? dueLabel(t.due_at) : "")), [open]);
  const allWork = useMemo(() => [...planWork, ...src.tasks, ...src.sheets], [planWork, src.tasks, src.sheets]);
  const shownWork = useMemo(() => allWork.filter((w) => kinds.has(w.kind) && matchWork(w, filter, me)), [allWork, kinds, filter, me]);
  const summary = useMemo(() => workSummary(allWork.filter((w) => kinds.has(w.kind))), [allWork, kinds]);
  /** กล่องที่งานชิ้นนี้อยู่ในผังที่เปิดอยู่ */
  const boxesOf = useCallback((w: WorkItem): string[] => {
    if (w.kind === "plan") return w.plan ? flowPinsOf(w.plan) : [];
    if (isWork) return w.box ? [w.box] : [];
    return w.kind === "sheet" ? ["ds"] : [];   // ผังอื่น: ใบงานรวมที่กล่องใบงานออกแบบ · งาน Task ไม่มีกล่อง
  }, [isWork]);
  const byNode = useMemo(() => {
    const m = new Map<string, WorkItem[]>();
    for (const w of shownWork) for (const id of boxesOf(w)) if (inView.has(id)) (m.get(id) ?? m.set(id, []).get(id)!).push(w);
    return m;
  }, [shownWork, boxesOf, inView]);
  const topNode = useMemo(() => {
    let best: string | null = null, n = 0;
    for (const [id, list] of byNode) { const o = list.filter((w) => w.overdue).length; if (o > n) { n = o; best = id; } }
    return best ? { id: best, n } : null;
  }, [byNode]);
  const sel = selKey ? allWork.find((w) => workKey(w) === selKey) ?? null : null;
  const selBoxes = useMemo(() => new Set(sel ? boxesOf(sel) : []), [sel, boxesOf]);
  const selPlan = sel?.kind === "plan" ? sel.plan ?? null : null;

  // ── บันทึกการเกาะ (ส่งรายการผูกทั้งชุด) + ย้อนกลับ ──
  const saveLinked = useCallback(async (t: PlanItem, linked: PlanItem["plan"]["linked"], msg: string, undoable = true) => {
    const before = t.plan.linked;
    onUpsert([{ ...t, plan: { ...t.plan, linked } }]);   // เห็นผลทันที
    try {
      const { item } = await patchPlanItem(t.id, { linked });
      onUpsert([item]);
      if (undoable) toast.undo(msg, async () => {
        const cur = itemsRef.current.find((x) => x.id === t.id) ?? item;
        await saveLinked(cur, before, "ย้อนกลับแล้ว", false);
      });
      else toast.success(msg);
    } catch (e) {
      onUpsert([t]);
      toast.error(e instanceof Error ? `บันทึกไม่สำเร็จ: ${e.message}` : "บันทึกไม่สำเร็จ");
    }
  }, [onUpsert, toast]);

  const pinTo = useCallback((t: PlanItem, node: string) => {
    if (!canEdit) { toast.info("ต้องมีสิทธิ์แก้แผนงานจึงจะเกาะงานกับกล่องได้"); return; }
    const cur = itemsRef.current.find((x) => x.id === t.id) ?? t;
    if (flowPinsOf(cur).includes(node)) { toast.info(`"${cur.title}" เกาะกับ ${flowNodeLabel(node)} อยู่แล้ว`); return; }
    void saveLinked(cur, withFlowPin(cur.plan.linked, node), `เกาะ "${cur.title}" กับ ${flowNodeLabel(node)} แล้ว`);
  }, [canEdit, saveLinked, toast]);
  const unpin = useCallback((t: PlanItem, node: string) => {
    if (!canEdit) return;
    void saveLinked(t, withoutFlowPin(t.plan.linked, node), `เอา "${t.title}" ออกจาก ${flowNodeLabel(node)} แล้ว (งานยังอยู่ในแผน)`);
  }, [canEdit, saveLinked]);

  const tickDone = useCallback(async (t: PlanItem) => {
    if (!canEdit) return;
    onUpsert([{ ...t, status: "resolved", resolved_at: new Date().toISOString() }]);
    try {
      const { item } = await patchPlanItem(t.id, { status: "resolved" });
      onUpsert([item]);
      toast.undo(`ติ๊ก "${t.title}" เสร็จแล้ว`, async () => {
        try { const r = await patchPlanItem(t.id, { status: "open" }); onUpsert([r.item]); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { onUpsert([t]); toast.error(e instanceof Error ? e.message : "ติ๊กเสร็จไม่สำเร็จ"); }
  }, [canEdit, onUpsert, toast]);

  // งาน Task: เปลี่ยนสถานะตามเส้นทางเดิมของ Task Manager (ถามเหตุผลเองถ้าเป็นตีกลับ/ติดปัญหา) + ย้อนกลับถ้ามีเส้นทางกลับ
  const moveTask = useCallback(async (w: WorkItem, to: string) => {
    const row = src.taskRows.get(w.id);
    if (!row) return;
    const from = row.status;
    const ok = await applyTaskTransition(row, to, { pushToast });
    if (!ok) return;
    await src.reload();
    if (transitionBetween(to, from)) {
      toast.undo(`"${w.title}" → ${taskStatusLabel(to)}`, async () => {
        if (await applyTaskTransition({ ...row, status: to as typeof row.status }, from, { pushToast })) await src.reload();
      });
    }
  }, [src, pushToast, toast]);

  const dropOn = (node: string) => (e: DragEvent) => {
    const id = e.dataTransfer.getData("text/plan-id");
    setOverNode(null);
    if (!id) return;
    e.preventDefault(); e.stopPropagation();
    const t = itemsRef.current.find((x) => x.id === id);
    if (t) pinTo(t, node);
  };

  const showPop = (node: string, e: RMouseEvent) => {
    if (popTimer.current) clearTimeout(popTimer.current);
    setPop({ node, x: Math.min(e.clientX, window.innerWidth - 330), y: Math.min(e.clientY + 10, window.innerHeight - 320) });
  };
  const hidePopSoon = () => { if (popTimer.current) clearTimeout(popTimer.current); popTimer.current = setTimeout(() => setPop(null), 350); };
  const keepPop = () => { if (popTimer.current) clearTimeout(popTimer.current); };

  const boxMeta = (id: string): { label: string; sub: string } | null => WORK_BOXES[id] ?? (FLOW_NODES[id] ? { label: FLOW_NODES[id].label, sub: FLOW_NODES[id].sub } : null);

  // ── กล่อง 1 กล่อง (วาดเองทั้งกล่อง ขนาดเท่ากล่องผัง) ──
  const renderBox = (id: string) => {
    const meta = boxMeta(id); if (!meta) return null;
    const list = byNode.get(id) ?? [];
    return (
      <div className="h-full w-full"
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/plan-id")) { e.preventDefault(); if (overNode !== id) setOverNode(id); } }}
        onDragLeave={() => setOverNode((c) => (c === id ? null : c))} onDrop={dropOn(id)}
        onClick={(e) => { if (selPlan && canEdit && !flowPinsOf(selPlan).includes(id)) { e.stopPropagation(); pinTo(selPlan, id); setSelKey(null); } }}>
        <WorkBoxView label={meta.label} sub={meta.sub} list={list} hover={overNode === id} lit={selBoxes.has(id)}
          over={list.some((w) => w.overdue)} dim={(filter !== "all" || onlyPinned) && list.length === 0} canAdd={canEdit}
          onBadge={(e) => showPop(id, e)} onBadgeLeave={hidePopSoon} onAdd={() => setAddAt(id)} />
      </div>
    );
  };

  const dimLines = onlyPinned || filter !== "all";
  const lockedLayer: FlowLockedLayer = isWork ? {
    boxes: WORK_VIEW_IDS.map((id) => { const r = workBoxRect(id); return { id, ...r, label: `${boxMeta(id)?.label ?? id} ${boxMeta(id)?.sub ?? ""}` }; }),
    lines: WORK_LINES.map(([a, b], i): LockedLine => {
      const ra = workBoxRect(a), rb = workBoxRect(b);
      const y = ra.y + ra.h / 2, x1 = ra.x + ra.w, x2 = rb.x;
      return { id: `wl${i}`, source: a, target: b, d: `M${x1} ${y} L${x2} ${y}`, color: "#94a3b8", width: 1.5, opacity: dimLines ? 0.35 : 1 };
    }),
    backdrop: {
      width: 680, height: 268,
      content: (
        <svg width={680} height={268} viewBox="0 0 680 268" className="block" aria-hidden="true">
          {WORK_BAND_LABELS.map((h, i) => (
            <g key={h}>
              <rect x={10} y={WB_Y[i] - 12} width={660} height={FM_H + 24} rx={12} fill={i === 0 ? "#f0fdfa" : "#fffbeb"} />
              <text x={14} y={WB_Y[i] - 22} fontSize={12} fontWeight={600} fill="#334155">{h}</text>
            </g>
          ))}
        </svg>
      ),
    },
    renderBox,
    focus,
  } : {
    boxes: Object.entries(view!.pos).map(([id, p]) => { const b = fmBox(p); return { id, x: b.x, y: b.y, w: FM_W, h: b.h, label: `${FLOW_NODES[id]?.label ?? id} ${FLOW_NODES[id]?.sub ?? ""}` }; }),
    lines: drawn.map((e): LockedLine => {
      const ty = FLOW_EDGE_TYPES[e.type];
      return { id: e.id, source: e.a, target: e.b, d: e.d, feeds: e.feeds.map((f) => f.d), badge: { x: e.badge[0], y: e.badge[1] },
        color: ty.color, dash: ty.dash, width: e.type === "missing" ? 2 : 1.5, text: String(e.i + 1),
        dot: isRecentEdge(e.id) ? "#7c3aed" : undefined, title: FLOW_EDGES[e.id].title, opacity: dimLines ? 0.35 : 1 };
    }),
    backdrop: (view!.bands || view!.heads) ? {
      width: 680, height: view!.height,
      content: (
        <svg width={680} height={view!.height} viewBox={`0 0 680 ${view!.height}`} className="block" aria-hidden="true">
          {view!.bands && FM_BAND_LABELS.map((h, i) => (
            <g key={h}>
              <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={388} rx={12} fill="#f1f5f9" />
              <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#334155">{h}</text>
            </g>
          ))}
          {view!.heads?.map((h, i) => (
            <g key={h}>
              <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={view!.height - 34} rx={12} fill="#f8fafc" />
              <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="#334155">{h}</text>
            </g>
          ))}
        </svg>
      ),
    } : undefined,
    renderBox,
    focus,
  };

  // ── ถาดขวา: 4 แท็บ (แผนยังไม่เกาะ · แผนทั้งหมด · งาน · ใบงาน) ──
  const tabs: TrayTab<WorkItem>[] = useMemo(() => {
    const t: TrayTab<WorkItem>[] = [];
    if (kinds.has("plan")) {
      t.push({ key: "free", label: "แผน·ยังไม่เกาะ", filter: (w) => w.kind === "plan" && !!w.plan && flowPinsOf(w.plan).length === 0 });
      t.push({ key: "plan", label: "แผนทั้งหมด", filter: (w) => w.kind === "plan" });
    }
    if (src.canTasks && kinds.has("task")) t.push({ key: "task", label: "งาน", filter: (w) => w.kind === "task" });
    if (src.canSheets && kinds.has("sheet")) t.push({ key: "sheet", label: "ใบงาน", filter: (w) => w.kind === "sheet" });
    return t.length ? t : [{ key: "none", label: "ทั้งหมด", filter: () => true }];
  }, [kinds, src.canTasks, src.canSheets]);
  const focusBox = (id: string) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  const pickItem = (w: WorkItem) => {
    const k = workKey(w);
    if (selKey === k) { setSelKey(null); return; }
    setSelKey(k);
    if (w.kind !== "plan" && !isWork && !(w.kind === "sheet" && inView.has("ds"))) {
      patchPref({ view: WORK_VIEW });   // งาน Task อยู่ในผังครีเอทีฟเท่านั้น → พาไป
      if (w.box) setTimeout(() => focusBox(w.box!), 400);
      setTrayOpen(false);
      return;
    }
    const pins = boxesOf(w).filter((id) => inView.has(id));
    if (pins.length) { focusBox(pins[0]); setTrayOpen(false); }
    else if (w.kind === "plan" && canEdit) { toast.info("กดกล่องในผังเพื่อเกาะงานนี้ (หรือลากไปวาง / กด \"เกาะกับ…\")"); setTrayOpen(false); }
  };
  const openItem = (w: WorkItem) => {
    setPop(null);
    if (w.kind === "plan" && w.plan) onOpen(w.plan);
    else if (w.kind === "task" || w.kind === "sheet") setOpened({ kind: w.kind, id: w.id });
  };
  const lead = (w: WorkItem) => (
    <span className={`mt-px shrink-0 rounded px-1 text-[9px] leading-4 ${WORK_KIND_META[w.kind].chip}`}>{WORK_KIND_META[w.kind].short}</span>
  );
  const extra = (w: WorkItem) => {
    if (w.kind !== "plan" || !w.plan) {
      return (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500" onClick={(e) => e.stopPropagation()}>
          <span className="rounded bg-slate-100 px-1">{w.status_label}</span>
          {w.progress != null && <ProgressBar pct={w.progress} />}
          {w.waiting.length > 0 && <span className="line-clamp-1 text-amber-700" title={w.waiting.join(" · ")}>รอ: {w.waiting[0]}{w.waiting.length > 1 ? ` +${w.waiting.length - 1}` : ""}</span>}
          <button type="button" onClick={() => openItem(w)} className="ml-auto rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">เปิด</button>
        </div>
      );
    }
    if (!canEdit) return null;
    const t = w.plan;
    const sug = isWork ? null : suggestFlowNode(t.title, inView);
    const pinned = flowPinsOf(t);
    return (
      <div className="mt-1 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
        {pinned.length > 0 && <span className="text-[10px] text-slate-500">ที่ {pinned.map(flowNodeLabel).join(", ")}</span>}
        {sug && !pinned.includes(sug) && (
          <button type="button" onClick={() => pinTo(t, sug)} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700 hover:bg-violet-100">วางที่ {flowNodeLabel(sug)}?</button>
        )}
        <button type="button" onClick={() => { setMenuQ(""); setMenuFor(t); setTrayOpen(false); }} className="inline-flex items-center gap-0.5 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"><Icon name="link" /> เกาะกับ…</button>
      </div>
    );
  };

  // ── ป๊อปรายการบนกล่อง (ชี้/แตะป้าย) ──
  const popList = pop ? sortWork(byNode.get(pop.node) ?? []) : [];
  const sugFor = menuFor && !isWork ? suggestFlowNode(menuFor.title, inView) : null;
  const menuNodes = (() => {
    const s = menuQ.trim().toLowerCase();
    const ids = [...inView].filter((id) => { const m = boxMeta(id); return m && (!s || `${m.label} ${m.sub}`.toLowerCase().includes(s)); });
    return ids.sort((a, b) => (a === sugFor ? -1 : b === sugFor ? 1 : 0));
  })();

  const seg = (on: boolean) => `h-8 px-2.5 text-xs rounded-md whitespace-nowrap ${on ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  const H = fill ? "100%" : HEIGHT;
  const freePlans = planWork.filter((w) => w.plan && flowPinsOf(w.plan).length === 0).length;
  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      {/* แถบบน: แท็บผัง · ตัวกรองรวม · เฉพาะกล่องที่มีงาน · ปุ่มถาด (มือถือ) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5">
          <button type="button" className={seg(isWork)} onClick={() => { patchPref({ view: WORK_VIEW }); setPop(null); }} title="งาน Task + ใบงานออกแบบ เกาะกล่องเองตามสถานะ">ครีเอทีฟ / ออกแบบ</button>
          {PLAN_FLOW_VIEWS.map((v) => <button key={v.key} type="button" className={seg(v.key === viewKey)} onClick={() => { patchPref({ view: v.key }); setPop(null); }}>{v.label}</button>)}
        </div>
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5">
          {WORK_FILTERS.map((f) => <button key={f.key} type="button" title={f.hint} className={seg(filter === f.key)} onClick={() => patchPref({ filter: f.key as WorkFilter })}>{f.label}</button>)}
        </div>
        <button type="button" onClick={() => patchPref({ onlyPinned: !onlyPinned })} aria-pressed={onlyPinned}
          className={`h-9 rounded-lg border px-3 text-xs ${onlyPinned ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          {onlyPinned ? "แสดงทุกกล่อง" : "เฉพาะกล่องที่มีงาน"}
        </button>
        <button type="button" onClick={() => void src.reload()} disabled={src.loading} title="ดึงงาน Task / ใบงานล่าสุด"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Icon name="refresh" /> {src.loading ? "กำลังโหลด…" : "อัปเดต"}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => setTrayOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 md:hidden">
          <Icon name="list" /> งาน {shownWork.length}
        </button>
      </div>

      {/* แถบสรุป — กดป้ายชนิด = ซ่อน/โชว์ชนิดนั้น · กดตัวเลข = กรองทันที */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
        <span>ค้าง <b className="font-medium text-slate-800">{summary.total}</b></span>
        {KINDS.filter((k) => k === "plan" || (k === "task" ? src.canTasks : src.canSheets)).map((k) => {
          const on = kinds.has(k);
          return (
            <button key={k} type="button" aria-pressed={on} title={on ? `ซ่อน${WORK_KIND_META[k].label}` : `โชว์${WORK_KIND_META[k].label}`}
              onClick={() => { const next = KINDS.filter((x) => (x === k ? !on : kinds.has(x))); if (next.length) patchPref({ kinds: next }); }}
              className={`rounded-full px-2 py-0.5 ${on ? WORK_KIND_META[k].chip : "bg-slate-100 text-slate-400 line-through"}`}>
              {WORK_KIND_META[k].label} {allWork.filter((w) => w.kind === k).length}
            </button>
          );
        })}
        <button type="button" onClick={() => patchPref({ filter: filter === "over" ? "all" : "over" })} className="hover:underline">เกินกำหนด <b className="font-medium text-rose-600">{summary.overdue}</b></button>
        <button type="button" onClick={() => patchPref({ filter: filter === "review" ? "all" : "review" })} className="hover:underline">รอตรวจ/รอคนอื่น <b className="font-medium text-amber-700">{summary.review}</b></button>
        {summary.waitingSheets > 0 && <span>ใบงานรอของ <b className="font-medium text-amber-700">{summary.waitingSheets}</b></span>}
        {topNode && <button type="button" onClick={() => focusBox(topNode.id)} className="hover:underline">ค้างเกินมากสุด: <b className="font-medium text-slate-800">{boxMeta(topNode.id)?.label}</b> ({topNode.n})</button>}
        {src.error && <span className="text-rose-600" title={src.error}>โหลดบางระบบไม่สำเร็จ</span>}
        {!fill && <span className="text-slate-400">{canEdit ? "ลากงานแผนไปวางบนกล่อง · งาน/ใบงานเกาะเองตามสถานะ · ซูมเข้า = เห็นสถานะย่อย" : "ดูอย่างเดียว"}</span>}
      </div>

      <div className={fill ? "flex min-h-0 flex-1 gap-2" : "flex gap-2"}>
        <div className={`min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-1 ${fill ? "flex flex-col" : ""}`}>
          <FlowchartBoard key={viewKey} entityType="team_plan_flow" entityId={viewKey} height={H} editable={canEdit}
            fileName={`แผนงาน-ผัง${isWork ? "ครีเอทีฟ" : view!.label}`} locked={lockedLayer} />
        </div>
        <PlanTray<WorkItem> items={sortWork(shownWork)} tabs={tabs} title="งานค้าง" selectedId={selKey} onPick={pickItem} renderExtra={extra} renderLead={lead}
          keyOf={workKey} canDrag={(w) => w.kind === "plan" && canEdit}
          footer={`กด = กล่องที่อยู่เรือง · ลากงานแผนไปวาง = เกาะ${freePlans ? ` · แผนยังไม่เกาะ ${freePlans}` : ""}`}
          mobileOpen={trayOpen} onMobileClose={() => setTrayOpen(false)} height={H} />
      </div>

      {/* ป๊อปรายการงานของกล่อง */}
      {pop && (
        <div onMouseEnter={keepPop} onMouseLeave={hidePopSoon} style={{ left: pop.x, top: pop.y }}
          className="fixed z-50 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="mb-1 flex items-center gap-1 px-1">
            <span className="text-sm font-medium text-slate-800">{boxMeta(pop.node)?.label}</span>
            <span className="text-xs text-slate-400">· {FLOW_NODES[pop.node] ? FLOW_AREA_LABEL[FLOW_NODES[pop.node].area] + " · " : ""}{popList.length} รายการ</span>
            <span className="flex-1" />
            <button type="button" onClick={() => setPop(null)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="ปิด"><Icon name="cancel" /></button>
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {popList.map((w) => (
              <div key={workKey(w)} className="flex items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-slate-50">
                {w.kind === "plan" && canEdit && w.plan && <input type="checkbox" className="mt-0.5" title="ติ๊กเสร็จ" onChange={() => void tickDone(w.plan!)} />}
                {w.kind !== "plan" && lead(w)}
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => openItem(w)} className="block w-full text-left" title="เปิด">
                    <span className="line-clamp-2 text-xs text-slate-800">{w.title}</span>
                    <span className={`block text-[11px] ${w.overdue ? "text-rose-600" : "text-slate-400"}`}>{w.due_text}{w.assigned_name ? ` · ${w.assigned_name}` : ""}{w.kind !== "plan" ? ` · ${w.status_label}` : ""}</span>
                  </button>
                  {w.progress != null && <ProgressBar pct={w.progress} />}
                  {w.waiting.length > 0 && <span className="block text-[11px] text-amber-700">รอ: {w.waiting.slice(0, 2).join(" · ")}{w.waiting.length > 2 ? ` +${w.waiting.length - 2}` : ""}</span>}
                  {w.kind === "task" && <TaskMoveButtons from={w.status} onMove={(to) => void moveTask(w, to)} />}
                </div>
                {w.kind === "plan" && canEdit && w.plan && <button type="button" onClick={() => unpin(w.plan!, pop.node)} title="เอาออกจากกล่องนี้ (งานยังอยู่ในแผน)" className="rounded px-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-rose-600">เอาออก</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ป๊อป "เกาะกับ…" */}
      <ERPModal open={!!menuFor} onClose={() => setMenuFor(null)} title="เกาะงานกับกล่องไหน" description={menuFor?.title} size="sm">
        <input value={menuQ} onChange={(e) => setMenuQ(e.target.value)} autoFocus placeholder="ค้นหากล่อง เช่น ใบสั่งขาย"
          className="mb-2 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
          {menuNodes.length === 0 && <p className="py-2 text-sm text-slate-400">ไม่พบกล่องในผังนี้</p>}
          {menuNodes.map((id) => {
            const pinned = menuFor ? flowPinsOf(menuFor).includes(id) : false;
            return (
              <button key={id} type="button" disabled={pinned} onClick={() => { if (menuFor) pinTo(menuFor, id); setMenuFor(null); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-violet-50 disabled:opacity-50">
                <span className="flex-1">{boxMeta(id)?.label} <span className="text-xs text-slate-400">{FLOW_NODES[id] ? FLOW_AREA_LABEL[FLOW_NODES[id].area] : WORK_BOXES[id] ? WORK_BAND_LABELS[WORK_BOXES[id].band] : ""}</span></span>
                {sugFor === id && <span className="rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">ระบบเดา</span>}
                {pinned && <span className="text-[11px] text-slate-400">เกาะอยู่แล้ว</span>}
              </button>
            );
          })}
        </div>
      </ERPModal>

      {/* "+ งาน" บนกล่อง → สร้างงานแล้วเกาะกล่องนี้ */}
      {addAt && <AddToPlanModal open defaultTitle="" onClose={() => setAddAt(null)}
        onCreated={(item) => { const node = addAt; setAddAt(null); onUpsert([item]); void saveLinked(item, withFlowPin(item.plan.linked, node), `สร้างงาน "${item.title}" ที่ ${flowNodeLabel(node)} แล้ว`, false); }} />}

      {/* หน้าต่างเดิมของแต่ละระบบ */}
      {opened?.kind === "task" && (
        <TaskDetailDrawer taskId={opened.id} onClose={() => { setOpened(null); void src.reload(); }} onChanged={() => src.reload()}
          onMove={async (task, to) => { if (await applyTaskTransition(task, to, { pushToast })) await src.reload(); }}
          onDelete={async (id) => { try { await deleteTask(id); pushToast("info", "ลบงานแล้ว"); setOpened(null); await src.reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
          pushToast={pushToast} />
      )}
      {opened?.kind === "sheet" && <DesignSheetDetail detailOnly hideSendToBoard openId={opened.id} onDetailClose={() => { setOpened(null); void src.reload(); }} />}
    </div>
  );
}

/** แถบความคืบหน้างานย่อย (งาน Task) */
function ProgressBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400" title={`งานย่อยคืบหน้า ${p}%`}>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-slate-200"><span className="block h-full bg-teal-500" style={{ width: `${p}%` }} /></span>{p}%
    </span>
  );
}

/** ปุ่มเปลี่ยนสถานะงาน Task ตามเส้นทางเดิมของ Task Manager (ตั้งที่ Admin · Workflows) */
function TaskMoveButtons({ from, onMove }: { from: string; onMove: (to: string) => void }) {
  const next = transitionsFrom(from).slice(0, 3);
  if (!next.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {next.map((t) => (
        <button key={t.to_key} type="button" onClick={() => onMove(t.to_key)} title={`เปลี่ยนเป็น "${taskStatusLabel(t.to_key)}"`}
          className="rounded border border-teal-200 bg-teal-50 px-1.5 text-[10px] leading-4 text-teal-800 hover:bg-teal-100">{t.label || taskStatusLabel(t.to_key)}</button>
      ))}
    </span>
  );
}

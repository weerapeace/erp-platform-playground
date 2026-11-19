"use client";
/**
 * 🧭 โหมด "ผังระบบ" ของกระดานแผนงาน — แผนผังการทำงาน (lib/flow-map) + งานในแผนเกาะกล่อง (เจ้าของเลือกแบบ C + ไอเดีย 1-15 · 2026-11-19)
 *   วางงาน: ลากจากถาดขวาไปวางบนกล่อง · ปุ่ม "วางที่ …?" (ระบบเดาจากชื่องาน) · ปุ่ม "เกาะกับ…" (เลือกจากรายการ) · เกาะได้หลายกล่อง · ทุกครั้งมี "ย้อนกลับ"
 *   ดู: แถบสรุป (เกาะแล้ว/เกินกำหนด/กล่องที่ค้างมากสุด) · กล่องแดง = มีงานเกินกำหนด · ป้าย "งาน N" + รูปย่อคนทำ · ชี้ป้าย = รายการงาน
 *       ตัวกรอง ทั้งทีม/ของฉัน/เกินกำหนด (กล่องที่ไม่เกี่ยวจาง) · เฉพาะกล่องที่มีงาน · กดงานในถาด = กล่องที่เกาะเรือง + พาไปหา
 *   ทำต่อ: ติ๊กเสร็จ/เอาออก/เปิดงาน จากรายการบนกล่อง · "+ งาน" บนกล่อง = สร้างงานที่เกาะกล่องนี้เลย
 *   ตัวกระดาน = ของกลาง FlowchartBoard (ชั้นล็อก = ผังระบบ · วาดเสริมได้ entity team_plan_flow/<แท็บผัง>) · ตรรกะ = lib/team-plan-flow
 * doc: docs/team-plan.md
 */
import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent as RMouseEvent } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { LoadingState } from "@/components/state-views";
import type { FlowLockedLayer } from "@/components/flowchart-board";
import type { LockedLine } from "@/lib/flowchart-locked";
import { FLOW_AREA_LABEL, FLOW_EDGE_TYPES, FLOW_EDGES, FLOW_NODES, FLOW_VIEWS } from "@/lib/flow-map";
import { FM_BAND_LABELS, FM_CX, FM_W, fmBox, isRecentEdge, layoutFlowView } from "@/lib/flow-map-layout";
import { dueLabel, isOverdue, type PlanItem } from "@/lib/team-plan";
import { patchPlanItem } from "@/lib/team-plan-client";
import {
  flowNodeLabel, flowPinsOf, flowSummary, initialOf, matchFlowFilter, pinsByNode, suggestFlowNode, withFlowPin, withoutFlowPin, type FlowFilter,
} from "@/lib/team-plan-flow";
import { AddToPlanModal } from "./add-to-plan";
import { PlanTray, type TrayTab } from "./plan-tray";

const FlowchartBoard = dynamic(() => import("@/components/flowchart-board").then((m) => m.FlowchartBoard), { ssr: false, loading: () => <LoadingState /> });

/** แท็บผังที่ใช้ในแผนงาน (ผังการเงินเห็นเฉพาะผู้มีสิทธิ์ — ไม่เอามาที่นี่) */
const PLAN_FLOW_VIEWS = FLOW_VIEWS.filter((v) => !v.finance);
const HEIGHT = "calc(100vh - 300px)";

type Pop = { node: string; x: number; y: number } | null;

export function PlanFlowBoard({ items, canEdit, onOpen, onUpsert }: {
  items: PlanItem[];
  canEdit: boolean;
  onOpen: (t: PlanItem) => void;
  onUpsert: (list: PlanItem[]) => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const me = user?.id ?? null;
  const [viewKey, setViewKey] = useState(PLAN_FLOW_VIEWS[0]?.key ?? "ov");
  const view = PLAN_FLOW_VIEWS.find((v) => v.key === viewKey) ?? PLAN_FLOW_VIEWS[0];
  const drawn = useMemo(() => layoutFlowView(view), [view]);
  const [filter, setFilter] = useState<FlowFilter>("all");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [menuFor, setMenuFor] = useState<PlanItem | null>(null);
  const [menuQ, setMenuQ] = useState("");
  const [addAt, setAddAt] = useState<string | null>(null);
  const [overNode, setOverNode] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const itemsRef = useRef(items); itemsRef.current = items;
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useMemo(() => items.filter((t) => t.status !== "resolved"), [items]);
  const inView = useMemo(() => new Set(Object.keys(view.pos)), [view]);
  const byNode = useMemo(() => pinsByNode(open, filter, me), [open, filter, me]);
  const summary = useMemo(() => flowSummary(open), [open]);
  const sel = selId ? open.find((t) => t.id === selId) ?? null : null;
  const selPins = useMemo(() => new Set(sel ? flowPinsOf(sel) : []), [sel]);

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
    void saveLinked(t, withoutFlowPin(t.plan.linked, node), `เอา "${t.title}" ออกจาก ${flowNodeLabel(node)} แล้ว`);
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
    setPop({ node, x: Math.min(e.clientX, window.innerWidth - 300), y: Math.min(e.clientY + 10, window.innerHeight - 260) });
  };
  const hidePopSoon = () => { if (popTimer.current) clearTimeout(popTimer.current); popTimer.current = setTimeout(() => setPop(null), 350); };
  const keepPop = () => { if (popTimer.current) clearTimeout(popTimer.current); };

  // ── กล่องระบบ 1 กล่อง (วาดเองทั้งกล่อง ขนาดเท่ากล่องผัง) ──
  const renderBox = (id: string) => {
    const n = FLOW_NODES[id]; if (!n) return null;
    const list = byNode.get(id) ?? [];
    const over = list.some((t) => isOverdue(t.due_at));
    const dim = (filter !== "all" || onlyPinned) && list.length === 0;
    const lit = selPins.has(id);
    const people = [...new Set(list.map((t) => t.assigned_name ?? ""))].slice(0, 3);
    return (
      <div onDragOver={(e) => { if (e.dataTransfer.types.includes("text/plan-id")) { e.preventDefault(); if (overNode !== id) setOverNode(id); } }}
        onDragLeave={() => setOverNode((c) => (c === id ? null : c))} onDrop={dropOn(id)}
        onClick={(e) => { if (sel && canEdit && !flowPinsOf(sel).includes(id)) { e.stopPropagation(); pinTo(sel, id); setSelId(null); } }}
        className={`group relative flex h-full w-full flex-col items-center justify-center rounded-lg border px-1 text-center transition-opacity
          ${overNode === id ? "border-violet-500 bg-violet-100 ring-2 ring-violet-300" : over ? "border-rose-500 bg-white ring-1 ring-rose-300" : "border-indigo-200 bg-indigo-50"}
          ${lit ? "ring-2 ring-violet-500" : ""} ${dim ? "opacity-30" : ""}`}>
        <span className="text-[13px] font-semibold leading-tight text-indigo-950">{n.label}</span>
        <span className="text-[10px] leading-tight text-indigo-500">{n.sub}</span>
        {list.length > 0 && (
          <button type="button" onMouseEnter={(e) => showPop(id, e)} onMouseLeave={hidePopSoon}
            onClick={(e) => { e.stopPropagation(); showPop(id, e); }}
            className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] font-medium leading-4 ${over ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
            งาน {list.length}
            <span className="flex">{people.map((p) => <span key={p} title={p || "ยังไม่ระบุคนทำ"} className="-ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-violet-200 text-[8px] text-violet-800 first:ml-0">{initialOf(p)}</span>)}</span>
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setAddAt(id); }} title={`สร้างงานใหม่ที่เกาะ ${n.label}`}
            className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 text-[10px] text-violet-700 shadow-sm hover:bg-violet-50 group-hover:block">+ งาน</button>
        )}
      </div>
    );
  };

  const lockedLayer: FlowLockedLayer = {
    boxes: Object.entries(view.pos).map(([id, p]) => { const b = fmBox(p); return { id, x: b.x, y: b.y, w: FM_W, h: b.h, label: `${FLOW_NODES[id]?.label ?? id} ${FLOW_NODES[id]?.sub ?? ""}` }; }),
    lines: drawn.map((e): LockedLine => {
      const ty = FLOW_EDGE_TYPES[e.type];
      return { id: e.id, source: e.a, target: e.b, d: e.d, feeds: e.feeds.map((f) => f.d), badge: { x: e.badge[0], y: e.badge[1] },
        color: ty.color, dash: ty.dash, width: e.type === "missing" ? 2 : 1.5, text: String(e.i + 1),
        dot: isRecentEdge(e.id) ? "#7c3aed" : undefined, title: FLOW_EDGES[e.id].title, opacity: onlyPinned || filter !== "all" ? 0.35 : 1 };
    }),
    backdrop: (view.bands || view.heads) ? {
      width: 680, height: view.height,
      content: (
        <svg width={680} height={view.height} viewBox={`0 0 680 ${view.height}`} className="block" aria-hidden="true">
          {view.bands && FM_BAND_LABELS.map((h, i) => (
            <g key={h}>
              <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={388} rx={12} fill="#f1f5f9" />
              <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#334155">{h}</text>
            </g>
          ))}
          {view.heads?.map((h, i) => (
            <g key={h}>
              <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={view.height - 34} rx={12} fill="#f8fafc" />
              <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="#334155">{h}</text>
            </g>
          ))}
        </svg>
      ),
    } : undefined,
    renderBox,
    focus,
  };

  // ── ถาดขวา ──
  const tabs: TrayTab[] = useMemo(() => [
    { key: "free", label: "ยังไม่เกาะ", filter: (t) => flowPinsOf(t).length === 0 },
    { key: "pinned", label: "เกาะแล้ว", filter: (t) => flowPinsOf(t).length > 0 },
    { key: "all", label: "ทั้งหมด", filter: () => true },
  ], []);
  const trayItems = useMemo(() => open.filter((t) => matchFlowFilter(t, filter, me)), [open, filter, me]);
  const pickTask = (t: PlanItem) => {
    if (selId === t.id) { setSelId(null); return; }
    setSelId(t.id);
    const pins = flowPinsOf(t).filter((id) => inView.has(id));
    if (pins.length) { setFocus((f) => ({ id: pins[0], n: (f?.n ?? 0) + 1 })); setTrayOpen(false); }
    else if (canEdit) { toast.info("กดกล่องในผังเพื่อเกาะงานนี้ (หรือลากไปวาง / กด \"เกาะกับ…\")"); setTrayOpen(false); }
  };
  const extra = (t: PlanItem) => {
    if (!canEdit) return null;
    const sug = suggestFlowNode(t.title, inView);
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
  const popList = pop ? (byNode.get(pop.node) ?? []) : [];
  const menuNodes = useMemo(() => {
    const s = menuQ.trim().toLowerCase();
    const sug = menuFor ? suggestFlowNode(menuFor.title, inView) : null;
    const ids = [...inView].filter((id) => FLOW_NODES[id] && (!s || `${FLOW_NODES[id].label} ${FLOW_NODES[id].sub}`.toLowerCase().includes(s)));
    return ids.sort((a, b) => (a === sug ? -1 : b === sug ? 1 : 0));
  }, [menuQ, menuFor, inView]);

  const seg = (on: boolean) => `h-8 px-2.5 text-xs rounded-md ${on ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <div className="space-y-2">
      {/* แถบบน: แท็บผัง · ตัวกรอง · เฉพาะกล่องที่มีงาน · ปุ่มถาด (มือถือ) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5">
          {PLAN_FLOW_VIEWS.map((v) => <button key={v.key} type="button" className={seg(v.key === view.key)} onClick={() => { setViewKey(v.key); setPop(null); }}>{v.label}</button>)}
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {([["all", "ทั้งทีม"], ["me", "ของฉัน"], ["over", "เกินกำหนด"]] as [FlowFilter, string][]).map(([k, l]) =>
            <button key={k} type="button" className={seg(filter === k)} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <button type="button" onClick={() => setOnlyPinned((v) => !v)} aria-pressed={onlyPinned}
          className={`h-9 rounded-lg border px-3 text-xs ${onlyPinned ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          {onlyPinned ? "แสดงทุกกล่อง" : "เฉพาะกล่องที่มีงาน"}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => setTrayOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 md:hidden">
          <Icon name="list" /> งาน {open.filter((t) => flowPinsOf(t).length === 0).length}
        </button>
      </div>

      {/* แถบสรุป */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
        <span>เกาะกล่องแล้ว <b className="font-medium text-slate-800">{summary.pinned}/{summary.total}</b> งาน</span>
        <button type="button" onClick={() => setFilter(filter === "over" ? "all" : "over")} className="hover:underline">เกินกำหนด <b className="font-medium text-rose-600">{summary.overdue}</b></button>
        {summary.topNode && (
          <button type="button" onClick={() => setFocus((f) => ({ id: summary.topNode!, n: (f?.n ?? 0) + 1 }))} className="hover:underline">
            ค้างมากสุด: <b className="font-medium text-slate-800">{flowNodeLabel(summary.topNode)}</b> ({summary.topCount})
          </button>
        )}
        <span className="text-slate-400">{canEdit ? "ลากงานจากถาดขวาไปวางบนกล่อง · ชี้ป้าย \"งาน N\" ดูรายการ · ชี้กล่องแล้วกด \"+ งาน\"" : "ดูอย่างเดียว"}</span>
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-1">
          <FlowchartBoard key={view.key} entityType="team_plan_flow" entityId={view.key} height={HEIGHT} editable={canEdit}
            fileName={`แผนงาน-ผัง${view.label}`} locked={lockedLayer} />
        </div>
        <PlanTray items={trayItems} tabs={tabs} title="งานในแผน" selectedId={selId} onPick={pickTask} renderExtra={extra}
          footer="กด = กล่องที่เกาะเรือง · ลากไปวางบนกล่อง = เกาะ" mobileOpen={trayOpen} onMobileClose={() => setTrayOpen(false)} height={HEIGHT} />
      </div>

      {/* ป๊อปรายการงานของกล่อง */}
      {pop && (
        <div onMouseEnter={keepPop} onMouseLeave={hidePopSoon} style={{ left: pop.x, top: pop.y }}
          className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="mb-1 flex items-center gap-1 px-1">
            <span className="text-sm font-medium text-slate-800">{flowNodeLabel(pop.node)}</span>
            <span className="text-xs text-slate-400">· {FLOW_AREA_LABEL[FLOW_NODES[pop.node]?.area ?? "buy"]} · งาน {popList.length}</span>
            <span className="flex-1" />
            <button type="button" onClick={() => setPop(null)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="ปิด"><Icon name="cancel" /></button>
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {popList.map((t) => (
              <div key={t.id} className="flex items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-slate-50">
                {canEdit && <input type="checkbox" className="mt-0.5" title="ติ๊กเสร็จ" onChange={() => void tickDone(t)} />}
                <button type="button" onClick={() => { setPop(null); onOpen(t); }} className="min-w-0 flex-1 text-left" title="เปิดงาน">
                  <span className="line-clamp-2 text-xs text-slate-800">{t.title}</span>
                  <span className={`block text-[11px] ${isOverdue(t.due_at) ? "text-rose-600" : "text-slate-400"}`}>{t.due_at ? dueLabel(t.due_at) : "ไม่มีกำหนด"}{t.assigned_name ? ` · ${t.assigned_name}` : ""}</span>
                </button>
                {canEdit && <button type="button" onClick={() => unpin(t, pop.node)} title="เอาออกจากกล่องนี้" className="rounded px-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-rose-600">เอาออก</button>}
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
          {menuNodes.length === 0 && <p className="py-2 text-sm text-slate-400">ไม่พบกล่องในผัง "{view.label}"</p>}
          {menuNodes.map((id) => {
            const pinned = menuFor ? flowPinsOf(menuFor).includes(id) : false;
            const sug = menuFor ? suggestFlowNode(menuFor.title, inView) === id : false;
            return (
              <button key={id} type="button" disabled={pinned} onClick={() => { if (menuFor) pinTo(menuFor, id); setMenuFor(null); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-violet-50 disabled:opacity-50">
                <span className="flex-1">{FLOW_NODES[id].label} <span className="text-xs text-slate-400">{FLOW_AREA_LABEL[FLOW_NODES[id].area]}</span></span>
                {sug && <span className="rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">ระบบเดา</span>}
                {pinned && <span className="text-[11px] text-slate-400">เกาะอยู่แล้ว</span>}
              </button>
            );
          })}
        </div>
      </ERPModal>

      {/* "+ งาน" บนกล่อง → สร้างงานแล้วเกาะกล่องนี้ */}
      {addAt && <AddToPlanModal open defaultTitle="" onClose={() => setAddAt(null)}
        onCreated={(item) => { const node = addAt; setAddAt(null); onUpsert([item]); void saveLinked(item, withFlowPin(item.plan.linked, node), `สร้างงาน "${item.title}" ที่ ${flowNodeLabel(node)} แล้ว`, false); }} />}
    </div>
  );
}

"use client";
/**
 * 🧭 โหมด "ผังระบบ" ของกระดานแผนงาน = แผนผังการทำงานของระบบ (ซื้อ · ผลิต · จ่ายงาน · ขาย) ไว้ดู/จัดการระบบ
 *   เจ้าของสั่ง 2026-11-19 "ผังระบบไว้จัดการระบบ ไม่ต้องมีรายการงาน" → งานค้างทั้งหมด (แผน · งาน Task · ใบงาน) ย้ายไปโหมด
 *   "งานทั้งหมด" (./board-view · กรอบหมวดตามชนิดงาน) — ที่นี่ไม่มีชิปงาน/ถาด/ตัวกรองแล้ว
 *   - แท็บเหลือ 2: "ภาพรวม" | "ทั้งระบบ" (เจ้าของสั่ง 2026-11-20 แบบ A + ข้อ 1-4)
 *     ทั้งระบบ = ผัง ซื้อ · ผลิต · จ่ายงาน · ขาย เรียงซ้าย→ขวาบนผืนเดียว (lib/plan-flow-merge · กล่องระบบ id "<ส่วน>:<กล่อง>")
 *     ปุ่มกระโดดไปส่วน · กดกล่องที่อยู่หลายส่วน = ไฮไลต์ทุกที่ + ป๊อปบอกว่าอยู่ส่วนไหนบ้าง
 *     ของที่วาดเสริมไว้ในแท็บเดิม ย้ายมาเองครั้งแรกที่เปิด (seed) — กระดานเดิม team_plan_flow/buy|make|dispatch|sell เก็บเป็นสำรอง ไม่ลบ
 *   - กล่อง/เส้นวาดจากทะเบียน lib/flow-map (ชั้นล็อก) · วาดเสริมทับได้ (entity team_plan_flow/ov | all) · ปุ่ม ↗ บนกล่อง = เปิดหน้านั้นในแท็บใหม่
 *   - กดกล่อง/วงกลมเลขเส้น = ป๊อปเล็กข้าง ๆ จุดที่กด บอกข้อมูลจากทะเบียน (กดซ้ำที่เดิม = ปิด · มือถือขึ้นล่างจอ) — เจ้าของสั่ง 2026-11-19
 *   - รายละเอียดเต็ม (ตัวเลขสด · ช่องโหว่ · โน้ต · อยากแก้อะไร) = /master/flow-map
 *   ตัวกระดาน = ของกลาง FlowchartBoard · เต็มจอ = FullscreenStage (หน้าแม่)
 * doc: docs/team-plan.md
 */
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { FullscreenBar } from "@/components/fullscreen-stage";
import { LoadingState } from "@/components/state-views";
import type { FlowLockedLayer } from "@/components/flowchart-board";
import type { LockedLine } from "@/lib/flowchart-locked";
import { FLOW_AREA_LABEL, FLOW_EDGE_TYPES, FLOW_EDGES, FLOW_NODES, FLOW_VIEWS, type FlowView } from "@/lib/flow-map";
import { FM_BAND_LABELS, FM_CX, FM_W, fmBox, isRecentEdge, layoutFlowView, type FmDrawn, type FmPt } from "@/lib/flow-map-layout";
import { useUserPref } from "@/lib/use-user-pref";
import { apiFetch } from "@/lib/api";
import { parseFlowScene, type FlowScene } from "@/lib/flowchart";
import { PLAN_ALL_KEY, PLAN_ALL_SECTIONS, PLAN_SECTION_W, allBoxId, mergeOldScenes, sectionX, splitAllId, type PlanAllSection } from "@/lib/plan-flow-merge";
import { FLOW_VIEW_PREF_DEFAULT, parseFlowViewPref, type FlowViewPref } from "@/lib/work-canvas";

const FlowchartBoard = dynamic(() => import("@/components/flowchart-board").then((m) => m.FlowchartBoard), { ssr: false, loading: () => <LoadingState /> });

/** ผังที่ใช้ในแผนงาน: ภาพรวม + 4 ส่วนของ "ทั้งระบบ" (ผังการเงินเห็นเฉพาะผู้มีสิทธิ์ — ไม่เอามาที่นี่) */
const OV_VIEW = FLOW_VIEWS.find((v) => v.key === "ov")!;
const ALL_SECTIONS = PLAN_ALL_SECTIONS.map((k, i) => ({ view: FLOW_VIEWS.find((v) => v.key === k)!, ox: sectionX(i) }));
const ALL_H = Math.max(...ALL_SECTIONS.map((x) => x.view.height)) + 20;
const ALL_W = sectionX(PLAN_ALL_SECTIONS.length - 1) + PLAN_SECTION_W;
const TABS = [{ key: "ov", label: "ภาพรวม" }, { key: PLAN_ALL_KEY, label: "ทั้งระบบ" }];
type Sec = { key: string; view: FlowView; ox: number; drawn: FmDrawn[] };
const OV_SECS: Sec[] = [{ key: "ov", view: OV_VIEW, ox: 0, drawn: layoutFlowView(OV_VIEW) }];
const ALL_SECS: Sec[] = ALL_SECTIONS.map(({ view, ox }) => ({ key: view.key, view, ox, drawn: layoutFlowView(view) }));
const HEIGHT = "calc(100vh - 260px)";
const seg = (on: boolean) => `h-8 px-2.5 text-xs rounded-md whitespace-nowrap ${on ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
const moved = (pts: FmPt[], ox: number) => "M" + pts.map(([x, y]) => `${x + ox} ${y}`).join(" L");

/** ย้ายของที่วาดเสริมในแท็บเดิม 4 แท็บ → ฉากเริ่มต้นของ "ทั้งระบบ" (เรียกครั้งแรกที่ยังไม่เคยมีกระดานนี้เท่านั้น) */
async function seedAll(): Promise<FlowScene | null> {
  const got = await Promise.all(PLAN_ALL_SECTIONS.map(async (k) => {
    const res = await apiFetch(`/api/canvas-sketch?entity_type=team_plan_flow&entity_id=${k}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || "load");
    return [k, parseFlowScene(j.data?.scene)] as const;
  }));
  const m = mergeOldScenes(Object.fromEntries(got) as Partial<Record<PlanAllSection, FlowScene | null>>);
  return m.nodes.length || m.edges.length || m.pins ? m : null;
}

export function PlanFlowBoard({ canEdit, fill = false }: {
  canEdit: boolean;
  /** โหมดเต็มจอ (FullscreenStage ของหน้าแม่) */
  fill?: boolean;
}) {
  // แท็บที่เปิดล่าสุด (จำต่อคน · ค่าเดิม ซื้อ/ผลิต/จ่ายงาน/ขาย = "ทั้งระบบ")
  const [pref, setPref] = useUserPref<FlowViewPref>("team_plan_flow_pref", FLOW_VIEW_PREF_DEFAULT, parseFlowViewPref);
  const isAll = pref.view !== "ov";
  const mode = isAll ? PLAN_ALL_KEY : "ov";
  const secs = isAll ? ALL_SECS : OV_SECS;
  /** id บนกระดาน ↔ (ส่วน, id ทะเบียน) — ภาพรวมใช้ id ตรงเหมือนเดิม (ตำแหน่งกล่องที่ย้ายไว้ไม่หาย) */
  const gid = (key: string, id: string) => (isAll ? allBoxId(key, id) : id);
  const parse = (v: string) => (isAll ? splitAllId(v) ?? { key: secs[0].key, id: v } : { key: "ov", id: v });
  const secOf = (key: string) => secs.find((x) => x.key === key) ?? secs[0];

  // ป๊อปข้อมูล: กล่อง (n) หรือเส้น (e) · กดซ้ำที่เดิม = ปิด · เปลี่ยนแท็บ = ปิด
  // ป๊อปขึ้นข้าง ๆ จุดที่กด (เจ้าของสั่ง 2026-11-19 "อยากให้ pop ข้าง ๆ ที่กด") — จำจุดที่กดล่าสุดบนกระดาน · กดในป๊อป = ป๊อปอยู่ที่เดิม
  type At = { x: number; y: number; w: number; h: number };
  const [sel, setSel] = useState<{ k: "n" | "e"; id: string; view: string; at: At | null } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const lastPt = useRef<At | null>(null);
  const cur = sel && sel.view === mode ? sel : null;
  const toggle = (k: "n" | "e", id: string) => setSel((x) => (x && x.k === k && x.id === id && x.view === mode ? null : { k, id, view: mode, at: lastPt.current ?? x?.at ?? null }));
  const onPointerDownCapture = (e: RPointerEvent) => {
    if (popRef.current?.contains(e.target as Node)) return;   // กดปุ่มในป๊อป → ป๊อปไม่ย้าย
    const r = wrapRef.current?.getBoundingClientRect(); if (!r) return;
    lastPt.current = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  /** ตำแหน่งป๊อป (จอกว้าง): ขวาของจุดที่กด · ล้นขวา = ไปซ้าย · ไม่ล้นบน/ล่าง · มือถือ = แผ่นล่างจอ (ไม่ใช้ค่านี้) */
  const POP_W = 320;
  const popStyle = (at: At | null): CSSProperties | undefined => {
    if (!at || typeof window === "undefined" || window.innerWidth < 640) return undefined;
    const left = at.x + 24 + POP_W <= at.w - 8 ? at.x + 24 : Math.max(8, at.x - 24 - POP_W);
    const top = Math.min(Math.max(8, at.y - 40), Math.max(8, at.h - 280));
    return { left, top, right: "auto", bottom: "auto", width: POP_W, maxHeight: at.h - top - 8 };
  };

  // ปุ่มกระโดดไปส่วน (ข้อ 2) / ไปกล่องในส่วนอื่น (ข้อ 4) — กระดานเลื่อน+ซูมไปหา
  const [focus, setFocus] = useState<{ id: string; n: number; ids?: string[] } | null>(null);
  const jumpTo = (key: string, boxId?: string) => {
    const sc = secOf(key);
    setFocus((f) => (boxId
      ? { id: gid(key, boxId), n: (f?.n ?? 0) + 1 }
      : { id: `${key}-section`, n: (f?.n ?? 0) + 1, ids: Object.keys(sc.view.pos).map((id) => gid(key, id)) }));
  };

  const curP = cur ? parse(cur.id) : null;
  const curSec = curP ? secOf(curP.key) : secs[0];
  const drawn = curSec.drawn;
  const edgeNo = (eid: string) => { const e = drawn.find((d) => d.id === eid); return e ? e.i + 1 : null; };
  const nodeName = (id: string) => FLOW_NODES[id]?.label ?? id;
  /** กล่องที่กดอยู่ → ไฮไลต์ทุกส่วนที่มีกล่องนี้ (ข้อ 4) */
  const hlId = cur?.k === "n" ? curP?.id ?? null : null;
  const secsWith = (id: string) => secs.filter((x) => id in x.view.pos);

  const renderBox = (bid: string) => {
    const id = parse(bid).id;
    const n = FLOW_NODES[id]; if (!n) return null;
    const hl = isAll && hlId === id;
    return (
      <div className={`group relative flex h-full w-full flex-col items-center justify-center rounded-lg border bg-indigo-50 px-1 text-center ${hl ? "border-amber-400 ring-2 ring-amber-400" : "border-indigo-200"}`}>
        <span className="text-[13px] font-semibold leading-tight text-indigo-950">{n.label}</span>
        <span className="text-[10px] leading-tight text-indigo-500">{n.sub}</span>
        {n.href && (
          <a href={n.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`เปิดหน้า ${n.label} ในแท็บใหม่`}
            className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 text-[10px] text-violet-700 shadow-sm hover:bg-violet-50 group-hover:block">↗</a>
        )}
      </div>
    );
  };

  const lockedLayer: FlowLockedLayer = useMemo(() => ({
    boxes: secs.flatMap((sc) => Object.entries(sc.view.pos).map(([id, p]) => {
      const b = fmBox(p);
      return { id: gid(sc.key, id), x: b.x + sc.ox, y: b.y, w: FM_W, h: b.h, label: `${FLOW_NODES[id]?.label ?? id} ${FLOW_NODES[id]?.sub ?? ""}` };
    })),
    lines: secs.flatMap((sc) => sc.drawn.map((e): LockedLine => {
      const ty = FLOW_EDGE_TYPES[e.type];
      return { id: gid(sc.key, e.id), source: gid(sc.key, e.a), target: gid(sc.key, e.b), d: moved(e.pts, sc.ox), feeds: e.feeds.map((f) => moved(f.pts, sc.ox)),
        badge: { x: e.badge[0] + sc.ox, y: e.badge[1] },
        color: ty.color, dash: ty.dash, width: e.type === "missing" ? 2 : 1.5, text: String(e.i + 1),
        dot: isRecentEdge(e.id) ? "#7c3aed" : undefined, title: FLOW_EDGES[e.id].title };
    })),
    backdrop: isAll ? {
      width: ALL_W, height: ALL_H,
      content: (
        <svg width={ALL_W} height={ALL_H} viewBox={`0 0 ${ALL_W} ${ALL_H}`} className="block" aria-hidden="true">
          {ALL_SECTIONS.map(({ view: v, ox }) => (
            <g key={v.key}>
              <rect x={ox} y={26} width={PLAN_SECTION_W} height={ALL_H - 26} rx={14} fill="#f8fafc" stroke="#e2e8f0" />
              <text x={ox + 12} y={12} dominantBaseline="central" fontSize={15} fontWeight={700} fill="#334155">{v.label}</text>
            </g>
          ))}
        </svg>
      ),
    } : {
      width: 680, height: OV_VIEW.height,
      content: (
        <svg width={680} height={OV_VIEW.height} viewBox={`0 0 680 ${OV_VIEW.height}`} className="block" aria-hidden="true">
          {FM_BAND_LABELS.map((h, i) => (
            <g key={h}>
              <rect x={FM_CX[i] - 8} y={28} width={FM_W + 16} height={388} rx={12} fill="#f1f5f9" />
              <text x={FM_CX[i] + FM_W / 2} y={16} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#334155">{h}</text>
            </g>
          ))}
        </svg>
      ),
    },
    renderBox,
    onBoxClick: (id: string) => toggle("n", id),
    onLineClick: (id: string) => toggle("e", id),
    focus,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [isAll, hlId, focus, mode, sel]);

  const H = fill ? "100%" : HEIGHT;
  const curKey = curP?.key ?? secs[0].key;
  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      {/* แถบบน: ภาพรวม | ทั้งระบบ · ปุ่มไปส่วน · ลิงก์รายละเอียดเต็ม — เต็มจอ = ซ่อนไว้ขอบบน (FullscreenBar) */}
      <FullscreenBar order={20}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5">
            {TABS.map((v) => <button key={v.key} type="button" className={seg(v.key === mode)} onClick={() => setPref({ ...pref, view: v.key })}>{v.label}</button>)}
          </div>
          {isAll && (
            <div className="flex max-w-full items-center gap-1 overflow-x-auto">
              <span className="text-[11px] text-slate-400">ไปที่</span>
              {ALL_SECTIONS.map(({ view: v }) => (
                <button key={v.key} type="button" onClick={() => jumpTo(v.key)} title={`เลื่อนกระดานไปส่วน ${v.label}`}
                  className="h-8 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700">{v.label}</button>
              ))}
            </div>
          )}
          <a href="/master/flow-map" target="_blank" rel="noopener noreferrer" title="ตัวเลขสด · ช่องโหว่ · โน้ต · อยากแก้อะไร ของแต่ละกล่อง/เส้น"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
            <Icon name="map" /> รายละเอียดเต็มของผัง ↗
          </a>
          {!fill && <span className="text-[11px] text-slate-400">งานค้างทั้งหมดอยู่ที่ &quot;งานทั้งหมด&quot; · กดกล่อง/เส้น = ดูข้อมูล · ชี้กล่องแล้วกด ↗ = เปิดหน้านั้น{canEdit ? " · วาดเสริมทับผังได้" : ""}</span>}
        </div>
      </FullscreenBar>

      <div ref={wrapRef} onPointerDownCapture={onPointerDownCapture} className={`relative min-w-0 rounded-xl border border-slate-200 bg-white p-1 ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        <FlowchartBoard key={mode} entityType="team_plan_flow" entityId={mode} height={H} editable={canEdit}
          fileName={`แผนงาน-ผัง${isAll ? "ทั้งระบบ" : OV_VIEW.label}`} locked={lockedLayer} seed={isAll ? seedAll : undefined} />
        {cur && curP && (
          <div ref={popRef} style={popStyle(cur.at)} className="absolute inset-x-1 bottom-1 z-20 max-h-[55%] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-14 sm:max-h-[70%] sm:w-80">
            <div className="mb-1.5 flex items-start gap-2">
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                {cur.k === "n" ? nodeName(curP.id) : `เส้น ${edgeNo(curP.id) ?? ""} · ${nodeName(FLOW_EDGES[curP.id]?.from ?? "")} → ${nodeName(FLOW_EDGES[curP.id]?.to ?? "")}`}
                {cur.k === "n" && FLOW_NODES[curP.id] && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{FLOW_AREA_LABEL[FLOW_NODES[curP.id].area]}</span>}
                {isAll && cur.k === "e" && <span className="ml-1.5 text-[11px] font-normal text-slate-400">ส่วน{curSec.view.label}</span>}
              </span>
              <button type="button" onClick={() => setSel(null)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="ปิด"><Icon name="cancel" /></button>
            </div>
            {cur.k === "n" ? (() => {
              const n = FLOW_NODES[curP.id]; if (!n) return null;
              const ins = drawn.filter((e) => e.b === curP.id), outs = drawn.filter((e) => e.a === curP.id);
              const line = (e: FmDrawn, other: string) => (
                <button key={e.id} type="button" onClick={() => toggle("e", gid(curKey, e.id))} className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-violet-50" title={FLOW_EDGES[e.id]?.title}>
                  <span className="mr-1 inline-block min-w-[18px] rounded-full border border-slate-300 text-center text-[10px]">{e.i + 1}</span>{nodeName(other)} · <span className="text-slate-400">{FLOW_EDGES[e.id]?.title}</span>
                </button>
              );
              const where = isAll ? secsWith(curP.id) : [];
              return (
                <div className="space-y-1.5">
                  {where.length > 1 && (
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
                      <span>อยู่ในส่วน: </span>
                      {where.map((x) => (
                        <button key={x.key} type="button" onClick={() => jumpTo(x.key, curP.id)} title={`ไปที่กล่องนี้ในส่วน ${x.view.label}`}
                          className={`mr-1 rounded px-1.5 py-0.5 ${x.key === curKey ? "bg-amber-200 font-semibold" : "underline hover:bg-amber-100"}`}>{x.view.label}</button>
                      ))}
                    </div>
                  )}
                  {n.href && <a href={n.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700 hover:bg-violet-100">เปิดหน้า {n.href} ↗</a>}
                  <p><span className="text-slate-400">หน้าที่เกี่ยวข้อง:</span> {n.pages}</p>
                  <p><span className="text-slate-400">เก็บที่:</span> {n.tables}</p>
                  {n.statuses && <p><span className="text-slate-400">สถานะ:</span> {n.statuses}</p>}
                  {!!n.gaps?.length && <ul className="list-disc space-y-0.5 pl-4 text-amber-700">{n.gaps.slice(0, 3).map((g) => <li key={g}>{g}</li>)}</ul>}
                  {ins.length > 0 && <div><p className="text-slate-400">เส้นเข้า{isAll ? ` (ส่วน${curSec.view.label})` : ""}</p>{ins.map((e) => line(e, e.a))}</div>}
                  {outs.length > 0 && <div><p className="text-slate-400">เส้นออก{isAll ? ` (ส่วน${curSec.view.label})` : ""}</p>{outs.map((e) => line(e, e.b))}</div>}
                </div>
              );
            })() : (() => {
              const e = FLOW_EDGES[curP.id]; if (!e) return null;
              const d = drawn.find((x) => x.id === curP.id);
              return (
                <div className="space-y-1.5">
                  <p><span className="text-slate-400">กดอะไร:</span> {e.title}</p>
                  <p><span className="text-slate-400">ระบบทำต่อ:</span> {e.detail}</p>
                  {e.warn && <p className="text-amber-700">ระวัง: {e.warn}</p>}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {[d?.a ?? e.from, d?.b ?? e.to].map((id) => <button key={id} type="button" onClick={() => toggle("n", gid(curKey, id))} className="rounded-lg border border-slate-200 px-2 py-0.5 hover:bg-slate-50">{nodeName(id)}</button>)}
                  </div>
                </div>
              );
            })()}
            <p className="mt-2 text-[10px] text-slate-400">กดกล่อง/เส้นเดิมอีกครั้ง = ปิด · รายละเอียดเต็มที่หน้าแผนผังการทำงาน</p>
          </div>
        )}
      </div>
    </div>
  );
}

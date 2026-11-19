"use client";
/**
 * 🧭 โหมด "ผังระบบ" ของกระดานแผนงาน = แผนผังการทำงานของระบบ (ซื้อ · ผลิต · จ่ายงาน · ขาย) ไว้ดู/จัดการระบบ
 *   เจ้าของสั่ง 2026-11-19 "ผังระบบไว้จัดการระบบ ไม่ต้องมีรายการงาน" → งานค้างทั้งหมด (แผน · งาน Task · ใบงาน) ย้ายไปโหมด
 *   "งานทั้งหมด" (./board-view · กรอบหมวดตามชนิดงาน) — ที่นี่ไม่มีชิปงาน/ถาด/ตัวกรองแล้ว
 *   - กล่อง/เส้นวาดจากทะเบียน lib/flow-map (ชั้นล็อก) · วาดเสริมทับได้ (entity team_plan_flow/<แท็บผัง>) · ปุ่ม ↗ บนกล่อง = เปิดหน้านั้นในแท็บใหม่
 *   - รายละเอียดเต็ม (ตัวเลขสด · ช่องโหว่ · โน้ต · อยากแก้อะไร) = /master/flow-map
 *   ตัวกระดาน = ของกลาง FlowchartBoard · เต็มจอ = FullscreenStage (หน้าแม่)
 * doc: docs/team-plan.md
 */
import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { FullscreenBar } from "@/components/fullscreen-stage";
import { LoadingState } from "@/components/state-views";
import type { FlowLockedLayer } from "@/components/flowchart-board";
import type { LockedLine } from "@/lib/flowchart-locked";
import { FLOW_EDGE_TYPES, FLOW_EDGES, FLOW_NODES, FLOW_VIEWS } from "@/lib/flow-map";
import { FM_BAND_LABELS, FM_CX, FM_W, fmBox, isRecentEdge, layoutFlowView } from "@/lib/flow-map-layout";
import { useUserPref } from "@/lib/use-user-pref";
import { FLOW_VIEW_PREF_DEFAULT, parseFlowViewPref, type FlowViewPref } from "@/lib/work-canvas";

const FlowchartBoard = dynamic(() => import("@/components/flowchart-board").then((m) => m.FlowchartBoard), { ssr: false, loading: () => <LoadingState /> });

/** แท็บผังที่ใช้ในแผนงาน (ผังการเงินเห็นเฉพาะผู้มีสิทธิ์ — ไม่เอามาที่นี่) */
const PLAN_FLOW_VIEWS = FLOW_VIEWS.filter((v) => !v.finance);
const HEIGHT = "calc(100vh - 260px)";
const seg = (on: boolean) => `h-8 px-2.5 text-xs rounded-md whitespace-nowrap ${on ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;

export function PlanFlowBoard({ canEdit, fill = false }: {
  canEdit: boolean;
  /** โหมดเต็มจอ (FullscreenStage ของหน้าแม่) */
  fill?: boolean;
}) {
  // แท็บผังที่เปิดล่าสุด (จำต่อคน · ค่าเดิม "ครีเอทีฟ / ออกแบบ" ไม่มีแล้ว = แท็บแรก)
  const [pref, setPref] = useUserPref<FlowViewPref>("team_plan_flow_pref", FLOW_VIEW_PREF_DEFAULT, parseFlowViewPref);
  const view = PLAN_FLOW_VIEWS.find((v) => v.key === pref.view) ?? PLAN_FLOW_VIEWS[0];
  const drawn = useMemo(() => layoutFlowView(view), [view]);

  const renderBox = (id: string) => {
    const n = FLOW_NODES[id]; if (!n) return null;
    return (
      <div className="group relative flex h-full w-full flex-col items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-1 text-center">
        <span className="text-[13px] font-semibold leading-tight text-indigo-950">{n.label}</span>
        <span className="text-[10px] leading-tight text-indigo-500">{n.sub}</span>
        {n.href && (
          <a href={n.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`เปิดหน้า ${n.label} ในแท็บใหม่`}
            className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 text-[10px] text-violet-700 shadow-sm hover:bg-violet-50 group-hover:block">↗</a>
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
        dot: isRecentEdge(e.id) ? "#7c3aed" : undefined, title: FLOW_EDGES[e.id].title };
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
  };

  const H = fill ? "100%" : HEIGHT;
  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      {/* แถบบน: แท็บผัง · ลิงก์รายละเอียดเต็ม — เต็มจอ = ซ่อนไว้ขอบบน (FullscreenBar) */}
      <FullscreenBar order={20}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5">
            {PLAN_FLOW_VIEWS.map((v) => <button key={v.key} type="button" className={seg(v.key === view.key)} onClick={() => setPref({ ...pref, view: v.key })}>{v.label}</button>)}
          </div>
          <a href="/master/flow-map" target="_blank" rel="noopener noreferrer" title="ตัวเลขสด · ช่องโหว่ · โน้ต · อยากแก้อะไร ของแต่ละกล่อง/เส้น"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
            <Icon name="map" /> รายละเอียดเต็มของผัง ↗
          </a>
          {!fill && <span className="text-[11px] text-slate-400">งานค้างทั้งหมดอยู่ที่ &quot;งานทั้งหมด&quot; · ชี้กล่องแล้วกด ↗ = เปิดหน้านั้น{canEdit ? " · วาดเสริมทับผังได้" : ""}</span>}
        </div>
      </FullscreenBar>

      <div className={`min-w-0 rounded-xl border border-slate-200 bg-white p-1 ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        <FlowchartBoard key={view.key} entityType="team_plan_flow" entityId={view.key} height={H} editable={canEdit}
          fileName={`แผนงาน-ผัง${view.label}`} locked={lockedLayer} />
      </div>
    </div>
  );
}

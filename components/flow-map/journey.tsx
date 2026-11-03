"use client";

/**
 * แผนผังการทำงาน — แท็บ "ออเดอร์ 1 ใบ เดินทางยังไง" (ไล่ทีละขั้นตั้งแต่ลงออเดอร์จนเก็บเงิน)
 * ขั้นตอนอยู่ที่ FLOW_JOURNEY · ข้อความ/แบบของแต่ละจุดส่งต่อดึงจาก FLOW_EDGES → แก้เส้นแล้วแท็บนี้ตามเอง
 */
import { useT } from "@/components/i18n";
import { FLOW_NODES, FLOW_EDGES, FLOW_EDGE_TYPES, FLOW_JOURNEY, FLOW_AREA_LABEL, type FlowEdgeType } from "@/lib/flow-map";
import { isRecentEdge } from "@/lib/flow-map-layout";

const TAG: Record<FlowEdgeType, string> = {
  auto: "bg-green-50 text-green-700", live: "bg-blue-50 text-blue-700", manual: "bg-amber-50 text-amber-800", missing: "bg-red-50 text-red-700",
};

export function FlowJourney({ onPickNode, onPickEdge }: { onPickNode: (id: string) => void; onPickEdge: (id: string) => void }) {
  const t = useT();
  const all = FLOW_JOURNEY.flatMap((s) => s.edges);
  const count = (ty: FlowEdgeType) => all.filter((id) => FLOW_EDGES[id].type === ty).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {(Object.keys(FLOW_EDGE_TYPES) as FlowEdgeType[]).map((ty) => (
          <div key={ty} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">{FLOW_EDGE_TYPES[ty].label}</div>
            <div className="text-xl font-semibold tabular-nums" style={{ color: FLOW_EDGE_TYPES[ty].color }}>{count(ty)}</div>
          </div>
        ))}
      </div>
      <ol className="mt-3">
        {FLOW_JOURNEY.map((s, i) => {
          const n = FLOW_NODES[s.node];
          return (
            <li key={`${s.node}${i}`} className="pt-3">
              <button type="button" onClick={() => onPickNode(s.node)} className="flex items-center gap-2.5 text-left group">
                <span className="w-7 h-7 rounded-full border border-slate-300 bg-slate-50 text-[12px] font-semibold text-slate-600 flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">{FLOW_AREA_LABEL[n.area]}</span>
                <span className="text-[14px] font-medium text-slate-800 group-hover:underline">{s.title}</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">{n.sub}</span>
              </button>
              <div className="ml-[13px] pl-6 border-l border-slate-200 pb-1">
                {s.edges.map((id) => {
                  const e = FLOW_EDGES[id], ty = FLOW_EDGE_TYPES[e.type];
                  return (
                    <button key={id} type="button" onClick={() => onPickEdge(id)}
                      className="w-full flex items-start gap-2 text-left text-[13px] leading-relaxed mt-1.5 pl-2.5 border-l-2 hover:bg-slate-50 rounded-r-md"
                      style={{ borderColor: ty.color, borderLeftStyle: e.type === "auto" ? "solid" : e.type === "missing" ? "dotted" : "dashed" }}>
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded ${TAG[e.type]}`}>{ty.label}</span>
                      <span className="text-slate-700">
                        {e.title}
                        {e.warn && <span className="text-red-700"> — {e.warn}</span>}
                        {isRecentEdge(id) && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 whitespace-nowrap">{t("เพิ่งแก้", "Updated")} {e.changed?.date.slice(8)}/{e.changed?.date.slice(5, 7)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

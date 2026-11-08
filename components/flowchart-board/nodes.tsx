"use client";

// กล่อง + เส้นของกระดาน flowchart กลาง (ใช้ภายใน components/flowchart-board เท่านั้น)
// สี/ขนาด/ชนิด อ่านจาก lib/flowchart (FLOW_PALETTE / FLOW_KIND_META) — ที่เดียวกับตอนบันทึกเป็นรูป

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, NodeToolbar, Position, getSmoothStepPath, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { Icon } from "@/components/icon";
import { FLOW_COLORS, FLOW_KIND_META, FLOW_PALETTE, nodeColor, splitFlowLabel, type FlowColor, type FlowKind, type FlowNodeData } from "@/lib/flowchart";

export type FlowRFNode = Node<FlowNodeData, FlowKind>;

/** ของที่กล่อง/เส้นต้องเรียกกลับไปที่กระดาน */
export type FlowBoardActions = {
  readOnly: boolean;
  t: (th: string, en: string) => string;
  updateData: (id: string, patch: Partial<FlowNodeData>) => void;
  removeNode: (id: string) => void;
  openFolder: (path: string) => void;
  setEdgeLabel: (id: string, label: string) => void;
  editEdgeLabel: (id: string) => void;
  removeEdge: (id: string) => void;
};
export const FlowBoardCtx = createContext<FlowBoardActions | null>(null);
const useBoard = () => {
  const c = useContext(FlowBoardCtx);
  if (!c) throw new Error("FlowBoardCtx missing");
  return c;
};

const HANDLE_POS: [string, Position][] = [["t", Position.Top], ["r", Position.Right], ["b", Position.Bottom], ["l", Position.Left]];

/** ข้อความในกล่อง: บรรทัดแรกตัวหนา · ที่เหลือตัวเล็ก */
function LabelText({ label, color, align = "center" }: { label: string; color: FlowColor; align?: "center" | "left" }) {
  const { title, sub } = splitFlowLabel(label);
  const pal = FLOW_PALETTE[color];
  return (
    <div className="pointer-events-none w-full whitespace-pre-wrap break-words leading-snug" style={{ textAlign: align }}>
      <div className="text-[13px] font-semibold" style={{ color: pal.text }}>{title || "\u00a0"}</div>
      {sub && <div className="mt-0.5 text-[11px]" style={{ color: pal.sub }}>{sub}</div>}
    </div>
  );
}

/** แก้ข้อความในกล่อง (ดับเบิลคลิก) — Enter = ขึ้นบรรทัด · Ctrl+Enter หรือคลิกข้างนอก = เสร็จ · Esc = ยกเลิก */
function InlineEditor({ initial, onDone, folder }: { initial: FlowNodeData; onDone: (patch: Partial<FlowNodeData> | null) => void; folder?: boolean }) {
  const { t } = useBoard();
  const [label, setLabel] = useState(initial.label);
  const [path, setPath] = useState(initial.path ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => onDone(folder ? { label: label.trim() || t("โฟลเดอร์", "Folder"), path: path.trim() } : { label });
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onDone(null); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
  };
  return (
    <div className="nodrag nowheel nopan absolute inset-1 z-10 flex flex-col gap-1"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) commit(); }}>
      <textarea ref={ref} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={key} rows={folder ? 1 : 3}
        placeholder={t("บรรทัดแรก = หัวข้อ · บรรทัดถัดไป = คำอธิบาย", "First line = title · next lines = details")}
        className="min-h-0 w-full flex-1 resize-none rounded-md border border-violet-300 bg-white px-1.5 py-1 text-[12px] text-slate-800 outline-none focus:ring-2 focus:ring-violet-200" />
      {folder && (
        <input value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { key(e); if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="Z:\Work In Process\..." className="h-7 w-full rounded-md border border-violet-300 bg-white px-1.5 text-[11px] text-slate-700 outline-none" />
      )}
    </div>
  );
}

/** ปุ่มลอยเหนือกล่องที่เลือก: สี · แก้ข้อความ · เปิดโฟลเดอร์ · ลบ */
function NodeTools({ id, kind, data, onEdit }: { id: string; kind: FlowKind; data: FlowNodeData; onEdit: () => void }) {
  const { t, updateData, removeNode, openFolder } = useBoard();
  const cur = nodeColor(kind, data);
  const btn = "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-slate-600 hover:bg-slate-100";
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
      {FLOW_COLORS.map((c) => (
        <button key={c} type="button" title={t(FLOW_PALETTE[c].th, FLOW_PALETTE[c].en)} onClick={() => updateData(id, { color: c })}
          className={`mx-0.5 h-4 w-4 rounded-full border-2 ${cur === c ? "ring-2 ring-violet-300 ring-offset-1" : ""}`}
          style={{ background: FLOW_PALETTE[c].fill, borderColor: FLOW_PALETTE[c].stroke }} />
      ))}
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <button type="button" className={btn} onClick={onEdit} title={t("แก้ข้อความ (หรือดับเบิลคลิกกล่อง)", "Edit text (or double-click)")}><Icon value="i:pencil" />{t("แก้", "Edit")}</button>
      {kind === "folder" && data.path && <button type="button" className={btn} onClick={() => openFolder(data.path!)}><Icon value="i:folder-open" />{t("เปิด", "Open")}</button>}
      <button type="button" className={`${btn} hover:bg-rose-50 hover:text-rose-600`} onClick={() => removeNode(id)} title={t("ลบกล่อง (หรือกด Delete)", "Delete box (or press Delete)")}><Icon value="i:trash" /></button>
    </div>
  );
}

/** รูปทรงพื้นหลังแบบ SVG (คำถาม = ข้าวหลามตัด · ที่เก็บ = ทรงกระบอก) */
function ShapeBg({ kind, color }: { kind: FlowKind; color: FlowColor }) {
  const p = FLOW_PALETTE[color];
  const common = { fill: p.fill, stroke: p.stroke, strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const };
  if (kind === "question") return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="50,1 99,50 50,99 1,50" {...common} />
    </svg>
  );
  if (kind === "storage") return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1,12 A49,11 0 0,1 99,12 L99,88 A49,11 0 0,1 1,88 Z" {...common} />
      <path d="M1,12 A49,11 0 0,0 99,12" fill="none" stroke={p.stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
  return null;
}

/** กล่องทุกชนิด (ชนิดดูจาก type ของโหนด) */
export function FlowNodeView({ id, type, data, selected }: NodeProps<FlowRFNode>) {
  const { readOnly, t, updateData, openFolder } = useBoard();
  const kind = type as FlowKind;
  const color = nodeColor(kind, data);
  const pal = FLOW_PALETTE[color];
  const [editing, setEditing] = useState(false);
  const meta = FLOW_KIND_META[kind];

  const boxStyle: React.CSSProperties =
    kind === "question" || kind === "storage" ? {}
    : { background: pal.fill, border: `2px solid ${pal.stroke}`, borderRadius: kind === "start" ? 999 : kind === "note" ? 4 : 10 };
  // ระยะขอบข้อความ (ข้าวหลามตัด/ทรงกระบอก ต้องเว้นมากกว่า)
  const pad = kind === "question" ? "18% 22%" : kind === "storage" ? "22% 10% 10%" : kind === "note" ? "10px 12px" : "6px 12px";

  let content: ReactNode;
  if (kind === "folder") {
    content = (
      <div className="pointer-events-none flex w-full items-center gap-2 text-left">
        <span className="text-lg" style={{ color: pal.stroke }}><Icon value="i:folder" /></span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold" style={{ color: pal.text }}>{data.label || "—"}</div>
          {data.path && <div className="truncate text-[10px]" style={{ color: pal.sub }}>{data.path}</div>}
        </div>
      </div>
    );
  } else {
    content = <LabelText label={data.label} color={color} align={kind === "note" ? "left" : "center"} />;
  }

  return (
    <>
      {!readOnly && <NodeResizer isVisible={selected && !editing} minWidth={kind === "question" ? 120 : 80} minHeight={kind === "question" ? 70 : 40}
        lineClassName="fc-resize-line" handleClassName="fc-resize-handle" />}
      {!readOnly && (
        <NodeToolbar isVisible={selected && !editing} position={Position.Top} offset={10}>
          <NodeTools id={id} kind={kind} data={data} onEdit={() => setEditing(true)} />
        </NodeToolbar>
      )}
      <div
        className={`fc-node relative flex h-full w-full justify-center ${kind === "note" ? "items-start" : "items-center"}`}
        style={{ ...boxStyle, padding: pad }}
        title={kind === "folder" ? t(meta.hintTh, meta.hintEn) : undefined}
        onDoubleClick={(e) => {
          if (kind === "folder") { if (data.path) openFolder(data.path); return; }   // โฟลเดอร์: ดับเบิลคลิก = เปิด (แก้ผ่านปุ่ม "แก้")
          if (readOnly) return;
          e.stopPropagation(); setEditing(true);
        }}
      >
        <ShapeBg kind={kind} color={color} />
        <div className="relative z-[1] flex w-full justify-center">{content}</div>
        {editing && (
          <InlineEditor initial={data} folder={kind === "folder"}
            onDone={(patch) => { setEditing(false); if (patch) updateData(id, patch); }} />
        )}
      </div>
      {HANDLE_POS.map(([hid, pos]) => (
        <Handle key={hid} id={hid} type="source" position={pos} className="fc-h" isConnectable={!readOnly} />
      ))}
    </>
  );
}

/** เส้นต่อ (หักมุมอัตโนมัติ) + ป้าย · เลือกเส้นแล้วมีปุ่มลัด ใช่ / ไม่ใช่ / แก้ / ลบ */
export function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, label, selected }: EdgeProps) {
  const { readOnly, t, setEdgeLabel, editEdgeLabel, removeEdge } = useBoard();
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 10 });
  const text = typeof label === "string" ? label : "";
  const chip = "h-6 rounded-md px-1.5 text-[11px] hover:bg-slate-100";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={18}
        style={{ stroke: selected ? "#7c3aed" : "#64748b", strokeWidth: selected ? 2.5 : 1.75 }} />
      {(text || (selected && !readOnly)) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute flex flex-col items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all" }}>
            {text && <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${selected ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>{text}</span>}
            {selected && !readOnly && (
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 text-slate-600 shadow-md">
                <button type="button" className={chip} onClick={() => setEdgeLabel(id, t("ใช่", "Yes"))}>{t("ใช่", "Yes")}</button>
                <button type="button" className={chip} onClick={() => setEdgeLabel(id, t("ไม่ใช่", "No"))}>{t("ไม่ใช่", "No")}</button>
                <button type="button" className={chip} onClick={() => editEdgeLabel(id)} title={t("พิมพ์ป้ายเอง", "Type a label")}><Icon value="i:pencil" /></button>
                {text && <button type="button" className={chip} onClick={() => setEdgeLabel(id, "")} title={t("เอาป้ายออก", "Remove label")}><Icon value="i:x" /></button>}
                <button type="button" className={`${chip} hover:bg-rose-50 hover:text-rose-600`} onClick={() => removeEdge(id)} title={t("ลบเส้น", "Delete line")}><Icon value="i:trash" /></button>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

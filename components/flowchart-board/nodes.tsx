"use client";

// กล่อง + เส้นของกระดาน flowchart กลาง (ใช้ภายใน components/flowchart-board เท่านั้น)
// สี/ขนาด/ชนิด อ่านจาก lib/flowchart (FLOW_PALETTE / FLOW_KIND_META) — ที่เดียวกับตอนบันทึกเป็นรูป

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, NodeToolbar, Position, getSmoothStepPath, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { Icon } from "@/components/icon";
import { FileTypeIcon } from "@/components/file-type-icon";
import { FLOW_COLORS, FLOW_KIND_META, FLOW_PALETTE, ICON_SCALE_MAX, ICON_SCALE_MIN, flowIconSizes, iconBoxBaseSize, nodeColor, splitFlowLabel, type FlowColor, type FlowKind, type FlowNodeData } from "@/lib/flowchart";
import { storagePlaceOf, storagePlaceSvg } from "@/lib/storage-places";

/** ไอคอนที่เก็บ (Google Drive · R2 · NAS ...) — SVG จาก lib/storage-places (ตัวเดียวกับตอนบันทึกเป็นรูป) */
function PlaceIcon({ place, size }: { place: string; size: number }) {
  // key ผ่าน isPlaceKey แล้วตอนโหลด (lib/flowchart parseFlowScene) · SVG สร้างจากค่าคงที่ของเราเอง
  return <span className="inline-block shrink-0 leading-[0]" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: storagePlaceSvg(place, size) }} />;
}

/** แถวไอคอนไฟล์เล็ก ๆ ใต้ชื่อกล่องที่เก็บ */
function ExtRow({ exts, size }: { exts?: string[]; size: number }) {
  if (!exts?.length) return null;
  return <div className="flex flex-wrap justify-center gap-0.5">{exts.map((e) => <FileTypeIcon key={e} ext={e} size={size} title="" />)}</div>;
}

export type FlowRFNode = Node<FlowNodeData, FlowKind>;

/** ของที่กล่อง/เส้นต้องเรียกกลับไปที่กระดาน */
export type FlowBoardActions = {
  readOnly: boolean;
  t: (th: string, en: string) => string;
  updateData: (id: string, patch: Partial<FlowNodeData>) => void;
  /** กล่อง "ไฟล์" (และไฟล์ที่เก็บในกล่อง "ที่เก็บ"): เปิดป๊อปเลือกประเภทไฟล์ */
  editFileTypes: (id: string) => void;
  /** กล่อง "ที่เก็บ": เปิดป๊อปเลือกไอคอนที่เก็บ (Google Drive · R2 · NAS ...) */
  editPlace: (id: string) => void;
  /** กล่องที่เลือกอยู่ (ไว้ซ่อนแถบเครื่องมือรายกล่องตอนเลือกหลายกล่อง — ใช้แถบกลุ่มแทน) */
  selectedIds: string[];
  setColor: (ids: string[], color: FlowColor) => void;
  /** ขนาดไอคอนตอนนี้ของกล่องที่เลือก (null = ในกลุ่มไม่มีกล่องที่มีไอคอน) */
  iconScaleOf: (ids: string[]) => number | null;
  /** ปุ่ม − / + ขนาดไอคอน (dir) · 0 = กลับ 100% — เลือกหลายกล่อง = ทุกกล่องที่มีไอคอนขนาดเท่ากัน */
  stepIconScale: (ids: string[], dir: 1 | -1 | 0) => void;
  copyNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[]) => void;
  removeNodes: (ids: string[]) => void;
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
function InlineEditor({ initial, onDone, folder, zone }: { initial: FlowNodeData; onDone: (patch: Partial<FlowNodeData> | null) => void; folder?: boolean; zone?: boolean }) {
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
    <div className={`nodrag nowheel nopan absolute z-10 flex flex-col gap-1 ${zone ? "left-2 top-1.5 h-9 w-[min(320px,90%)] pointer-events-auto" : "inset-1"}`}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) commit(); }}>
      <textarea ref={ref} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { key(e); if (zone && e.key === "Enter") { e.preventDefault(); commit(); } }} rows={folder || zone ? 1 : 3}
        placeholder={t("บรรทัดแรก = หัวข้อ · บรรทัดถัดไป = คำอธิบาย", "First line = title · next lines = details")}
        className="min-h-0 w-full flex-1 resize-none rounded-md border border-violet-300 bg-white px-1.5 py-1 text-[12px] text-slate-800 outline-none focus:ring-2 focus:ring-violet-200" />
      {folder && (
        <input value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { key(e); if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="Z:\Work In Process\..." className="h-7 w-full rounded-md border border-violet-300 bg-white px-1.5 text-[11px] text-slate-700 outline-none" />
      )}
    </div>
  );
}

/**
 * แถบปุ่มลอยเหนือกล่องที่เลือก: สี · แก้ข้อความ · คัดลอก · ทำซ้ำ · เปิดโฟลเดอร์ · ลบ
 *   เลือก 1 กล่อง = แถบของกล่องนั้น (ส่ง single) · เลือกหลายกล่อง = แถบกลุ่มอันเดียว (กระดานวางไว้เหนือกลุ่ม)
 */
export function FlowTools({ ids, single }: { ids: string[]; single?: { kind: FlowKind; data: FlowNodeData; onEdit: () => void } }) {
  const { t, setColor, copyNodes, duplicateNodes, removeNodes, openFolder, editPlace, editFileTypes, iconScaleOf, stepIconScale } = useBoard();
  const cur = single ? nodeColor(single.kind, single.data) : null;
  const iconScale = iconScaleOf(ids);
  const btn = "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-slate-600 hover:bg-slate-100";
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
      {!single && <span className="px-1.5 text-[11px] font-medium text-violet-700">{t(`เลือก ${ids.length} กล่อง`, `${ids.length} selected`)}</span>}
      {FLOW_COLORS.map((c) => (
        <button key={c} type="button" title={t(FLOW_PALETTE[c].th, FLOW_PALETTE[c].en)} onClick={() => setColor(ids, c)}
          className={`mx-0.5 h-4 w-4 rounded-full border-2 ${cur === c ? "ring-2 ring-violet-300 ring-offset-1" : ""}`}
          style={{ background: FLOW_PALETTE[c].fill, borderColor: FLOW_PALETTE[c].stroke }} />
      ))}
      <span className="mx-1 h-5 w-px bg-slate-200" />
      {single && <button type="button" className={btn} onClick={single.onEdit} title={single.kind === "file" ? t("เลือกประเภทไฟล์ / แก้ชื่อ (หรือดับเบิลคลิกกล่อง)", "Choose file types / rename (or double-click)") : t("แก้ข้อความ (หรือดับเบิลคลิกกล่อง)", "Edit text (or double-click)")}><Icon value="i:pencil" />{t("แก้", "Edit")}</button>}
      {single?.kind === "storage" && (
        <>
          <button type="button" className={btn} onClick={() => editPlace(ids[0])} title={t("เลือกไอคอนที่เก็บ เช่น Google Drive · R2 · NAS", "Choose a storage icon, e.g. Google Drive · R2 · NAS")}><Icon value="i:database" />{t("ไอคอน", "Icon")}</button>
          <button type="button" className={btn} onClick={() => editFileTypes(ids[0])} title={t("ใส่ไอคอนประเภทไฟล์ที่เก็บที่นี่", "Show which file types live here")}><Icon value="i:files" />{t("ไฟล์", "Files")}</button>
        </>
      )}
      {iconScale !== null && (
        <>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" className={`${btn} disabled:opacity-40`} disabled={iconScale <= ICON_SCALE_MIN} onClick={() => stepIconScale(ids, -1)} title={t("ไอคอนเล็กลง", "Smaller icon")}><Icon value="i:minus" /></button>
          <button type="button" className={`${btn} min-w-[42px] justify-center tabular-nums`} onClick={() => stepIconScale(ids, 0)}
            title={t(`ขนาดไอคอน — กดเพื่อกลับ 100%${single ? "" : " (ทุกกล่องที่เลือกจะเท่ากัน)"} · ลากมุมกล่องก็ได้`, `Icon size — click to reset to 100%${single ? "" : " (all selected boxes match)"} · or drag a corner`)}>
            {Math.round(iconScale * 100)}%
          </button>
          <button type="button" className={`${btn} disabled:opacity-40`} disabled={iconScale >= ICON_SCALE_MAX} onClick={() => stepIconScale(ids, 1)} title={t("ไอคอนใหญ่ขึ้น", "Bigger icon")}><Icon value="i:plus" /></button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
        </>
      )}
      <button type="button" className={btn} onClick={() => copyNodes(ids)} title={t("คัดลอก (Ctrl+C) แล้วไปวางที่อื่นด้วย Ctrl+V — วางในกระดานหน้าอื่นได้", "Copy (Ctrl+C), then paste elsewhere with Ctrl+V")}><Icon value="i:copy" />{t("คัดลอก", "Copy")}</button>
      <button type="button" className={btn} onClick={() => duplicateNodes(ids)} title={t("ทำซ้ำข้าง ๆ ทันที (Ctrl+D)", "Duplicate right here (Ctrl+D)")}><Icon value="i:stack-2" />{t("ทำซ้ำ", "Duplicate")}</button>
      {single?.kind === "folder" && single.data.path && <button type="button" className={btn} onClick={() => openFolder(single.data.path!)}><Icon value="i:folder-open" />{t("เปิด", "Open")}</button>}
      <button type="button" className={`${btn} hover:bg-rose-50 hover:text-rose-600`} onClick={() => removeNodes(ids)} title={t("ลบ (หรือกด Delete)", "Delete (or press Delete)")}><Icon value="i:trash" /></button>
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
export function FlowNodeView({ id, type, data, selected, width, height }: NodeProps<FlowRFNode>) {
  const { readOnly, t, updateData, openFolder, selectedIds, editFileTypes } = useBoard();
  const kind = type as FlowKind;
  const onlyMe = selected && selectedIds.length === 1;   // เลือกหลายกล่อง → ใช้แถบกลุ่มแทน
  const color = nodeColor(kind, data);
  const pal = FLOW_PALETTE[color];
  const [editing, setEditing] = useState(false);
  const meta = FLOW_KIND_META[kind];
  const startEdit = () => (kind === "file" ? editFileTypes(id) : setEditing(true));   // กล่องไฟล์ = ป๊อปเลือกประเภท

  const place = kind === "storage" ? storagePlaceOf(data.place) : null;

  // กรอบโซน: กรอบใหญ่โปร่ง อยู่หลังกล่องอื่น · จับ/ลาก/ดับเบิลคลิกได้เฉพาะหัวกรอบ (ตัวกรอบกดทะลุไปที่กระดาน)
  if (kind === "zone") {
    return (
      <>
        {!readOnly && <NodeResizer isVisible={selected && !editing} minWidth={160} minHeight={100} lineClassName="fc-resize-line" handleClassName="fc-resize-handle" />}
        {!readOnly && (
          <NodeToolbar isVisible={onlyMe && !editing} position={Position.Top} align="start" offset={8}>
            <FlowTools ids={[id]} single={{ kind, data, onEdit: startEdit }} />
          </NodeToolbar>
        )}
        <div className="fc-zone relative h-full w-full">
          <div className="absolute inset-0 rounded-2xl" style={{ background: pal.fill, opacity: 0.55 }} />
          <div className="absolute inset-0 rounded-2xl" style={{ border: `2px dashed ${pal.stroke}`, opacity: selected ? 1 : 0.7 }} />
          <div className={`fc-zone-handle absolute left-2 top-1.5 inline-flex max-w-[90%] items-center gap-1.5 rounded-lg px-2 py-1 ${readOnly ? "" : "cursor-grab"}`}
            style={{ color: pal.text, background: "rgba(255,255,255,.75)" }}
            title={readOnly ? undefined : t("ลากตรงนี้ = ย้ายทั้งกรอบพร้อมกล่องข้างใน · ดับเบิลคลิก = แก้ชื่อ", "Drag here to move the zone with its boxes · double-click to rename")}
            onDoubleClick={(e) => { if (readOnly) return; e.stopPropagation(); setEditing(true); }}>
            <span style={{ color: pal.stroke }}><Icon value="i:circle-dashed" /></span>
            <span className="truncate text-[14px] font-bold">{splitFlowLabel(data.label).title || t("โซน", "Zone")}</span>
          </div>
          {editing && <InlineEditor initial={data} zone onDone={(patch) => { setEditing(false); if (patch) updateData(id, patch); }} />}
        </div>
      </>
    );
  }

  // กล่องไฟล์ + ที่เก็บแบบมีไอคอน = ไม่มีกรอบ (ไอคอน + ชื่อ) · ที่เก็บไม่มีไอคอน = ทรงกระบอกเดิม
  const frameless = kind === "file" || !!place;
  const boxStyle: React.CSSProperties =
    kind === "question" || kind === "storage" || frameless ? {}
    : { background: pal.fill, border: `2px solid ${pal.stroke}`, borderRadius: kind === "start" ? 999 : kind === "note" ? 4 : 10 };
  // ระยะขอบข้อความ (ข้าวหลามตัด/ทรงกระบอก ต้องเว้นมากกว่า)
  const pad = frameless ? "4px 6px" : kind === "question" ? "18% 22%" : kind === "storage" ? "22% 10% 10%" : kind === "note" ? "10px 12px" : "6px 12px";

  // ไอคอนโตตามกล่อง (lib/flowchart flowIconSizes — สูตรเดียวกับตอนบันทึกเป็นรูป)
  const iconBase = iconBoxBaseSize({ type: kind, data });
  const icons = flowIconSizes({ type: kind, data, width: width ?? 0, height: height ?? 0 });

  let content: ReactNode;
  if (place) {
    content = (
      <div className="pointer-events-none flex w-full flex-col items-center gap-1">
        <PlaceIcon place={place.key} size={icons.place} />
        <LabelText label={data.label} color={data.color ? color : "slate"} />
        <ExtRow exts={data.exts} size={icons.ext} />
      </div>
    );
  } else if (kind === "storage" && data.exts?.length) {
    content = (
      <div className="pointer-events-none flex w-full flex-col items-center gap-1">
        <LabelText label={data.label} color={color} />
        <ExtRow exts={data.exts} size={icons.ext} />
      </div>
    );
  } else if (kind === "folder") {
    content = (
      <div className="pointer-events-none flex w-full items-center gap-2 text-left">
        <span className="text-lg" style={{ color: pal.stroke }}><Icon value="i:folder" /></span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold" style={{ color: pal.text }}>{data.label || "—"}</div>
          {data.path && <div className="truncate text-[10px]" style={{ color: pal.sub }}>{data.path}</div>}
        </div>
      </div>
    );
  } else if (kind === "file") {
    const exts = data.exts?.length ? data.exts : [""];
    const size = icons.file;
    content = (
      <div className="pointer-events-none flex w-full flex-col items-center gap-1.5">
        <div className="flex flex-wrap justify-center gap-1">{exts.map((e, i) => <FileTypeIcon key={e || i} ext={e} size={size} title="" />)}</div>
        <LabelText label={data.label} color={color} />
      </div>
    );
  } else {
    content = <LabelText label={data.label} color={color} align={kind === "note" ? "left" : "center"} />;
  }

  return (
    <>
      {!readOnly && <NodeResizer isVisible={selected && !editing}
        minWidth={iconBase ? Math.round(iconBase.w * ICON_SCALE_MIN) : kind === "question" ? 120 : 80}
        minHeight={iconBase ? Math.round(iconBase.h * ICON_SCALE_MIN) : kind === "question" ? 70 : 40}
        lineClassName="fc-resize-line" handleClassName="fc-resize-handle" />}
      {!readOnly && (
        <NodeToolbar isVisible={onlyMe && !editing} position={Position.Top} offset={10}>
          <FlowTools ids={[id]} single={{ kind, data, onEdit: startEdit }} />
        </NodeToolbar>
      )}
      <div
        className={`fc-node relative flex h-full w-full justify-center ${kind === "note" ? "items-start" : "items-center"} ${frameless ? "fc-frameless" : ""}`}
        style={{ ...boxStyle, padding: pad }}
        title={kind === "folder" ? t(meta.hintTh, meta.hintEn) : undefined}
        onDoubleClick={(e) => {
          if (kind === "folder") { if (data.path) openFolder(data.path); return; }   // โฟลเดอร์: ดับเบิลคลิก = เปิด (แก้ผ่านปุ่ม "แก้")
          if (readOnly) return;
          e.stopPropagation(); startEdit();
        }}
      >
        {!frameless && <ShapeBg kind={kind} color={color} />}
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

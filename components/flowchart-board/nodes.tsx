"use client";

// กล่อง + เส้นของกระดาน flowchart กลาง (ใช้ภายใน components/flowchart-board เท่านั้น)
// สี/ขนาด/ชนิด อ่านจาก lib/flowchart (FLOW_PALETTE / FLOW_KIND_META) — ที่เดียวกับตอนบันทึกเป็นรูป

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, NodeToolbar, Position, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { flowEdgePath } from "./edge-path";
import { Icon } from "@/components/icon";
import { FileTypeIcon } from "@/components/file-type-icon";
import { FLOW_COLORS, FLOW_EDGE_SHAPES, FLOW_EDGE_SHAPE_META, FLOW_KIND_META, FLOW_PALETTE, ICON_SCALE_MAX, ICON_SCALE_MIN, edgeShapeOf, flowIconSizes, iconBoxBaseSize, nodeColor, splitFlowLabel, todoProgress, toggleTodo, newFlowId, TODO_MAX, type FlowTodo, type FlowColor, type FlowEdgeShape, type FlowKind, type FlowNodeData } from "@/lib/flowchart";
import { storagePlaceOf, storagePlaceSvg } from "@/lib/storage-places";
import { plainToRich, richToPlain, sanitizeRich } from "@/lib/flowchart-rich";
import { BoxFormatBar, RichEditor, RichText, type BoxFormatOp } from "./rich-text";
import type { PlanRuleCheck } from "@/lib/storage-policy";
import { flowShapeOf } from "@/lib/flowchart-shapes";
import { RESHAPE_KINDS } from "@/lib/flowchart";
import { ShapePalette } from "./shape-palette";
import { StylePicker, cssToStyle } from "./style-picker";
import { ColorPanel } from "./rich-text";
import { FLOW_STYLE_EDGE, effectiveStyle, flowStyleBoxCss, flowStyleLook, type FlowStyleKey, type FlowStyleLook } from "@/lib/flowchart-styles";
/** สีตัวหนังสือตามสไตล์กล่อง (null = ตามชุดสีปกติ) */
const ToneCtx = createContext<{ text: string; sub: string } | null>(null);
import { AUTO_ACTIONS, AUTO_ACTS_MAX, AUTO_STATUSES, AUTO_STATUS_META, AUTO_TRIGGERS, autoAction, autoTrigger, type AutoPick, type AutoRef, type FlowAuto } from "@/lib/flow-automation";

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
  /** ขยายกล่องให้อย่างน้อยเท่านี้ (ไม่หดกล่องที่ใหญ่อยู่แล้ว) — ใช้หลังพิมพ์ข้อความยาวกว่ากล่อง */
  growNode: (id: string, w: number, h: number) => void;
  /** จัดรูปแบบทั้งกล่อง (หลายกล่องพร้อมกันได้) + สีพื้น/เส้นขอบกำหนดเอง — ./rich-text BoxFormatBar */
  formatNodes: (ids: string[], op: BoxFormatOp) => void;
  /** กล่องที่เพิ่งสร้างจาก "ขั้นตอนต่อไป" → เข้าโหมดพิมพ์ทันที (กล่องเห็นแล้วเรียก clearAutoEdit) */
  autoEditId: string | null;
  clearAutoEdit: () => void;
  /** กล่อง "ไฟล์" (และไฟล์ที่เก็บในกล่อง "ที่เก็บ"): เปิดป๊อปเลือกประเภทไฟล์ */
  editFileTypes: (id: string) => void;
  /** กล่อง "ที่เก็บ": เปิดป๊อปเลือกไอคอนที่เก็บ (Google Drive · R2 · NAS ...) */
  editPlace: (id: string) => void;
  /** กล่อง "หน้าใน ERP": เปิดป๊อปเลือกหน้าจากเมนูจริง (components/menu-page-picker) */
  editPage: (id: string) => void;
  /** เปิดหน้าใน ERP (แท็บใหม่ — แผนผังยังเปิดค้างไว้) */
  openPage: (href: string) => void;
  /** ชื่อแอปล่าสุด + หน้ายังอยู่ในเมนูไหม (จากเมนูจริง) · null = ยังโหลดเมนูไม่เสร็จ (ใช้ค่าที่จำไว้ในกล่อง) */
  pageInfo: (href: string, app?: string) => { appName: string; appIcon: string | null; missing: boolean } | null;
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
  /** เปลี่ยนแบบลูกศร (หักมุม · ตรง · โค้ง) */
  setEdgeShape: (ids: string[], shape: FlowEdgeShape) => void;
  editEdgeLabel: (id: string) => void;
  removeEdge: (id: string) => void;
  /** กล่อง "ที่เก็บ": เปิดป๊อปผูกกฎที่เก็บจริง (/master/storage-rules) */
  editRule: (id: string) => void;
  /** สไตล์ทั้งกระดาน (lib/flowchart-styles) */
  boardStyle: FlowStyleKey;
  /** ตั้งสไตล์กล่อง (หลายกล่องพร้อมกันได้) · null = ตามกระดาน */
  setStyle: (ids: string[], style: FlowStyleKey | null) => void;
  /** เปลี่ยนรูปทรงกล่อง (กล่อง · เริ่ม/จบ · คำถาม · รูปทรง flowchart) — ข้อความ/สี/เส้นเหมือนเดิม */
  setShape: (ids: string[], target: string) => void;
  /** รูปทรงที่ใช้ล่าสุด (แถวบนของแผง) */
  recentShapes: string[];
  /** ชื่อคนที่ล็อกอินอยู่ (กล่องรายการงานจำว่าใครติ๊ก) */
  meName: string;
  /** ผลเทียบแผนกับกฎที่ผูก · null = ไม่ได้ผูก · "loading" = กำลังโหลดกฎ */
  ruleCheck: (data: FlowNodeData) => PlanRuleCheck | "loading" | null;
};
export const FlowBoardCtx = createContext<FlowBoardActions | null>(null);
const useBoard = () => {
  const c = useContext(FlowBoardCtx);
  if (!c) throw new Error("FlowBoardCtx missing");
  return c;
};

const HANDLE_POS: [string, Position][] = [["t", Position.Top], ["r", Position.Right], ["b", Position.Bottom], ["l", Position.Left]];

/** ข้อความในกล่อง: บรรทัดแรกตัวหนา · ที่เหลือตัวเล็ก */
function LabelText({ label, color, align = "center" }: { label: string; color: FlowColor; align?: "center" | "left" | "right" }) {
  const { title, sub } = splitFlowLabel(label);
  const pal = useContext(ToneCtx) ?? FLOW_PALETTE[color];
  return (
    <div className="pointer-events-none w-full whitespace-pre-wrap break-words leading-snug" style={{ textAlign: align }}>
      <div className="text-[13px] font-semibold" style={{ color: pal.text }}>{title || "\u00a0"}</div>
      {sub && <div className="mt-0.5 text-[11px]" style={{ color: pal.sub }}>{sub}</div>}
    </div>
  );
}

/** แก้ข้อความในกล่อง (ดับเบิลคลิก) — Enter = ขึ้นบรรทัด · Ctrl+Enter หรือคลิกข้างนอก = เสร็จ · Esc = ยกเลิก */
/** ช่องพิมพ์ในกล่อง — ยืดสูงตามข้อความเอง + ลากมุมขวาล่างขยายได้ (เจ้าของสั่ง 2026-11-19 "อยากให้ปรับขนาดได้ ตอนพิมพ์")
 *  boxW/boxH = ขนาดกล่องตอนนี้ (ช่องพิมพ์เริ่มเท่ากล่อง) · พิมพ์เสร็จ = onDone(patch, ขนาดช่องพิมพ์) → กระดานขยายกล่องให้พอดี */
function InlineEditor({ initial, onDone, folder, zone, boxW, boxH }: { initial: FlowNodeData; onDone: (patch: Partial<FlowNodeData> | null, size?: { w: number; h: number }) => void; folder?: boolean; zone?: boolean; boxW?: number; boxH?: number }) {
  const { t } = useBoard();
  const [label, setLabel] = useState(initial.label);
  const [path, setPath] = useState(initial.path ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const grow = !zone && !folder;
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  // ยืดความสูงตามข้อความ (ไม่หดต่ำกว่าขนาดกล่อง / ขนาดที่ลากขยายไว้)
  useLayoutEffect(() => {
    const ta = ref.current; if (!ta || !grow) return;
    const min = Math.max(40, (boxH ?? 0) - 8, ta.offsetHeight);   // ไม่หดต่ำกว่าที่ลากขยายไว้
    ta.style.height = "auto";
    ta.style.height = `${Math.max(min, ta.scrollHeight + 2)}px`;
  }, [label, grow, boxH]);
  const commit = () => {
    const el = wrapRef.current;
    const size = grow && el ? { w: el.offsetWidth + 8, h: el.offsetHeight + 8 } : undefined;
    onDone(folder ? { label: label.trim() || t("โฟลเดอร์", "Folder"), path: path.trim() } : { label }, size);
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onDone(null); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
  };
  return (
    <div ref={wrapRef} className={`nodrag nowheel nopan absolute z-10 flex flex-col gap-1 ${zone ? "left-2 top-1.5 h-9 w-[min(320px,90%)] pointer-events-auto" : grow ? "left-1 top-1 w-max" : "inset-1"}`}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) commit(); }}>
      <textarea ref={ref} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { key(e); if (zone && e.key === "Enter") { e.preventDefault(); commit(); } }} rows={folder || zone ? 1 : 3}
        placeholder={t("บรรทัดแรก = หัวข้อ · บรรทัดถัดไป = คำอธิบาย", "First line = title · next lines = details")}
        title={grow ? t("ลากมุมขวาล่าง = ขยายช่อง · Ctrl+Enter = บันทึก", "Drag the bottom-right corner to resize · Ctrl+Enter to save") : undefined}
        style={grow ? { width: Math.max(140, (boxW ?? 0) - 8), minWidth: 120, overflow: "hidden" } : undefined}
        className={`min-h-0 rounded-md border border-violet-300 bg-white px-1.5 py-1 text-[12px] text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-violet-200 ${grow ? "resize" : "w-full flex-1 resize-none"}`} />
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
  const { t, setColor, copyNodes, duplicateNodes, removeNodes, openFolder, editPlace, editFileTypes, editPage, openPage, iconScaleOf, stepIconScale, editRule, formatNodes, setShape, recentShapes, setStyle } = useBoard();
  const [shapeOpen, setShapeOpen] = useState(false);
  const [pop, setPop] = useState<null | "style" | "fill" | "stroke">(null);
  const togglePop = (p: "style" | "fill" | "stroke") => { setPop((v) => (v === p ? null : p)); setFmt(false); setShapeOpen(false); };
  const canReshape = !!single && RESHAPE_KINDS.includes(single.kind);
  const cur = single ? nodeColor(single.kind, single.data) : null;
  const iconScale = iconScaleOf(ids);
  const [fmt, setFmt] = useState(false);
  const pal = FLOW_PALETTE[cur ?? "slate"];
  const btn = "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-slate-600 hover:bg-slate-100";
  return (
    <div className="relative">
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
      {single?.kind !== "zone" && (
        <button type="button" className={`${btn} ${fmt ? "bg-violet-100 text-violet-700" : ""}`} onClick={() => { setFmt((v) => !v); setShapeOpen(false); setPop(null); }}
          title={t("จัดข้อความ / สีพื้น / สีเส้นขอบ ทั้งกล่อง" + (single ? "" : " (ทุกกล่องที่เลือก)") + " · จัดเฉพาะคำ = ดับเบิลคลิกกล่อง", "Format text / fill / border for the whole box · double-click to format words")}>
          <Icon value="i:typography" />
        </button>
      )}
      {!single && <span className="px-1.5 text-[11px] font-medium text-violet-700">{t(`เลือก ${ids.length} กล่อง`, `${ids.length} selected`)}</span>}
      {FLOW_COLORS.map((c) => (
        <button key={c} type="button" title={t(FLOW_PALETTE[c].th, FLOW_PALETTE[c].en)} onClick={() => setColor(ids, c)}
          className={`mx-0.5 h-4 w-4 rounded-full border-2 ${cur === c ? "ring-2 ring-violet-300 ring-offset-1" : ""}`}
          style={{ background: FLOW_PALETTE[c].fill, borderColor: FLOW_PALETTE[c].stroke }} />
      ))}
      <span className="mx-1 h-5 w-px bg-slate-200" />
      {single?.kind !== "zone" && (
        <>
          <button type="button" className={`${btn} ${pop === "style" ? "bg-violet-100 text-violet-700" : ""}`} onClick={() => togglePop("style")}
            title={t("สไตล์กล่อง (ปกติ · minimal · comic · luxury · punk-hazard · y2k)" + (single ? "" : " — ทุกกล่องที่เลือก"), "Box style" + (single ? "" : " — all selected"))}>
            <Icon value="i:palette" />{t("สไตล์", "Style")}
          </button>
          <button type="button" className={`${btn} relative ${pop === "fill" ? "bg-violet-100 text-violet-700" : ""}`} onClick={() => togglePop("fill")} title={t("สีพื้นเอง", "Custom fill")}>
            <Icon value="i:paint" /><span className="absolute bottom-0.5 left-1.5 right-1.5 h-[3px] rounded border border-slate-300" style={{ background: single?.data.fill ?? pal.fill }} />
          </button>
          <button type="button" className={`${btn} relative ${pop === "stroke" ? "bg-violet-100 text-violet-700" : ""}`} onClick={() => togglePop("stroke")} title={t("สีเส้นขอบเอง", "Custom border")}>
            <Icon value="i:square" /><span className="absolute bottom-0.5 left-1.5 right-1.5 h-[3px] rounded" style={{ background: single?.data.stroke ?? pal.stroke }} />
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
        </>
      )}
      {canReshape && (
        <button type="button" className={`${btn} ${shapeOpen ? "bg-violet-100 text-violet-700" : ""}`} onClick={() => { setShapeOpen((v) => !v); setFmt(false); setPop(null); }}
          title={t("เปลี่ยนรูปทรงกล่องนี้ — ข้อความ สี และเส้นที่ต่ออยู่เหมือนเดิม", "Change this box's shape — text, colour and lines stay")}>
          <Icon value="i:category" />{t("รูปทรง", "Shape")}
        </button>
      )}
      {single && <button type="button" className={btn} onClick={single.onEdit} title={single.kind === "file" ? t("เลือกประเภทไฟล์ / แก้ชื่อ (หรือดับเบิลคลิกกล่อง)", "Choose file types / rename (or double-click)") : t("แก้ข้อความ (หรือดับเบิลคลิกกล่อง)", "Edit text (or double-click)")}><Icon value="i:pencil" />{t("แก้", "Edit")}</button>}
      {single?.kind === "storage" && (
        <>
          <button type="button" className={btn} onClick={() => editPlace(ids[0])} title={t("เลือกไอคอนที่เก็บ เช่น Google Drive · R2 · NAS", "Choose a storage icon, e.g. Google Drive · R2 · NAS")}><Icon value="i:database" />{t("ไอคอน", "Icon")}</button>
          <button type="button" className={btn} onClick={() => editFileTypes(ids[0])} title={t("ใส่ไอคอนประเภทไฟล์ที่เก็บที่นี่", "Show which file types live here")}><Icon value="i:files" />{t("ไฟล์", "Files")}</button>
          <button type="button" className={btn} onClick={() => editRule(ids[0])} title={t("ผูกกับกฎที่เก็บจริงของระบบ — แผนไม่ตรงกฎจะขึ้นป้ายเตือน", "Link to the real storage rule — warns when the plan doesn't match")}><Icon value="i:shield-check" />{t("กฎ", "Rule")}</button>
        </>
      )}
      {single?.kind === "page" && (
        <button type="button" className={btn} onClick={() => editPage(ids[0])} title={t("เลือกหน้าอื่นจากเมนู", "Pick another page from the menu")}><Icon value="i:arrows-exchange" />{t("เปลี่ยนหน้า", "Change page")}</button>
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
      {single?.kind === "page" && single.data.href && <button type="button" className={btn} onClick={() => openPage(single.data.href!)} title={t("เปิดหน้านี้ในแท็บใหม่", "Open this page in a new tab")}><Icon value="i:external-link" />{t("เปิด", "Open")}</button>}
      <button type="button" className={`${btn} hover:bg-rose-50 hover:text-rose-600`} onClick={() => removeNodes(ids)} title={t("ลบ (หรือกด Delete)", "Delete (or press Delete)")}><Icon value="i:trash" /></button>
    </div>
    {fmt && (
      <div className="absolute left-0 top-full z-20 mt-1">
        <BoxFormatBar t={t} onApply={(op) => formatNodes(ids, op)} font={single?.data.font ?? ""}
          fill={single?.data.fill ?? pal.fill} stroke={single?.data.stroke ?? pal.stroke} textColor={pal.text} />
      </div>
    )}
    {pop && (
      <div className="absolute left-0 top-full z-20 mt-1" onMouseDown={(e) => e.stopPropagation()}>
        {pop === "style"
          ? <StylePicker t={t} inherit value={single ? single.data.style ?? null : null} title={t(single ? "สไตล์ของกล่องนี้" : `สไตล์ของ ${ids.length} กล่องที่เลือก`, single ? "This box's style" : `Style of ${ids.length} boxes`)}
              onPick={(k) => { setStyle(ids, k); setPop(null); }} />
          : pop === "fill"
            ? <ColorPanel value={single?.data.fill ?? pal.fill} t={t} onChange={(hex) => formatNodes(ids, { fill: hex })} onReset={() => formatNodes(ids, { fill: null })} resetLabel={t("คืนสีพื้นตามสไตล์", "Back to style fill")} />
            : <ColorPanel value={single?.data.stroke ?? pal.stroke} t={t} onChange={(hex) => formatNodes(ids, { stroke: hex })} onReset={() => formatNodes(ids, { stroke: null })} resetLabel={t("คืนสีเส้นตามสไตล์", "Back to style border")} />}
      </div>
    )}
    {shapeOpen && single && (
      <div className="absolute left-0 top-full z-20 mt-1">
        <ShapePalette t={t} includeBasic recent={recentShapes} current={single.kind === "shape" ? single.data.shape : single.kind}
          onPick={(k) => { setShape(ids, k); setShapeOpen(false); }} />
      </div>
    )}
    </div>
  );
}

/** ป้ายใต้กล่องที่เก็บ: ผูกกฎที่เก็บจริงแล้ว ตรง (เขียว) / ไม่ตรง (ส้ม) · กด = เปลี่ยนกฎ */
function RuleChip({ check, onClick }: { check: PlanRuleCheck | "loading" | null; onClick?: () => void }) {
  const { t } = useBoard();
  if (!check) return null;
  const warn = check !== "loading" && check.tone === "warn";
  const text = check === "loading" ? t("กำลังเทียบกับกฎ...", "Checking the rule...") : t(check.th, check.en);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick?.(); }} onDoubleClick={(e) => e.stopPropagation()} title={text}
      className={`nodrag nopan absolute left-1/2 top-full z-[2] mt-1 inline-flex max-w-[260px] -translate-x-1/2 items-center gap-1 truncate rounded-full border px-2 text-[10.5px] leading-5 ${onClick ? "" : "cursor-default"} ${check === "loading" ? "border-slate-200 bg-white text-slate-500" : warn ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      <Icon value={warn ? "i:alert-triangle" : "i:shield-check"} /><span className="truncate">{text}</span>
    </button>
  );
}

const fmtTodoAt = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }); };
const stopAll = { onDoubleClick: (e: React.SyntheticEvent) => e.stopPropagation(), onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation() };

/** กล่อง "รายการงาน" (เจ้าของสั่ง 2026-11-20): หัว (ชื่อ + เสร็จ n/ทั้งหมด) · แถบคืบหน้า · ข้อพร้อมช่องติ๊ก (จำว่าใครติ๊ก เมื่อไหร่)
 *  กดข้อความ = แก้ · ปุ่ม x = ลบข้อ (Ctrl+Z ย้อนได้) · ช่องล่างสุด = เพิ่มข้อ · กล่องยืดสูงตามจำนวนข้อเอง
 *  editingTitle = กำลังแก้ชื่อกล่อง (ดับเบิลคลิกกล่อง / ปุ่ม "แก้" บนแถบ) */
function TodoList({ id, data, color, width, height, editingTitle, onTitleDone }: { id: string; data: FlowNodeData; color: FlowColor; width?: number; height?: number; editingTitle: boolean; onTitleDone: () => void }) {
  const { readOnly, t, updateData, growNode, meName } = useBoard();
  const pal = FLOW_PALETTE[color];
  const items = data.items ?? [];
  const prog = todoProgress(items);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [title, setTitle] = useState(data.label);
  const ref = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingTitle) setTitle(data.label); }, [editingTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  // ข้อเยอะขึ้นจนล้นกล่อง → ยืดกล่องลงให้พอดี (ไม่หด)
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !height) return;
    const need = el.scrollHeight + 4;
    if (need > height) growNode(id, width ?? 0, need);
  }, [items.length, editId, data.label, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const setItems = (next: FlowTodo[]) => updateData(id, { items: next });
  const saveEdit = () => {
    if (!editId) return;
    const text = draft.trim();
    setItems(text ? items.map((i) => (i.id === editId ? { ...i, text } : i)) : items.filter((i) => i.id !== editId));
    setEditId(null);
  };
  const add = () => {
    const text = adding.trim(); if (!text || items.length >= TODO_MAX) return;
    setItems([...items, { id: newFlowId("n"), text }]);
    setAdding("");
  };
  const input = "nodrag nopan nowheel w-full rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[12px] text-slate-800 outline-none focus:ring-2 focus:ring-violet-200";
  return (
    <div ref={ref} className="flex w-full flex-col text-left">
      <div className="flex items-center gap-1.5 px-2.5 pt-2 text-[13px] font-semibold" style={{ color: pal.text }}>
        <span className="shrink-0" style={{ color: pal.stroke }}><Icon value={prog.allDone ? "i:circle-check" : "i:list-check"} /></span>
        {editingTitle
          ? <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} {...stopAll} className={input}
              onBlur={() => { updateData(id, { label: title.trim() || t("สิ่งที่ต้องทำ", "To do") }); onTitleDone(); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTitle(data.label); onTitleDone(); } }} />
          : <span className="min-w-0 flex-1 truncate" title={data.label}>{splitFlowLabel(data.label).title || t("สิ่งที่ต้องทำ", "To do")}</span>}
        <span className="shrink-0 text-[11px] font-normal" style={{ color: pal.sub }}>{prog.done}/{prog.total}</span>
      </div>
      <div className="mx-2.5 mb-1 mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/80">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%`, background: pal.stroke }} />
      </div>
      {items.map((it) => (
        <div key={it.id} className="group flex items-start gap-1.5 px-2.5 py-[3px] text-[12px]"
          title={it.done && (it.by || it.at) ? t(`ติ๊กโดย ${it.by ?? "-"} · ${fmtTodoAt(it.at)}`, `Checked by ${it.by ?? "-"} · ${fmtTodoAt(it.at)}`) : undefined}>
          <input type="checkbox" checked={!!it.done} disabled={readOnly} {...stopAll}
            onChange={(e) => setItems(toggleTodo(items, it.id, e.target.checked, meName))}
            aria-label={it.text} className="nodrag nopan mt-[2px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-600 disabled:cursor-default" />
          {editId === it.id
            ? <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} {...stopAll} className={input} onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }} />
            : <div className={`min-w-0 flex-1 break-words leading-snug ${readOnly ? "" : "nodrag cursor-text"}`}
                onClick={(e) => { if (readOnly) return; e.stopPropagation(); setEditId(it.id); setDraft(it.text); }} onDoubleClick={(e) => e.stopPropagation()}>
                <span className={it.done ? "text-slate-400 line-through" : "text-slate-800"}>{it.text || "—"}</span>
                {it.done && it.by && <div className="text-[10px] text-slate-400">{t(`ติ๊กโดย ${it.by}`, `by ${it.by}`)}{it.at ? ` · ${fmtTodoAt(it.at)}` : ""}</div>}
              </div>}
          {!readOnly && editId !== it.id && (
            <button type="button" {...stopAll} onClick={(e) => { e.stopPropagation(); setItems(items.filter((i) => i.id !== it.id)); }}
              title={t("ลบข้อนี้ (ย้อนกลับได้ Ctrl+Z)", "Delete this item (Ctrl+Z to undo)")}
              className="nodrag nopan invisible shrink-0 rounded px-0.5 text-slate-400 hover:text-rose-600 group-hover:visible"><Icon value="i:x" /></button>
          )}
        </div>
      ))}
      {!readOnly && items.length < TODO_MAX && (
        <div className="flex items-center gap-1 px-2.5 pb-2 pt-1">
          <span className="text-[12px]" style={{ color: pal.stroke }}><Icon value="i:plus" /></span>
          <input ref={addRef} value={adding} onChange={(e) => setAdding(e.target.value)} {...stopAll}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { setAdding(""); addRef.current?.blur(); } }}
            onBlur={add} placeholder={t("เพิ่มข้อ แล้วกด Enter", "Add an item, press Enter")}
            className="nodrag nopan nowheel min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400" />
        </div>
      )}
      {readOnly && !items.length && <div className="px-2.5 pb-2 text-[11px] text-slate-400">{t("ยังไม่มีข้อ", "No items yet")}</div>}
    </div>
  );
}

/** ตัวเลือก เมื่อ/ให้: รายการจากทะเบียน (จัดกลุ่ม) + "พิมพ์เอง" + ช่องรายละเอียด — Enter/คลิกนอก = เสร็จ · Esc = ยกเลิก */
function AutoPickEditor({ refs, initial, onDone }: { refs: AutoRef[]; initial?: AutoPick; onDone: (p: AutoPick | null | undefined) => void }) {
  const { t } = useBoard();
  const [key, setKey] = useState(initial?.key ?? (initial?.text ? "" : refs[0].key));
  const [text, setText] = useState(initial?.text ?? "");
  const groups = [...new Set(refs.map((r) => r.group))];
  const done = () => { const tx = text.trim(); onDone(key || tx ? { ...(key ? { key } : {}), ...(tx ? { text: tx } : {}) } : null); };
  const cls = "nodrag nopan nowheel w-full rounded border border-violet-300 bg-white px-1 py-0.5 text-[12px] text-slate-800 outline-none focus:ring-2 focus:ring-violet-200";
  return (
    <div className="flex w-full flex-col gap-1" {...stopAll}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) done(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onDone(undefined); if (e.key === "Enter") done(); }}>
      <select autoFocus value={key} onChange={(e) => setKey(e.target.value)} className={cls}>
        {groups.map((g) => <optgroup key={g} label={g}>{refs.filter((r) => r.group === g).map((r) => <option key={r.key} value={r.key}>{t(r.th, r.en)}</option>)}</optgroup>)}
        <option value="">{t("— พิมพ์เอง —", "— Type my own —")}</option>
      </select>
      <input value={text} onChange={(e) => setText(e.target.value)} className={cls}
        placeholder={key ? t("รายละเอียดเพิ่ม (ไม่ใส่ก็ได้) เช่น ฝ่ายขาย", "Extra detail (optional), e.g. sales team") : t("พิมพ์เอง", "Type it")} />
    </div>
  );
}

/** ชิปของ เมื่อ/ให้ 1 อัน: ไอคอน + ชื่อจากทะเบียน + รายละเอียด */
function AutoChip({ p, refOf }: { p: AutoPick; refOf: (k?: string) => AutoRef | undefined }) {
  const { t } = useBoard();
  const r = refOf(p.key);
  return (
    <span className="mb-0.5 mr-1 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px text-[11.5px] text-slate-700">
      {r && <Icon value={r.icon} className="shrink-0" />}
      <span className="min-w-0 break-words">{[r ? t(r.th, r.en) : "", p.text].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

/** กล่อง "อัตโนมัติ" (เจ้าของสั่ง 2026-11-20 แบบ A): หัว (ชื่อ + สถานะ) · เมื่อ · ถ้า · ให้ (หลายอย่าง) — กดแถวไหนแก้แถวนั้น
 *  ⚠️ จดกฎอย่างเดียว ระบบยังไม่ทำงานเอง · ทะเบียน เมื่อ/ให้ = lib/flow-automation */
function AutoCard({ id, data, color, width, height, editingTitle, onTitleDone }: { id: string; data: FlowNodeData; color: FlowColor; width?: number; height?: number; editingTitle: boolean; onTitleDone: () => void }) {
  const { readOnly, t, updateData, growNode } = useBoard();
  const pal = FLOW_PALETTE[color];
  const a: FlowAuto = data.auto ?? { acts: [], status: "plan" };
  const [edit, setEdit] = useState<"when" | "cond" | number | "add" | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [title, setTitle] = useState(data.label);
  const [cond, setCond] = useState(a.cond ?? "");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editingTitle) setTitle(data.label); }, [editingTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !height) return;
    const need = el.scrollHeight + 4;
    if (need > height) growNode(id, width ?? 0, need);
  }, [edit, a.acts.length, a.when, a.cond, data.label, statusOpen, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<FlowAuto>) => updateData(id, { auto: { ...a, ...patch } });
  const off = a.status === "off";
  const st = AUTO_STATUS_META[a.status];
  const rowBtn = `min-w-0 flex-1 text-left ${readOnly ? "cursor-default" : "nodrag cursor-pointer rounded hover:bg-violet-50/70"}`;
  const open = (v: typeof edit) => (e: React.MouseEvent) => { if (readOnly) return; e.stopPropagation(); if (v === "cond") setCond(a.cond ?? ""); setEdit(v); };
  const empty = (th: string, en: string) => <span className="text-[11.5px] text-slate-400">{readOnly ? "—" : t(th, en)}</span>;
  const tag = (txt: string, cls: string) => <span className={`mt-px w-8 shrink-0 rounded text-center text-[10.5px] font-semibold leading-[18px] ${cls}`}>{txt}</span>;
  const input = "nodrag nopan nowheel w-full rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[12px] text-slate-800 outline-none focus:ring-2 focus:ring-violet-200";
  return (
    <div ref={ref} className={`flex w-full flex-col pb-2 text-left ${off ? "opacity-60" : ""}`}>
      <div className="relative flex items-center gap-1.5 border-b px-2.5 py-1.5 text-[13px] font-semibold" style={{ color: pal.text, borderColor: `${pal.stroke}33` }}>
        <span className="shrink-0" style={{ color: pal.stroke }}><Icon value="i:bolt" /></span>
        {editingTitle
          ? <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} {...stopAll} className={input}
              onBlur={() => { updateData(id, { label: title.trim() || t("กฎอัตโนมัติ", "Automation rule") }); onTitleDone(); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTitle(data.label); onTitleDone(); } }} />
          : <span className="min-w-0 flex-1 truncate" title={data.label}>{splitFlowLabel(data.label).title || t("กฎอัตโนมัติ", "Automation rule")}</span>}
        <button type="button" {...stopAll} disabled={readOnly} onClick={(e) => { e.stopPropagation(); setStatusOpen((v) => !v); }}
          title={t("สถานะของกฎ — กดเพื่อเปลี่ยน", "Rule status — click to change")}
          className={`nodrag nopan shrink-0 rounded-full border px-2 text-[10.5px] font-medium leading-5 ${st.cls} ${readOnly ? "cursor-default" : ""}`}>{t(st.th, st.en)}</button>
        {statusOpen && !readOnly && (
          <div className="nodrag nopan absolute right-1.5 top-full z-20 mt-1 flex flex-col rounded-lg border border-slate-200 bg-white p-1 shadow-lg" {...stopAll}>
            {AUTO_STATUSES.map((s) => (
              <button key={s} type="button" onClick={(e) => { e.stopPropagation(); set({ status: s }); setStatusOpen(false); }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] hover:bg-slate-50 ${s === a.status ? "font-semibold" : "font-normal"}`}>
                <span className={`h-2.5 w-2.5 rounded-full border ${AUTO_STATUS_META[s].cls}`} />{t(AUTO_STATUS_META[s].th, AUTO_STATUS_META[s].en)}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* เมื่อ */}
      <div className="flex items-start gap-2 px-2.5 pt-1.5">
        {tag(t("เมื่อ", "When"), "bg-blue-50 text-blue-700")}
        {edit === "when"
          ? <AutoPickEditor refs={AUTO_TRIGGERS} initial={a.when} onDone={(p) => { setEdit(null); if (p !== undefined) set({ when: p ?? undefined }); }} />
          : <div className={rowBtn} onClick={open("when")} onDoubleClick={(e) => e.stopPropagation()}>{a.when ? <AutoChip p={a.when} refOf={autoTrigger} /> : empty("+ เลือกเหตุการณ์", "+ Pick an event")}</div>}
      </div>
      {/* ถ้า */}
      <div className="flex items-start gap-2 px-2.5 pt-1">
        {tag(t("ถ้า", "If"), "bg-amber-50 text-amber-700")}
        {edit === "cond"
          ? <input autoFocus value={cond} onChange={(e) => setCond(e.target.value)} {...stopAll} className={input}
              placeholder={t("เช่น ยอดเกิน 10,000 · ลูกค้า VIP (ไม่ใส่ก็ได้)", "e.g. total over 10,000 · VIP customer (optional)")}
              onBlur={() => { setEdit(null); set({ cond: cond.trim() || undefined }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }} />
          : <div className={`${rowBtn} break-words text-[12px] text-slate-700`} onClick={open("cond")} onDoubleClick={(e) => e.stopPropagation()}>{a.cond || empty("ทุกครั้ง (กดเพื่อใส่เงื่อนไข)", "Always (click to add a condition)")}</div>}
      </div>
      {/* ให้ */}
      <div className="flex items-start gap-2 px-2.5 pt-1">
        {tag(t("ให้", "Then"), "bg-emerald-50 text-emerald-700")}
        <div className="min-w-0 flex-1">
          {a.acts.map((p, i) => edit === i
            ? <AutoPickEditor key={i} refs={AUTO_ACTIONS} initial={p} onDone={(np) => { setEdit(null); if (np === undefined) return; set({ acts: np ? a.acts.map((x, j) => (j === i ? np : x)) : a.acts.filter((_, j) => j !== i) }); }} />
            : (
              <div key={i} className="group flex items-start">
                <div className={rowBtn} onClick={open(i)} onDoubleClick={(e) => e.stopPropagation()}><AutoChip p={p} refOf={autoAction} /></div>
                {!readOnly && <button type="button" {...stopAll} onClick={(e) => { e.stopPropagation(); set({ acts: a.acts.filter((_, j) => j !== i) }); }}
                  title={t("เอาออก (ย้อนกลับได้ Ctrl+Z)", "Remove (Ctrl+Z to undo)")}
                  className="nodrag nopan invisible shrink-0 px-0.5 text-slate-400 hover:text-rose-600 group-hover:visible"><Icon value="i:x" /></button>}
              </div>
            ))}
          {edit === "add"
            ? <AutoPickEditor refs={AUTO_ACTIONS} onDone={(np) => { setEdit(null); if (np) set({ acts: [...a.acts, np] }); }} />
            : !readOnly && a.acts.length < AUTO_ACTS_MAX
              ? <button type="button" {...stopAll} onClick={open("add")} className="nodrag nopan text-[11.5px] text-violet-600 hover:underline">{a.acts.length ? t("+ เพิ่มอีก", "+ Add another") : t("+ เลือกสิ่งที่จะให้ทำ", "+ Pick an action")}</button>
              : !a.acts.length && empty("—", "—")}
        </div>
      </div>
    </div>
  );
}

/** รูปทรงพื้นหลังแบบ SVG (คำถาม = ข้าวหลามตัด · ที่เก็บ = ทรงกระบอก) */
function ShapeBg({ kind, color, fill, stroke, shape, look }: { kind: FlowKind; color: FlowColor; fill?: string; stroke?: string; shape?: string; look?: FlowStyleLook }) {
  const p0 = FLOW_PALETTE[color];
  const p = look ? { ...p0, fill: look.fill, stroke: look.stroke } : { ...p0, fill: fill ?? p0.fill, stroke: stroke ?? p0.stroke };
  const common = { fill: p.fill, stroke: p.stroke, strokeWidth: look ? Math.min(look.sw, 4) : 2, vectorEffect: "non-scaling-stroke" as const, ...(look?.dash ? { strokeDasharray: look.dash } : {}) };
  const svgStyle = look?.filter ? { filter: look.filter } : undefined;
  if (kind === "shape") {
    const s = flowShapeOf(shape);
    return (
      <svg style={svgStyle} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        {s.fill.map((d) => <path key={d} d={d} {...common} />)}
        {(s.line ?? []).map((d) => <path key={d} d={d} fill="none" stroke={p.stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      </svg>
    );
  }
  if (kind === "question") return (
    <svg style={svgStyle} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="50,1 99,50 50,99 1,50" {...common} />
    </svg>
  );
  if (kind === "storage") return (
    <svg style={svgStyle} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1,12 A49,11 0 0,1 99,12 L99,88 A49,11 0 0,1 1,88 Z" {...common} />
      <path d="M1,12 A49,11 0 0,0 99,12" fill="none" stroke={p.stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
  return null;
}

/** กล่องทุกชนิด (ชนิดดูจาก type ของโหนด) */
export function FlowNodeView({ id, type, data, selected, width, height }: NodeProps<FlowRFNode>) {
  const { readOnly, t, updateData, growNode, autoEditId, clearAutoEdit, openFolder, selectedIds, editFileTypes, editPage, openPage, pageInfo, ruleCheck, editRule, boardStyle } = useBoard();
  const kind = type as FlowKind;
  const onlyMe = selected && selectedIds.length === 1;   // เลือกหลายกล่อง → ใช้แถบกลุ่มแทน
  const color = nodeColor(kind, data);
  // สไตล์กล่อง (ของกล่อง → ของกระดาน → ปกติ) · กรอบโซนไม่ใช้สไตล์
  const styleKey = kind === "zone" ? "normal" : effectiveStyle(data.style, boardStyle);
  const look = styleKey === "normal" ? null : flowStyleLook(styleKey, FLOW_PALETTE[color], { fill: data.fill, stroke: data.stroke }, kind === "todo" || kind === "auto");
  const pal = look ? { ...FLOW_PALETTE[color], fill: look.fill, stroke: look.stroke, text: look.text, sub: look.sub } : FLOW_PALETTE[color];
  const [editing, setEditing] = useState(false);
  const meta = FLOW_KIND_META[kind];
  // กล่องไฟล์ = ป๊อปเลือกประเภท · กล่องหน้าใน ERP ที่ยังไม่ได้เลือกหน้า = ป๊อปเลือกหน้า (เลือกแล้ว = แก้ข้อความ)
  const startEdit = () => (kind === "file" ? editFileTypes(id) : kind === "page" && !data.href ? editPage(id) : setEditing(true));
  useEffect(() => { if (autoEditId === id && !readOnly) { clearAutoEdit(); startEdit(); } }, [autoEditId]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = kind === "storage" ? storagePlaceOf(data.place) : null;

  // กรอบโซน: กรอบใหญ่โปร่ง อยู่หลังกล่องอื่น · จับ/ลาก/ดับเบิลคลิกได้เฉพาะหัวกรอบ (ตัวกรอบกดทะลุไปที่กระดาน)
  if (kind === "zone") {
    return (
      <>
        {!readOnly && <NodeResizer isVisible={selected && !editing} minWidth={160} minHeight={100} lineClassName="fc-resize-line" handleClassName="fc-resize-handle" />}
        {/* กรอบโซนอยู่ชั้นล่าง (z -1) → แถบเครื่องมือได้ชั้นเดียวกันจมใต้พื้นกระดาน กดสีไม่ได้ → ยกแถบขึ้นบน (แก้ 2026-11-22) */}
        {!readOnly && (
          <NodeToolbar isVisible={onlyMe && !editing} position={Position.Top} align="start" offset={8} style={{ zIndex: 1100 }}>
            <FlowTools ids={[id]} single={{ kind, data, onEdit: startEdit }} />
          </NodeToolbar>
        )}
        <div className="fc-zone relative h-full w-full">
          <div className="absolute inset-0 rounded-2xl" style={{ background: data.fill ?? pal.fill, opacity: 0.55 }} />
          <div className="absolute inset-0 rounded-2xl" style={{ border: `2px dashed ${data.stroke ?? pal.stroke}`, opacity: selected ? 1 : 0.7 }} />
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
  const frameless = kind === "file" || kind === "text" || !!place;
  const boxStyle: React.CSSProperties =
    kind === "question" || kind === "storage" || kind === "shape" || frameless ? {}
    : look ? cssToStyle(flowStyleBoxCss(look, kind === "start" ? "999px" : kind === "note" ? "4px" : "10px"))
    : { background: data.fill ?? pal.fill, border: `2px solid ${data.stroke ?? pal.stroke}`, borderRadius: kind === "start" ? 999 : kind === "note" ? 4 : 10 };
  const fontFamily = data.font ?? look?.font;
  // ระยะขอบข้อความ (ข้าวหลามตัด/ทรงกระบอก ต้องเว้นมากกว่า)
  const pad = kind === "shape" ? flowShapeOf(data.shape).pad : kind === "todo" || kind === "auto" ? "0" : frameless ? "4px 6px" : kind === "question" ? "18% 22%" : kind === "storage" ? "22% 10% 10%" : kind === "note" ? "10px 12px" : "6px 12px";

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
  } else if (kind === "page") {
    // หน้าใน ERP: แถวบน = แอป + ปุ่ม "เปิด ↗" · ล่าง = ไอคอนเมนู + ชื่อหน้า (ชื่อแอปล่าสุดจากเมนูจริง · ยังโหลดไม่เสร็จ = ชื่อที่จำไว้)
    const info = data.href ? pageInfo(data.href, data.app) : null;
    const appName = (info && !info.missing ? info.appName : data.appName) || "";
    content = (
      <div className="pointer-events-none flex w-full min-w-0 flex-col gap-1 text-left">
        <div className="flex min-w-0 items-center gap-1 text-[10.5px] font-medium" style={{ color: pal.sub }}>
          <span className="shrink-0">{info?.appIcon ? <Icon value={info.appIcon} /> : <Icon value="i:apps" />}</span>
          <span className="min-w-0 flex-1 truncate">{appName ? t(`แอป ${appName}`, `App: ${appName}`) : t("หน้าใน ERP", "ERP page")}</span>
          {data.href && (
            <a href={data.href} target="_blank" rel="noopener noreferrer"
              className="nodrag nopan pointer-events-auto inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border bg-white px-1.5 text-[10.5px] font-medium hover:shadow-sm"
              style={{ borderColor: pal.stroke, color: pal.text }}
              title={t(`เปิด ${data.href} ในแท็บใหม่`, `Open ${data.href} in a new tab`)}
              onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              {t("เปิด", "Open")}<Icon value="i:external-link" />
            </a>
          )}
        </div>
        <div className="flex min-w-0 items-start gap-1.5">
          {data.icon && <span className="shrink-0 text-[15px] leading-[1.25]"><Icon value={data.icon} /></span>}
          <div className="min-w-0 flex-1"><LabelText label={data.label} color={color} align="left" /></div>
        </div>
        {!data.href
          ? <div className="text-[10.5px] text-amber-700"><Icon value="i:alert-triangle" /> {t("ยังไม่ได้เลือกหน้า — กด \"เปลี่ยนหน้า\"", "No page chosen — click \"Change page\"")}</div>
          : info?.missing && <div className="text-[10.5px] text-amber-700" title={data.href}><Icon value="i:alert-triangle" /> {t("หน้านี้ไม่อยู่ในเมนูแล้ว", "This page is no longer in the menu")}</div>}
      </div>
    );
  } else if (kind === "auto") {
    content = <AutoCard id={id} data={data} color={color} width={width} height={height} editingTitle={editing} onTitleDone={() => setEditing(false)} />;
  } else if (kind === "todo") {
    content = <TodoList id={id} data={data} color={color} width={width} height={height} editingTitle={editing} onTitleDone={() => setEditing(false)} />;
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
    const align = data.align ?? (kind === "note" ? "left" : "center");
    content = data.rich ? <RichText html={data.rich} align={align} color={pal.text} /> : <LabelText label={data.label} color={color} align={align} />;
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
        className={`fc-node relative flex h-full w-full justify-center ${kind === "note" || kind === "todo" || kind === "auto" ? "items-start" : "items-center"} ${frameless ? "fc-frameless" : ""}`}
        style={{ ...boxStyle, padding: pad, ...(fontFamily ? { fontFamily: `"${fontFamily}", sans-serif` } : {}), ...(look?.upper ? { textTransform: "uppercase" } : {}), ...(look?.letter ? { letterSpacing: look.letter } : {}) }}
        title={kind === "folder" ? t(meta.hintTh, meta.hintEn) : kind === "page" && data.href ? t(`ดับเบิลคลิก = เปิดหน้า ${data.href}`, `Double-click to open ${data.href}`) : undefined}
        onDoubleClick={(e) => {
          if (kind === "folder") { if (data.path) openFolder(data.path); return; }   // โฟลเดอร์: ดับเบิลคลิก = เปิด (แก้ผ่านปุ่ม "แก้")
          if (kind === "page" && data.href) { e.stopPropagation(); openPage(data.href); return; }   // หน้าใน ERP: ดับเบิลคลิก = เปิดหน้า (แก้ผ่านปุ่มบนแถบ)
          if (readOnly) return;
          e.stopPropagation(); startEdit();
        }}
      >
        {!frameless && <ShapeBg kind={kind} color={color} fill={data.fill} stroke={data.stroke} shape={data.shape} look={look ?? undefined} />}
        <ToneCtx.Provider value={look ? { text: look.text, sub: look.sub } : null}><div className="relative z-[1] flex w-full justify-center">{content}</div></ToneCtx.Provider>
        {kind === "storage" && data.rule && <RuleChip check={ruleCheck(data)} onClick={readOnly ? undefined : () => editRule(id)} />}
        {editing && kind !== "todo" && kind !== "auto" && (
          kind === "folder" || kind === "file"
            ? <InlineEditor initial={data} folder={kind === "folder"} boxW={width} boxH={height}
                onDone={(patch, size) => { setEditing(false); if (patch) updateData(id, patch); if (patch && size) growNode(id, size.w, size.h); }} />
            // ข้อความจัดรูปแบบ (เจ้าของเลือก 2026-11-19 แบบ B) — ไม่ได้จัดอะไร = เก็บเป็นข้อความล้วนเหมือนเดิม
            : <RichEditor t={t} boxW={width} boxH={height} textColor={pal.text} initialHtml={data.rich || plainToRich(data.label, pal.sub)}
                onDone={(html, size) => {
                  setEditing(false);
                  if (html === null) return;
                  const rich = sanitizeRich(html), label = richToPlain(rich);
                  const plainOnly = rich === plainToRich(label, pal.sub);
                  updateData(id, { label, rich: plainOnly ? undefined : rich });
                  if (size) growNode(id, size.w, size.h);
                }} />
        )}
      </div>
      {HANDLE_POS.map(([hid, pos]) => (
        <Handle key={hid} id={hid} type="source" position={pos} className="fc-h" isConnectable={!readOnly} />
      ))}
    </>
  );
}

/** ไอคอนแบบลูกศร (เส้นเล็ก 16×16 — รูปเส้นจาก FLOW_EDGE_SHAPE_META) */
export function EdgeShapeIcon({ shape, size = 16 }: { shape: FlowEdgeShape; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={FLOW_EDGE_SHAPE_META[shape].svg} />
      <path d={FLOW_EDGE_SHAPE_META[shape].head} />
    </svg>
  );
}

/** เส้นต่อ (หักมุม / ตรง / โค้ง ตาม data.shape) + ป้าย · เลือกเส้นแล้วมีปุ่มลัด แบบเส้น / ใช่ / ไม่ใช่ / แก้ / ลบ */
export function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, label, selected, data }: EdgeProps) {
  const { readOnly, t, setEdgeLabel, editEdgeLabel, removeEdge, setEdgeShape, boardStyle } = useBoard();
  const es = FLOW_STYLE_EDGE[boardStyle];
  const shape = edgeShapeOf(data as { shape?: unknown } | undefined);
  const [path, lx, ly] = flowEdgePath(shape, { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const text = typeof label === "string" ? label : "";
  const chip = "h-6 rounded-md px-1.5 text-[11px] hover:bg-slate-100";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={18}
        style={{ stroke: selected ? "#7c3aed" : es.color, strokeWidth: selected ? Math.max(2.5, es.width + 0.5) : es.width, ...(es.dash && !selected ? { strokeDasharray: es.dash } : {}) }} />
      {(text || (selected && !readOnly)) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute flex flex-col items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all", ...(selected ? { zIndex: 1100 } : {}) /* เลือกเส้นอยู่ = ปุ่มลัดลอยเหนือกล่อง (เส้นสั้นกล่องเคยบังปุ่ม) */ }}>
            {text && <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${selected ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>{text}</span>}
            {selected && !readOnly && (
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 text-slate-600 shadow-md">
                {FLOW_EDGE_SHAPES.map((s) => (
                  <button key={s} type="button" onClick={() => setEdgeShape([id], s)} aria-pressed={shape === s}
                    title={t(`ลูกศรแบบ${FLOW_EDGE_SHAPE_META[s].th}`, `${FLOW_EDGE_SHAPE_META[s].en} arrow`)}
                    className={`inline-flex h-6 w-7 items-center justify-center rounded-md ${shape === s ? "bg-violet-100 text-violet-700" : "hover:bg-slate-100"}`}>
                    <EdgeShapeIcon shape={s} />
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px bg-slate-200" />
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

// ─────────────────────────────────────────────────────────────
// ชั้นล็อก (กล่อง/เส้นที่ระบบสร้าง — หน้าแม่ส่งมาทาง prop `locked`) · ตรรกะล้วน: lib/flowchart-locked
// ─────────────────────────────────────────────────────────────

/** ของที่กล่อง/เส้นของระบบต้องใช้ (หน้าแม่วาดเนื้อหากล่องเอง ผ่าน renderBox) */
export type FlowLockedActions = {
  renderBox: (id: string) => ReactNode;
  /** แก้กระดานได้ (มีสิทธิ์ + ไม่ได้ซ่อนชั้นวาด) — ดับเบิลคลิกปลดล็อก/ต่อเส้นได้ */
  canChange: boolean;
};
export const FlowLockedCtx = createContext<FlowLockedActions | null>(null);

export type SysNodeData = { lid: string; unlocked: boolean };
export type SysRFNode = Node<SysNodeData, "sys">;
export type SysBgRFNode = Node<{ content: ReactNode }, "sysBg">;

/** กล่องของระบบ: เนื้อหาจากหน้าแม่ · ล็อกอยู่ = ลากไม่ได้ (กดดูรายละเอียดได้) · ดับเบิลคลิก = ปลด/ล็อกกล่องนี้ · ต่อเส้นที่วาดเองเข้ามาได้ */
export function SysNodeView({ data }: NodeProps<SysRFNode>) {
  const ctx = useContext(FlowLockedCtx);
  const { t } = useBoard();
  if (!ctx) return null;
  return (
    <>
      <div className={`fc-sys relative h-full w-full ${data.unlocked ? "fc-sys-open" : ""}`}
        title={ctx.canChange ? (data.unlocked ? t("ปลดล็อกอยู่ — ลากย้ายได้ · ดับเบิลคลิก = ล็อกกลับ", "Unlocked — drag to move · double-click to lock") : t("กล่องของระบบ (ล็อก) — ดับเบิลคลิก = ปลดล็อกกล่องนี้", "System box (locked) — double-click to unlock")) : undefined}>
        {ctx.renderBox(data.lid)}
        {data.unlocked && (
          <span className="pointer-events-none absolute -top-2.5 right-1 inline-flex items-center gap-0.5 rounded-full bg-violet-600 px-1.5 text-[10px] font-medium leading-4 text-white shadow">
            <Icon value="i:lock-open" />{t("ปลดล็อก", "Unlocked")}
          </span>
        )}
      </div>
      {HANDLE_POS.map(([hid, pos]) => (
        <Handle key={hid} id={hid} type="source" position={pos} className="fc-h" isConnectable={ctx.canChange} />
      ))}
    </>
  );
}

/** พื้นหลังของชั้นล็อก (เช่น แถบคอลัมน์ ซื้อ/ผลิต/จ่ายงาน/ขาย) — กดทะลุ */
export function SysBgView({ data }: NodeProps<SysBgRFNode>) {
  return <div className="pointer-events-none h-full w-full">{data.content}</div>;
}

export type SysEdgeData = { path: { d: string; feeds: string[]; badge: { x: number; y: number } | null }; color: string; dash?: string; width?: number; text?: string; dot?: string; title?: string; opacity?: number };

/** เส้นของระบบ: วาดตามเส้นทางที่คำนวณแล้ว (ไม่ใช้พิกัดจุดต่อของ React Flow) + วงกลมเลขกำกับ · กด = หน้าแม่เปิดรายละเอียด */
export function SysEdgeView({ id, data, markerEnd }: EdgeProps) {
  const e = data as unknown as SysEdgeData | undefined;
  if (!e) return null;
  const w = e.width ?? 1.5;
  const style = { stroke: e.color, strokeWidth: w, strokeDasharray: e.dash, strokeLinecap: "round" as const };
  return (
    <g opacity={e.opacity ?? 1} className="cursor-pointer">
      {e.title && <title>{e.title}</title>}
      {e.path.feeds.map((d) => <path key={d} d={d} fill="none" style={style} />)}
      <BaseEdge id={id} path={e.path.d} markerEnd={markerEnd} interactionWidth={12} style={style} />
      {e.path.feeds.map((d) => <path key={`h${d}`} d={d} fill="none" stroke="transparent" strokeWidth={12} />)}
      {e.path.badge && e.text && (
        <g>
          <circle cx={e.path.badge.x} cy={e.path.badge.y} r={9} fill="#fff" stroke={e.color} strokeWidth={1.5} />
          <text x={e.path.badge.x} y={e.path.badge.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill={e.color}>{e.text}</text>
          {e.dot && <circle cx={e.path.badge.x + 7} cy={e.path.badge.y - 7} r={3.5} fill={e.dot} stroke="#fff" strokeWidth={1} />}
        </g>
      )}
    </g>
  );
}

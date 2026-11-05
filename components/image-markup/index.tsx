"use client";

/**
 * ImageMarkup — ของกลาง: วาดบนรูป (สี่เหลี่ยม · วงกลม · ข้อความ · เส้นมือ) + หมุดเลข
 *
 * ใช้ที่: ใบงานออกแบบ แท็บ "รายละเอียดงาน" (หมุด = วัตถุดิบผูก SKU)
 * ใช้ซ้ำได้: ชี้ตำหนิบนรูป QC · ชี้จุดแก้งานบนรูป comment
 * ต่างจาก ImageRegions (กรอบสี่เหลี่ยมผูกข้อมูล เช่นแผ่น Swatch): ตัวนี้คือ "ปากกาวาดบนรูป" + หมุดเลข
 *
 * พิกัด = % ของรูป (lib/image-markup) · ตัวนี้ไม่บันทึกเอง — หน้าที่เรียกใช้เก็บ state + ยิง API
 * doc: docs/image-markup.md
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type SVGAttributes } from "react";
import { Icon } from "@/components/icon";
import {
  MARKUP_COLORS, MARKUP_TEXT_SIZE, markupShapeBox, moveMarkupShape, newMarkupId,
  type MarkupPin, type MarkupSelection, type MarkupShape, type MarkupTool,
} from "@/lib/image-markup";

type Pt = { x: number; y: number };
type Draft = { t: "rect" | "circle"; a: Pt; b: Pt } | { t: "draw"; pts: [number, number][] } | null;
type Drag = { kind: "shape" | "pin"; id: string; start: Pt; dx: number; dy: number; moved: boolean } | null;
type TextEdit = { id: string | null; x: number; y: number; value: string } | null;

const r2 = (n: number) => Math.round(n * 100) / 100;
const cl = (n: number) => r2(Math.min(100, Math.max(0, n)));
const STROKE = 2.5;

export function ImageMarkup({
  src, alt = "", shapes, pins = [], editable = false, tool = "select", color = MARKUP_COLORS[0],
  selected = null, onSelect, onShapesChange, onPinAdd, onPinMove, onDeleteSelected, onImageLoad, className = "",
}: {
  src: string;
  alt?: string;
  shapes: MarkupShape[];
  pins?: MarkupPin[];
  editable?: boolean;
  tool?: MarkupTool;
  /** สีของสิ่งที่วาดใหม่ */
  color?: string;
  selected?: MarkupSelection | null;
  onSelect?: (sel: MarkupSelection | null) => void;
  /** ทุกการเปลี่ยน (วาด/ย้าย/แก้ข้อความ/ลบ) ส่งชุดใหม่ทั้งชุด — เรียกครั้งเดียวต่อการกระทำ (ไว้เก็บ undo ได้) */
  onShapesChange?: (next: MarkupShape[]) => void;
  /** เครื่องมือหมุด: กดบนรูป → ขอเพิ่มหมุดที่ตำแหน่งนี้ (หน้าเจ้าของสร้างข้อมูลหมุดเอง) */
  onPinAdd?: (pt: Pt) => void;
  onPinMove?: (id: string, pt: Pt) => void;
  /** กดปุ่ม Delete/Backspace ตอนเลือกอยู่ */
  onDeleteSelected?: () => void;
  onImageLoad?: (w: number, h: number) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [draft, setDraft] = useState<Draft>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [textEdit, setTextEdit] = useState<TextEdit>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // เปลี่ยนรูป/เครื่องมือระหว่างพิมพ์ข้อความ → ทิ้งที่ค้าง
  useEffect(() => { setTextEdit(null); setDraft(null); }, [src, tool]);

  const toPct = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: cl(((e.clientX - r.left) / r.width) * 100), y: cl(((e.clientY - r.top) / r.height) * 100) };
  };
  const drawing = editable && tool !== "select";
  const selectable = editable && tool === "select";
  const focusWrap = () => wrapRef.current?.focus({ preventScroll: true });

  // ── วาดใหม่: ชั้นรับเมาส์บนรูป (โผล่เฉพาะตอนเลือกเครื่องมือวาด) ──
  const onLayerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drawing || e.button !== 0) return;
    focusWrap();
    const p = toPct(e);
    if (tool === "pin") { onPinAdd?.(p); return; }
    if (tool === "text") { e.preventDefault(); setTextEdit({ id: null, x: p.x, y: p.y, value: "" }); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect?.(null);
    setDraft(tool === "draw" ? { t: "draw", pts: [[p.x, p.y]] } : { t: tool === "circle" ? "circle" : "rect", a: p, b: p });
  };
  const finishDraft = () => {
    const d = draft; if (!d) return;
    setDraft(null);
    let shape: MarkupShape | null = null;
    if (d.t === "draw") {
      if (d.pts.length >= 2) shape = { id: newMarkupId(), t: "draw", pts: d.pts, color };
    } else {
      let x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y);
      let w = Math.abs(d.a.x - d.b.x), h = Math.abs(d.a.y - d.b.y);
      if (w < 1.2 && h < 1.2) {   // แค่คลิก (ไม่ได้ลาก) = กรอบขนาดตั้งต้นรอบจุดที่คลิก
        w = 12; h = 9;
        x = Math.max(0, Math.min(100 - w, d.a.x - w / 2)); y = Math.max(0, Math.min(100 - h, d.a.y - h / 2));
      }
      shape = { id: newMarkupId(), t: d.t, x: r2(x), y: r2(y), w: r2(Math.max(w, 1.2)), h: r2(Math.max(h, 1.2)), color };
    }
    if (shape) { onShapesChange?.([...shapes, shape]); onSelect?.({ kind: "shape", id: shape.id }); }
  };

  // ── ย้ายของเดิม (สิ่งที่วาด: โหมดเลือก · หมุด: ทุกโหมด) ──
  const startDrag = (e: RPointerEvent<Element>, kind: "shape" | "pin", id: string) => {
    e.stopPropagation();
    focusWrap();
    onSelect?.({ kind, id });
    if (!editable || e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ kind, id, start: toPct(e), dx: 0, dy: 0, moved: false });
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (draft) {
      const p = toPct(e);
      if (draft.t === "draw") {
        const last = draft.pts[draft.pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) >= 0.35) setDraft({ t: "draw", pts: [...draft.pts, [p.x, p.y]] });
      } else setDraft({ ...draft, b: p });
      return;
    }
    if (drag) {
      const p = toPct(e);
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) + Math.abs(dy) > 0.3 });
    }
  };
  const onUp = () => {
    if (draft) { finishDraft(); return; }
    const d = drag; if (!d) return;
    setDrag(null);
    if (!d.moved) return;
    if (d.kind === "shape") onShapesChange?.(shapes.map((s) => (s.id === d.id ? moveMarkupShape(s, d.dx, d.dy) : s)));
    else { const pin = pins.find((p) => p.id === d.id); if (pin) onPinMove?.(d.id, { x: cl(pin.x + d.dx), y: cl(pin.y + d.dy) }); }
  };

  const commitText = () => {
    const te = textEdit; if (!te) return;
    setTextEdit(null);
    const v = te.value.trim();
    if (te.id) {
      onShapesChange?.(v ? shapes.map((s) => (s.id === te.id && s.t === "text" ? { ...s, text: v } : s)) : shapes.filter((s) => s.id !== te.id));
    } else if (v) {
      const s: MarkupShape = { id: newMarkupId(), t: "text", x: te.x, y: te.y, text: v, size: MARKUP_TEXT_SIZE, color };
      onShapesChange?.([...shapes, s]);
    }
    focusWrap();
  };

  const shown = (s: MarkupShape): MarkupShape => (drag && drag.kind === "shape" && drag.id === s.id && drag.moved ? moveMarkupShape(s, drag.dx, drag.dy) : s);
  const isSel = (kind: "shape" | "pin", id: string) => selected?.kind === kind && selected.id === id;
  const fontPx = (size: number) => Math.max(10, (size / 100) * (width || 600));

  const svgShape = (s: MarkupShape, extra: SVGAttributes<SVGElement>) => {
    const common = { stroke: s.color, strokeWidth: STROKE, fill: "none", vectorEffect: "non-scaling-stroke" as const, ...extra };
    if (s.t === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} {...common} />;
    if (s.t === "circle") return <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...common} />;
    if (s.t === "draw") return <polyline points={s.pts.map((p) => p.join(",")).join(" ")} strokeLinecap="round" strokeLinejoin="round" {...common} />;
    return null;
  };

  return (
    <div ref={wrapRef} tabIndex={editable ? 0 : -1}
      className={`relative select-none outline-none ${className}`}
      onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onKeyDown={(e) => {
        if (textEdit) return;
        if ((e.key === "Delete" || e.key === "Backspace") && selected && editable) { e.preventDefault(); onDeleteSelected?.(); }
        else if (e.key === "Escape") onSelect?.(null);
      }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="block w-full h-auto pointer-events-none"
        onLoad={(e) => onImageLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />

      {/* สี่เหลี่ยม / วงกลม / เส้น — viewBox 0-100 = % ของรูป */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: "none", overflow: "visible" }}>
        {shapes.filter((s) => s.t !== "text").map((s0) => {
          const s = shown(s0);
          const b = markupShapeBox(s);
          return (
            <g key={s.id}>
              {svgShape(s, {})}
              {/* ที่จับกว้าง ๆ (มองไม่เห็น) ให้คลิกเส้นบาง ๆ ติดง่าย */}
              {selectable && svgShape(s, { stroke: "transparent", strokeWidth: 14, pointerEvents: "stroke", style: { cursor: "move" },
                onPointerDown: (e: RPointerEvent<SVGElement>) => startDrag(e, "shape", s.id) })}
              {isSel("shape", s.id) && (
                <rect x={b.x - 0.8} y={b.y - 0.8} width={b.w + 1.6} height={b.h + 1.6} fill="none" stroke="#2563eb"
                  strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          );
        })}
        {draft && svgShape(
          draft.t === "draw"
            ? { id: "draft", t: "draw", pts: draft.pts, color }
            : { id: "draft", t: draft.t, x: Math.min(draft.a.x, draft.b.x), y: Math.min(draft.a.y, draft.b.y), w: Math.abs(draft.a.x - draft.b.x), h: Math.abs(draft.a.y - draft.b.y), color },
          { strokeDasharray: draft.t === "draw" ? undefined : "5 3" },
        )}
      </svg>

      {/* ข้อความ (HTML — ไม่เพี้ยนตามสัดส่วนรูป) */}
      {shapes.map((s0) => {
        if (s0.t !== "text" || textEdit?.id === s0.id) return null;
        const s = shown(s0) as Extract<MarkupShape, { t: "text" }>;
        const light = s.color === "#ffffff";
        return (
          <div key={s.id}
            onPointerDown={selectable ? (e) => startDrag(e, "shape", s.id) : undefined}
            onDoubleClick={selectable ? () => setTextEdit({ id: s.id, x: s.x, y: s.y, value: s.text }) : undefined}
            title={selectable ? "ลากเพื่อย้าย · ดับเบิลคลิกเพื่อแก้ข้อความ" : undefined}
            className={`absolute whitespace-pre font-semibold leading-tight ${selectable ? "cursor-move" : "pointer-events-none"} ${isSel("shape", s.id) ? "outline outline-1 outline-dashed outline-blue-600 outline-offset-2" : ""}`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, color: s.color, fontSize: fontPx(s.size),
              textShadow: light ? "0 0 3px #0f172a, 0 0 3px #0f172a" : "0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff" }}>
            {s.text}
          </div>
        );
      })}

      {/* ชั้นรับเมาส์ตอนวาด (อยู่ใต้หมุด — กดหมุดเดิมได้แม้อยู่โหมดวาด) */}
      {drawing && (
        <div className="absolute inset-0" style={{ cursor: tool === "text" ? "text" : "crosshair", touchAction: "none" }} onPointerDown={onLayerDown} />
      )}

      {/* หมุดเลข */}
      {pins.map((p) => {
        const d = drag && drag.kind === "pin" && drag.id === p.id && drag.moved ? drag : null;
        const x = d ? cl(p.x + d.dx) : p.x, y = d ? cl(p.y + d.dy) : p.y;
        const sel = isSel("pin", p.id);
        return (
          <button key={p.id} type="button" onPointerDown={(e) => startDrag(e, "pin", p.id)}
            title={editable ? "ลากเพื่อย้ายหมุด" : undefined}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-white font-bold shadow-md flex items-center justify-center leading-none
              ${sel ? "w-8 h-8 text-sm ring-4 ring-violet-300 z-10" : "w-6 h-6 text-xs"} ${p.muted ? "bg-amber-500" : "bg-violet-600"} ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
            style={{ left: `${x}%`, top: `${y}%`, touchAction: "none" }}>
            {p.label}
          </button>
        );
      })}

      {/* กล่องพิมพ์ข้อความ (ใหม่/แก้) */}
      {textEdit && (
        <input autoFocus value={textEdit.value} placeholder="พิมพ์ข้อความ แล้วกด Enter"
          onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitText(); } else if (e.key === "Escape") { setTextEdit(null); focusWrap(); } }}
          onBlur={commitText}
          className="absolute z-20 min-w-[10rem] h-8 px-2 text-sm border-2 border-blue-500 rounded-md bg-white/95 shadow focus:outline-none"
          style={{ left: `${Math.min(textEdit.x, 80)}%`, top: `${textEdit.y}%` }} />
      )}
    </div>
  );
}

// ── แถบเครื่องมือ (ใช้คู่กับ ImageMarkup) ──
const G = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" width="1.05em" height="1.05em" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const TOOLS: { t: MarkupTool; label: string; glyph: ReactNode }[] = [
  { t: "select", label: "เลือก / ย้าย (ลากของที่วาด · ดับเบิลคลิกข้อความเพื่อแก้)", glyph: <G><path d="M3.5 2.5l8.5 5-3.8 1 2.3 4.4-1.7.9-2.3-4.4-3 2.7z" fill="currentColor" stroke="none" /></G> },
  { t: "rect", label: "สี่เหลี่ยม (ลากบนรูป)", glyph: <G><rect x="2.5" y="3.5" width="11" height="9" rx="1" /></G> },
  { t: "circle", label: "วงกลม (ลากบนรูป)", glyph: <G><circle cx="8" cy="8" r="5.5" /></G> },
  { t: "text", label: "ข้อความ (กดบนรูปแล้วพิมพ์)", glyph: <span className="font-bold text-[14px] leading-none">T</span> },
  { t: "draw", label: "วาดเส้น (ลากบนรูป)", glyph: <Icon name="edit" /> },
  { t: "pin", label: "หมุด (กดบนรูป)", glyph: <Icon name="pin" /> },
];

export function ImageMarkupToolbar({
  tool, onTool, color, onColor, onUndo, canUndo = false, onDelete, canDelete = false, tools, pinLabel,
}: {
  tool: MarkupTool;
  onTool: (t: MarkupTool) => void;
  color: string;
  onColor: (c: string) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onDelete?: () => void;
  canDelete?: boolean;
  /** เลือกเฉพาะบางเครื่องมือ (ค่าเริ่ม = ครบทุกตัว) */
  tools?: MarkupTool[];
  /** ชื่อเครื่องมือหมุดตามงาน เช่น "หมุดวัตถุดิบ" */
  pinLabel?: string;
}) {
  const btn = "h-8 w-8 inline-flex items-center justify-center rounded-lg border text-slate-600 transition-colors";
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {TOOLS.filter((d) => !tools || tools.includes(d.t)).map((d) => {
        const label = d.t === "pin" && pinLabel ? `${pinLabel} (กดบนรูป)` : d.label;
        return (
          <button key={d.t} type="button" onClick={() => onTool(d.t)} title={label} aria-label={label} aria-pressed={tool === d.t}
            className={`${btn} ${tool === d.t ? "bg-violet-50 text-violet-700 border-violet-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
            {d.glyph}
          </button>
        );
      })}
      <span className="w-px h-6 bg-slate-200 mx-1" />
      {MARKUP_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onColor(c)} title="สีที่วาด" aria-label={`สี ${c}`} aria-pressed={color === c}
          className={`h-6 w-6 rounded-full border ${color === c ? "ring-2 ring-offset-1 ring-violet-500 border-white" : "border-slate-300"}`}
          style={{ background: c }} />
      ))}
      <span className="w-px h-6 bg-slate-200 mx-1" />
      {onUndo && (
        <button type="button" onClick={onUndo} disabled={!canUndo} title="ย้อนกลับ" aria-label="ย้อนกลับ"
          className={`${btn} bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default`}><Icon name="back" /></button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={!canDelete} title="ลบที่เลือก (ปุ่ม Delete)" aria-label="ลบที่เลือก"
          className={`${btn} bg-white border-slate-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 disabled:cursor-default`}><Icon name="delete" /></button>
      )}
    </div>
  );
}

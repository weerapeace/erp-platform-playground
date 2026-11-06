"use client";

/**
 * ImageMarkup — ของกลาง: วาดบนรูปแบบกระดาน (สี่เหลี่ยม · วงกลม · ลูกศร · ข้อความ · ปากกา · ปากกาเน้น) + หมุดเลข + ป้ายชื่อหมุด
 *
 * ใช้ที่: ใบงานออกแบบ แท็บ "รายละเอียดงาน" (หมุด = วัตถุดิบผูก SKU)
 * ใช้ซ้ำได้: ชี้ตำหนิบนรูป QC · ชี้จุดแก้งานบนรูป comment
 * ต่างจาก ImageRegions (กรอบสี่เหลี่ยมผูกข้อมูล เช่นแผ่น Swatch): ตัวนี้คือ "ปากกาวาดบนรูป" + หมุดเลข
 *
 * v2 (2026-11-06): กดของที่วาด → จุดดึงที่มุมไว้ขยาย/ย่อ (ข้อความ = ปรับขนาดตัวอักษร · ลูกศร = ลากปลาย) · ซูม ·
 *   ป้ายชื่อข้างหมุด (รูปเล็ก + ชื่อ · ลากหลบได้) · แถบปรับ ImageMarkupStyleBar (สี/หนา/ประ/พื้น/ขนาดตัวอักษร/ทำซ้ำ/ลบ)
 * พิกัด = % ของรูป (lib/image-markup) · วาดจริงเป็นพิกเซลตามขนาดกล่อง (เส้น/หัวลูกศรไม่เพี้ยนตามสัดส่วนรูป)
 * ตัวนี้ไม่บันทึกเอง — หน้าที่เรียกใช้เก็บ state + ยิง API · doc: docs/image-markup.md
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type SVGAttributes } from "react";
import { Icon } from "@/components/icon";
import {
  DEFAULT_MARKUP_STYLE, MARKUP_COLORS, MARKUP_HL_WIDTH, MARKUP_PIN_LABEL_OFFSET, MARKUP_TEXT_SIZE, MARKUP_WIDTHS,
  arrowHeadPoints, markupShapeBox, moveMarkupShape, newMarkupId, resizeMarkupShape,
  type MarkupHandle, type MarkupPin, type MarkupSelection, type MarkupShape, type MarkupStyle, type MarkupTool,
} from "@/lib/image-markup";

type Pt = { x: number; y: number };
type Draft = { t: "rect" | "circle" | "arrow"; a: Pt; b: Pt } | { t: "draw"; pts: [number, number][]; hl: boolean } | null;
type Drag = { kind: "shape" | "pin" | "label" | "handle"; id: string; handle?: MarkupHandle; textW?: number; start: Pt; dx: number; dy: number; moved: boolean } | null;
type TextEdit = { id: string | null; x: number; y: number; value: string } | null;

const r2 = (n: number) => Math.round(n * 100) / 100;
const cl = (n: number) => r2(Math.min(100, Math.max(0, n)));
const HANDLE = "absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-blue-600 bg-white shadow";

export function ImageMarkup({
  src, alt = "", shapes, pins = [], editable = false, tool = "select", drawStyle = DEFAULT_MARKUP_STYLE, zoom = 1, showPinLabels = true,
  selected = null, onSelect, onShapesChange, onPinAdd, onPinMove, onPinLabelMove, onDeleteSelected, onUndo, onDuplicate, onToolDone, onImageLoad, className = "",
}: {
  src: string;
  alt?: string;
  shapes: MarkupShape[];
  pins?: MarkupPin[];
  editable?: boolean;
  tool?: MarkupTool;
  /** หน้าตาของที่วาดใหม่ (สี/หนา/ประ/พื้น) */
  drawStyle?: MarkupStyle;
  /** 1 = เต็มกล่อง · มากกว่า 1 = ขยายรูปแล้วเลื่อนดูในกล่อง */
  zoom?: number;
  showPinLabels?: boolean;
  selected?: MarkupSelection | null;
  onSelect?: (sel: MarkupSelection | null) => void;
  /** ทุกการเปลี่ยน (วาด/ย้าย/ขยาย/แก้ข้อความ/ลบ) ส่งชุดใหม่ทั้งชุด — เรียกครั้งเดียวต่อการกระทำ (ไว้เก็บ undo ได้) */
  onShapesChange?: (next: MarkupShape[]) => void;
  /** เครื่องมือหมุด: กดบนรูป → ขอเพิ่มหมุดที่ตำแหน่งนี้ (หน้าเจ้าของสร้างข้อมูลหมุดเอง) */
  onPinAdd?: (pt: Pt) => void;
  onPinMove?: (id: string, pt: Pt) => void;
  /** ลากป้ายชื่อหมุดหลบ → ตำแหน่งป้ายห่างจากหมุด (%) */
  onPinLabelMove?: (id: string, off: { ldx: number; ldy: number }) => void;
  /** ปุ่ม Delete/Backspace ตอนเลือกอยู่ */
  onDeleteSelected?: () => void;
  /** Ctrl+Z */
  onUndo?: () => void;
  /** Ctrl+D (ทำซ้ำของที่เลือก) */
  onDuplicate?: () => void;
  /** วาดกรอบ/วงกลม/ลูกศร/ข้อความเสร็จ 1 ชิ้น → ให้หน้าเจ้าของสลับกลับเครื่องมือเลือก (ปรับต่อได้ทันที เหมือนกระดาน) */
  onToolDone?: () => void;
  onImageLoad?: (w: number, h: number) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Draft>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [textEdit, setTextEdit] = useState<TextEdit>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  // เปลี่ยนรูป/เครื่องมือระหว่างพิมพ์ข้อความ → ทิ้งที่ค้าง
  useEffect(() => { setTextEdit(null); setDraft(null); }, [src, tool]);

  const W = size.w || 1, H = size.h || 1;
  const px = (v: number) => (v / 100) * W, py = (v: number) => (v / 100) * H;
  const toPct = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: cl(((e.clientX - r.left) / r.width) * 100), y: cl(((e.clientY - r.top) / r.height) * 100) };
  };
  const drawing = editable && tool !== "select";
  const selectable = editable && tool === "select";
  const focusWrap = () => outerRef.current?.focus({ preventScroll: true });

  // ── วาดใหม่: ชั้นรับเมาส์บนรูป (โผล่เฉพาะตอนเลือกเครื่องมือวาด) ──
  const onLayerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drawing || e.button !== 0) return;
    focusWrap();
    const p = toPct(e);
    if (tool === "pin") { onPinAdd?.(p); return; }
    if (tool === "text") { e.preventDefault(); setTextEdit({ id: null, x: p.x, y: p.y, value: "" }); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect?.(null);
    if (tool === "draw" || tool === "hl") setDraft({ t: "draw", pts: [[p.x, p.y]], hl: tool === "hl" });
    else setDraft({ t: tool === "circle" ? "circle" : tool === "arrow" ? "arrow" : "rect", a: p, b: p });
  };
  const finishDraft = () => {
    const d = draft; if (!d) return;
    setDraft(null);
    const st = drawStyle;
    let shape: MarkupShape | null = null;
    if (d.t === "draw") {
      if (d.pts.length >= 2) shape = { id: newMarkupId(), t: "draw", pts: d.pts, color: st.color, sw: d.hl ? undefined : st.sw, dash: !d.hl && st.dash ? true : undefined, hl: d.hl || undefined };
    } else if (d.t === "arrow") {
      const tiny = Math.abs(d.a.x - d.b.x) + Math.abs(d.a.y - d.b.y) < 2;
      const a = tiny ? { x: cl(d.a.x - 10), y: cl(d.a.y - 8) } : d.a;   // แค่คลิก = ลูกศรชี้มาที่จุดนั้น
      shape = { id: newMarkupId(), t: "arrow", x1: a.x, y1: a.y, x2: d.b.x, y2: d.b.y, color: st.color, sw: st.sw, dash: st.dash || undefined };
    } else {
      let x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y);
      let w = Math.abs(d.a.x - d.b.x), h = Math.abs(d.a.y - d.b.y);
      if (w < 1.2 && h < 1.2) {   // แค่คลิก (ไม่ได้ลาก) = กรอบขนาดตั้งต้นรอบจุดที่คลิก
        w = 12; h = 9;
        x = Math.max(0, Math.min(100 - w, d.a.x - w / 2)); y = Math.max(0, Math.min(100 - h, d.a.y - h / 2));
      }
      shape = { id: newMarkupId(), t: d.t, x: r2(x), y: r2(y), w: r2(Math.max(w, 1.2)), h: r2(Math.max(h, 1.2)), color: st.color, sw: st.sw, dash: st.dash || undefined, fill: st.fill || undefined };
    }
    if (!shape) return;
    onShapesChange?.([...shapes, shape]);
    onSelect?.({ kind: "shape", id: shape.id });
    if (shape.t !== "draw") onToolDone?.();
  };

  // ── ลาก: ย้ายของที่วาด (โหมดเลือก) · จุดดึงขยาย · หมุด · ป้ายหมุด ──
  const startDrag = (e: RPointerEvent<Element>, kind: NonNullable<Drag>["kind"], id: string, handle?: MarkupHandle) => {
    e.stopPropagation();
    focusWrap();
    if (kind !== "handle") onSelect?.({ kind: kind === "label" ? "pin" : kind, id });
    if (!editable || e.button !== 0) return;
    let textW: number | undefined;
    if (kind === "handle" && handle === "se") {
      const box = (e.currentTarget as HTMLElement).parentElement;   // จุดดึงของข้อความอยู่ในกล่องข้อความ
      if (box && wrapRef.current) textW = (box.offsetWidth / wrapRef.current.clientWidth) * 100;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ kind, id, handle, textW, start: toPct(e), dx: 0, dy: 0, moved: false });
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (draft) {
      const p = toPct(e);
      if (draft.t === "draw") {
        const last = draft.pts[draft.pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) >= 0.35) setDraft({ ...draft, pts: [...draft.pts, [p.x, p.y]] });
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
    else if (d.kind === "handle" && d.handle) onShapesChange?.(shapes.map((s) => (s.id === d.id ? resizeMarkupShape(s, d.handle!, d.dx, d.dy, d.textW) : s)));
    else {
      const pin = pins.find((p) => p.id === d.id); if (!pin) return;
      if (d.kind === "pin") onPinMove?.(d.id, { x: cl(pin.x + d.dx), y: cl(pin.y + d.dy) });
      else onPinLabelMove?.(d.id, { ldx: r2((pin.ldx ?? MARKUP_PIN_LABEL_OFFSET.ldx) + d.dx), ldy: r2((pin.ldy ?? MARKUP_PIN_LABEL_OFFSET.ldy) + d.dy) });
    }
  };

  const commitText = () => {
    const te = textEdit; if (!te) return;
    setTextEdit(null);
    const v = te.value.trim();
    if (te.id) {
      onShapesChange?.(v ? shapes.map((s) => (s.id === te.id && s.t === "text" ? { ...s, text: v } : s)) : shapes.filter((s) => s.id !== te.id));
    } else if (v) {
      const s: MarkupShape = { id: newMarkupId(), t: "text", x: te.x, y: te.y, text: v, size: MARKUP_TEXT_SIZE, color: drawStyle.color };
      onShapesChange?.([...shapes, s]);
      onSelect?.({ kind: "shape", id: s.id });
      onToolDone?.();
    }
    focusWrap();
  };

  const shown = (s: MarkupShape): MarkupShape => {
    if (!drag || drag.id !== s.id || !drag.moved) return s;
    if (drag.kind === "shape") return moveMarkupShape(s, drag.dx, drag.dy);
    if (drag.kind === "handle" && drag.handle) return resizeMarkupShape(s, drag.handle, drag.dx, drag.dy, drag.textW);
    return s;
  };
  const isSel = (kind: "shape" | "pin", id: string) => selected?.kind === kind && selected.id === id;
  const fontPx = (size: number) => Math.max(9, (size / 100) * W);
  const strokeOf = (s: { sw?: number }) => s.sw ?? DEFAULT_MARKUP_STYLE.sw;

  /** วาดสิ่งที่วาด 1 ชิ้นเป็นพิกเซล (extra = ที่จับ/เส้นร่าง) */
  const svgShape = (s: MarkupShape, extra: SVGAttributes<SVGElement>, hit = false): ReactNode => {
    if (s.t === "text") return null;
    const w = s.t === "draw" && s.hl ? MARKUP_HL_WIDTH : strokeOf(s);
    const dash = s.t !== "draw" || !s.hl ? (s.dash ? `${w * 3} ${w * 2}` : undefined) : undefined;
    const base = { stroke: s.color, strokeWidth: w, strokeDasharray: hit ? undefined : dash, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...extra };
    if (s.t === "rect") return <rect x={px(s.x)} y={py(s.y)} width={px(s.w)} height={py(s.h)} rx={2} {...base} fill={!hit && s.fill ? s.color : base.fill} fillOpacity={!hit && s.fill ? 0.15 : undefined} />;
    if (s.t === "circle") return <ellipse cx={px(s.x + s.w / 2)} cy={py(s.y + s.h / 2)} rx={px(s.w / 2)} ry={py(s.h / 2)} {...base} fill={!hit && s.fill ? s.color : base.fill} fillOpacity={!hit && s.fill ? 0.15 : undefined} />;
    if (s.t === "draw") return <polyline points={s.pts.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")} {...base} strokeOpacity={!hit && s.hl ? 0.35 : undefined} />;
    if (s.t !== "arrow") return null;
    const x1 = px(s.x1), y1 = py(s.y1), x2 = px(s.x2), y2 = py(s.y2);
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} {...base} />
        {!hit && <polygon points={arrowHeadPoints(x1, y1, x2, y2, 9 + w * 2.2)} fill={s.color} stroke={s.color} strokeWidth={1} strokeLinejoin="round" />}
      </g>
    );
  };
  const hitProps = (s: MarkupShape): SVGAttributes<SVGElement> => ({
    stroke: "transparent", strokeWidth: 14,
    pointerEvents: (s.t === "rect" || s.t === "circle") && s.fill ? "all" : "stroke",
    style: { cursor: "move" },
    onPointerDown: (e) => startDrag(e, "shape", s.id),
  });

  const selShape = selected?.kind === "shape" ? shapes.find((s) => s.id === selected.id) : undefined;
  const selShown = selShape ? shown(selShape) : undefined;

  return (
    <div ref={outerRef} tabIndex={editable ? 0 : -1}
      className={`relative outline-none ${zoom > 1 ? "overflow-auto max-h-[75vh]" : ""} ${className}`}
      onKeyDown={(e) => {
        if (textEdit) return;
        const mod = e.ctrlKey || e.metaKey;
        if ((e.key === "Delete" || e.key === "Backspace") && selected && editable) { e.preventDefault(); onDeleteSelected?.(); }
        else if (mod && e.key.toLowerCase() === "z" && onUndo) { e.preventDefault(); onUndo(); }
        else if (mod && e.key.toLowerCase() === "d" && onDuplicate && selected?.kind === "shape") { e.preventDefault(); onDuplicate(); }
        else if (e.key === "Escape") onSelect?.(null);
      }}>
      <div ref={wrapRef} className="relative select-none" style={{ width: `${zoom * 100}%` }}
        onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} draggable={false} className="block w-full h-auto pointer-events-none"
          onLoad={(e) => onImageLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />

        {/* สิ่งที่วาด + เส้นโยงป้ายหมุด (พิกเซล = ขนาดกล่องจริง) */}
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ pointerEvents: "none", overflow: "visible" }}>
          {showPinLabels && pins.map((p) => {
            if (!p.tag) return null;
            const d = drag && drag.id === p.id && drag.moved ? drag : null;
            const x = d?.kind === "pin" ? cl(p.x + d.dx) : p.x, y = d?.kind === "pin" ? cl(p.y + d.dy) : p.y;
            const ldx = (p.ldx ?? MARKUP_PIN_LABEL_OFFSET.ldx) + (d?.kind === "label" ? d.dx : 0);
            const ldy = (p.ldy ?? MARKUP_PIN_LABEL_OFFSET.ldy) + (d?.kind === "label" ? d.dy : 0);
            return <line key={`l-${p.id}`} x1={px(x)} y1={py(y)} x2={px(x + ldx)} y2={py(y + ldy)} stroke="#7c3aed" strokeWidth={1.25} />;
          })}
          {shapes.filter((s) => s.t !== "text").map((s0) => {
            const s = shown(s0);
            return (
              <g key={s.id}>
                {svgShape(s, {})}
                {selectable && svgShape(s, hitProps(s), true)}
              </g>
            );
          })}
          {selShown && selShown.t !== "text" && (() => {
            const b = markupShapeBox(selShown);
            return <rect x={px(b.x) - 4} y={py(b.y) - 4} width={px(b.w) + 8} height={py(b.h) + 8} fill="none" stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3" />;
          })()}
          {draft && svgShape(
            draft.t === "draw"
              ? { id: "draft", t: "draw", pts: draft.pts, color: drawStyle.color, sw: drawStyle.sw, hl: draft.hl || undefined }
              : draft.t === "arrow"
              ? { id: "draft", t: "arrow", x1: draft.a.x, y1: draft.a.y, x2: draft.b.x, y2: draft.b.y, color: drawStyle.color, sw: drawStyle.sw, dash: drawStyle.dash }
              : { id: "draft", t: draft.t, x: Math.min(draft.a.x, draft.b.x), y: Math.min(draft.a.y, draft.b.y), w: Math.abs(draft.a.x - draft.b.x), h: Math.abs(draft.a.y - draft.b.y), color: drawStyle.color, sw: drawStyle.sw, dash: true },
            {},
          )}
        </svg>

        {/* ข้อความ (HTML — ไม่เพี้ยนตามสัดส่วนรูป) · เลือกอยู่ = จุดดึงมุมขวาล่างไว้ปรับขนาด */}
        {shapes.map((s0) => {
          if (s0.t !== "text" || textEdit?.id === s0.id) return null;
          const s = shown(s0) as Extract<MarkupShape, { t: "text" }>;
          const light = s.color === "#ffffff";
          const on = isSel("shape", s.id);
          return (
            <div key={s.id}
              onPointerDown={selectable ? (e) => startDrag(e, "shape", s.id) : undefined}
              onDoubleClick={selectable ? () => setTextEdit({ id: s.id, x: s.x, y: s.y, value: s.text }) : undefined}
              title={selectable ? "ลากเพื่อย้าย · ดับเบิลคลิกเพื่อแก้ข้อความ · ลากจุดมุมเพื่อปรับขนาด" : undefined}
              className={`absolute whitespace-pre font-semibold leading-tight ${s.bg ? "rounded px-1 bg-white/90" : ""} ${selectable ? "cursor-move" : "pointer-events-none"} ${on ? "outline outline-1 outline-dashed outline-blue-600 outline-offset-2" : ""}`}
              style={{ left: `${s.x}%`, top: `${s.y}%`, color: s.color, fontSize: fontPx(s.size),
                textShadow: s.bg ? undefined : light ? "0 0 3px #0f172a, 0 0 3px #0f172a" : "0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff" }}>
              {s.text}
              {on && selectable && (
                <span className={`${HANDLE} cursor-nwse-resize`} style={{ left: "100%", top: "100%" }} onPointerDown={(e) => startDrag(e, "handle", s.id, "se")} />
              )}
            </div>
          );
        })}

        {/* จุดดึงของกรอบ/วงกลม/ลูกศรที่เลือก */}
        {selectable && selShown && selShown.t !== "text" && selShown.t !== "draw" && (
          selShown.t === "arrow"
            ? ([["p1", selShown.x1, selShown.y1], ["p2", selShown.x2, selShown.y2]] as const).map(([h, x, y]) => (
                <span key={h} className={`${HANDLE} cursor-move rounded-full`} style={{ left: `${x}%`, top: `${y}%` }} onPointerDown={(e) => startDrag(e, "handle", selShown.id, h)} />
              ))
            : ([["nw", selShown.x, selShown.y], ["ne", selShown.x + selShown.w, selShown.y], ["sw", selShown.x, selShown.y + selShown.h], ["se", selShown.x + selShown.w, selShown.y + selShown.h]] as const).map(([h, x, y]) => (
                <span key={h} className={`${HANDLE} ${h === "nw" || h === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} style={{ left: `${x}%`, top: `${y}%` }}
                  onPointerDown={(e) => startDrag(e, "handle", selShown.id, h)} />
              ))
        )}

        {/* ชั้นรับเมาส์ตอนวาด (อยู่ใต้หมุด/ป้าย — กดหมุดเดิมได้แม้อยู่โหมดวาด) */}
        {drawing && (
          <div className="absolute inset-0" style={{ cursor: tool === "text" ? "text" : "crosshair", touchAction: "none" }} onPointerDown={onLayerDown} />
        )}

        {/* ป้ายชื่อข้างหมุด (รูปเล็ก + ชื่อ) — ลากหลบได้ */}
        {showPinLabels && pins.map((p) => {
          if (!p.tag) return null;
          const d = drag && drag.id === p.id && drag.moved ? drag : null;
          const x = d?.kind === "pin" ? cl(p.x + d.dx) : p.x, y = d?.kind === "pin" ? cl(p.y + d.dy) : p.y;
          const ldx = (p.ldx ?? MARKUP_PIN_LABEL_OFFSET.ldx) + (d?.kind === "label" ? d.dx : 0);
          const ldy = (p.ldy ?? MARKUP_PIN_LABEL_OFFSET.ldy) + (d?.kind === "label" ? d.dy : 0);
          const sel = isSel("pin", p.id);
          return (
            <div key={`t-${p.id}`} onPointerDown={(e) => startDrag(e, "label", p.id)} title={editable ? "ลากป้ายเพื่อย้ายหลบ" : undefined}
              className={`absolute z-[5] flex max-w-[190px] items-center gap-1.5 rounded-lg border bg-white/95 py-1 pl-1 pr-2 shadow-sm ${sel ? "border-violet-500 ring-2 ring-violet-200" : "border-violet-200"} ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
              style={{ left: `${x + ldx}%`, top: `${y + ldy}%`, transform: `translate(${ldx < 0 ? "-100%" : "0"}, -50%)`, touchAction: "none" }}>
              {p.tag.imageUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.tag.imageUrl} alt="" draggable={false} className="h-6 w-6 shrink-0 rounded object-cover bg-slate-100" />
                : <span className="h-6 w-6 shrink-0 rounded bg-slate-100" />}
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[11px] font-semibold text-violet-700">{p.tag.title}</span>
                {p.tag.sub && <span className={`block truncate text-[10px] ${p.muted ? "text-amber-600" : "text-slate-600"}`}>{p.tag.sub}</span>}
              </span>
            </div>
          );
        })}

        {/* หมุดเลข */}
        {pins.map((p) => {
          const d = drag && drag.kind === "pin" && drag.id === p.id && drag.moved ? drag : null;
          const x = d ? cl(p.x + d.dx) : p.x, y = d ? cl(p.y + d.dy) : p.y;
          const sel = isSel("pin", p.id);
          return (
            <button key={p.id} type="button" onPointerDown={(e) => startDrag(e, "pin", p.id)}
              title={editable ? "ลากเพื่อย้ายหมุด" : undefined}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-white font-bold shadow-md flex items-center justify-center leading-none
                ${sel ? "w-8 h-8 text-sm ring-4 ring-violet-300" : "w-6 h-6 text-xs"} ${p.muted ? "bg-amber-500" : "bg-violet-600"} ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
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
            className="absolute z-30 min-w-[10rem] h-8 px-2 text-sm border-2 border-blue-500 rounded-md bg-white/95 shadow focus:outline-none"
            style={{ left: `${Math.min(textEdit.x, 80)}%`, top: `${textEdit.y}%` }} />
        )}
      </div>
    </div>
  );
}

// ── แถบเครื่องมือ (ใช้คู่กับ ImageMarkup) ──
const G = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" width="1.05em" height="1.05em" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const TOOLS: { t: MarkupTool; label: string; glyph: ReactNode }[] = [
  { t: "select", label: "เลือก / ย้าย / ขยาย (กดของที่วาด แล้วลากจุดมุม)", glyph: <G><path d="M3.5 2.5l8.5 5-3.8 1 2.3 4.4-1.7.9-2.3-4.4-3 2.7z" fill="currentColor" stroke="none" /></G> },
  { t: "rect", label: "สี่เหลี่ยม (ลากบนรูป)", glyph: <G><rect x="2.5" y="3.5" width="11" height="9" rx="1" /></G> },
  { t: "circle", label: "วงกลม (ลากบนรูป)", glyph: <G><circle cx="8" cy="8" r="5.5" /></G> },
  { t: "arrow", label: "ลูกศร (ลากจากต้นไปปลาย)", glyph: <G><path d="M3 13L13 3M7 3h6v6" /></G> },
  { t: "text", label: "ข้อความ (กดบนรูปแล้วพิมพ์)", glyph: <span className="font-bold text-[14px] leading-none">T</span> },
  { t: "draw", label: "ปากกา (ลากบนรูป)", glyph: <Icon name="edit" /> },
  { t: "hl", label: "ปากกาเน้น สีจาง (ลากทับจุดที่จะเน้น)", glyph: <G><path d="M2.5 12.5h11" strokeWidth={4} strokeOpacity={0.45} /><path d="M5 9.5l5-5 2 2-5 5H5z" /></G> },
  { t: "pin", label: "หมุด (กดบนรูป)", glyph: <Icon name="pin" /> },
];
const btnCls = "h-8 min-w-8 px-1.5 inline-flex items-center justify-center rounded-lg border text-slate-600 transition-colors";

export function ImageMarkupToolbar({
  tool, onTool, onUndo, canUndo = false, tools, pinLabel, zoom, onZoom,
}: {
  tool: MarkupTool;
  onTool: (t: MarkupTool) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  /** เลือกเฉพาะบางเครื่องมือ (ค่าเริ่ม = ครบทุกตัว) */
  tools?: MarkupTool[];
  /** ชื่อเครื่องมือหมุดตามงาน เช่น "หมุดวัตถุดิบ" */
  pinLabel?: string;
  /** ซูม (ส่งมาพร้อม onZoom = โชว์ปุ่ม − / % / ＋) */
  zoom?: number;
  onZoom?: (z: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {TOOLS.filter((d) => !tools || tools.includes(d.t)).map((d) => {
        const label = d.t === "pin" && pinLabel ? `${pinLabel} (กดบนรูป)` : d.label;
        return (
          <button key={d.t} type="button" onClick={() => onTool(d.t)} title={label} aria-label={label} aria-pressed={tool === d.t}
            className={`${btnCls} ${tool === d.t ? "bg-violet-50 text-violet-700 border-violet-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
            {d.glyph}
          </button>
        );
      })}
      {onZoom && zoom != null && (
        <>
          <span className="w-px h-6 bg-slate-200 mx-1" />
          <button type="button" onClick={() => onZoom(Math.max(1, r2(zoom - 0.5)))} disabled={zoom <= 1} title="ซูมออก" aria-label="ซูมออก"
            className={`${btnCls} bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40`}>−</button>
          <button type="button" onClick={() => onZoom(1)} title="พอดีกล่อง" className="h-8 w-12 text-xs text-slate-500 tabular-nums hover:text-slate-800">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => onZoom(Math.min(4, r2(zoom + 0.5)))} disabled={zoom >= 4} title="ซูมเข้า" aria-label="ซูมเข้า"
            className={`${btnCls} bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40`}>＋</button>
        </>
      )}
      {onUndo && (
        <>
          <span className="w-px h-6 bg-slate-200 mx-1" />
          <button type="button" onClick={onUndo} disabled={!canUndo} title="ย้อนกลับ (Ctrl+Z)" aria-label="ย้อนกลับ"
            className={`${btnCls} bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default`}><Icon name="back" /></button>
        </>
      )}
    </div>
  );
}

/**
 * แถบปรับหน้าตา (ใช้คู่กับ ImageMarkup) — เลือกของอยู่ = ปรับชิ้นนั้น · ไม่ได้เลือก = ตั้งค่าของที่จะวาดใหม่
 * กรอบ/วงกลม/ลูกศร/เส้น: สี · หนา (บาง/กลาง/หนา) · เส้นประ · พื้นจาง (กรอบ/วงกลม) — ข้อความ: สี · A− / A＋ · พื้นขาว
 */
export function ImageMarkupStyleBar({ shape, style, onStyle, onShapeChange, onDuplicate, onDelete }: {
  /** ของที่เลือกอยู่ (null = ยังไม่ได้เลือก → ปรับค่าของที่จะวาดใหม่) */
  shape: MarkupShape | null;
  style: MarkupStyle;
  onStyle: (patch: Partial<MarkupStyle>) => void;
  onShapeChange: (next: MarkupShape) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const color = shape ? shape.color : style.color;
  const isText = shape?.t === "text";
  const isHl = shape?.t === "draw" && !!shape.hl;
  const sw = shape && shape.t !== "text" ? shape.sw ?? DEFAULT_MARKUP_STYLE.sw : style.sw;
  const dash = shape && shape.t !== "text" ? !!shape.dash : style.dash;
  const canFill = !shape || shape.t === "rect" || shape.t === "circle";
  const fill = shape && (shape.t === "rect" || shape.t === "circle") ? !!shape.fill : style.fill;
  const set = (patch: Partial<MarkupStyle>) => {
    onStyle(patch);   // จำเป็นค่าตั้งต้นของที่จะวาดต่อด้วย
    if (!shape) return;
    if (shape.t === "text") { if (patch.color) onShapeChange({ ...shape, color: patch.color }); return; }
    let next = { ...shape, ...(patch.color ? { color: patch.color } : {}), ...(patch.sw != null ? { sw: patch.sw } : {}), ...(patch.dash != null ? { dash: patch.dash || undefined } : {}) } as MarkupShape;
    if ((next.t === "rect" || next.t === "circle") && patch.fill != null) next = { ...next, fill: patch.fill || undefined };
    onShapeChange(next);
  };
  const chip = (on: boolean) => `h-7 px-2 text-xs rounded-md border ${on ? "bg-violet-50 text-violet-700 border-violet-300 font-medium" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`;
  return (
    <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <span className="text-[11px] text-slate-400 mr-0.5">{shape ? "ปรับที่เลือก:" : "ของที่จะวาด:"}</span>
      {MARKUP_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => set({ color: c })} title="สี" aria-label={`สี ${c}`} aria-pressed={color === c}
          className={`h-6 w-6 rounded-full border ${color === c ? "ring-2 ring-offset-1 ring-violet-500 border-white" : "border-slate-300"}`} style={{ background: c }} />
      ))}
      <span className="w-px h-5 bg-slate-200 mx-0.5" />
      {isText && shape?.t === "text" ? (
        <>
          <button type="button" className={chip(false)} onClick={() => onShapeChange({ ...shape, size: Math.max(1, r2(shape.size - 0.5)) })} title="ตัวอักษรเล็กลง">A−</button>
          <span className="w-8 text-center text-xs tabular-nums text-slate-600">{shape.size.toFixed(1)}</span>
          <button type="button" className={chip(false)} onClick={() => onShapeChange({ ...shape, size: Math.min(15, r2(shape.size + 0.5)) })} title="ตัวอักษรใหญ่ขึ้น">A＋</button>
          <button type="button" className={chip(!!shape.bg)} onClick={() => onShapeChange({ ...shape, bg: shape.bg ? undefined : true })} title="พื้นขาวรองข้อความ">พื้นขาว</button>
        </>
      ) : !isHl && (
        <>
          {MARKUP_WIDTHS.map((w) => (
            <button key={w.v} type="button" className={chip(sw === w.v)} onClick={() => set({ sw: w.v })} title={`เส้น${w.label}`}>{w.label}</button>
          ))}
          <button type="button" className={chip(dash)} onClick={() => set({ dash: !dash })} title="เส้นประ">เส้นประ</button>
          {canFill && <button type="button" className={chip(fill)} onClick={() => set({ fill: !fill })} title="ใส่พื้นสีจาง">พื้นจาง</button>}
        </>
      )}
      {shape && (onDuplicate || onDelete) && (
        <>
          <span className="w-px h-5 bg-slate-200 mx-0.5" />
          {onDuplicate && <button type="button" onClick={onDuplicate} title="ทำซ้ำ (Ctrl+D)" className={chip(false)}>ทำซ้ำ</button>}
          {onDelete && <button type="button" onClick={onDelete} title="ลบ (Delete)" aria-label="ลบ"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Icon name="delete" /></button>}
        </>
      )}
    </div>
  );
}

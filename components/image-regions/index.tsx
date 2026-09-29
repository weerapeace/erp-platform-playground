"use client";

/**
 * ImageRegions — ของกลาง: "จุดบนรูป" (กรอบสี่เหลี่ยมบนรูปภาพ ที่ผูกกับข้อมูลอะไรก็ได้)
 *
 * 2 โหมด:
 *   view — ซ่อนเส้นกรอบทั้งหมด (เห็นแต่รูป) · ชี้ที่จุด = ป้ายข้อมูลลอยขึ้น · กด = onRegionClick
 *   edit — เห็นกรอบ · ลากบนที่ว่าง = วาดกรอบใหม่ · ลากกรอบ = ย้าย · ลากมุม = ปรับขนาด · กด = เลือก
 *
 * พิกัดทุกตัวเป็น "เปอร์เซ็นต์ของรูป" (0-100) → ตรงตำแหน่งทุกขนาดจอ/ทุกระดับซูม
 *
 * ใช้ที่: แท็บ 🎨 Swatch (components/sku-swatch-browser) · ใช้ซ้ำได้กับงานอื่น เช่น ชี้ตำหนิบนรูป QC
 * ห้ามเขียนตัวลากกรอบเองในหน้าโมดูล — ใช้ตัวนี้
 */

import { useCallback, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from "react";

export type Region = { id: string; x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
type Drag =
  | { kind: "draw"; sx: number; sy: number; cx: number; cy: number }
  | { kind: "move"; id: string; sx: number; sy: number; start: Region; moved: boolean }
  | { kind: "resize"; id: string; corner: Corner; start: Region };

const MIN = 1.2;   // ขนาดกรอบเล็กสุด (% ของรูป) — เล็กกว่านี้ถือว่าเป็นการคลิก ไม่ใช่การวาด
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 100) / 100;

export function ImageRegions<T extends Region>({
  src, alt = "", regions, mode, selectedId, onSelect, onChange, onCreate, onRegionClick, renderTooltip, regionLabel, isMuted, className = "",
}: {
  src: string;
  alt?: string;
  regions: T[];
  mode: "view" | "edit";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** (edit) ย้าย/ปรับขนาดกรอบ — ส่งกรอบที่เปลี่ยนกลับไป */
  onChange?: (id: string, rect: { x: number; y: number; w: number; h: number }) => void;
  /** (edit) วาดกรอบใหม่เสร็จ */
  onCreate?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** (view) กดที่จุด */
  onRegionClick?: (region: T) => void;
  /** (view) ป้ายข้อมูลตอนชี้ที่จุด */
  renderTooltip?: (region: T) => ReactNode;
  /** (edit) ข้อความสั้นบนกรอบ เช่น รหัส SKU */
  regionLabel?: (region: T) => string | null;
  /** (edit) กรอบที่ยังไม่สมบูรณ์ (เช่น ยังไม่ผูกข้อมูล) → เส้นประสีส้ม */
  isMuted?: (region: T) => boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  /** ตำแหน่งเมาส์ → % ของรูป */
  const pct = useCallback((e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  }, []);

  /** จับเมาส์ไว้กับรูป (ลากออกนอกรูปแล้วยังตามได้) — บางเบราว์เซอร์/อุปกรณ์โยน error ได้ จึงกันไว้ */
  const capture = (pointerId: number) => { try { boxRef.current?.setPointerCapture(pointerId); } catch { /* ignore */ } };

  const startDraw = (e: RPointerEvent<HTMLDivElement>) => {
    if (mode !== "edit" || e.button !== 0) return;
    const p = pct(e);
    capture(e.pointerId);
    setDrag({ kind: "draw", sx: p.x, sy: p.y, cx: p.x, cy: p.y });
  };
  const startMove = (e: RPointerEvent<HTMLDivElement>, r: T) => {
    if (mode !== "edit" || e.button !== 0) return;
    e.stopPropagation();
    const p = pct(e);
    capture(e.pointerId);
    onSelect?.(r.id);
    setDrag({ kind: "move", id: r.id, sx: p.x, sy: p.y, start: { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h }, moved: false });
  };
  const startResize = (e: RPointerEvent<HTMLSpanElement>, r: T, corner: Corner) => {
    if (mode !== "edit" || e.button !== 0) return;
    e.stopPropagation();
    capture(e.pointerId);
    onSelect?.(r.id);
    setDrag({ kind: "resize", id: r.id, corner, start: { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h } });
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = pct(e);
    if (drag.kind === "draw") { setDrag({ ...drag, cx: p.x, cy: p.y }); return; }
    if (drag.kind === "move") {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (!drag.moved && Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;
      const s = drag.start;
      onChange?.(drag.id, { x: round(clamp(s.x + dx, 0, 100 - s.w)), y: round(clamp(s.y + dy, 0, 100 - s.h)), w: s.w, h: s.h });
      if (!drag.moved) setDrag({ ...drag, moved: true });
      return;
    }
    // resize — มุมตรงข้ามอยู่กับที่
    const s = drag.start;
    const fx = drag.corner.includes("w") ? s.x + s.w : s.x;   // จุดยึด (มุมตรงข้าม)
    const fy = drag.corner.includes("n") ? s.y + s.h : s.y;
    const x1 = Math.min(fx, p.x), x2 = Math.max(fx, p.x), y1 = Math.min(fy, p.y), y2 = Math.max(fy, p.y);
    onChange?.(drag.id, { x: round(x1), y: round(y1), w: round(Math.max(MIN, x2 - x1)), h: round(Math.max(MIN, y2 - y1)) });
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    try { boxRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (drag.kind === "draw") {
      const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy);
      const w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
      if (w >= MIN && h >= MIN) onCreate?.({ x: round(x), y: round(y), w: round(w), h: round(h) });
      else onSelect?.(null);   // แค่คลิกที่ว่าง = ยกเลิกการเลือก
    }
    setDrag(null);
  };

  const drawing = drag?.kind === "draw" ? {
    x: Math.min(drag.sx, drag.cx), y: Math.min(drag.sy, drag.cy), w: Math.abs(drag.cx - drag.sx), h: Math.abs(drag.cy - drag.sy),
  } : null;
  const hovered = mode === "view" && hoverId ? regions.find((r) => r.id === hoverId) ?? null : null;

  return (
    <div ref={boxRef}
      className={`relative inline-block align-top select-none ${mode === "edit" ? "cursor-crosshair" : ""} ${className}`}
      style={mode === "edit" ? { touchAction: "none" } : undefined}
      onPointerDown={startDraw} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="block w-full h-auto pointer-events-none" />

      {regions.map((r) => {
        const style = { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` };
        if (mode === "view") {
          // โหมดดู: ไม่มีเส้นกรอบ ไม่มีพื้นหลัง — เห็นแต่รูป (ชี้แล้วมีป้ายข้อมูล)
          return (
            <button key={r.id} type="button" style={{ ...style, outline: "none", boxShadow: "none" }} aria-label={regionLabel?.(r) ?? "จุดบนรูป"}
              onClick={() => onRegionClick?.(r)}
              onPointerEnter={() => setHoverId(r.id)} onPointerLeave={() => setHoverId((h) => (h === r.id ? null : h))}
              onFocus={() => setHoverId(r.id)} onBlur={() => setHoverId((h) => (h === r.id ? null : h))}
              className="absolute bg-transparent border-0 p-0 m-0 cursor-pointer outline-none" />
          );
        }
        const sel = r.id === selectedId;
        const muted = isMuted?.(r) ?? false;
        const label = regionLabel?.(r) ?? null;
        return (
          <div key={r.id} style={style} onPointerDown={(e) => startMove(e, r)}
            className={`absolute cursor-move ${sel ? "border-2 border-indigo-500 bg-indigo-400/15 z-[2]" : muted ? "border-2 border-dashed border-amber-500 bg-amber-300/10 z-[1]" : "border-2 border-emerald-500 bg-emerald-300/10 z-[1]"}`}>
            {label && <span className={`absolute left-0 top-0 max-w-full truncate text-[10px] leading-none px-1 py-0.5 text-white ${sel ? "bg-indigo-600" : muted ? "bg-amber-600" : "bg-emerald-600"}`}>{label}</span>}
            {sel && (["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
              <span key={c} onPointerDown={(e) => startResize(e, r, c)}
                className={`absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm ${c.includes("n") ? "-top-1.5" : "-bottom-1.5"} ${c.includes("w") ? "-left-1.5" : "-right-1.5"} ${c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} />
            ))}
          </div>
        );
      })}

      {/* กรอบที่กำลังวาด */}
      {drawing && drawing.w > 0 && drawing.h > 0 && (
        <div className="absolute border-2 border-dashed border-indigo-500 bg-indigo-400/15 pointer-events-none z-[3]"
          style={{ left: `${drawing.x}%`, top: `${drawing.y}%`, width: `${drawing.w}%`, height: `${drawing.h}%` }} />
      )}

      {/* ป้ายข้อมูลตอนชี้ (โหมดดู) — อยู่เหนือจุด ถ้าชิดขอบบนให้ลงไปอยู่ใต้จุด */}
      {hovered && renderTooltip && (
        <div className="absolute z-[5] pointer-events-none"
          style={hovered.y < 14
            ? { left: `${clamp(hovered.x + hovered.w / 2, 12, 88)}%`, top: `${hovered.y + hovered.h}%`, transform: "translate(-50%, 6px)" }
            : { left: `${clamp(hovered.x + hovered.w / 2, 12, 88)}%`, top: `${hovered.y}%`, transform: "translate(-50%, calc(-100% - 6px))" }}>
          <div className="rounded-lg bg-slate-900/95 text-white shadow-xl px-2.5 py-1.5 text-[12px] whitespace-nowrap max-w-[18rem]">{renderTooltip(hovered)}</div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * ImageRegions — ของกลาง: "จุดบนรูป" (กรอบบนรูปภาพ ที่ผูกกับข้อมูลอะไรก็ได้)
 *
 * 2 โหมด:
 *   view — ซ่อนเส้นกรอบทั้งหมด (เห็นแต่รูป) · ชี้ที่จุด = ป้ายข้อมูลลอยขึ้น · กด = onRegionClick
 *          · ใส่ renderMenu = กดแล้วมี "เมนูเล็ก" ลอยตรงจุดที่กด (ไม่ใช่ป๊อปอัป) · selecting = โหมดติ๊กเลือกหลายจุด
 *   edit — เห็นกรอบ · ลากบนที่ว่าง = วาดกรอบใหม่ · ลากกรอบ = ย้าย · ลากมุม = ปรับขนาด (cornerMode "resize") หรือ ดัดเฉพาะมุมนั้น (cornerMode "bend") · กด = เลือก
 *
 * กรอบดัดมุม (2026-11-14): region มี points = จุดมุม [[x,y], …] → วาดเป็นรูปหลายเหลี่ยม (SVG) ทั้งโหมด edit และ view (กดได้เฉพาะในรูปทรง)
 *   x/y/w/h ของ region ควรเป็นกรอบที่ครอบจุดทั้งหมด (onChange ส่งให้ทั้งกรอบครอบ + points)
 *
 * พิกัดทุกตัวเป็น "เปอร์เซ็นต์ของรูป" (0-100) → ตรงตำแหน่งทุกขนาดจอ/ทุกระดับซูม
 *
 * ใช้ที่: แท็บ 🎨 Swatch (components/sku-swatch-browser) · ครอปกรอบอิสระ (ImageFreeCropModal) · ใช้ซ้ำได้กับงานอื่น เช่น ชี้ตำหนิบนรูป QC
 * ห้ามเขียนตัวลากกรอบเองในหน้าโมดูล — ใช้ตัวนี้
 */

import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from "react";

/** จุด [x, y] เป็น % ของรูป */
export type RegionPoint = [number, number];
export type Region = { id: string; x: number; y: number; w: number; h: number; points?: RegionPoint[] | null };
type Box = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
type Drag =
  | { kind: "draw"; sx: number; sy: number; cx: number; cy: number }
  | { kind: "move"; id: string; sx: number; sy: number; start: Box; pts: RegionPoint[] | null; moved: boolean }
  | { kind: "resize"; id: string; corner: Corner; start: Box }
  | { kind: "bend"; id: string; k: number; pts: RegionPoint[] };

const MIN = 1.2;   // ขนาดกรอบเล็กสุด (% ของรูป) — เล็กกว่านี้ถือว่าเป็นการคลิก ไม่ใช่การวาด
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 100) / 100;
const CORNERS: Corner[] = ["nw", "ne", "se", "sw"];   // ลำดับเดียวกับจุดมุม (ซ้ายบน → ขวาบน → ขวาล่าง → ซ้ายล่าง)
const cornersOf = (b: Box): RegionPoint[] => [[round(b.x), round(b.y)], [round(b.x + b.w), round(b.y)], [round(b.x + b.w), round(b.y + b.h)], [round(b.x), round(b.y + b.h)]];
function bboxOfPts(pts: RegionPoint[]): Box {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: round(x), y: round(y), w: round(Math.max(0.5, Math.max(...xs) - x)), h: round(Math.max(0.5, Math.max(...ys) - y)) };
}
const boxOf = (r: Region): Box => (r.points && r.points.length >= 3 ? bboxOfPts(r.points) : r);
const polyStr = (pts: RegionPoint[]) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

export function ImageRegions<T extends Region>({
  src, alt = "", regions, mode, selectedId, onSelect, onChange, onCreate, onRegionClick, renderTooltip, regionLabel, isMuted, className = "",
  renderMenu, selecting = false, checkedIds, onToggleCheck, pulseId, overlay, onPointClick, editCursor, cornerMode = "resize",
}: {
  src: string;
  alt?: string;
  regions: T[];
  mode: "view" | "edit";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** (edit) ย้าย/ปรับขนาด/ดัดมุมกรอบ — ส่งกรอบครอบที่เปลี่ยนกลับไป + จุดมุม (กรอบดัดมุม) */
  onChange?: (id: string, rect: { x: number; y: number; w: number; h: number }, points?: RegionPoint[] | null) => void;
  /** (edit) วาดกรอบใหม่เสร็จ */
  onCreate?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** (view) กดที่จุด */
  onRegionClick?: (region: T) => void;
  /** (view) ป้ายข้อมูลตอนชี้ที่จุด */
  renderTooltip?: (region: T) => ReactNode;
  /** (view) เมนูเล็กตอนกดที่จุด — ใส่แล้ว "กด = เปิดเมนู" แทน onRegionClick · เรียก close() เมื่อเลือกรายการแล้ว */
  renderMenu?: (region: T, close: () => void) => ReactNode;
  /** (view) โหมดเลือกหลายจุด — กด = ติ๊ก/เอาออก (ไม่เปิดเมนู) · โชว์วงกลมติ๊กบนทุกจุด */
  selecting?: boolean;
  checkedIds?: Set<string>;
  onToggleCheck?: (region: T) => void;
  /** (view) ชี้ตำแหน่งจุดนี้ด้วยวงกะพริบชั่วคราว ~6 วิ + เลื่อนจอไปหา (ใช้ตอนเปิดจากลิงก์ "อยู่บนแผ่นไหน") */
  pulseId?: string | null;
  /** (edit) ข้อความสั้นบนกรอบ เช่น รหัส SKU */
  regionLabel?: (region: T) => string | null;
  /** (edit) กรอบที่ยังไม่สมบูรณ์ (เช่น ยังไม่ผูกข้อมูล) → เส้นประสีส้ม */
  isMuted?: (region: T) => boolean;
  className?: string;
  /** ชั้นทับรูป (ไม่รับเมาส์) เช่น พื้นมืดนอกกรอบครอป — วางในกล่องรูป ใช้ % เดียวกับกรอบ */
  overlay?: ReactNode;
  /** โหมด edit: คลิก (ไม่ลาก) บนรูป → จุดที่คลิก (% ของรูป) + กรอบที่คลิกโดน (ไม่โดน = null) · ใส่แล้วคลิกที่ว่างจะไม่ยกเลิกการเลือก */
  onPointClick?: (pt: { x: number; y: number }, region: T | null) => void;
  /** เคอร์เซอร์ตอน edit (ค่าเริ่ม crosshair) */
  editCursor?: string;
  /** (edit) ลากมุมกรอบที่เลือก: "resize" = ปรับขนาด (มุมตรงข้ามอยู่กับที่ · ค่าเริ่ม) · "bend" = ขยับเฉพาะมุมนั้น (กรอบเบี้ยวตามชิ้นที่ถ่ายเอียง) */
  cornerMode?: "resize" | "bend";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);   // เมนูเล็ก (ตำแหน่ง = จุดที่กด เป็น % ของรูป)
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // ปิดเมนู: กดนอกเมนู / กด Esc (จับก่อนหน้าที่ครอบอยู่ ไม่ให้ Esc ปิดทั้งหน้า) / ออกจากโหมดดู / เข้าโหมดเลือกหลายจุด
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setMenu(null); } };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  }, [menu]);
  useEffect(() => { if (mode !== "view" || selecting) setMenu(null); }, [mode, selecting]);

  // จุดกะพริบบอกตำแหน่ง — โชว์ ~6 วิ แล้วหายเอง (ตอนดูปกติต้องไม่มีอะไรบังรูป)
  const [pulseOn, setPulseOn] = useState(false);
  const pulseRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pulseId) { setPulseOn(false); return; }
    setPulseOn(true);
    const t1 = setTimeout(() => { try { pulseRef.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); } catch { /* ignore */ } }, 250);
    const t2 = setTimeout(() => setPulseOn(false), 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pulseId]);
  const pulseRegion = mode === "view" && pulseOn && pulseId ? regions.find((r) => r.id === pulseId) ?? null : null;

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
  const startMove = (e: RPointerEvent<Element>, r: T) => {
    if (mode !== "edit" || e.button !== 0) return;
    e.stopPropagation();
    const p = pct(e);
    capture(e.pointerId);
    onSelect?.(r.id);
    const pts = r.points && r.points.length >= 3 ? r.points.map((q) => [...q] as RegionPoint) : null;
    setDrag({ kind: "move", id: r.id, sx: p.x, sy: p.y, start: boxOf(r), pts, moved: false });
  };
  const startResize = (e: RPointerEvent<HTMLSpanElement>, r: T, corner: Corner) => {
    if (mode !== "edit" || e.button !== 0) return;
    e.stopPropagation();
    capture(e.pointerId);
    onSelect?.(r.id);
    setDrag({ kind: "resize", id: r.id, corner, start: boxOf(r) });
  };
  const startBend = (e: RPointerEvent<HTMLSpanElement>, r: T, k: number) => {
    if (mode !== "edit" || e.button !== 0) return;
    e.stopPropagation();
    capture(e.pointerId);
    onSelect?.(r.id);
    const pts = r.points && r.points.length >= 3 ? r.points.map((q) => [...q] as RegionPoint) : cornersOf(r);
    setDrag({ kind: "bend", id: r.id, k, pts });
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = pct(e);
    if (drag.kind === "draw") { setDrag({ ...drag, cx: p.x, cy: p.y }); return; }
    if (drag.kind === "bend") {
      const pts = drag.pts.map((q, i) => (i === drag.k ? [round(p.x), round(p.y)] as RegionPoint : q));
      onChange?.(drag.id, bboxOfPts(pts), pts);
      return;
    }
    if (drag.kind === "move") {
      const dx0 = p.x - drag.sx, dy0 = p.y - drag.sy;
      if (!drag.moved && Math.abs(dx0) < 0.3 && Math.abs(dy0) < 0.3) return;
      const s = drag.start;
      const dx = clamp(dx0, -s.x, 100 - s.w - s.x), dy = clamp(dy0, -s.y, 100 - s.h - s.y);
      if (drag.pts) {
        const pts = drag.pts.map((q) => [round(q[0] + dx), round(q[1] + dy)] as RegionPoint);
        onChange?.(drag.id, bboxOfPts(pts), pts);
      } else {
        onChange?.(drag.id, { x: round(s.x + dx), y: round(s.y + dy), w: s.w, h: s.h });
      }
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
      else if (onPointClick) onPointClick({ x: drag.sx, y: drag.sy }, null);   // คลิกที่ว่าง → ผู้เรียกจัดการ (เช่น คลิกที่สี = ตีกรอบ)
      else onSelect?.(null);   // แค่คลิกที่ว่าง = ยกเลิกการเลือก
    } else if (drag.kind === "move" && !drag.moved && onPointClick) {
      const r = regions.find((x) => x.id === drag.id) ?? null;
      onPointClick({ x: drag.sx, y: drag.sy }, r);   // คลิกในกรอบ (ไม่ได้ลาก)
    }
    setDrag(null);
  };

  const drawing = drag?.kind === "draw" ? {
    x: Math.min(drag.sx, drag.cx), y: Math.min(drag.sy, drag.cy), w: Math.abs(drag.cx - drag.sx), h: Math.abs(drag.cy - drag.sy),
  } : null;
  const hoveredR = mode === "view" && hoverId && !menu ? regions.find((r) => r.id === hoverId) ?? null : null;
  const hovered = hoveredR ? boxOf(hoveredR) : null;
  const menuRegion = mode === "view" && menu ? regions.find((r) => r.id === menu.id) ?? null : null;
  const onViewClick = (e: { clientX: number; clientY: number }, r: T) => {
    if (selecting) { onToggleCheck?.(r); return; }
    if (!renderMenu) { onRegionClick?.(r); return; }
    // กดด้วยคีย์บอร์ด (Enter/Space) ไม่มีพิกัดเมาส์ → ใช้กลางจุดแทน
    const b = boxOf(r);
    const p = e.clientX === 0 && e.clientY === 0 ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : pct(e);
    setMenu((m) => (m && m.id === r.id ? null : { id: r.id, x: p.x, y: p.y }));
  };
  const polyRegions = regions.filter((r) => r.points && r.points.length >= 3);
  const checkCircle = (on: boolean) => (
    <span className={`absolute left-1 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] leading-none shadow-md ${on ? "bg-indigo-600 text-white ring-2 ring-white" : "bg-white/85 text-transparent ring-1 ring-slate-400"}`}>✓</span>
  );
  const strokeOf = (r: T) => (r.id === selectedId ? "#6366f1" : isMuted?.(r) ? "#f59e0b" : "#10b981");

  return (
    <div ref={boxRef}
      className={`relative inline-block align-top select-none ${mode === "edit" && !editCursor ? "cursor-crosshair" : ""} ${className}`}
      style={mode === "edit" ? { touchAction: "none", ...(editCursor ? { cursor: editCursor } : {}) } : undefined}
      onPointerDown={startDraw} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="block w-full h-auto pointer-events-none" />
      {overlay && <div className="absolute inset-0 pointer-events-none">{overlay}</div>}

      {/* กรอบดัดมุม (รูปหลายเหลี่ยม) — กด/ลากได้เฉพาะในรูปทรง */}
      {polyRegions.length > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden={mode === "edit"}>
          {polyRegions.map((r) => mode === "view" ? (
            <polygon key={r.id} points={polyStr(r.points!)} fill="transparent" stroke="none" style={{ pointerEvents: "all", cursor: "pointer", outline: "none" }}
              role="button" tabIndex={0} aria-label={regionLabel?.(r) ?? "จุดบนรูป"} aria-pressed={selecting ? !!checkedIds?.has(r.id) : undefined}
              onClick={(e) => onViewClick(e, r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onViewClick({ clientX: 0, clientY: 0 }, r); } }}
              onPointerEnter={() => setHoverId(r.id)} onPointerLeave={() => setHoverId((h) => (h === r.id ? null : h))}
              onFocus={() => setHoverId(r.id)} onBlur={() => setHoverId((h) => (h === r.id ? null : h))} />
          ) : (
            <polygon key={r.id} points={polyStr(r.points!)} fill={r.id === selectedId ? "rgba(129,140,248,0.15)" : isMuted?.(r) ? "rgba(252,211,77,0.1)" : "rgba(110,231,183,0.1)"}
              stroke={strokeOf(r)} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={r.id !== selectedId && isMuted?.(r) ? "5 3" : undefined}
              style={{ pointerEvents: "all", cursor: "move" }} onPointerDown={(e) => startMove(e, r)} />
          ))}
        </svg>
      )}

      {regions.map((r) => {
        const b = boxOf(r);
        const isPoly = !!(r.points && r.points.length >= 3);
        const style = { left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` };
        if (mode === "view") {
          if (isPoly) return selecting ? <span key={r.id} className="absolute pointer-events-none" style={style}>{checkCircle(!!checkedIds?.has(r.id))}</span> : null;
          // โหมดดู: ไม่มีเส้นกรอบ ไม่มีพื้นหลัง — เห็นแต่รูป (ชี้แล้วมีป้ายข้อมูล)
          return (
            <button key={r.id} type="button" style={{ ...style, outline: "none", boxShadow: "none" }} aria-label={regionLabel?.(r) ?? "จุดบนรูป"}
              onClick={(e) => onViewClick(e, r)}
              aria-pressed={selecting ? !!checkedIds?.has(r.id) : undefined}
              onPointerEnter={() => setHoverId(r.id)} onPointerLeave={() => setHoverId((h) => (h === r.id ? null : h))}
              onFocus={() => setHoverId(r.id)} onBlur={() => setHoverId((h) => (h === r.id ? null : h))}
              className="absolute bg-transparent border-0 p-0 m-0 cursor-pointer outline-none">
              {/* โหมดเลือกหลายจุด: วงกลมติ๊กมุมซ้ายบน (ไม่ใช่เส้นกรอบ) — ว่าง = ยังไม่เลือก · ✓ = เลือกแล้ว */}
              {selecting && checkCircle(!!checkedIds?.has(r.id))}
            </button>
          );
        }
        const sel = r.id === selectedId;
        const muted = isMuted?.(r) ?? false;
        const label = regionLabel?.(r) ?? null;
        const labelEl = label && <span className={`absolute left-0 top-0 max-w-full truncate text-[10px] leading-none px-1 py-0.5 text-white pointer-events-none ${sel ? "bg-indigo-600" : muted ? "bg-amber-600" : "bg-emerald-600"}`}>{label}</span>;
        if (isPoly) {
          // กรอบดัดมุม: เส้น/พื้นวาดใน SVG ด้านบน · ตรงนี้วางแค่ป้าย + จุดจับมุม (เฉพาะกรอบที่เลือก)
          return (
            <div key={r.id} className="contents">
              <div className="absolute pointer-events-none z-[2]" style={style}>{labelEl}</div>
              {sel && r.points!.map((pt, k) => (
                <span key={k} onPointerDown={(e) => startBend(e, r, k)} title="ลากเพื่อดัดมุมนี้"
                  className="absolute z-[3] w-3 h-3 -ml-1.5 -mt-1.5 bg-white border-2 border-indigo-600 rounded-full cursor-crosshair" style={{ left: `${pt[0]}%`, top: `${pt[1]}%` }} />
              ))}
            </div>
          );
        }
        return (
          <div key={r.id} style={style} onPointerDown={(e) => startMove(e, r)}
            className={`absolute cursor-move ${sel ? "border-2 border-indigo-500 bg-indigo-400/15 z-[2]" : muted ? "border-2 border-dashed border-amber-500 bg-amber-300/10 z-[1]" : "border-2 border-emerald-500 bg-emerald-300/10 z-[1]"}`}>
            {labelEl}
            {sel && CORNERS.map((c, k) => (
              <span key={c} onPointerDown={(e) => (cornerMode === "bend" ? startBend(e, r, k) : startResize(e, r, c))}
                title={cornerMode === "bend" ? "ลากเพื่อดัดมุมนี้" : undefined}
                className={`absolute w-3 h-3 bg-white border-2 border-indigo-600 ${cornerMode === "bend" ? "rounded-full cursor-crosshair" : `rounded-sm ${c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} ${c.includes("n") ? "-top-1.5" : "-bottom-1.5"} ${c.includes("w") ? "-left-1.5" : "-right-1.5"}`} />
            ))}
          </div>
        );
      })}

      {/* กรอบที่กำลังวาด */}
      {drawing && drawing.w > 0 && drawing.h > 0 && (
        <div className="absolute border-2 border-dashed border-indigo-500 bg-indigo-400/15 pointer-events-none z-[3]"
          style={{ left: `${drawing.x}%`, top: `${drawing.y}%`, width: `${drawing.w}%`, height: `${drawing.h}%` }} />
      )}

      {/* จุดกะพริบบอกตำแหน่ง (ชั่วคราว) */}
      {pulseRegion && (() => { const b = boxOf(pulseRegion); return (
        <span ref={pulseRef} className="absolute z-[4] pointer-events-none flex items-center justify-center"
          style={{ left: `${b.x + b.w / 2}%`, top: `${b.y + b.h / 2}%`, width: 0, height: 0 }}>
          <span className="absolute w-10 h-10 rounded-full bg-pink-500/60 animate-ping" />
          <span className="absolute w-4 h-4 rounded-full bg-pink-500 ring-2 ring-white shadow-lg" />
        </span>
      ); })()}

      {/* เมนูเล็กตอนกดที่จุด (โหมดดู) — ลอยตรงจุดที่กด · ชิดขอบขวา/ล่างจะพลิกไปอีกด้าน */}
      {menuRegion && menu && renderMenu && (
        <div ref={menuRef} role="menu" className="absolute z-[6]"
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: `${menu.x}%`, top: `${menu.y}%`, transform: `translate(${menu.x > 62 ? "calc(-100% - 6px)" : "6px"}, ${menu.y > 68 ? "calc(-100% - 6px)" : "6px"})` }}>
          {renderMenu(menuRegion, closeMenu)}
        </div>
      )}

      {/* ป้ายข้อมูลตอนชี้ (โหมดดู) — อยู่เหนือจุด ถ้าชิดขอบบนให้ลงไปอยู่ใต้จุด */}
      {hovered && hoveredR && renderTooltip && (
        <div className="absolute z-[5] pointer-events-none"
          style={hovered.y < 14
            ? { left: `${clamp(hovered.x + hovered.w / 2, 12, 88)}%`, top: `${hovered.y + hovered.h}%`, transform: "translate(-50%, 6px)" }
            : { left: `${clamp(hovered.x + hovered.w / 2, 12, 88)}%`, top: `${hovered.y}%`, transform: "translate(-50%, calc(-100% - 6px))" }}>
          <div className="rounded-lg bg-slate-900/95 text-white shadow-xl px-2.5 py-1.5 text-[12px] whitespace-nowrap max-w-[18rem]">{renderTooltip(hoveredR)}</div>
        </div>
      )}
    </div>
  );
}

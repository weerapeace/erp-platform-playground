"use client";

/**
 * ZoomBox — ของกลาง: กล่องดูรูป/เนื้อหาที่ซูมได้ (เจ้าของขอ 2026-11-14 "ต้องซูมรูปได้ ctrl + scroll เมาส์")
 *
 *   Ctrl (หรือ ⌘) + หมุนลูกกลิ้ง = ซูมเข้า/ออก "ตรงจุดที่เมาส์ชี้" · หมุนลูกกลิ้งเฉย ๆ = เลื่อนดูส่วนอื่น (เหมือนเดิม)
 *   ปุ่ม − / % / + = ZoomControls (วางที่ไหนก็ได้ · กด % = กลับพอดีกล่อง)
 *   100% = พอดีกล่อง (ใช้ aspect = กว้าง/สูง ของเนื้อหา คำนวณให้เห็นทั้งรูป) · เนื้อหาข้างใน (เช่น ImageRegions) กว้าง = ขนาดพอดี × zoom
 *   → กรอบที่ใช้ % ของรูปยังตรงตำแหน่งทุกระดับซูม
 *
 * ใช้ที่: แผงผ้า Swatch (ป๊อปเพิ่มแผ่น · โหมดตั้งค่า · โหมดดู) · ครอปกรอบอิสระ (ImageFreeCropModal)
 * ห้ามใช้: ดูรูปเต็มจอเลื่อนรูปถัดไป → ImageLightbox · วาด/เขียนบนรูป → ImageMarkup (มีซูมของตัวเอง)
 *
 *   const [zoom, setZoom] = useState(1);
 *   <ZoomControls zoom={zoom} onZoom={setZoom} />
 *   <ZoomBox zoom={zoom} onZoom={setZoom} aspect={w / h} className="h-[60vh]">…</ZoomBox>
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
const clampZoom = (z: number, min = ZOOM_MIN, max = ZOOM_MAX) => Math.round(Math.min(max, Math.max(min, z)) * 100) / 100;

export function ZoomBox({ zoom, onZoom, aspect, maxFitWidth, padding = 8, className = "", children, min = ZOOM_MIN, max = ZOOM_MAX }: {
  zoom: number;
  onZoom: (z: number) => void;
  /** กว้าง/สูง ของเนื้อหา (เช่น รูป) — มีค่า = 100% พอดีทั้งกว้างและสูง · ไม่ส่ง = พอดีความกว้างกล่อง */
  aspect?: number | null;
  /** กว้างสุดตอน 100% (px) เช่น 900 = รูปไม่ยืดเต็มจอกว้าง ๆ */
  maxFitWidth?: number;
  /** ระยะขอบในกล่อง (px) */
  padding?: number;
  /** ขนาดกล่อง (ต้องมีความสูง เช่น h-[52vh] หรือ flex-1 min-h-0) */
  className?: string;
  children: ReactNode;
  min?: number;
  max?: number;
}) {
  const vpRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // จุดที่ต้องคงไว้ใต้เมาส์หลังซูม (สัดส่วนของเนื้อหา + ตำแหน่งเมาส์บนจอ)
  const anchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const measure = () => setBox({ w: vp.clientWidth, h: vp.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;   // ไม่กด Ctrl = เลื่อนตามปกติ
      e.preventDefault();                      // กันเบราว์เซอร์ซูมทั้งหน้า
      const c = contentRef.current?.getBoundingClientRect();
      if (c && c.width > 0 && c.height > 0) anchor.current = { fx: (e.clientX - c.left) / c.width, fy: (e.clientY - c.top) / c.height, cx: e.clientX, cy: e.clientY };
      const step = Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.0025)));   // ทัชแพด (deltaY เล็ก) ซูมนุ่ม · ลูกกลิ้งทีละ ~20%
      const next = clampZoom(zoomRef.current * step, min, max);
      if (next !== zoomRef.current) onZoomRef.current(next);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); vp.removeEventListener("wheel", onWheel); };
  }, [min, max]);

  const availW = Math.max(40, box.w - padding * 2), availH = Math.max(40, box.h - padding * 2);
  let fitW = aspect && aspect > 0 ? Math.min(availW, availH * aspect) : availW;
  if (maxFitWidth) fitW = Math.min(fitW, maxFitWidth);
  const contentW = Math.round(fitW * zoom);

  // หลังซูม: เลื่อนกล่องให้จุดเดิมยังอยู่ใต้เมาส์ (ซูมจากปุ่ม = ยึดกลางกล่อง)
  useLayoutEffect(() => {
    const vp = vpRef.current, el = contentRef.current;
    if (!vp || !el) return;
    const c = el.getBoundingClientRect();
    let a = anchor.current;
    anchor.current = null;
    if (!a) { const v = vp.getBoundingClientRect(); a = { fx: 0.5, fy: 0.5, cx: v.left + v.width / 2, cy: v.top + v.height / 2 }; }
    vp.scrollLeft += c.left + a.fx * c.width - a.cx;
    vp.scrollTop += c.top + a.fy * c.height - a.cy;
  }, [zoom]);

  return (
    // ⚠ ไม่ใส่ relative เอง — ผู้เรียกมักส่ง absolute inset-0 (relative ของ Tailwind ชนะ absolute → กล่องยุบเหลือสูงเท่าเนื้อหา)
    <div ref={vpRef} className={`overflow-auto ${className}`}>
      {/* เล็กกว่ากล่อง = จัดกลาง · ใหญ่กว่า = เลื่อนดูได้ */}
      <div className="flex items-start justify-center min-h-full" style={{ width: Math.max(box.w, contentW + padding * 2), padding }}>
        {box.w > 0 && <div ref={contentRef} style={{ width: contentW }} className="shrink-0">{children}</div>}
      </div>
    </div>
  );
}

/** ปุ่มซูม − / % / + (กด % = กลับ 100% พอดีกล่อง) */
export function ZoomControls({ zoom, onZoom, min = ZOOM_MIN, max = ZOOM_MAX, className = "" }: { zoom: number; onZoom: (z: number) => void; min?: number; max?: number; className?: string }) {
  return (
    <div className={`inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden ${className}`} title="Ctrl + หมุนลูกกลิ้งบนรูป = ซูมตรงจุดที่ชี้">
      <button type="button" onClick={() => onZoom(clampZoom(zoom / 1.25, min, max))} disabled={zoom <= min} className="w-8 h-8 text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label="ซูมออก">−</button>
      <button type="button" onClick={() => onZoom(min)} className="w-12 h-8 text-center text-[12px] text-slate-500 tabular-nums hover:text-slate-800" title="กลับพอดีกล่อง">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => onZoom(clampZoom(zoom * 1.25, min, max))} disabled={zoom >= max} className="w-8 h-8 text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label="ซูมเข้า">+</button>
    </div>
  );
}

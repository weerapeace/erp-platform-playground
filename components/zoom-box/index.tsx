"use client";

/**
 * ZoomBox — ของกลาง: กล่องดูรูป/เนื้อหาที่ซูมได้ (เจ้าของขอ 2026-11-14 "ต้องซูมรูปได้ ctrl + scroll เมาส์")
 *
 *   Ctrl (หรือ ⌘) + หมุนลูกกลิ้ง = ซูมเข้า/ออก "ตรงจุดที่เมาส์ชี้" · หมุนลูกกลิ้งเฉย ๆ = เลื่อนดูส่วนอื่น (เหมือนเดิม)
 *   มือถือ: สองนิ้ว = ถ่างซูมตรงกลางนิ้ว + ลากเลื่อน · dragPan = กดลูกกลิ้ง/Space ค้างแล้วลาก = เลื่อน · wheelZoom = หมุนลูกกลิ้งเฉย ๆ ก็ซูม
 *   ปุ่ม − / % / + = ZoomControls (วางที่ไหนก็ได้ · กด % = กลับพอดีกล่อง)
 *   100% = พอดีกล่อง (ใช้ aspect = กว้าง/สูง ของเนื้อหา คำนวณให้เห็นทั้งรูป) · เนื้อหาข้างใน (เช่น ImageRegions) กว้าง = ขนาดพอดี × zoom
 *   → กรอบที่ใช้ % ของรูปยังตรงตำแหน่งทุกระดับซูม
 *
 * ใช้ที่: แผงผ้า Swatch (ป๊อปเพิ่มแผ่น · โหมดตั้งค่า · โหมดดู) · ครอปกรอบอิสระ (ImageFreeCropModal) · ป๊อปแกะจากรูป (สตูดิโอแพทเทิร์น)
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

export function ZoomBox({ zoom, onZoom, aspect, maxFitWidth, padding = 8, className = "", children, min = ZOOM_MIN, max = ZOOM_MAX, dragPan = false, wheelZoom = false, style }: {
  zoom: number;
  /** สไตล์ของกล่อง (เช่น ความสูงที่วัดได้จริง) */
  style?: React.CSSProperties;
  /** true = หมุนลูกกลิ้งเฉย ๆ บนกล่องก็ซูม (ไม่ต้องกด Ctrl) — เลื่อนรูปใช้ dragPan / แถบเลื่อนแทน */
  wheelZoom?: boolean;
  /** true = กดลูกกลิ้งค้าง / Space ค้าง แล้วลาก = เลื่อนรูป (เมื่อคลิกซ้ายบนรูปมีหน้าที่อื่น) */
  dragPan?: boolean;
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
  const wheelZoomRef = useRef(wheelZoom);
  wheelZoomRef.current = wheelZoom;

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    // ⚠ วัด "ขนาดนอก" (รวมแถบเลื่อน) — ห้ามใช้ clientWidth/Height: แถบเลื่อนโผล่ → กล่องแคบลง → รูปเล็กลง → แถบหาย → รูปใหญ่ขึ้น → แถบโผล่…
    //   วนไม่จบ = จอกระพริบรัว (เจ้าของเจอ 2026-11-14 อัดวิดีโอมา)
    const measure = () => { const r = vp.getBoundingClientRect(); setBox((b) => (Math.abs(b.w - r.width) < 1 && Math.abs(b.h - r.height) < 1 ? b : { w: r.width, h: r.height })); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || wheelZoomRef.current)) return;   // ไม่กด Ctrl = เลื่อนตามปกติ (เว้นแต่เปิด wheelZoom)
      e.preventDefault();                      // กันเบราว์เซอร์ซูมทั้งหน้า
      const c = contentRef.current?.getBoundingClientRect();
      if (c && c.width > 0 && c.height > 0) anchor.current = { fx: (e.clientX - c.left) / c.width, fy: (e.clientY - c.top) / c.height, cx: e.clientX, cy: e.clientY };
      const step = Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.0025)));   // ทัชแพด (deltaY เล็ก) ซูมนุ่ม · ลูกกลิ้งทีละ ~20%
      const next = clampZoom(zoomRef.current * step, min, max);
      if (next !== zoomRef.current) onZoomRef.current(next);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    // มือถือ/แท็บเล็ต: สองนิ้ว = ถ่างซูมตรงกลางระหว่างนิ้ว + ลากเลื่อนไปพร้อมกัน (เพิ่ม 2026-11-16 · ป๊อปแกะจากรูป)
    //   นิ้วเดียว = ปล่อยให้เนื้อหาข้างในใช้ต่อ (เช่น ระบายยางลบ) หรือเลื่อนตามปกติ
    let pinch: { d: number; z: number; fx: number; fy: number } | null = null;
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) { pinch = null; return; }
      const m = mid(e.touches), c = contentRef.current?.getBoundingClientRect();
      if (!c || !(c.width > 0 && c.height > 0) || !(m.d > 0)) return;
      pinch = { d: m.d, z: zoomRef.current, fx: (m.x - c.left) / c.width, fy: (m.y - c.top) / c.height };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();                      // กันเบราว์เซอร์ซูม/เลื่อนทั้งหน้า
      const m = mid(e.touches), next = clampZoom(pinch.z * (m.d / pinch.d), min, max);
      if (next !== zoomRef.current) { anchor.current = { fx: pinch.fx, fy: pinch.fy, cx: m.x, cy: m.y }; onZoomRef.current(next); return; }
      const c = contentRef.current?.getBoundingClientRect();   // ซูมเท่าเดิม = เลื่อนอย่างเดียว
      if (c) { vp.scrollLeft += c.left + pinch.fx * c.width - m.x; vp.scrollTop += c.top + pinch.fy * c.height - m.y; }
    };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    vp.addEventListener("touchstart", onTouchStart, { passive: true });
    vp.addEventListener("touchmove", onTouchMove, { passive: false });
    vp.addEventListener("touchend", onTouchEnd);
    vp.addEventListener("touchcancel", onTouchEnd);
    return () => {
      ro.disconnect(); vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("touchstart", onTouchStart); vp.removeEventListener("touchmove", onTouchMove);
      vp.removeEventListener("touchend", onTouchEnd); vp.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [min, max]);

  // dragPan: กดลูกกลิ้งค้าง หรือกด Space ค้าง แล้วลาก = เลื่อนรูป (ใช้เมื่อคลิกซ้ายบนรูปมีหน้าที่อื่น เช่น ระบายยางลบ)
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp || !dragPan) return;
    let space = false, drag: { x: number; y: number; sl: number; st: number; id: number } | null = null;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const kd = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { space = true; vp.style.cursor = "grab"; if (vp.matches(":hover")) e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") { space = false; vp.style.cursor = ""; } };
    const down = (e: PointerEvent) => {
      if (!(e.button === 1 || (space && e.button === 0))) return;
      e.preventDefault(); e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop, id: e.pointerId };
      vp.setPointerCapture(e.pointerId); vp.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => { if (!drag || e.pointerId !== drag.id) return; e.stopPropagation(); vp.scrollLeft = drag.sl - (e.clientX - drag.x); vp.scrollTop = drag.st - (e.clientY - drag.y); };
    const up = (e: PointerEvent) => { if (!drag || e.pointerId !== drag.id) return; e.stopPropagation(); drag = null; vp.style.cursor = space ? "grab" : ""; };
    const aux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };   // กันเบราว์เซอร์เปิดโหมดเลื่อนอัตโนมัติของปุ่มกลาง
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    vp.addEventListener("pointerdown", down, true); vp.addEventListener("pointermove", move, true); vp.addEventListener("pointerup", up, true); vp.addEventListener("pointercancel", up, true);
    vp.addEventListener("mousedown", aux);
    return () => {
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      vp.removeEventListener("pointerdown", down, true); vp.removeEventListener("pointermove", move, true); vp.removeEventListener("pointerup", up, true); vp.removeEventListener("pointercancel", up, true);
      vp.removeEventListener("mousedown", aux);
    };
  }, [dragPan]);

  const availW = Math.max(40, box.w - padding * 2), availH = Math.max(40, box.h - padding * 2);
  let fitW = aspect && aspect > 0 ? Math.min(availW, availH * aspect) : availW;
  if (maxFitWidth) fitW = Math.min(fitW, maxFitWidth);
  const contentW = Math.floor(fitW * zoom);   // ปัดลง — ปัดขึ้นแม้ 1px ก็ล้นกล่อง

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
    // 100% = พอดีกล่องอยู่แล้ว → ไม่มีแถบเลื่อน (overflow visible: เมนู/ป้ายบนรูปไม่ถูกตัด) · ซูมเกิน 100% ค่อยเลื่อนได้
    <div ref={vpRef} style={style} className={`${zoom > 1 ? "overflow-auto" : "overflow-visible"} ${className}`}>
      {/* เล็กกว่ากล่อง = จัดกลาง · ใหญ่กว่า = เลื่อนดูได้ (ความกว้างขั้นต่ำ = กล่อง ด้วย CSS ไม่ใช่ตัวเลขที่วัด → ไม่ล้นเพราะแถบเลื่อน) */}
      <div className="flex items-center justify-center" style={{ minWidth: "100%", minHeight: "100%", width: "max-content", padding }}>
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

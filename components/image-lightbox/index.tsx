"use client";

// ============================================================
// ImageLightbox (ของกลาง) — กดรูปแล้วขยายเต็มจอ + เลื่อนดูถัดไป/ก่อนหน้า + ซูม/เลื่อนดู
// ลูกศรซ้าย/ขวา · Esc ปิด · ปัดนิ้ว (มือถือ) · กดพื้นหลังปิด
// ซูม: ล้อเมาส์ · ดับเบิลคลิก · จีบนิ้ว (pinch) · ปุ่ม +/− · ลากเลื่อนเมื่อซูม · กด "0"/ปุ่มรีเซ็ต = พอดีจอ
// ใช้ซ้ำได้ทุกที่ที่มีชุดรูป (แนบงาน, คอนเทนต์, แกลเลอรีสินค้า ฯลฯ)
// ============================================================

import { useCallback, useEffect, useRef, useState, type WheelEvent as RWheelEvent, type MouseEvent as RMouseEvent, type TouchEvent as RTouchEvent } from "react";
import { createPortal } from "react-dom";

export type LightboxImage = { url: string; label?: string | null };

const MIN = 1, MAX = 6;
const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));
type Pt = { clientX: number; clientY: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

export function ImageLightbox({ images, index, onClose, onIndex }: {
  images: LightboxImage[];
  index: number;                 // รูปปัจจุบัน · นอกช่วง (เช่น -1) = ปิด
  onClose: () => void;
  onIndex: (i: number) => void;  // เปลี่ยนรูป
}) {
  const open = index >= 0 && index < images.length;
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef(false);           // กำลังลากเลื่อน (เมื่อซูม)
  const moved = useRef(false);          // ขยับจริงไหม (กันปิดตอนลาก)
  const last = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const touchX = useRef<number | null>(null);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  const go = useCallback((delta: number) => {
    if (images.length < 2) return;
    reset();
    onIndex((index + delta + images.length) % images.length);
  }, [index, images.length, onIndex, reset]);

  useEffect(() => { reset(); }, [index, reset]);   // เปลี่ยนรูป → รีเซ็ตซูม

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "0") reset();
      else if (e.key === "+" || e.key === "=") setScale((s) => clampScale(s * 1.3));
      else if (e.key === "-") setScale((s) => { const n = clampScale(s / 1.3); if (n === 1) reset(); return n; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose, reset]);

  if (!open) return null;
  const cur = images[index];
  const zoomed = scale > 1;
  const navBtn = "absolute top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl leading-none select-none";

  const onWheel = (e: RWheelEvent) => {
    e.preventDefault();
    const ns = clampScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    if (ns === 1) reset(); else setScale(ns);
  };
  const toggleZoom = () => { if (zoomed) reset(); else setScale(2.5); };

  // ลากเลื่อน (เมาส์) — เฉพาะตอนซูม
  const onMouseDown = (e: RMouseEvent) => { if (!zoomed) return; drag.current = true; moved.current = false; last.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: RMouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    setTx((t) => t + dx); setTy((t) => t + dy);
  };
  const endDrag = () => { drag.current = false; };

  // สัมผัส: 2 นิ้ว = จีบซูม · 1 นิ้วตอนซูม = เลื่อน · 1 นิ้วไม่ซูม = ปัดเปลี่ยนรูป
  const onTouchStart = (e: RTouchEvent) => {
    if (e.touches.length === 2) { pinch.current = { dist: dist(e.touches[0], e.touches[1]), scale }; touchX.current = null; }
    else if (e.touches.length === 1) {
      if (zoomed) { drag.current = true; moved.current = false; last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
      else touchX.current = e.touches[0].clientX;
    }
  };
  const onTouchMove = (e: RTouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const d = dist(e.touches[0], e.touches[1]);
      setScale(clampScale(pinch.current.scale * (d / pinch.current.dist)));
    } else if (drag.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - last.current.x, dy = e.touches[0].clientY - last.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTx((t) => t + dx); setTy((t) => t + dy);
    }
  };
  const onTouchEnd = (e: RTouchEvent) => {
    if (pinch.current) { pinch.current = null; if (scale <= 1) reset(); }
    else if (!zoomed && touchX.current != null) {
      const x1 = e.changedTouches[0]?.clientX ?? null;
      if (x1 != null && Math.abs(x1 - touchX.current) > 50) go(x1 < touchX.current ? 1 : -1);
    }
    touchX.current = null; drag.current = false;
  };

  const bgClick = () => { if (zoomed || moved.current) return; onClose(); };

  // z-[9999] + portal ไป body → ลอยทับทุกอย่าง (modal/drawer) ไม่จมหลัง popup ที่เปิดอยู่
  const node = (
    <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center overflow-hidden select-none"
      onClick={bgClick} onWheel={onWheel}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* แถบบน: ลำดับ + ป้ายกำกับ */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[70vw] truncate text-white/85 text-sm pointer-events-none">{index + 1} / {images.length}{cur.label ? ` · ${cur.label}` : ""}{zoomed ? ` · ${Math.round(scale * 100)}%` : ""}</div>

      {/* ปุ่มซูม + ปิด (มุมขวาบน) */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => { const n = clampScale(s / 1.3); if (n === 1) reset(); return n; }); }} title="ซูมออก (−)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">−</button>
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => clampScale(s * 1.3)); }} title="ซูมเข้า (+)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">＋</button>
        {zoomed && <button onClick={(e) => { e.stopPropagation(); reset(); }} title="พอดีจอ (0)" className="h-10 px-3 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-sm">⤢</button>}
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} title="ปิด (Esc)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">✕</button>
      </div>

      {images.length > 1 && !zoomed && <button onClick={(e) => { e.stopPropagation(); go(-1); }} title="ก่อนหน้า (←)" className={`${navBtn} left-3`}>‹</button>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cur.url} alt={cur.label ?? ""} draggable={false}
        onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); toggleZoom(); }}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: zoomed ? (drag.current ? "grabbing" : "grab") : "zoom-in", transition: drag.current || pinch.current ? "none" : "transform 0.12s ease-out" }}
        className="max-h-[92vh] max-w-[94vw] object-contain rounded shadow-2xl" />
      {images.length > 1 && !zoomed && <button onClick={(e) => { e.stopPropagation(); go(1); }} title="ถัดไป (→)" className={`${navBtn} right-3`}>›</button>}

      {/* คำใบ้ (เฉพาะยังไม่ซูม) */}
      {!zoomed && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/45 text-[11px] pointer-events-none">ดับเบิลคลิก/ล้อเมาส์/จีบนิ้ว = ซูม</div>}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

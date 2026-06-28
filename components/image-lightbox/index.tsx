"use client";

// ============================================================
// ImageLightbox (ของกลาง) — กดรูปแล้วขยายเต็มจอ + เลื่อนดูถัดไป/ก่อนหน้า
// ใช้ลูกศรซ้าย/ขวา · Esc ปิด · ปัดนิ้ว (มือถือ) · กดพื้นหลังปิด
// ใช้ซ้ำได้ทุกที่ที่มีชุดรูป (แนบงาน, คอนเทนต์, แกลเลอรีสินค้า ฯลฯ)
// ============================================================

import { useCallback, useEffect, useRef } from "react";

export type LightboxImage = { url: string; label?: string | null };

export function ImageLightbox({ images, index, onClose, onIndex }: {
  images: LightboxImage[];
  index: number;                 // รูปปัจจุบัน · นอกช่วง (เช่น -1) = ปิด
  onClose: () => void;
  onIndex: (i: number) => void;  // เปลี่ยนรูป
}) {
  const open = index >= 0 && index < images.length;
  const touchX = useRef<number | null>(null);

  const go = useCallback((delta: number) => {
    if (images.length < 2) return;
    onIndex((index + delta + images.length) % images.length);
  }, [index, images.length, onIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose]);

  if (!open) return null;
  const cur = images[index];
  const navBtn = "absolute top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl leading-none select-none";
  return (
    <div className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center" onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => { const x0 = touchX.current; const x1 = e.changedTouches[0]?.clientX ?? null; if (x0 != null && x1 != null && Math.abs(x1 - x0) > 50) go(x1 < x0 ? 1 : -1); touchX.current = null; }}>
      {/* แถบบน: ลำดับ + ป้ายกำกับ + ปิด */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[80vw] truncate text-white/85 text-sm">{index + 1} / {images.length}{cur.label ? ` · ${cur.label}` : ""}</div>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} title="ปิด (Esc)" className="absolute top-3 right-3 h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">✕</button>
      {images.length > 1 && <button onClick={(e) => { e.stopPropagation(); go(-1); }} title="ก่อนหน้า (←)" className={`${navBtn} left-3`}>‹</button>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cur.url} alt={cur.label ?? ""} onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-[92vw] object-contain rounded shadow-2xl" />
      {images.length > 1 && <button onClick={(e) => { e.stopPropagation(); go(1); }} title="ถัดไป (→)" className={`${navBtn} right-3`}>›</button>}
    </div>
  );
}

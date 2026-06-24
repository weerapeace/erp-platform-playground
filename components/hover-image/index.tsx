"use client";

/**
 * HoverImage — รูปย่อ + ชี้เมาส์เพื่อดูรูปใหญ่ (ของกลาง)
 *
 * รูปพรีวิว "ลอยทับทุกอย่าง" ด้วย portal ไป document.body + position:fixed
 * → ไม่โดนกรอบ/ป๊อปอัป/คอลัมน์ที่ overflow ซ่อน ตัดทิ้ง (เห็นเต็มเสมอ)
 *
 * ใช้ที่ไหนก็ได้ที่อยากให้ "ชี้รูปเล็กแล้วเห็นรูปใหญ่":
 *   <HoverImage url={img} size={28} />
 * - เดสก์ท็อป: ชี้เมาส์ = เด้งรูปพรีวิวลอยตามเมาส์
 * - แตะ/คลิกที่รูป = เด้งรูปใหญ่เต็มจอ (lightbox) แตะที่ใดก็ปิด → ใช้ได้ทั้งทัช (iPad) และเมาส์
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withImageWidth } from "@/lib/r2-image";

export function HoverImage({
  url, size = 28, previewSize = 256, alt = "", rounded = "rounded", fallback = "📦", className = "",
}: {
  url?: string | null;
  size?: number;          // ขนาดรูปย่อ (px)
  previewSize?: number;   // ขนาดรูปพรีวิว (px)
  alt?: string;
  rounded?: string;       // class มุมโค้งของรูปย่อ
  fallback?: string;      // ไอคอน/ตัวอักษรเมื่อไม่มีรูป
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(false);   // แตะ/คลิก = เปิดรูปใหญ่เต็มจอ (ใช้บนทัชที่ไม่มี hover)

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const pad = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.right + pad;
    if (left + previewSize > vw) left = r.left - previewSize - pad;   // ชนขอบขวา → พลิกไปซ้าย
    if (left < pad) left = pad;
    let top = r.top + r.height / 2 - previewSize / 2;                 // กึ่งกลางแนวตั้งกับรูปย่อ
    if (top < pad) top = pad;
    if (top + previewSize > vh - pad) top = vh - previewSize - pad;   // กันตกขอบล่าง
    setBox({ left, top });
  };
  const close = () => setBox(null);

  const dim = { width: `${size}px`, height: `${size}px` };
  if (!url) {
    return (
      <span className={`shrink-0 inline-flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-300 ${rounded} ${className}`}
        style={{ ...dim, fontSize: Math.round(size * 0.42) }}>{fallback}</span>
    );
  }
  return (
    <span ref={ref} className={`shrink-0 inline-block cursor-zoom-in ${className}`} onMouseEnter={open} onMouseLeave={close}
      onClick={(e) => { e.stopPropagation(); setBox(null); setZoom(true); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withImageWidth(url, Math.min(size * 3, 512)) ?? url} alt={alt} loading="lazy" decoding="async" style={dim} className={`object-cover border border-slate-200 ${rounded}`} />
      {box && !zoom && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, zIndex: 9999 }}
          className="pointer-events-none bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(url, previewSize * 2) ?? url} alt={alt} decoding="async" style={{ width: `${previewSize}px`, height: `${previewSize}px` }} className="object-contain rounded-lg" />
        </div>,
        document.body,
      )}
      {/* แตะ/คลิก → รูปใหญ่เต็มจอ (แตะที่ใดก็ปิด) */}
      {zoom && typeof document !== "undefined" && createPortal(
        <div onClick={(e) => { e.stopPropagation(); setZoom(false); }}
          className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(url, 1024) ?? url} alt={alt} decoding="async" className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body,
      )}
    </span>
  );
}

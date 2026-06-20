"use client";

/**
 * HoverImage — รูปย่อ + ชี้เมาส์เพื่อดูรูปใหญ่ (ของกลาง)
 *
 * รูปพรีวิว "ลอยทับทุกอย่าง" ด้วย portal ไป document.body + position:fixed
 * → ไม่โดนกรอบ/ป๊อปอัป/คอลัมน์ที่ overflow ซ่อน ตัดทิ้ง (เห็นเต็มเสมอ)
 *
 * ใช้ที่ไหนก็ได้ที่อยากให้ "ชี้รูปเล็กแล้วเห็นรูปใหญ่":
 *   <HoverImage url={img} size={28} />
 * แท็บเล็ต/มือถือไม่มี hover → ไม่เด้ง (ใช้ปุ่มดูรายละเอียดแทน) — ปลอดภัย
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    <span ref={ref} className={`shrink-0 inline-block ${className}`} onMouseEnter={open} onMouseLeave={close} onClick={close}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} style={dim} className={`object-cover border border-slate-200 ${rounded}`} />
      {box && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, zIndex: 9999 }}
          className="pointer-events-none bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} style={{ width: `${previewSize}px`, height: `${previewSize}px` }} className="object-contain rounded-lg" />
        </div>,
        document.body,
      )}
    </span>
  );
}

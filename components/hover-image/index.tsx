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
 *
 * 📱 มือถือ/แท็บเล็ต: "ปิดพรีวิวตอน hover ทั้งหมด" (useCanHover) — เพราะเบราว์เซอร์ทัช
 *    ยิง onMouseEnter ปลอมตอนแตะ ทำให้พรีวิวเด้งค้างทับจอ · บนทัชใช้ "แตะ = รูปใหญ่เต็มจอ" แทน
 *
 * 2026-11-17: หมุนล้อเมาส์บนรูปย่อ = ซูมรูปลอย (ซูมตรงจุดที่ชี้ 1–5 เท่า) · ปิดด้วย wheelZoom={false}
 *             หน่วงเวลาก่อนโชว์ = ตั้งต่อคนที่เมนูโปรไฟล์ → หน้าตา (lib/hover-delay) · หรือส่ง delay={ms} เฉพาะจุด
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { withImageWidth } from "@/lib/r2-image";
import { useCanHover } from "@/lib/use-can-hover";
import { nextWheelZoom, readHoverDelay } from "@/lib/hover-delay";

/** ตั้งเวลาเปิดพรีวิวตามค่าหน่วง (prop ชนะค่าของคน) */
function useDelayedOpen(delay: number | undefined, openNow: () => void, closeNow: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const enter = () => {
    const ms = delay ?? readHoverDelay();
    if (timer.current) clearTimeout(timer.current);
    if (ms <= 0) openNow(); else timer.current = setTimeout(openNow, ms);
  };
  const leave = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; closeNow(); };
  return { enter, leave };
}

export function HoverImage({
  url, size = 28, previewSize = 256, alt = "", rounded = "rounded", fallback = "📦", className = "", delay, wheelZoom = true, onOpen,
}: {
  /** กด/แตะรูป → ให้ผู้เรียกเปิดเอง (เช่น ป๊อปเลื่อนดูหลายรูป ImageLightbox) แทนรูปใหญ่รูปเดียว */
  onOpen?: () => void;
  /** หน่วงก่อนโชว์ (มิลลิวินาที) — ไม่ส่ง = ตามที่ผู้ใช้ตั้ง (ค่าเริ่ม 0) */
  delay?: number;
  /** ล้อเมาส์ซูมรูปลอย (ค่าเริ่ม true) */
  wheelZoom?: boolean;
  url?: string | null;
  size?: number;          // ขนาดรูปย่อ (px)
  previewSize?: number;   // ขนาดรูปพรีวิว (px)
  alt?: string;
  rounded?: string;       // class มุมโค้งของรูปย่อ
  fallback?: ReactNode;   // ไอคอน/ตัวอักษรเมื่อไม่มีรูป (ส่ง <Icon> ได้)
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(false);   // แตะ/คลิก = เปิดรูปใหญ่เต็มจอ (ใช้บนทัชที่ไม่มี hover)
  const canHover = useCanHover();            // ทัช (มือถือ/แท็บเล็ต) = ไม่ผูก hover เลย

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
  const close = () => { setBox(null); setScale(1); };
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState("50% 50%");
  const hover = useDelayedOpen(delay, open, close);

  // ล้อเมาส์บนรูปย่อ = ซูมรูปลอย (ต้องติดแบบ passive:false ถึงกันหน้าเลื่อนได้)
  useEffect(() => {
    const el = ref.current;
    if (!el || !box || !wheelZoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const py = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      setOrigin(`${px.toFixed(0)}% ${py.toFixed(0)}%`);
      setScale((s) => nextWheelZoom(s, e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [box, wheelZoom]);

  const dim = { width: `${size}px`, height: `${size}px` };
  if (!url) {
    return (
      <span className={`shrink-0 inline-flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-300 ${rounded} ${className}`}
        style={{ ...dim, fontSize: Math.round(size * 0.42) }}>{fallback}</span>
    );
  }
  return (
    <span ref={ref} className={`shrink-0 inline-block cursor-zoom-in ${className}`}
      onMouseEnter={canHover ? hover.enter : undefined} onMouseLeave={canHover ? hover.leave : undefined}
      onClick={(e) => { e.stopPropagation(); hover.leave(); if (onOpen) onOpen(); else setZoom(true); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withImageWidth(url, Math.min(size * 3, 512)) ?? url} alt={alt} loading="lazy" decoding="async" style={dim} className={`object-cover border border-slate-200 ${rounded}`} />
      {box && !zoom && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, zIndex: 9999 }}
          className="pointer-events-none bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="overflow-hidden rounded-lg" style={{ width: `${previewSize}px`, height: `${previewSize}px` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withImageWidth(url, scale > 1.5 ? 1024 : previewSize * 2) ?? url} alt={alt} decoding="async"
              style={{ width: "100%", height: "100%", transform: scale > 1 ? `scale(${scale})` : undefined, transformOrigin: origin, transition: "transform 80ms ease-out" }}
              className="object-contain" />
          </div>
          {wheelZoom && <div className="pt-1 text-center text-[10px] text-slate-400">{scale > 1 ? `ซูม ${scale.toFixed(1)}×` : "หมุนล้อเมาส์ = ซูม"}</div>}
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

// HoverPreview — ครอบ children (เช่น แบนเนอร์รูปบนการ์ด) แล้วโชว์รูปพรีวิวใหญ่ตอน hover (ของกลาง)
// บนทัช (ไม่มี hover) จะไม่เด้งพรีวิว — ให้ใช้คลิก/แตะการ์ดเปิดรายละเอียดแทน
export function HoverPreview({ url, previewW = 640, children, delay }: { url?: string | null; previewW?: number; children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const canHover = useCanHover();   // 📱 ทัช = ไม่เด้งพรีวิว (กันเด้งค้างตอนแตะการ์ด)
  const open = () => {
    if (!url) return;
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(previewW, vw - pad * 2), h = w;
    let left = r.right + pad;
    if (left + w > vw) left = r.left - w - pad;
    if (left < pad) left = Math.max(pad, (vw - w) / 2);
    let top = r.top + r.height / 2 - h / 2;
    if (top < pad) top = pad;
    if (top + h > vh - pad) top = vh - h - pad;
    setBox({ left, top });
  };
  const hover = useDelayedOpen(delay, open, () => setBox(null));
  return (
    <div ref={ref} onMouseEnter={canHover ? hover.enter : undefined} onMouseLeave={canHover ? hover.leave : undefined}>
      {children}
      {url && box && canHover && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, zIndex: 9999, width: Math.min(previewW, window.innerWidth - 16) }}
          className="pointer-events-none bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(url, previewW) ?? url} alt="" decoding="async" className="w-full max-h-[70vh] object-contain rounded-lg" />
        </div>,
        document.body,
      )}
    </div>
  );
}

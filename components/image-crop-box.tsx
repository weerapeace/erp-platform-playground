"use client";

/**
 * ของกลาง — เลือก "ส่วนที่เห็น" ของรูปในกรอบสัดส่วนคงที่ (ลากกรอบ / คลิกตรงไหนของรูป + ซูม)
 *
 * โชว์รูปเต็ม + กรอบ = ส่วนที่จะเห็นจริง (นอกกรอบมืดลง) → ลากกรอบหรือคลิกจุดบนรูปเพื่อย้าย
 * ↘ จับมุมกรอบลาก = ย่อ/ขยายกรอบ (แบบ transform · มุมตรงข้ามอยู่กับที่ · คงสัดส่วน) → ได้ zoom ใหม่ (100% – maxZoom)
 * ค่าที่ได้ { x, y } (0–100 %) + zoom (100–300 %) = object-position + scale(zoom) รอบจุดเดียวกัน (สูตร canvasBgWindow)
 *
 * ใช้ที่: รูปพื้นหลังผืนผ้าใบ (CanvasBgPositioner) · รูปในแกลเลอรี (ช่องชนิด "crop" ของ schema)
 * เว็บร้านต้องวาดด้วยสูตรเดียวกัน: object-fit: cover; object-position: x% y%; transform: scale(zoom/100); transform-origin: x% y%
 */
import { useEffect, useRef, useState } from "react";
import { canvasBgPosFromWindow, canvasBgWindow } from "@/lib/website-canvas";

export interface CropValue {
  x: number;
  y: number;
  zoom: number;
}

const imgUrl = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const pct = (n: number) => `${n * 100}%`;

/** ขนาดจริงของรูป (โหลดตัวย่อมาวัด) — ใช้ร่วมกันทุกที่ (แคชต่อ key) */
const sizeCache = new Map<string, Promise<{ w: number; h: number }>>();
export function useImageSize(key: string | null | undefined): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let alive = true;
    setSize(null);
    if (!key) return;
    let p = sizeCache.get(key);
    if (!p) {
      p = new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
        im.onerror = () => resolve({ w: 1, h: 1 });
        im.src = imgUrl(key, 600);
      });
      sizeCache.set(key, p);
    }
    void p.then((s) => alive && setSize(s));
    return () => {
      alive = false;
    };
  }, [key]);
  return size;
}

export function ImageCropBox({
  imageKey,
  box,
  value,
  onChange,
  label,
  tone = "white",
  extraBox,
  maxHeight = 190,
  resizable = true,
  maxZoom = 300,
}: {
  imageKey: string;
  /** สัดส่วนกล่องที่รูปจะไปอยู่ (กว้าง/สูง — px หรือสัดส่วนก็ได้) */
  box: { w: number; h: number };
  value: CropValue;
  /** ย้ายกรอบ → { x, y } · ลากมุม → { x, y, zoom } */
  onChange: (p: { x: number; y: number; zoom?: number }) => void;
  /** ป้ายมุมกรอบ เช่น "🖥 คอม" */
  label?: string;
  /** สีกรอบ: white (ปกติ) · amber (มือถือ) */
  tone?: "white" | "amber";
  /** กรอบเส้นประเพิ่ม (เช่น ส่วนที่มือถือเห็น เมื่อใช้ค่าเดียวกัน) */
  extraBox?: { w: number; h: number } | null;
  /** ความสูงสูงสุดของภาพในแผง (px) */
  maxHeight?: number;
  /** มีมุมให้จับลากย่อ/ขยายกรอบ (ค่าเริ่ม = มี) */
  resizable?: boolean;
  /** ซูมได้สูงสุด (%) = กรอบเล็กสุด */
  maxZoom?: number;
}) {
  const size = useImageSize(imageKey);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offX: number; offY: number } | null>(null);
  // ลากมุม: มุมตรงข้าม (anchor) อยู่กับที่ · sx/sy = มุมที่จับอยู่ซ้าย(-1)/ขวา(1) บน(-1)/ล่าง(1) ของ anchor
  const resize = useRef<{ ax: number; ay: number; sx: number; sy: number } | null>(null);
  const win = size ? canvasBgWindow(size, box, value) : null;
  const xwin = size && extraBox ? canvasBgWindow(size, extraBox, value) : null;
  const ia = size ? size.w / size.h : 1;

  const moveTo = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    if (!el || !win || !drag.current) return;
    const r = el.getBoundingClientRect();
    const p = canvasBgPosFromWindow(win, (clientX - r.left) / r.width - drag.current.offX, (clientY - r.top) / r.height - drag.current.offY, value);
    if (p.x !== value.x || p.y !== value.y) onChange(p);
  };
  const resizeTo = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    const rz = resize.current;
    if (!el || !win || !rz || !size) return;
    const r = el.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    // ขนาดกรอบตอนซูม 100% (เต็มที่) — สัดส่วนกว้าง/สูงของกรอบคงที่
    const full = canvasBgWindow(size, box, { x: 0, y: 0, zoom: 100 });
    const ratio = full.w / full.h;
    // ไม่ให้เกินขอบรูปฝั่งที่ลากไป
    const roomW = rz.sx < 0 ? rz.ax : 1 - rz.ax;
    const roomH = rz.sy < 0 ? rz.ay : 1 - rz.ay;
    let w = Math.max(Math.abs(fx - rz.ax), Math.abs(fy - rz.ay) * ratio);
    w = Math.min(w, roomW, roomH * ratio, full.w);
    w = Math.max(w, full.w / (maxZoom / 100));
    const h = w / ratio;
    const left = Math.max(0, Math.min(1 - w, rz.sx < 0 ? rz.ax - w : rz.ax));
    const top = Math.max(0, Math.min(1 - h, rz.sy < 0 ? rz.ay - h : rz.ay));
    const zoom = Math.round((full.w / w) * 100);
    const px = 1 - w > 1e-4 ? Math.round((left / (1 - w)) * 1000) / 10 : value.x;
    const py = 1 - h > 1e-4 ? Math.round((top / (1 - h)) * 1000) / 10 : value.y;
    onChange({ x: px, y: py, zoom: Math.max(100, Math.min(maxZoom, zoom)) });
  };
  const onCorner = (sx: number, sy: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!win || e.button !== 0) return;
    e.stopPropagation();
    resize.current = { ax: sx < 0 ? win.x + win.w : win.x, ay: sy < 0 ? win.y + win.h : win.y, sx, sy };
    boxRef.current?.setPointerCapture(e.pointerId);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!win || e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const inside = fx >= win.x && fx <= win.x + win.w && fy >= win.y && fy <= win.y + win.h;
    drag.current = inside ? { offX: fx - win.x, offY: fy - win.y } : { offX: win.w / 2, offY: win.h / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!inside) moveTo(e.clientX, e.clientY);
  };

  return (
    <div
      ref={boxRef}
      className={`relative mx-auto overflow-hidden rounded-md border border-slate-200 bg-slate-100 select-none touch-none ${win ? "cursor-move" : ""}`}
      style={{ aspectRatio: `${ia}`, maxWidth: `min(100%, ${Math.round(maxHeight * ia)}px)` }}
      onPointerDown={onDown}
      onPointerMove={(e) => (resize.current ? resizeTo(e.clientX, e.clientY) : drag.current && moveTo(e.clientX, e.clientY))}
      onPointerUp={() => ((drag.current = null), (resize.current = null))}
      onPointerCancel={() => ((drag.current = null), (resize.current = null))}
      data-crop-box=""
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgUrl(imageKey, 600)} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
      {win && (
        <div
          data-crop-frame=""
          className={`absolute border-2 pointer-events-none ${tone === "amber" ? "border-amber-300" : "border-white"}`}
          style={{ left: pct(win.x), top: pct(win.y), width: pct(win.w), height: pct(win.h), boxShadow: "0 0 0 9999px rgba(15,23,42,0.5)" }}
        >
          {label && <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[9px] text-slate-700">{label}</span>}
          {resizable &&
            ([[-1, -1, "nwse-resize"], [1, -1, "nesw-resize"], [-1, 1, "nesw-resize"], [1, 1, "nwse-resize"]] as const).map(([sx, sy, cur]) => (
              <span
                key={`${sx}${sy}`}
                data-crop-handle={`${sx < 0 ? "l" : "r"}${sy < 0 ? "t" : "b"}`}
                onPointerDown={onCorner(sx, sy)}
                className="absolute w-3 h-3 rounded-sm bg-white border border-slate-500 shadow pointer-events-auto touch-none"
                style={{ cursor: cur, left: sx < 0 ? -7 : undefined, right: sx > 0 ? -7 : undefined, top: sy < 0 ? -7 : undefined, bottom: sy > 0 ? -7 : undefined }}
              />
            ))}
        </div>
      )}
      {xwin && (
        <div className="absolute border-2 border-dashed border-amber-300 pointer-events-none" style={{ left: pct(xwin.x), top: pct(xwin.y), width: pct(xwin.w), height: pct(xwin.h) }}>
          <span className="absolute right-1 bottom-1 rounded bg-amber-100/90 px-1 text-[9px] text-amber-800">📲</span>
        </div>
      )}
    </div>
  );
}

/** แถบซูม (ใช้คู่กับ ImageCropBox) */
export function CropZoom({ value, onChange, max = 300 }: { value: number; onChange: (z: number) => void; /** ซูมได้สูงสุด (%) */ max?: number }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] text-slate-500">
        ซูม
        <span className="tabular-nums">{value}%</span>
      </span>
      <input type="range" className="w-full accent-blue-600" min={100} max={max} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

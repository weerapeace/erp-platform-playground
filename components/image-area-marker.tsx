"use client";

/**
 * 📍 ของกลาง — วาด/ย้าย/ปรับขนาด "กรอบ" บนรูป (ค่าเป็น % ของรูป ใช้ได้ทุกขนาดจอ)
 *
 *   ใช้กับ: ช่องใส่ของของ Parent SKU (components/compartment-area-dialog → ป๊อป 📏 เทียบขนาดบนเว็บร้าน)
 *   ใช้ซ้ำได้กับงานที่ต้องชี้ "ตรงไหนของรูป" เช่น จุดตำหนิงาน QC · ป้ายบนลุคบุ๊ก
 *
 *   ลากบนพื้นที่ว่าง = วาดกรอบใหม่ · ลากในกรอบ = ย้าย · ลากจุดมุมขวาล่าง = ปรับขนาด
 *   ทรงของเส้น (มุมมน/สี่เหลี่ยม/วงรี/หัวใจ) วาดด้วย areaPath จาก lib/fit-check — ตัวเดียวกับที่เว็บร้านวาด → หน้าตาตรงกัน
 *   others = กรอบอื่นบนรูปเดียวกัน (โชว์จาง ๆ ไว้กะตำแหน่ง ไม่ให้แก้)
 */
import { useRef, useState } from "react";
import { areaPath, type AreaShape } from "@/lib/fit-check";

export interface MarkerArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag = { mode: "draw" | "move" | "size"; sx: number; sy: number; start: MarkerArea | null };

const MIN = 2; // % — เล็กกว่านี้ถือว่าแค่คลิก ไม่ใช่วาด
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ImageAreaMarker({
  src,
  value,
  onChange,
  shape,
  label,
  others = [],
  disabled = false,
}: {
  src: string;
  value: MarkerArea | null;
  onChange: (v: MarkerArea | null) => void;
  shape?: AreaShape;
  /** ป้ายบนกรอบที่กำลังแก้ เช่น "ช่องหน้า 22×11 ซม." */
  label?: string;
  others?: { id: string; label: string; area: MarkerArea; shape?: AreaShape }[];
  disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<MarkerArea | null>(null);
  const shown = live ?? value;

  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  };

  const down = (e: React.PointerEvent, mode: Drag["mode"]) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = at(e);
    drag.current = { mode, sx: p.x, sy: p.y, start: value };
    box.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    if (d.mode === "draw") {
      setLive({ x: r2(Math.min(d.sx, p.x)), y: r2(Math.min(d.sy, p.y)), w: r2(Math.abs(p.x - d.sx)), h: r2(Math.abs(p.y - d.sy)) });
    } else if (d.start) {
      const s = d.start;
      const dx = p.x - d.sx, dy = p.y - d.sy;
      setLive(
        d.mode === "move"
          ? { x: r2(clamp(s.x + dx, 0, 100 - s.w)), y: r2(clamp(s.y + dy, 0, 100 - s.h)), w: s.w, h: s.h }
          : { x: s.x, y: s.y, w: r2(clamp(s.w + dx, MIN, 100 - s.x)), h: r2(clamp(s.h + dy, MIN, 100 - s.y)) },
      );
    }
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = live;
    setLive(null);
    // คลิกเฉย ๆ (ไม่ได้ลาก) ไม่ลบกรอบเดิม
    if (v && v.w >= MIN && v.h >= MIN) onChange(v);
  };

  return (
    <div
      ref={box}
      className={`relative select-none overflow-hidden rounded-lg bg-slate-100 ${disabled ? "" : "cursor-crosshair"}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => down(e, "draw")}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      data-area-marker
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="block w-full h-auto pointer-events-none" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
        {others.map((o) => (
          <path key={o.id} d={areaPath(o.shape, o.area.x, o.area.y, o.area.w, o.area.h)} fill="rgba(255,255,255,.18)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        ))}
        {shown && <path d={areaPath(shape, shown.x, shown.y, shown.w, shown.h)} fill="rgba(236,72,153,.16)" stroke="#db2777" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      </svg>
      {others.map((o) => (
        <span key={o.id} className="pointer-events-none absolute rounded-full bg-white/85 px-1.5 text-[10px] leading-4 text-slate-500" style={{ left: `${o.area.x}%`, top: `${o.area.y}%` }}>
          {o.label}
        </span>
      ))}
      {shown && (
        <>
          {/* พื้นที่จับย้าย = กรอบทั้งกรอบ */}
          <div className="absolute cursor-move" style={{ left: `${shown.x}%`, top: `${shown.y}%`, width: `${shown.w}%`, height: `${shown.h}%` }} onPointerDown={(e) => down(e, "move")} data-area-move />
          {label && (
            <span className="pointer-events-none absolute -translate-y-full rounded-full bg-pink-600 px-2 text-[11px] leading-5 text-white whitespace-nowrap" style={{ left: `${shown.x}%`, top: `${shown.y}%` }}>
              {label}
            </span>
          )}
          {!disabled && (
            <div
              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-white bg-pink-600 shadow"
              style={{ left: `${shown.x + shown.w}%`, top: `${shown.y + shown.h}%` }}
              onPointerDown={(e) => down(e, "size")}
              aria-label="ลากเพื่อปรับขนาดกรอบ"
              data-area-size
            />
          )}
        </>
      )}
    </div>
  );
}

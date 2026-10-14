"use client";

/**
 * ของกลางของผืนผ้าใบอิสระ — ตั้ง "ส่วนที่เห็น" ของรูปพื้นหลังผืน (แผงตั้งค่าทั้งผืน)
 *
 * เต็มผืน (cover): โชว์รูปเต็ม + กรอบขาว = ส่วนที่เห็นบนจอคอม (เส้นประ = มือถือแบบจัดเอง)
 *                   ลากกรอบ / คลิกตรงไหนของรูป = ย้ายส่วนที่เห็นไปตรงนั้น · ซูมได้ 100–300%
 * เห็นทั้งรูป (contain): โชว์หน้าตาบนจอคอม (รูปไม่ถูกตัด เหลือขอบเป็นสีพื้นผืน) · เลื่อนชิดซ้าย/ขวา/บน/ล่างได้
 *
 * คำนวณด้วย canvasBgWindow (lib/website-canvas.ts) — สูตรเดียวกับเว็บร้าน (object-position + scale รอบจุดเดียวกัน)
 */
import { useEffect, useRef, useState } from "react";
import { measureImage } from "@/components/website-canvas-media";
import { CANVAS_BG_DEFAULT, CANVAS_BG_REF_WIDTH, CANVAS_MOBILE_WIDTH, CANVAS_WIDTH, canvasBgPosFromWindow, canvasBgWindow } from "@/lib/website-canvas";

export interface CanvasBgPos {
  fit: "cover" | "contain";
  x: number;
  y: number;
  zoom: number;
}

const imgUrl = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const seg = (on: boolean) => `flex-1 px-2 py-1.5 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
const pct = (n: number) => `${n * 100}%`;

/** ค่าในบล็อก → ค่าที่ใช้ (ข้อมูลเก่าไม่มีช่อง = กลางรูป เต็มผืน ไม่ซูม) */
export function canvasBgPosOf(block: Record<string, unknown>): CanvasBgPos {
  const n = (v: unknown, fb: number, min: number, max: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.max(min, Math.min(max, Number(v))) : fb);
  return {
    fit: block.bgFit === "contain" ? "contain" : "cover",
    x: n(block.bgX, CANVAS_BG_DEFAULT.bgX, 0, 100),
    y: n(block.bgY, CANVAS_BG_DEFAULT.bgY, 0, 100),
    zoom: n(block.bgZoom, CANVAS_BG_DEFAULT.bgZoom, 100, 300),
  };
}

function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] text-slate-500">
        {label}
        <span className="tabular-nums">{value}%</span>
      </span>
      <input type="range" className="w-full accent-blue-600" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function CanvasBgPositioner({
  imageKey,
  value,
  height,
  mobileHeight,
  mobileCustom,
  onChange,
}: {
  imageKey: string;
  value: CanvasBgPos;
  /** ความสูงผืนคอม (หน่วยผืน 1200) */
  height: number;
  /** ความสูงผืนมือถือ (หน่วยผืนมือถือ 400) — ใช้เมื่อมือถือ "จัดเอง" */
  mobileHeight: number;
  mobileCustom: boolean;
  onChange: (p: { bgFit?: "cover" | "contain"; bgX?: number; bgY?: number; bgZoom?: number }) => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offX: number; offY: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setSize(null);
    void measureImage(imageKey).then((s) => alive && setSize(s));
    return () => {
      alive = false;
    };
  }, [imageKey]);

  // กล่องที่รูปไปอยู่บนเว็บ: คอม = กว้างเต็มจออ้างอิง × สูงตามผืน (ผืนกว้างสุด 1200) · มือถือจัดเอง = สัดส่วนผืนมือถือ
  const desk = { w: CANVAS_BG_REF_WIDTH, h: (Math.max(120, height) * Math.min(CANVAS_BG_REF_WIDTH, CANVAS_WIDTH)) / CANVAS_WIDTH };
  const mob = mobileCustom ? { w: CANVAS_MOBILE_WIDTH, h: Math.max(120, mobileHeight) } : null;
  const cover = value.fit === "cover";
  const win = size && cover ? canvasBgWindow(size, desk, value) : null;
  const mwin = size && cover && mob ? canvasBgWindow(size, mob, value) : null;
  const ia = size ? size.w / size.h : 16 / 9;

  // ลาก/คลิกบนรูป → ย้ายกรอบ (คลิกนอกกรอบ = ให้จุดที่คลิกอยู่กลางกรอบ แล้วลากต่อได้)
  const moveTo = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    if (!el || !win || !drag.current) return;
    const r = el.getBoundingClientRect();
    const left = (clientX - r.left) / r.width - drag.current.offX;
    const top = (clientY - r.top) / r.height - drag.current.offY;
    const p = canvasBgPosFromWindow(win, left, top, value);
    if (p.x !== value.x || p.y !== value.y) onChange({ bgX: p.x, bgY: p.y });
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
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button type="button" className={seg(cover)} onClick={() => onChange({ bgFit: "cover" })}>
          เต็มผืน
        </button>
        <button type="button" className={seg(!cover)} onClick={() => onChange({ bgFit: "contain" })}>
          เห็นทั้งรูป
        </button>
      </div>

      {cover ? (
        <>
          <div
            ref={boxRef}
            className={`relative mx-auto overflow-hidden rounded-md border border-slate-200 bg-slate-100 select-none touch-none ${win ? "cursor-move" : ""}`}
            style={{ aspectRatio: `${ia}`, maxWidth: `min(100%, ${Math.round(190 * ia)}px)` }}
            onPointerDown={onDown}
            onPointerMove={(e) => drag.current && moveTo(e.clientX, e.clientY)}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl(imageKey, 600)} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
            {win && (
              <div
                className="absolute border-2 border-white pointer-events-none"
                style={{ left: pct(win.x), top: pct(win.y), width: pct(win.w), height: pct(win.h), boxShadow: "0 0 0 9999px rgba(15,23,42,0.5)" }}
              >
                <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[9px] text-slate-700">🖥 คอม</span>
              </div>
            )}
            {mwin && (
              <div className="absolute border-2 border-dashed border-amber-300 pointer-events-none" style={{ left: pct(mwin.x), top: pct(mwin.y), width: pct(mwin.w), height: pct(mwin.h) }}>
                <span className="absolute right-1 bottom-1 rounded bg-amber-100/90 px-1 text-[9px] text-amber-800">📲</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            ลากกรอบขาว (หรือคลิกตรงไหนของรูป) = ส่วนที่เห็นบนจอคอม{mob ? " · เส้นประ = มือถือ" : " · มือถือจะเห็นช่วงรอบจุดเดียวกันนี้"}
          </p>
          <Range label="ซูม" value={value.zoom} min={100} max={300} step={5} onChange={(n) => onChange({ bgZoom: n })} />
        </>
      ) : (
        <>
          {/* หน้าตาบนจอคอม: ทั้งรูป ไม่ถูกตัด · ที่เหลือเป็นสีพื้นของผืน */}
          <div className="relative overflow-hidden rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px]" style={{ aspectRatio: `${desk.w / desk.h}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl(imageKey, 600)} alt="" draggable={false} className="absolute inset-0 w-full h-full" style={{ objectFit: "contain", objectPosition: `${value.x}% ${value.y}%` }} />
          </div>
          <p className="text-[10px] text-slate-500">เห็นทั้งรูป ไม่ถูกตัด · ที่ว่างรอบรูปเป็น &quot;สีพื้นผืน&quot; ด้านบน</p>
        </>
      )}

      <Range label="ซ้าย ↔ ขวา" value={value.x} min={0} max={100} onChange={(n) => onChange({ bgX: n })} />
      <Range label="บน ↕ ล่าง" value={value.y} min={0} max={100} onChange={(n) => onChange({ bgY: n })} />
      <div className="flex items-center justify-between">
        <button type="button" className="text-[11px] text-slate-500 hover:text-blue-600" onClick={() => onChange({ bgX: 50, bgY: 50, bgZoom: 100 })}>
          ↺ กลับกลางรูป
        </button>
        {cover && <span className="text-[10px] text-slate-400">อยากเห็นรูปมากขึ้น = เพิ่ม &quot;ความสูงผืน&quot;</span>}
      </div>
    </div>
  );
}

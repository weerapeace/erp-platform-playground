"use client";
/**
 * 🧵 ภาพตัวอย่างฝีเข็ม — วาดคำสั่งเครื่องปักลงแคนวาส (ด้ายตามสีที่ปัก · เส้นกระโดดประจาง ๆ · พื้นตามสีผ้า)
 *   ซูม: ล้อเมาส์ (ตรงจุดที่ชี้) · ถ่างสองนิ้ว · ปุ่ม + − พอดีจอ 1:1 (ขนาดจริงบนจอ) · ลาก = เลื่อน · แผนที่ย่อมุมขวาล่าง (คลิก = ไปตรงนั้น)
 *   คลิกชิ้น → onPick(id) (หาชิ้นด้วย pieceAt) · selectedId = ไฮไลต์ขอบชิ้น · focus = ซูมไปกรอบนั้น (เปลี่ยน focus.key = ซูมใหม่)
 *   ไม่ใช้ useCanvasZoom ของบล็อกพิมพ์: ตัวนั้นขยายกล่อง SVG ให้เลื่อนดู — ฝีเข็มหลายหมื่นเส้นต้องวาดแคนวาสเท่าจอแล้วแปลงพิกัดเอง (แคนวาสขยาย 8 เท่ากินหน่วยความจำ)
 *   upto = วาดถึงคำสั่งที่เท่าไร (แถบเล่นลำดับการปัก) · ไม่ใส่ = ทั้งหมด
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { pieceAt, type BoxMm, type EmbPlan } from "@/lib/embroidery";

const MIN_Z = 0.5, MAX_Z = 40;
const PX_PER_MM = 96 / 25.4;

function drawPlan(g: CanvasRenderingContext2D, plan: EmbPlan, k: number, ox: number, oy: number, end: number, showJumps: boolean, lw: number) {
  let ci = 0, px = ox, py = oy;
  let color = plan.colors[0]?.color ?? "#000";
  g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.strokeStyle = color; g.lineWidth = lw;
  const jumps: number[] = [];
  for (let i = 0; i < end; i++) {
    const c = plan.cmds[i];
    const x = ox + c.x * k, y = oy + c.y * k;
    if (c.t === "stitch") { g.moveTo(px, py); g.lineTo(x, y); }
    else if (c.t === "jump" && showJumps) jumps.push(px, py, x, y);
    else if (c.t === "color") { g.stroke(); ci++; color = plan.colors[ci]?.color ?? color; g.beginPath(); g.strokeStyle = color; }
    px = x; py = y;
  }
  g.stroke();
  if (jumps.length) {
    g.save(); g.setLineDash([2, 3]); g.strokeStyle = "rgba(100,116,139,0.55)"; g.lineWidth = 0.7; g.beginPath();
    for (let i = 0; i < jumps.length; i += 4) { g.moveTo(jumps[i], jumps[i + 1]); g.lineTo(jumps[i + 2], jumps[i + 3]); }
    g.stroke(); g.restore();
  }
  return { px, py };
}

export function StitchPreview({ plan, upto, showJumps = true, height = 360, fabric = "#ffffff", selectedId, onPick, focus, className = "" }: {
  plan: EmbPlan; upto?: number; showJumps?: boolean; height?: number; fabric?: string;
  selectedId?: string | null; onPick?: (id: string | null) => void; focus?: { key: string; box: BoxMm } | null; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ z: 1, cx: 0, cy: 0 });   // z = เท่าของ "พอดีจอ" · cx,cy = จุด (มม.) ที่อยู่กลางจอ
  const [size, setSize] = useState({ w: 600, h: height });
  const viewRef = useRef(view); viewRef.current = view;

  const fitK = useCallback(() => {
    const pad = 16;
    return Math.max(0.01, Math.min((size.w - pad * 2) / Math.max(plan.width, 0.01), (size.h - pad * 2) / Math.max(plan.height, 0.01)));
  }, [size, plan.width, plan.height]);

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: height }));
    ro.observe(el); setSize({ w: el.clientWidth, h: height });
    return () => ro.disconnect();
  }, [height]);

  // งานเปลี่ยนขนาด → กลับพอดีจอ
  useEffect(() => { setView({ z: 1, cx: 0, cy: 0 }); }, [plan.width, plan.height]);
  // ซูมไปกรอบที่ขอ (เช่น กด "ดูในภาพ" ของคำเตือน)
  useEffect(() => {
    if (!focus) return;
    const k0 = fitK();
    const z = Math.min(MAX_Z, Math.max(1, Math.min((size.w * 0.7) / Math.max(focus.box.w, 0.5), (size.h * 0.7) / Math.max(focus.box.h, 0.5)) / k0));
    setView({ z, cx: focus.box.x + focus.box.w / 2, cy: focus.box.y + focus.box.h / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  // วาดภาพหลัก
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size.w, H = size.h;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = fabric; g.fillRect(0, 0, W, H);
    if (!plan.width || !plan.height) return;
    const k = fitK() * view.z;
    const ox = W / 2 - view.cx * k, oy = H / 2 - view.cy * k;
    const end = Math.min(upto ?? plan.cmds.length, plan.cmds.length);
    const { px, py } = drawPlan(g, plan, k, ox, oy, end, showJumps, Math.max(0.6, 0.35 * k));
    const sel = selectedId ? plan.pieces.find((p) => p.id === selectedId) : null;
    if (sel) {
      g.save(); g.strokeStyle = "#4f46e5"; g.lineWidth = 2; g.setLineDash([5, 3]); g.beginPath();
      for (const r of sel.rings) { r.forEach(([x, y], i) => (i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k))); g.closePath(); }
      g.stroke(); g.restore();
    }
    if (upto != null && upto < plan.cmds.length) { g.fillStyle = "#ef4444"; g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill(); }
  }, [plan, upto, showJumps, size, view, fabric, selectedId, fitK]);

  // แผนที่ย่อ (วาดใหม่เมื่องานเปลี่ยน)
  const MW = 120, MH = 80;
  useEffect(() => {
    const cv = miniRef.current; if (!cv || !plan.width) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = MW * dpr; cv.height = MH * dpr;
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = fabric; g.fillRect(0, 0, MW, MH);
    const k = Math.min((MW - 8) / plan.width, (MH - 8) / plan.height);
    drawPlan(g, plan, k, MW / 2, MH / 2, plan.cmds.length, false, 0.6);
  }, [plan, fabric]);

  const zoomAt = useCallback((factor: number, sx?: number, sy?: number) => {
    setView((v) => {
      const k0 = fitK();
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * factor));
      if (sx == null || sy == null) return { ...v, z };
      // จุดใต้เมาส์อยู่ที่เดิม
      const kOld = k0 * v.z, kNew = k0 * z;
      const mx = v.cx + (sx - size.w / 2) / kOld, my = v.cy + (sy - size.h / 2) / kOld;
      return { z, cx: mx - (sx - size.w / 2) / kNew, cy: my - (sy - size.h / 2) / kNew };
    });
  }, [fitK, size]);

  // ล้อเมาส์ (ต้อง passive:false ถึงกันหน้าเว็บเลื่อนได้)
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ลากเลื่อน · ถ่างสองนิ้ว · คลิก = เลือกชิ้น
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; sx: number; sy: number; pinch?: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) gesture.current = { moved: false, sx: e.clientX, sy: e.clientY };
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; gesture.current = { moved: true, sx: 0, sy: 0, pinch: Math.hypot(a.x - b.x, a.y - b.y) }; }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId); if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gs = gesture.current; if (!gs) return;
    if (pts.current.size === 2 && gs.pinch) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = boxRef.current!.getBoundingClientRect();
      zoomAt(d / gs.pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      gs.pinch = d;
      return;
    }
    if (Math.hypot(e.clientX - gs.sx, e.clientY - gs.sy) > 4) gs.moved = true;
    if (gs.moved) {
      const k = fitK() * viewRef.current.z;
      const dx = (e.clientX - prev.x) / k, dy = (e.clientY - prev.y) / k;
      setView((v) => ({ ...v, cx: v.cx - dx, cy: v.cy - dy }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const gs = gesture.current;
    if (pts.current.size === 0) {
      if (gs && !gs.moved && onPick) {
        const r = boxRef.current!.getBoundingClientRect();
        const k = fitK() * viewRef.current.z;
        const x = viewRef.current.cx + (e.clientX - r.left - size.w / 2) / k, y = viewRef.current.cy + (e.clientY - r.top - size.h / 2) / k;
        onPick(pieceAt(plan, x, y, 6 / k)?.id ?? null);
      }
      gesture.current = null;
    }
  };

  const k0 = fitK();
  const vw = size.w / (k0 * view.z), vh = size.h / (k0 * view.z);
  const mk = plan.width ? Math.min((MW - 8) / plan.width, (MH - 8) / plan.height) : 1;
  const zoomPct = Math.round(view.z * 100);
  const realZ = PX_PER_MM / k0;
  const btn = "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-sm text-slate-700 shadow-sm hover:bg-slate-50";

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border border-slate-200 ${className}`} style={{ height }}>
      <div ref={boxRef} className="absolute inset-0 touch-none select-none" style={{ cursor: onPick ? "crosshair" : "grab" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={ref} className="block" />
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className={btn} onClick={() => zoomAt(1.5)} aria-label="ซูมเข้า">+</button>
        <button type="button" className={btn} onClick={() => zoomAt(1 / 1.5)} aria-label="ซูมออก">−</button>
        <button type="button" className={btn} onClick={() => setView({ z: 1, cx: 0, cy: 0 })} aria-label="พอดีจอ" title="พอดีจอ">⤢</button>
        <button type="button" className={`${btn} text-[10px]`} onClick={() => setView((v) => ({ ...v, z: Math.min(MAX_Z, Math.max(MIN_Z, realZ)) }))} aria-label="ขนาดจริง" title="ขนาดจริงบนจอ (โดยประมาณ)">1:1</button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 flex gap-1.5 text-[11px]">
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-600 shadow-sm">{zoomPct}%</span>
        <span className="hidden rounded-full bg-white/90 px-2 py-0.5 text-slate-500 shadow-sm sm:inline">ล้อเมาส์ = ซูม · ลาก = เลื่อน{onPick ? " · คลิกชิ้น = ตั้งฝีเข็ม" : ""}</span>
      </div>
      {(
        <div className="absolute bottom-2 right-2 overflow-hidden rounded-md border border-slate-200 shadow-sm" style={{ width: MW, height: MH, visibility: view.z > 1.05 ? "visible" : "hidden" }}
          onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); setView((v) => ({ ...v, cx: (e.clientX - r.left - MW / 2) / mk, cy: (e.clientY - r.top - MH / 2) / mk })); }}>
          <canvas ref={miniRef} style={{ width: MW, height: MH }} />
          <div className="pointer-events-none absolute border-2 border-indigo-500" style={{ left: MW / 2 + (view.cx - vw / 2) * mk, top: MH / 2 + (view.cy - vh / 2) * mk, width: vw * mk, height: vh * mk }} />
        </div>
      )}
    </div>
  );
}

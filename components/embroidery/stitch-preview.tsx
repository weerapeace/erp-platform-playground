"use client";
/**
 * 🧵 ภาพตัวอย่างฝีเข็ม — วาดคำสั่งเครื่องปักลงแคนวาส (ด้ายตามสีที่ปัก · เส้นกระโดดประจาง ๆ · พื้นตามสีผ้า)
 *   ซูม: Ctrl/⌘ + ล้อเมาส์ (ตรงจุดที่ชี้ · หมุนเฉย ๆ = หน้าเว็บเลื่อนตามปกติ — ชุดกระดาน board-kit) · ถ่างสองนิ้ว · ปุ่ม + − พอดีจอ 1:1 (ขนาดจริงบนจอ) · ลาก = เลื่อน · แผนที่ย่อมุมขวาล่าง (คลิก = ไปตรงนั้น)
 *   คลิกชิ้น → onPick(id) (หาชิ้นด้วย pieceAt) · selectedId = ไฮไลต์ขอบชิ้น · focus = ซูมไปกรอบนั้น (เปลี่ยน focus.key = ซูมใหม่)
 *   ไม่ใช้ useCanvasZoom ของบล็อกพิมพ์: ตัวนั้นขยายกล่อง SVG ให้เลื่อนดู — ฝีเข็มหลายหมื่นเส้นต้องวาดแคนวาสเท่าจอแล้วแปลงพิกัดเอง (แคนวาสขยาย 8 เท่ากินหน่วยความจำ)
 *   upto = วาดถึงคำสั่งที่เท่าไร (แถบเล่นลำดับการปัก) · ไม่ใส่ = ทั้งหมด
 *   real = ภาพเหมือนด้ายจริง (ด้ายหนา + เงามัน + เงาตก) · false = เส้นบางดูโครงฝีเข็ม
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { pieceAt, type BoxMm, type EmbPlan } from "@/lib/embroidery";
import { wheelAction } from "@/lib/board-kit";

/** ตัวแปลงพิกัดที่ส่งให้ชั้นวาดทับ · toScreen = มม. งาน → px ในกล่อง · toPlan = จุดเมาส์ (clientX/Y) → มม. งาน · k = px ต่อ มม. */
export type PreviewView = { toScreen: (x: number, y: number) => [number, number]; toPlan: (clientX: number, clientY: number) => [number, number]; k: number; w: number; h: number };

const MIN_Z = 0.5, MAX_Z = 40;
const PX_PER_MM = 96 / 25.4;

/** สีอ่อน/เข้มลง (t > 0 = ไปทางขาว · t < 0 = ไปทางดำ) */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const f = (v: number) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * วาดฝีเข็ม · real = ภาพเหมือนด้ายจริง: ด้ายหนา 0.4 มม. ขอบเข้ม + เงามันกลางเส้น + เงาตกบนผ้าบาง ๆ (ซูมเล็กมากจนด้ายบางกว่า ~1.5px ใช้เส้นธรรมดา)
 */
/** ไล่แสงทีละฝีได้ไม่เกินเท่านี้ต่อสี (เกิน = แบบเร็ว ให้ซูม/เลื่อนยังลื่น) */
const REAL_MAX = 25_000;

/** ตาราง มม. แบบโปรแกรม Tajima (เส้นทุก 10 มม. · จางทุก 2 มม. เมื่อซูมใกล้) — สีตามความสว่างของผ้า */
export function drawGrid(g: CanvasRenderingContext2D, W: number, H: number, k: number, ox: number, oy: number, fabric: string) {
  const n = parseInt(fabric.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const ink = lum > 140 ? "0,0,0" : "255,255,255";
  for (const [stepMm, alpha] of [[2, 0.05], [10, 0.13]] as const) {
    if (stepMm * k < 6) continue;
    g.strokeStyle = `rgba(${ink},${alpha})`; g.lineWidth = 1; g.beginPath();
    for (let x = ox - Math.ceil(ox / (stepMm * k)) * stepMm * k; x <= W; x += stepMm * k) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); }
    for (let y = oy - Math.ceil(oy / (stepMm * k)) * stepMm * k; y <= H; y += stepMm * k) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
    g.stroke();
  }
}

export function drawPlan(g: CanvasRenderingContext2D, plan: EmbPlan, k: number, ox: number, oy: number, end: number, showJumps: boolean, lw: number, real = false) {
  let ci = 0, px = ox, py = oy;
  let color = plan.colors[0]?.color ?? "#000";
  g.lineCap = "round"; g.lineJoin = "round";
  const thread = real && lw >= 1.5;
  const segs: number[] = [];
  const flush = () => {
    if (!segs.length) return;
    const path = () => { g.beginPath(); for (let i = 0; i < segs.length; i += 4) { g.moveTo(segs[i], segs[i + 1]); g.lineTo(segs[i + 2], segs[i + 3]); } };
    if (thread && segs.length / 4 <= REAL_MAX) {
      // แบบ Tajima: เงาตกบนผ้า (รวดเดียว) → ด้ายทีละฝี ไล่แสงขวางเส้นด้าย (ขอบเข้ม · สันสว่าง · กลางสีจริง) เหมือนด้ายนูน
      //   ไล่แสงสร้างครั้งเดียวต่อสี แล้วหมุนกระดาษไปตามทิศฝี (setTransform) — ไม่ต้องสร้างใหม่ทุกฝี
      g.save(); g.translate(lw * 0.15, lw * 0.22); g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = lw * 1.08; path(); g.stroke(); g.restore();
      const gr = g.createLinearGradient(0, -lw / 2, 0, lw / 2);
      gr.addColorStop(0, shade(color, -0.55)); gr.addColorStop(0.28, shade(color, 0.38)); gr.addColorStop(0.5, color); gr.addColorStop(0.85, shade(color, -0.3)); gr.addColorStop(1, shade(color, -0.6));
      const base = g.getTransform();
      g.strokeStyle = gr; g.lineWidth = lw;
      for (let i = 0; i < segs.length; i += 4) {
        const x0 = segs[i], y0 = segs[i + 1], x1 = segs[i + 2], y1 = segs[i + 3];
        const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.01) continue;
        const c = (x1 - x0) / L, sn = (y1 - y0) / L, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        g.setTransform(base.a * c, base.b + base.a * sn, base.c - base.d * sn, base.d * c, base.a * mx + base.e, base.d * my + base.f);
        g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
      }
      g.setTransform(base);
    } else if (thread) {
      // งานใหญ่มาก (ฝีเยอะเกินจะไล่แสงทีละฝีได้ลื่น) — แบบเร็ว: เงา → ขอบเข้ม → ตัวด้าย
      g.save(); g.translate(lw * 0.12, lw * 0.18); g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = lw * 1.05; path(); g.stroke(); g.restore();
      g.strokeStyle = shade(color, -0.35); g.lineWidth = lw; path(); g.stroke();
      g.strokeStyle = color; g.lineWidth = lw * 0.72; path(); g.stroke();
    } else { g.strokeStyle = color; g.lineWidth = lw; path(); g.stroke(); }
    segs.length = 0;
  };
  const jumps: number[] = [];
  for (let i = 0; i < end; i++) {
    const c = plan.cmds[i];
    const x = ox + c.x * k, y = oy + c.y * k;
    if (c.t === "stitch") segs.push(px, py, x, y);
    else if (c.t === "jump" && showJumps) jumps.push(px, py, x, y);
    else if (c.t === "color") { flush(); ci++; color = plan.colors[ci]?.color ?? color; }
    px = x; py = y;
  }
  flush();
  if (jumps.length) {
    g.save(); g.setLineDash([2, 3]); g.strokeStyle = "rgba(100,116,139,0.55)"; g.lineWidth = 0.7; g.beginPath();
    for (let i = 0; i < jumps.length; i += 4) { g.moveTo(jumps[i], jumps[i + 1]); g.lineTo(jumps[i + 2], jumps[i + 3]); }
    g.stroke(); g.restore();
  }
  return { px, py };
}

export function StitchPreview({ plan, upto, showJumps = true, height = 360, fabric = "#ffffff", selectedId, onPick, focus, real = true, grid = false, className = "", drawMode = false, onDraw, overlay, controls, children }: {
  plan: EmbPlan; upto?: number; showJumps?: boolean; height?: number; fabric?: string; real?: boolean;
  selectedId?: string | null; onPick?: (id: string | null) => void; focus?: { key: string; box: BoxMm } | null; className?: string;
  /** โหมดวาด (เช่น ลากเส้นทิศฝีเข็ม): กด/ลาก/ปล่อย ส่งพิกัดงาน (มม.) แทนการเลื่อนภาพ · ล้อเมาส์ยังซูมได้ */
  /** ตาราง มม. แบบ Tajima ใต้ฝีเข็ม */ grid?: boolean;
  drawMode?: boolean; onDraw?: (e: { phase: "down" | "move" | "up"; x: number; y: number }) => void;
  /** ชั้นวาดทับ (เส้นทิศ · จุดแก้รูปทรง) — ได้ตัวแปลงพิกัดงาน ↔ จอ */
  overlay?: (v: PreviewView) => ReactNode;
  /** ปุ่มเพิ่มต่อท้ายแถบซูมมุมขวาบน (เต็มจอ) */ controls?: ReactNode;
  /** ของลอยบนกระดาน (กล่องเครื่องมือ) */ children?: ReactNode;
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

  // งานเปลี่ยนขนาดชัด ๆ (เกิน 5%) → กลับพอดีจอ · ขยับนิดหน่อยตอนแก้จุด ไม่รีเซ็ต
  const lastDim = useRef({ w: plan.width, h: plan.height });
  useEffect(() => {
    const o = lastDim.current;
    if (Math.abs(plan.width - o.w) > Math.max(o.w, 1) * 0.05 || Math.abs(plan.height - o.h) > Math.max(o.h, 1) * 0.05) { setView({ z: 1, cx: 0, cy: 0 }); lastDim.current = { w: plan.width, h: plan.height }; }
  }, [plan.width, plan.height]);
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
    if (grid) drawGrid(g, W, H, k, ox, oy, fabric);
    const end = Math.min(upto ?? plan.cmds.length, plan.cmds.length);
    const { px, py } = drawPlan(g, plan, k, ox, oy, end, showJumps, Math.max(0.6, (real ? 0.42 : 0.35) * k), real);
    const sel = selectedId ? plan.pieces.find((p) => p.id === selectedId) : null;
    if (sel) {
      g.save(); g.strokeStyle = "#4f46e5"; g.lineWidth = 2; g.setLineDash([5, 3]); g.beginPath();
      for (const r of sel.rings) { r.forEach(([x, y], i) => (i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k))); g.closePath(); }
      g.stroke(); g.restore();
    }
    if (upto != null && upto < plan.cmds.length) { g.fillStyle = "#ef4444"; g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill(); }
  }, [plan, upto, showJumps, size, view, fabric, selectedId, fitK, real, grid]);

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

  // ล้อเมาส์: เฉย ๆ = เลื่อนหน้าเว็บ · Ctrl+ลูกกลิ้ง = ซูม (ต้อง passive:false ถึงกันหน้าเว็บซูมเองได้)
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (wheelAction(e.ctrlKey || e.metaKey) === "pass") return;
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
  const planAt = (clientX: number, clientY: number): [number, number] => {
    const r = boxRef.current!.getBoundingClientRect();
    const k = fitK() * viewRef.current.z;
    return [viewRef.current.cx + (clientX - r.left - size.w / 2) / k, viewRef.current.cy + (clientY - r.top - size.h / 2) / k];
  };
  const drawing = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (drawMode && onDraw && pts.current.size === 0 && e.button === 0) { drawing.current = true; const [x, y] = planAt(e.clientX, e.clientY); onDraw({ phase: "down", x, y }); return; }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) gesture.current = { moved: false, sx: e.clientX, sy: e.clientY };
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; gesture.current = { moved: true, sx: 0, sy: 0, pinch: Math.hypot(a.x - b.x, a.y - b.y) }; }
  };
  const onMove = (e: React.PointerEvent) => {
    if (drawing.current && onDraw) { const [x, y] = planAt(e.clientX, e.clientY); onDraw({ phase: "move", x, y }); return; }
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
    if (drawing.current) { drawing.current = false; if (onDraw) { const [x, y] = planAt(e.clientX, e.clientY); onDraw({ phase: "up", x, y }); } return; }
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
      <div ref={boxRef} className="absolute inset-0 select-none" style={{ touchAction: "none", cursor: drawMode ? "crosshair" : onPick ? "pointer" : "grab" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={ref} className="block" />
      </div>
      {overlay && (() => {
        const k = k0 * view.z, ox = size.w / 2 - view.cx * k, oy = size.h / 2 - view.cy * k;
        return (
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
            {overlay({ toScreen: (x, y) => [ox + x * k, oy + y * k], toPlan: planAt, k, w: size.w, h: size.h })}
          </svg>
        );
      })()}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className={btn} onClick={() => zoomAt(1.5)} aria-label="ซูมเข้า">+</button>
        <button type="button" className={btn} onClick={() => zoomAt(1 / 1.5)} aria-label="ซูมออก">−</button>
        <button type="button" className={btn} onClick={() => setView({ z: 1, cx: 0, cy: 0 })} aria-label="พอดีจอ" title="พอดีจอ">⤢</button>
        <button type="button" className={`${btn} text-[10px]`} onClick={() => setView((v) => ({ ...v, z: Math.min(MAX_Z, Math.max(MIN_Z, realZ)) }))} aria-label="ขนาดจริง" title="ขนาดจริงบนจอ (โดยประมาณ)">1:1</button>
        {controls}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 flex gap-1.5 text-[11px]">
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-600 shadow-sm">{zoomPct}%</span>
        <span className="hidden rounded-full bg-white/90 px-2 py-0.5 text-slate-500 shadow-sm sm:inline">Ctrl + ล้อเมาส์ = ซูม · ลาก = เลื่อน{onPick ? " · คลิกชิ้น = ตั้งฝีเข็ม" : ""}</span>
      </div>
      {(
        <div className="absolute bottom-2 right-2 overflow-hidden rounded-md border border-slate-200 shadow-sm" style={{ width: MW, height: MH, visibility: view.z > 1.05 ? "visible" : "hidden" }}
          onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); setView((v) => ({ ...v, cx: (e.clientX - r.left - MW / 2) / mk, cy: (e.clientY - r.top - MH / 2) / mk })); }}>
          <canvas ref={miniRef} style={{ width: MW, height: MH }} />
          <div className="pointer-events-none absolute border-2 border-indigo-500" style={{ left: MW / 2 + (view.cx - vw / 2) * mk, top: MH / 2 + (view.cy - vh / 2) * mk, width: vw * mk, height: vh * mk }} />
        </div>
      )}
      {children}
    </div>
  );
}

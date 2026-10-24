"use client";

/**
 * ภาพแผ่นงาน (SVG หน่วย mm) — ย้ายมาจากหน้าเว็บตัวช่วย (tools/nesting-app/web/static/app.js renderSheet)
 * ลากชิ้นขยับเองได้ (อัปเดต DOM ตรง ๆ ระหว่างลาก แล้วค่อยแจ้งตำแหน่งใหม่ตอนปล่อย — ลื่นแม้หลายร้อยชิ้น)
 * ⚠️ ของใน <use> ไม่โดน CSS ของหน้า → สีเส้นตัดใส่เป็น attribute ตรง ๆ · <svg> ไม่มี .hidden
 */
import { useLayoutEffect, useRef } from "react";
import { helperFileUrl } from "@/lib/nesting-helper";

export type Pt = [number, number];
export type HelperPart = {
  index: number; name: string; sha: string; qty: number; image_w_mm: number; image_h_mm: number;
  size_mm: [number, number]; outline: Pt[]; nest: Pt[]; cut: Pt[] | null; warnings: string[];
};
export type Placed = { inst: number; tid: number; rot: number; x: number; y: number };

export function rotXY(x: number, y: number, deg: number): Pt {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [x * c + y * s, -x * s + y * c];
}

/** หมุนชิ้น 90° รอบกลางภาพ (ตำแหน่งกลางชิ้นอยู่ที่เดิม) */
export function rotated90(pl: Placed, part: HelperPart): Placed {
  const cx = part.image_w_mm / 2, cy = part.image_h_mm / 2;
  const [ax, ay] = rotXY(cx, cy, pl.rot);
  const nr = (pl.rot + 90) % 360;
  const [bx, by] = rotXY(cx, cy, nr);
  return { ...pl, rot: nr, x: Math.round((pl.x + ax - bx) * 100) / 100, y: Math.round((pl.y + ay - by) * 100) / 100 };
}

const pathD = (pts: Pt[] | null) => (pts && pts.length ? `M${pts.map((p) => `${p[0]} ${p[1]}`).join("L")}Z` : "");
const transform = (pl: { x: number; y: number; rot: number }) => `translate(${pl.x} ${pl.y}) rotate(${-pl.rot})`;

export function SheetView({
  parts, placements, width, height, roll, margin, cutContour, header, bg, showSpacing, zoom, running,
  closePairs, outside, selected, onSelect, onMove, rollText,
}: {
  parts: HelperPart[];
  placements: Placed[];
  width: number;
  height: number;
  roll: boolean;
  margin: number;
  cutContour: boolean;
  header: [string, string] | null;   // ข้อความหัวงาน (null = ไม่แสดง)
  bg: string;
  showSpacing: boolean;
  zoom: number;
  running: boolean;
  closePairs: { a: number; b: number; gap: string }[];
  outside: Set<number>;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onMove: (i: number, x: number, y: number) => void;
  rollText: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; g: SVGGElement; x0: number; y0: number; px: number; py: number; pl: Placed; moved: boolean } | null>(null);

  const extra = roll ? Math.max(15, height * 0.12) : 0;
  const pad = 4;
  const fs = Math.max(2.5, Math.min(width, height) * 0.018);
  const bad = new Set<number>();
  for (const c of closePairs) { bad.add(c.a); bad.add(c.b); }

  // หัวงานยาวเกินแผ่น → ย่อตัวอักษรให้พอดีความกว้าง (เหมือนที่พิมพ์ลง PDF)
  useLayoutEffect(() => {
    const maxW = width - 2 * margin;
    svgRef.current?.querySelectorAll<SVGTextElement>("[data-fit]").forEach((el) => {
      el.style.fontSize = el.dataset.fs ?? el.style.fontSize;
      const len = el.getComputedTextLength();
      if (len > maxW) el.style.fontSize = `${(parseFloat(el.style.fontSize) * maxW) / len}px`;
    });
  }, [header, width, margin, bg]);

  const svgPoint = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = (e.target as Element).closest<SVGGElement>(".pc");
    if (!g) { onSelect(null); return; }
    const i = Number(g.dataset.i);
    onSelect(i);
    if (running) return;
    const pl = placements[i];
    const p = svgPoint(e);
    drag.current = { i, g, x0: pl.x, y0: pl.y, px: p.x, py: p.y, pl: { ...pl }, moved: false };
    svgRef.current!.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = svgPoint(e);
    d.pl.x = Math.round((d.x0 + p.x - d.px) * 100) / 100;
    d.pl.y = Math.round((d.y0 + p.y - d.py) * 100) / 100;
    d.moved = true;
    d.g.setAttribute("transform", transform(d.pl));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) onMove(d.i, d.pl.x, d.pl.y);
  };

  const dark = bg !== "#ffffff";
  const y1 = margin + 3.6 * 1.25, y2 = y1 + 3.0 * 1.25;
  return (
    <div ref={wrapRef} className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3" style={{ maxHeight: "70vh" }}>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + extra + 2 * pad}`}
        style={{ width: `${Math.max(20, 100 * zoom)}%`, display: "block", touchAction: "none", opacity: running ? 0.85 : 1 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {parts.map((p) => (
            <g key={p.index} id={`art${p.index}`}>
              <image href={helperFileUrl(p.sha, "view")} width={p.image_w_mm} height={p.image_h_mm} preserveAspectRatio="none" />
              {cutContour && p.cut ? <path d={pathD(p.cut)} fill="none" stroke="#e6007e" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
            </g>
          ))}
        </defs>
        {roll && (
          <>
            <rect x={0} y={height} width={width} height={extra} fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            <text x={width / 2} y={height + extra / 2} textAnchor="middle" fill="#94a3b8" style={{ fontSize: `${fs}px` }}>{rollText}</text>
          </>
        )}
        <rect x={0} y={0} width={width} height={height} style={{ fill: bg }} stroke="#94a3b8" vectorEffect="non-scaling-stroke" />
        {margin > 0 && (
          <rect x={margin} y={margin} width={Math.max(0, width - 2 * margin)} height={Math.max(0, height - 2 * margin)}
            fill="none" stroke={dark ? "#64748b" : "#cbd5e1"} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        {placements.map((pl, i) => {
          const p = parts[pl.tid];
          if (!p) return null;
          const isBad = bad.has(i), isOut = outside.has(i), isSel = i === selected;
          return (
            <g key={pl.inst} className="pc" data-i={i} transform={transform(pl)} style={{ cursor: running ? "default" : "move" }}>
              <use href={`#art${pl.tid}`} />
              {showSpacing && <path d={pathD(p.nest)} fill="none" stroke="#0ea5e9" strokeDasharray="2 2" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />}
              <path d={pathD(p.outline)} fill="transparent"
                stroke={isSel ? "#7c3aed" : isBad ? "#dc2626" : isOut ? "#d97706" : "none"}
                strokeWidth={isSel || isBad || isOut ? 2 : 0} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {header && (
          <>
            <text data-fit data-fs="3.6px" x={margin} y={y1} style={{ fontSize: "3.6px", fontWeight: 600, fill: dark ? "#fff" : "#000" }}>{header[0]}</text>
            <text data-fit data-fs="3px" x={margin} y={y2} style={{ fontSize: "3px", fill: dark ? "#fff" : "#000" }}>{header[1]}</text>
          </>
        )}
        {closePairs.map((c, k) => {
          const pa = placements[c.a], pb = placements[c.b];
          if (!pa || !pb) return null;
          return <text key={k} x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2} fill="#dc2626" fontWeight={700} style={{ fontSize: `${fs}px` }}>{c.gap}</text>;
        })}
      </svg>
    </div>
  );
}

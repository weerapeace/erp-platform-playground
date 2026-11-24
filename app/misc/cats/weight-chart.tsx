"use client";

/**
 * 🐾 กราฟน้ำหนักแมว (เส้น) — SVG ล้วน · ชี้/แตะจุด = บอกค่า
 *   ยังเป็นของเฉพาะแอปแมว (ระบบมีแค่กราฟแท่งกลาง SimpleBarChart) — ถ้ามีหน้าอื่นอยากได้กราฟเส้น ให้ย้ายไป components/ แล้วลงทะเบียน
 */
import { useState } from "react";
import { formatDate } from "@/lib/date";

export function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีการชั่งน้ำหนัก</p>;
  const W = 600, H = 180, L = 40, R = 14, T = 14, B = 26;
  const kgs = points.map((p) => p.kg);
  let lo = Math.min(...kgs), hi = Math.max(...kgs);
  const pad = Math.max(0.2, (hi - lo) * 0.2);
  lo = Math.max(0, Math.floor((lo - pad) * 10) / 10); hi = Math.ceil((hi + pad) * 10) / 10;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => (t1 === t0 ? (L + W - R) / 2 : L + ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R));
  const y = (kg: number) => T + (1 - (kg - lo) / (hi - lo || 1)) * (H - T - B);
  const path = points.map((p) => `${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto max-h-64 w-full" role="img" aria-label="กราฟน้ำหนัก" onMouseLeave={() => setHover(null)}>
        {[hi, (hi + lo) / 2, lo].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{v.toFixed(1)}</text>
          </g>
        ))}
        <polyline points={path} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.date)} cy={y(p.kg)} r={hover === i ? 6 : 4} fill={hover === i ? "#0369a1" : "#0ea5e9"} stroke="#fff" strokeWidth="1.5"
            onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "pointer" }} />
        ))}
        <text x={L} y={H - 6} fontSize="11" fill="#94a3b8">{formatDate(points[0].date)}</text>
        {points.length > 1 && <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" fill="#94a3b8">{formatDate(points[points.length - 1].date)}</text>}
      </svg>
      {h && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md bg-slate-800 px-2 py-1 text-xs text-white">
          {formatDate(h.date)} · {h.kg.toFixed(2)} กก.
        </div>
      )}
    </div>
  );
}

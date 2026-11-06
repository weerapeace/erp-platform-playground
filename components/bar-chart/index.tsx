"use client";

/**
 * SimpleBarChart (ของกลาง) — กราฟแท่งแนวตั้งชุดเดียว (SVG ล้วน ไม่ต้องลง library)
 *   ใช้ดูยอดรายวัน/รายเดือน เช่น ค่า AI ย้อนหลัง (ศูนย์ AI / API ที่เสียเงิน)
 *   ชี้/แตะแท่ง = กล่องบอกค่า · แท่งที่ค่า = 0 วาดเป็นขีดบาง ๆ · ป้ายแกนล่างเว้นระยะอัตโนมัติไม่ให้ทับกัน
 *
 *   <SimpleBarChart data={[{ key: "2026-11-06", label: "6 พ.ย.", value: 12.5, hint: "40 ครั้ง" }]} format={(v) => `฿${v}`} />
 */
import { useState } from "react";

export type BarDatum = { key: string; label: string; value: number; hint?: string };

export function SimpleBarChart({ data, format = (v) => String(v), height = 200, emptyText = "ยังไม่มีข้อมูล", ariaLabel = "กราฟแท่ง" }: {
  data: BarDatum[];
  format?: (v: number) => string;
  height?: number;
  emptyText?: string;
  ariaLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p>;
  const W = 900, H = height, L = 56, R = 12, T = 14, B = 28;
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = max > 0 ? niceMax(max) : 1;
  const slot = (W - L - R) / data.length;
  const bw = Math.max(3, Math.min(34, slot * 0.66));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.max(1, Math.ceil(data.length / 12));   // ป้ายแกนล่างไม่เกิน ~12 ป้าย
  const ticks = [top, top / 2, 0];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth={v === 0 ? 1 : 0.75} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">{format(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + slot * i + slot / 2;
          const yy = y(d.value);
          const hgt = Math.max(d.value > 0 ? 2 : 1, H - B - yy);
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "pointer" }}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent" />
              <rect x={cx - bw / 2} y={H - B - hgt} width={bw} height={hgt} rx={2}
                fill={d.value > 0 ? (hover === i ? "#2563eb" : "#60a5fa") : "#cbd5e1"} />
              {i % every === 0 && <text x={cx} y={H - 9} textAnchor="middle" fontSize={11} fill="#64748b">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-sm">
          <div className="font-medium text-slate-800">{h.label}</div>
          <div className="tabular-nums text-slate-700">{format(h.value)}</div>
          {h.hint && <div className="text-slate-500">{h.hint}</div>}
        </div>
      )}
    </div>
  );
}

/** ปัดค่าสูงสุดขึ้นเป็นตัวเลขกลม ๆ (1, 2, 5 × 10ⁿ) ให้เส้นแกนอ่านง่าย */
function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

"use client";

// ============================================================
// FabricLayoutPreview — ภาพผังการวางชิ้นบนหน้าผ้า (จากผล packFabric)
//   ผ้าม้วน: วาดผ้าผืนยาวผืนเดียว · ผ้าผืน: วาดแยกทีละผืน
//   ชิ้นเดียวกัน (ขนาดเดียวกัน) = สีเดียวกัน · ชี้เมาส์ดูขนาด · ↻ = ชิ้นที่หมุน 90°
// ============================================================

import { useMemo } from "react";
import type { FabricResult } from "@/lib/fabric-calc";

// สีชุดอ่านง่าย (ไล่เฉด ไม่ฉูดฉาด) — ใช้วนตามชนิดชิ้น
const PALETTE = [
  { fill: "#c7d2fe", stroke: "#6366f1", text: "#3730a3" },
  { fill: "#bbf7d0", stroke: "#22c55e", text: "#166534" },
  { fill: "#fed7aa", stroke: "#f97316", text: "#9a3412" },
  { fill: "#fbcfe8", stroke: "#ec4899", text: "#9d174d" },
  { fill: "#bae6fd", stroke: "#0ea5e9", text: "#075985" },
  { fill: "#fde68a", stroke: "#f59e0b", text: "#92400e" },
  { fill: "#ddd6fe", stroke: "#8b5cf6", text: "#5b21b6" },
  { fill: "#a5f3fc", stroke: "#06b6d4", text: "#155e75" },
];

export function FabricLayoutPreview({ result, faceWidthCm, sheetLengthCm, mode }: {
  result: FabricResult;
  faceWidthCm: number;
  sheetLengthCm?: number | null;
  mode: "roll" | "sheet";
}) {
  // สีต่อชนิดชิ้น (ตาม key ของบรรทัด)
  const colorOf = useMemo(() => {
    const keys = [...new Set(result.rows.flatMap((r) => r.items.map((i) => i.key)))];
    const m = new Map<string, typeof PALETTE[number]>();
    keys.forEach((k, i) => m.set(k, PALETTE[i % PALETTE.length]));
    return (k: string) => m.get(k) ?? PALETTE[0];
  }, [result.rows]);

  // แบ่งเป็น "ผืน" — ผ้าม้วน = ผืนเดียว (ยาวเท่าที่ใช้)
  const sheets = useMemo(() => {
    if (mode === "sheet" && (result.sheetsUsed ?? 0) > 0) {
      const out: { label: string; height: number; rows: typeof result.rows }[] = [];
      for (let s = 0; s < (result.sheetsUsed ?? 0); s++) {
        out.push({
          label: `ผืนที่ ${s + 1}`,
          height: Number(sheetLengthCm) || 0,
          rows: result.rows.filter((r) => (r.sheetIndex ?? 0) === s).map((r) => ({ ...r, y: r.yInSheet ?? r.y })),
        });
      }
      return out;
    }
    return [{ label: "ผ้า 1 ผืนยาว (ต่อเนื่อง)", height: result.usedLengthCm, rows: result.rows }];
  }, [mode, result, sheetLengthCm]);

  if (!result.ok || result.rows.length === 0) return null;

  const W = 320;                                  // ความกว้างภาพ (px) — หน้าผ้าเต็มความกว้างนี้
  const scale = faceWidthCm > 0 ? W / faceWidthCm : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[12px] text-slate-500">
          🧵 ผังการวาง — หน้าผ้า {faceWidthCm} ซม. (แนวนอน) · ความยาวผ้าลงล่าง · ↻ = หมุนชิ้น 90°
        </p>
        <span className="text-[11px] text-slate-400">พื้นที่เทา = เศษที่เหลือ</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {sheets.map((sh, si) => {
          const H = Math.max(1, sh.height) * scale;
          return (
            <div key={si} className="shrink-0">
              <div className="text-[11px] text-slate-500 mb-1 text-center">
                {sh.label} · {Math.round(sh.height * 10) / 10} ซม.
              </div>
              <svg width={W} height={Math.min(H, 900)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet"
                className="border-2 border-slate-300 rounded bg-slate-100" role="img" aria-label={`ผังการวาง ${sh.label}`}>
                {/* เนื้อผ้า */}
                <rect x={0} y={0} width={W} height={H} fill="#f1f5f9" />
                {/* เส้นบอกระยะทุก 10 ซม. */}
                {Array.from({ length: Math.floor(sh.height / 10) }, (_, i) => (
                  <line key={i} x1={0} y1={(i + 1) * 10 * scale} x2={W} y2={(i + 1) * 10 * scale} stroke="#e2e8f0" strokeWidth={0.5} />
                ))}
                {/* ชิ้นงาน */}
                {sh.rows.flatMap((r) => r.items.map((it, ii) => {
                  const c = colorOf(it.key);
                  const x = it.x * scale, y = r.y * scale, w = it.w * scale, h = it.h * scale;
                  const showText = w > 34 && h > 14;
                  return (
                    <g key={`${r.y}-${ii}`}>
                      <rect x={x} y={y} width={w} height={h} fill={c.fill} stroke={c.stroke} strokeWidth={0.8} rx={1.5}>
                        <title>{`${it.w}×${it.h} ซม.${it.rotated ? " (หมุน 90°)" : ""}`}</title>
                      </rect>
                      {showText && (
                        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle"
                          fontSize={Math.min(9, h * 0.5)} fill={c.text}>
                          {it.rotated ? "↻ " : ""}{Math.round(it.w)}×{Math.round(it.h)}
                        </text>
                      )}
                    </g>
                  );
                }))}
              </svg>
            </div>
          );
        })}
      </div>

      {sheets.length > 1 && <p className="text-[11px] text-slate-400">* เลื่อนดูผืนถัดไปทางขวา</p>}
    </div>
  );
}

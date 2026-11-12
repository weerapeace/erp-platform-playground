"use client";

/**
 * ✂ PatternSheet — วาดชิ้นแพทเทิร์น (สี่เหลี่ยมตามกว้าง×ยาว หรือรูปทรงจริงที่วาดไว้) ขนาดจริง · ของกลาง · เจ้าของขอ 2026-11-07
 *   หน้าต่างวาดชิ้น (สี่เหลี่ยม วงกลม ปากกา วางจาก Illustrator) = ./shape-editor.tsx (ShapeEditor)
 *   <PatternPiecesSvg layout={shelfLayout(patternPieces(lines), 56)} />                 ภาพรวม (ย่อให้พอดีกล่อง)
 *   <PatternPiecesSvg layout={L} view={{ x, y, w: 19, h: 27.7 }} printMm />            1 หน้า A4 ขนาดจริง 1:1 (หน่วยมม. ตอนพิมพ์)
 *   สีตามชนิดวัสดุ · เส้นประ = แนวตัด · ป้าย = รหัสชิ้น + ชื่อ + ขนาด + ตัดกี่ชิ้น
 * คิดเลขอยู่ lib/pattern-sheet (patternPieces / shelfLayout / tilePages / DXF / SVG) · คู่มือ docs/pattern-sheet.md
 * ใช้ที่: หน้าพิมพ์แพทเทิร์นของใบงานออกแบบ (app/print/design-sheet/[id]/pattern)
 */
import type { CSSProperties } from "react";
import type { PatternLayout } from "@/lib/pattern-sheet";

// สีชุดเดียวกับผังวางผ้า (components/design-sheet-detail/fabric-layout-preview) — อ่านง่าย พิมพ์ขาวดำก็ยังเห็นเส้น
export const PATTERN_PALETTE = [
  { fill: "#e0e7ff", stroke: "#4f46e5", text: "#312e81" },
  { fill: "#dcfce7", stroke: "#16a34a", text: "#14532d" },
  { fill: "#ffedd5", stroke: "#ea580c", text: "#7c2d12" },
  { fill: "#fce7f3", stroke: "#db2777", text: "#831843" },
  { fill: "#e0f2fe", stroke: "#0284c7", text: "#0c4a6e" },
  { fill: "#fef3c7", stroke: "#d97706", text: "#78350f" },
];

/** สีต่อชนิดวัสดุ (ลำดับที่เจอครั้งแรก) */
export function groupColors(layout: PatternLayout): Map<string, (typeof PATTERN_PALETTE)[number]> {
  const m = new Map<string, (typeof PATTERN_PALETTE)[number]>();
  for (const p of layout.placed) if (!m.has(p.group)) m.set(p.group, PATTERN_PALETTE[m.size % PATTERN_PALETTE.length]);
  return m;
}

export function PatternPiecesSvg({ layout, view, printMm = false, mono = false, className, style }: {
  layout: PatternLayout;
  /** ส่วนของแผ่นที่จะวาด (ซม.) — ไม่ใส่ = ทั้งแผ่น */
  view?: { x: number; y: number; w: number; h: number };
  /** ตั้งขนาด svg เป็นมิลลิเมตรจริง (พิมพ์ 100% = ขนาดจริง 1:1) */
  printMm?: boolean;
  /** ขาวดำ (ประหยัดหมึกตอนพิมพ์ขนาดจริง) */
  mono?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const v = view ?? { x: 0, y: 0, w: Math.max(1, layout.width), h: Math.max(1, layout.height) };
  const colors = groupColors(layout);
  const sizeProps = printMm ? { width: `${v.w * 10}mm`, height: `${v.h * 10}mm` } : { width: "100%" };
  return (
    <svg viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} {...sizeProps} className={className} style={style}
      role="img" aria-label="ชิ้นแพทเทิร์น" preserveAspectRatio="xMinYMin meet">
      {layout.placed.map((p) => {
        const c = colors.get(p.group) ?? PATTERN_PALETTE[0];
        const fs = Math.max(0.7, Math.min(2.2, Math.min(p.w, p.h) / 5.5));
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const showSub = p.h >= fs * 3.2;
        return (
          <g key={p.id}>
            {p.d ? (   // รูปทรงจริงที่วาด/วางจาก Illustrator
              <g transform={`translate(${p.x} ${p.y})`}>
                <path d={p.d} fillRule="evenodd" fill={mono ? "#fff" : c.fill} stroke={mono ? "#111" : c.stroke}
                  strokeWidth={printMm ? 0.04 : Math.max(0.08, v.w / 600)} strokeDasharray={printMm ? "0.4 0.25" : undefined} />
                {p.sewD && <path d={p.sewD} fill="none" stroke={mono ? "#555" : c.stroke} strokeWidth={printMm ? 0.025 : Math.max(0.05, v.w / 900)} strokeDasharray={printMm ? "0.2 0.15" : "0.6 0.4"} />}
                {p.innerD && <path d={p.innerD} fill="none" stroke={mono ? "#000" : "#2563eb"} strokeWidth={printMm ? 0.035 : Math.max(0.07, v.w / 700)} strokeDasharray={printMm ? "0.25 0.15" : "0.6 0.4"} />}
                {p.foldD && <path d={p.foldD} fill="none" stroke={mono ? "#000" : "#7c3aed"} strokeWidth={printMm ? 0.035 : Math.max(0.07, v.w / 700)} strokeDasharray={printMm ? "0.5 0.15 0.1 0.15" : "1.2 0.4 0.3 0.4"} />}
                {p.marksD && <path d={p.marksD} fill="none" stroke={mono ? "#000" : c.stroke} strokeWidth={printMm ? 0.035 : Math.max(0.07, v.w / 700)} />}
                {(p.stitchSegs ?? []).map((L, k) => <path key={`st${k}`} data-stitch d={"M" + L.map(([x, y]) => `${x} ${y}`).join("L")} fill="none" stroke={mono ? "#000" : "#7c2d12"} strokeWidth={printMm ? 0.025 : Math.max(0.05, v.w / 900)} strokeDasharray={printMm ? "0.18 0.12" : "0.3 0.2"} />)}
                {(p.bands ?? []).map((bd, k) => (   // แนวทากาว (ส้ม เส้นประยาว) / ปาดบาง (น้ำตาล จุด) — รอบ F
                  <path key={`bd${k}`} data-band={bd.kind} d={"M" + bd.pts.map(([x, y]) => `${x} ${y}`).join("L")} fill="none" stroke={mono ? "#000" : bd.kind === "glue" ? "#ea580c" : "#92400e"} strokeWidth={printMm ? 0.04 : Math.max(0.08, v.w / 600)} strokeDasharray={bd.kind === "glue" ? (printMm ? "0.4 0.15" : "0.6 0.25") : (printMm ? "0.08 0.12" : "0.12 0.2")} />
                ))}
                {(p.dims ?? []).map((dm, k) => (   // เส้นวัดถาวร: เส้นบาง + ตัวเลข (รอบ E)
                  <g key={`dim${k}`} data-dim>
                    <line x1={dm.a[0]} y1={dm.a[1]} x2={dm.b[0]} y2={dm.b[1]} stroke={mono ? "#000" : "#0f766e"} strokeWidth={printMm ? 0.03 : Math.max(0.06, v.w / 800)} />
                    <text x={(dm.a[0] + dm.b[0]) / 2} y={(dm.a[1] + dm.b[1]) / 2 - 0.25} fontSize={printMm ? 0.35 : Math.max(0.5, fs * 0.45)} textAnchor="middle" fill={mono ? "#000" : "#0f766e"}>{dm.label}</text>
                  </g>
                ))}
              </g>
            ) : (
              <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={mono ? "#fff" : c.fill} stroke={mono ? "#111" : c.stroke}
                strokeWidth={printMm ? 0.04 : Math.max(0.08, v.w / 600)} strokeDasharray={printMm ? "0.4 0.25" : undefined} />
            )}
            <text x={cx} y={showSub ? cy - fs * 0.55 : cy} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={mono ? "#111" : c.text} fontWeight={600}>
              {p.id} {p.name}
            </text>
            {showSub && (
              <text x={cx} y={cy + fs * 0.75} fontSize={fs * 0.78} textAnchor="middle" dominantBaseline="middle" fill={mono ? "#333" : c.stroke}>
                {p.w}×{p.h} ซม. · ตัด ×{p.count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

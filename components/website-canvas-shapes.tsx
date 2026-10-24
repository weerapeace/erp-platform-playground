"use client";

/**
 * ภาพลายของตกแต่ง (SVG) สำหรับคลังของตกแต่งในตัวจัดหน้า ERP
 * ⚠️ สำเนาจากเว็บร้าน src/components/home/CanvasShapes.tsx (CanvasShape) — แก้ลายที่นั่นแล้วต้องคัดลอกมาที่นี่ด้วย
 */
import type React from "react";
import { shopPatternPaint, type ShopPattern, type ShopPatternLook } from "@/lib/website-frames";

/** 🎨 ลายของร้าน 1 ชิ้น — เต็มกล่อง (คงสัดส่วนของลาย) · look = สีที่แปลงเป็นค่าจริงแล้ว (สำเนาจากเว็บร้าน CanvasShapes.tsx ShopPatternArt) */
export function ShopPatternArt({ pattern, look }: { pattern: ShopPattern; look: ShopPatternLook }) {
  const paint = shopPatternPaint(pattern, look);
  return (
    <svg aria-hidden className="cv-shape" style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }} viewBox={pattern.vb.join(" ")} preserveAspectRatio="xMidYMid meet">
      {pattern.parts.map((pt, i) => (
        <path
          key={i}
          d={pt.d}
          transform={pt.t}
          fillRule={pt.rule}
          style={{ fill: paint[i].fill, stroke: paint[i].stroke }}
          strokeWidth={paint[i].width || undefined}
          strokeLinecap={pt.lc}
          strokeLinejoin={pt.lj}
          opacity={paint[i].opacity}
        />
      ))}
    </svg>
  );
}

export interface ShapeSpec {
  shape: string;
  w: number;
  h: number;
  outline: boolean;
  strokeWidth: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** เส้นลูกไม้ขอบหยักรอบวงรี (cx,cy,rx,ry) — bump = ความสูงหยัก */
function laceEllipsePath(cx: number, cy: number, rx: number, ry: number, bump: number): string {
  const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.max(12, Math.round(perim / (bump * 2.4)));
  const pt = (a: number, k = 1) => [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)];
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    // จุดดึงออกนอกวง → ได้หยักโค้งมน
    const kOut = 1 + (bump * 2.1) / Math.max(1, (rx + ry) / 2);
    const [qx, qy] = pt(am, kOut);
    d += `${i === 0 ? `M${r2(x0)} ${r2(y0)}` : ""} Q${r2(qx)} ${r2(qy)} ${r2(x1)} ${r2(y1)}`;
  }
  return d + " Z";
}

/** ✂️ จุดของสติกเกอร์ขอบหยัก (32 จุด) + แท่งบาร์โค้ด [x, กว้าง] — ของตกแต่งสำเร็จรูป */
const NONE = "none";
const BADGE_POINTS = Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 42 : 49;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
}).join(" ");
const BARCODE_BARS: [number, number][] = (() => {
  const ws = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2];
  const out: [number, number][] = [];
  let x = 2;
  ws.forEach((w, i) => {
    if (i % 2 === 0) out.push([x, w * 1.6]);
    x += w * 1.6 + 0.9;
  });
  return out.filter(([bx, bw]) => bx + bw <= 98);
})();

/* ── ลายไอคอน (viewBox คงที่) ── */
const ICONS: Record<string, { vb: [number, number]; body: (fill: string, stroke: string, sw: number) => React.ReactNode }> = {
  bow: {
    vb: [100, 72],
    body: (fill, stroke, sw) => (
      <>
        <path d="M50 31 C38 8 8 4 6 24 C4 42 30 44 50 34 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M50 31 C62 8 92 4 94 24 C96 42 70 44 50 34 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M46 37 C41 50 34 60 27 70 L37 67 L43 71 C47 60 49 49 50 39 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M54 37 C59 50 66 60 73 70 L63 67 L57 71 C53 60 51 49 50 39 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <ellipse cx="50" cy="33" rx="7.5" ry="8.5" fill={fill} stroke={stroke} strokeWidth={sw} />
        {fill !== "none" && (
          <g fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round">
            <path d="M46 30 C38 17 22 13 15 22" />
            <path d="M54 30 C62 17 78 13 85 22" />
            <path d="M47 30 C49 33 51 33 53 30" />
          </g>
        )}
      </>
    ),
  },
  heart: {
    vb: [100, 90],
    body: (fill, stroke, sw) => (
      <path d="M50 86 C21 64 3 47 3 27 C3 13 14 3 28 3 C38 3 46 9 50 18 C54 9 62 3 72 3 C86 3 97 13 97 27 C97 47 79 64 50 86 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    ),
  },
  sparkle: {
    vb: [100, 100],
    body: (fill, stroke, sw) => <path d="M50 2 C53 34 66 47 98 50 C66 53 53 66 50 98 C47 66 34 53 2 50 C34 47 47 34 50 2 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />,
  },
  star: {
    vb: [100, 96],
    body: (fill, stroke, sw) => <polygon points="50,4 61.5,37 96,37.5 68,58 78.5,91 50,71 21.5,91 32,58 4,37.5 38.5,37" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />,
  },
  flower: {
    vb: [100, 100],
    body: (fill, stroke, sw) => (
      <>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="50" cy="27" rx="15" ry="23" transform={`rotate(${a} 50 50)`} fill={fill} stroke={stroke} strokeWidth={sw} />
        ))}
        <circle cx="50" cy="50" r="11" fill={fill === "none" ? "none" : "#fff"} fillOpacity={0.7} stroke={stroke === "none" ? fill : stroke} strokeWidth={Math.max(1, sw)} />
      </>
    ),
  },
  // ✂️ ของตกแต่งสำเร็จรูป (แฟ้มวางอิสระ 2026-10-23) — คลิปหนีบ · คลิปดำ · เทปกาว · กระดาษโน้ต · สติกเกอร์ขอบหยัก · บาร์โค้ด
  //    ⚠️ ลายชุดเดียวกันทั้งเว็บร้าน (src/components/home/CanvasShapes.tsx) และ ERP (components/website-canvas-shapes.tsx)
  clip: {
    vb: [40, 100],
    body: (fill, stroke) => (
      <path d="M26 30 V78 C26 88 14 88 14 78 V20 C14 6 34 6 34 20 V82 C34 98 6 98 6 82 V30" fill="none" stroke={fill === NONE ? stroke : fill} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  binder: {
    vb: [100, 80],
    body: (fill, stroke, sw) => (
      <>
        <path d="M34 38 L22 6 Q50 0 78 6 L66 38" fill="none" stroke={fill === NONE ? stroke : fill} strokeOpacity={0.6} strokeWidth={4} strokeLinejoin="round" />
        <path d="M10 36 H90 L84 74 Q50 80 16 74 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        {fill !== NONE && <path d="M17 44 H83" stroke="#fff" strokeOpacity={0.25} strokeWidth={3} />}
      </>
    ),
  },
  tape: {
    vb: [120, 36],
    body: (fill, stroke, sw) => (
      <path d="M6 2 L114 2 L118 7 L114 12 L118 17 L114 22 L118 27 L114 34 L6 34 L2 29 L6 24 L2 19 L6 14 L2 9 Z" fill={fill} fillOpacity={0.6} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    ),
  },
  note: {
    vb: [100, 100],
    body: (fill, stroke, sw) => (
      <>
        <path d="M4 4 H96 V74 L74 96 H4 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M96 74 H80 Q74 74 74 80 V96 Z" fill={fill === NONE ? NONE : "#000"} fillOpacity={0.14} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      </>
    ),
  },
  badge: {
    vb: [100, 100],
    body: (fill, stroke, sw) => <polygon points={BADGE_POINTS} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />,
  },
  barcode: {
    vb: [100, 50],
    body: (fill, stroke) => (
      <g fill={fill === NONE ? stroke : fill}>
        {BARCODE_BARS.map(([x, w]) => (
          <rect key={x} x={x} y={2} width={w} height={46} />
        ))}
      </g>
    ),
  },
};

/**
 * ของตกแต่ง 1 ชิ้น — เต็มกล่องของชิ้น
 */
export function CanvasShape({ it, color }: { it: ShapeSpec; color: string }) {
  const { w, h } = it;
  const sw = it.strokeWidth;
  const icon = ICONS[it.shape];
  if (icon) {
    const [vw, vh] = icon.vb;
    // เส้นขอบในหน่วยของ viewBox ไอคอน (ให้หนาเท่ากับหน่วยผืน)
    const k = Math.min(w / vw, h / vh) || 1;
    const fill = it.outline ? "none" : color;
    const stroke = it.outline ? color : "none";
    return (
      <svg aria-hidden className="cv-shape" style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet">
        {icon.body(fill, stroke, it.outline ? sw / k : 0)}
      </svg>
    );
  }

  const fill = it.outline ? "none" : color;
  const stroke = it.outline ? color : "none";
  let body: React.ReactNode = null;
  switch (it.shape) {
    case "rect":
      body = <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} fill={fill} stroke={stroke} strokeWidth={sw} />;
      break;
    case "ellipse":
      body = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - sw / 2)} ry={Math.max(0, h / 2 - sw / 2)} fill={fill} stroke={stroke} strokeWidth={sw} />;
      break;
    case "line": {
      const horiz = w >= h;
      body = horiz ? (
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      ) : (
        <line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      );
      break;
    }
    case "wave": {
      const amp = Math.max(1, h / 2 - sw);
      const n = Math.max(1, Math.round(w / Math.max(8, h * 2)));
      const step = w / n;
      let d = `M0 ${h / 2}`;
      for (let i = 0; i < n; i++) {
        const x0 = i * step;
        d += ` C${r2(x0 + step * 0.25)} ${r2(h / 2 - amp)} ${r2(x0 + step * 0.25)} ${r2(h / 2 - amp)} ${r2(x0 + step / 2)} ${h / 2}`;
        d += ` C${r2(x0 + step * 0.75)} ${r2(h / 2 + amp)} ${r2(x0 + step * 0.75)} ${r2(h / 2 + amp)} ${r2(x0 + step)} ${h / 2}`;
      }
      body = <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />;
      break;
    }
    case "pearls": {
      const horiz = w >= h;
      const len = horiz ? w : h;
      const th = horiz ? h : w;
      const n = Math.max(2, Math.floor(len / (th * 1.08)));
      const gap = len / n;
      const r = Math.min(th / 2, gap / 2) * 0.86;
      body = (
        <>
          <line x1={horiz ? 0 : w / 2} y1={horiz ? h / 2 : 0} x2={horiz ? w : w / 2} y2={horiz ? h / 2 : h} stroke={color} strokeOpacity={0.45} strokeWidth={Math.max(0.6, r * 0.12)} />
          {Array.from({ length: n }, (_, i) => {
            const c = gap * (i + 0.5);
            const cx = horiz ? c : w / 2;
            const cy = horiz ? h / 2 : c;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} fill={fill === "none" ? "none" : color} stroke={it.outline ? color : "none"} strokeWidth={sw} />
                {!it.outline && <circle cx={cx - r * 0.32} cy={cy - r * 0.32} r={r * 0.28} fill="#fff" fillOpacity={0.6} />}
              </g>
            );
          })}
        </>
      );
      break;
    }
    case "lace": {
      const bump = Math.max(2, Math.min(w, h) * 0.03);
      body = (
        <>
          <path d={laceEllipsePath(w / 2, h / 2, w / 2 - bump * 2.6, h / 2 - bump * 2.6, bump)} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - bump * 3.6)} ry={Math.max(0, h / 2 - bump * 3.6)} fill="none" stroke={color} strokeWidth={Math.max(0.6, sw * 0.5)} strokeDasharray={`${bump * 0.6} ${bump}`} />
        </>
      );
      break;
    }
    case "scallop": {
      // แถบทึบด้านบน + ขอบล่างเป็นครึ่งวงกลมต่อกัน (เหมือนกันสาดร้านขนม)
      const n = Math.max(2, Math.round(w / Math.max(8, h * 0.9)));
      const rr = w / (2 * n);
      const top = Math.max(0, h - rr);
      let d = `M0 0 H${r2(w)} V${r2(top)}`;
      for (let i = n - 1; i >= 0; i--) d += ` A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(i * 2 * rr)} ${r2(top)}`;
      body = <path d={d + " Z"} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
      break;
    }
    case "arch": {
      const rx = Math.max(0, w / 2 - sw / 2);
      const ry = Math.min(rx, Math.max(0, h - sw));
      body = <path d={`M${sw / 2} ${h} V${r2(sw / 2 + ry)} A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(w - sw / 2)} ${r2(sw / 2 + ry)} V${h}`} fill={fill} stroke={it.outline ? color : "none"} strokeWidth={sw} />;
      break;
    }
  }
  return (
    <svg aria-hidden className="cv-shape" style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }} viewBox={`0 0 ${r2(w)} ${r2(h)}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {body}
    </svg>
  );
}

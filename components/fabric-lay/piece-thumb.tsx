"use client";
/** ✂️ ภาพย่อชิ้นแบบ — เส้นตัด (เทา) + เส้นเย็บ (สี) + รูปอ้างอิงของชิ้น (ถ้ามี) · ขนาดตามสัดส่วนจริง */
import { pieceLocal, type LayPiece } from "@/lib/fabric-lay";
import { polyD } from "@/lib/pattern-shape";
import { imgUrl } from "./shared";

export function PieceThumb({ piece, size = 56, color = "#4f46e5" }: { piece: LayPiece; size?: number; color?: string }) {
  const L = pieceLocal(piece, true);
  const pad = Math.max(L.w, L.h) * 0.06;
  const sw = Math.max(L.w, L.h) / 60;
  const ref = piece.ref ? imgUrl(piece.ref, 200) : null;
  const clip = `pt-${piece.id}`;
  return (
    <svg viewBox={`${-pad} ${-pad} ${L.w + pad * 2} ${L.h + pad * 2}`} width={size} height={size} className="shrink-0 rounded bg-slate-50" aria-hidden>
      {ref && <>
        <defs><clipPath id={clip}><path d={polyD(L.sew)} /></clipPath></defs>
        <image href={ref} x={0} y={0} width={L.w} height={L.h} preserveAspectRatio="none" clipPath={`url(#${clip})`} opacity={0.85} />
      </>}
      <path d={polyD(L.cut)} fill={ref ? "none" : `${color}14`} stroke="#94a3b8" strokeWidth={sw} strokeDasharray={piece.allow ? `${sw * 3} ${sw * 2}` : undefined} />
      <path d={polyD(L.sew)} fill="none" stroke={color} strokeWidth={sw * 1.4} />
      {L.holes.map((h, i) => <path key={i} d={polyD(h)} fill="#fff" stroke={color} strokeWidth={sw} />)}
    </svg>
  );
}

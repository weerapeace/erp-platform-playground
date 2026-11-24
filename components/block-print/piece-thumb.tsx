"use client";
/** 🧱 บล็อกพิมพ์ — รูปย่อของชิ้น (ใช้ทั้งหน้าตั้งขนาดและหน้าจัดวางในบล็อก) */
import { opsToSvgPath, pieceShapes, type BlockPiece } from "@/lib/block-print";

export function PieceThumb({ p, size = 24 }: { p: BlockPiece; size?: number }) {
  const inner = size - 2;
  const s = inner / Math.max(p.ow, p.oh);
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${size} ${size}`} className="shrink-0 rounded bg-slate-50">
      {pieceShapes(p).map((sh, i) => <path key={i} d={opsToSvgPath(sh.d, s, s, (inner - p.ow * s) / 2, (inner - p.oh * s) / 2)} fill="#111" fillRule={sh.fill} />)}
    </svg>
  );
}

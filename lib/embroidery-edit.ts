/**
 * 🧵 ไฟล์ปัก — ตัวช่วยหน้าจอแก้ลาย (รอบ 4): แปลงพิกัดงาน ↔ พิกัดไฟล์ · จุดรูปทรงของชิ้น (แก้จุด) · ชิ้นตัวหนังสือ
 *   พิกัดไฟล์ = มม. เดียวกับ ax/ay ของชิ้น (ไม่ขึ้นกับขนาดที่ปัก) · พิกัดงาน = มม. จริงที่ปัก จุดกึ่งกลางงาน = 0,0 (เหมือน buildPlan)
 *   ไม่มีหน้าจอ — ใช้ได้ทั้งเบราว์เซอร์และเทสต์
 */
import { buildPiece, opsBox, OP, type BlockPiece, type DrawOps } from "@/lib/block-print";
import { designBox, isActive, type EmbSettings, type Pt } from "@/lib/embroidery";

/** ตัวแปลงพิกัดของงานนี้ (ต้องตรงกับ buildPlan: กรอบจากชิ้นที่เลือกปัก · ย่อขยายตามกว้างที่ตั้ง) */
export function planFrame(pieces: BlockPiece[], st: EmbSettings) {
  const box = designBox(pieces.filter(isActive));
  const scale = box.w > 0 ? st.width_mm / box.w : 1;
  const cx = (box.w * scale) / 2, cy = (box.h * scale) / 2;
  return {
    scale, box,
    toPlan: (x: number, y: number): Pt => [(x - box.x) * scale - cx, (y - box.y) * scale - cy],
    toFile: (x: number, y: number): Pt => [(x + cx) / scale + box.x, (y + cy) / scale + box.y],
  };
}

const ARGS: Record<number, number> = { [OP.M]: 2, [OP.L]: 2, [OP.C]: 6, [OP.Q]: 4, [OP.Z]: 0 };

/** จุดที่ลากได้ของชิ้น (ปลายเส้นแต่ละท่อน) — พิกัดไฟล์ · s = เส้นย่อยที่เท่าไร · i = ตำแหน่งตัวเลข x ของจุดใน d */
export type Handle = { s: number; i: number; x: number; y: number };
export function pieceHandles(p: BlockPiece, max = 600): Handle[] {
  const shapes = p.parts?.length ? p.parts.map((q) => ({ d: q.d, ox: q.ax, oy: q.ay })) : [{ d: p.d, ox: p.ax, oy: p.ay }];
  const out: Handle[] = [];
  shapes.forEach((sh, s) => {
    let k = 0;
    while (k < sh.d.length && out.length < max) {
      const op = sh.d[k], n = ARGS[op] ?? 0;
      if (n) out.push({ s, i: k + n - 1, x: sh.d[k + n - 1] + sh.ox, y: sh.d[k + n] + sh.oy });
      k += n + 1;
    }
  });
  return out;
}

/** เลื่อนเส้นให้มุมซ้ายบน = 0,0 → { d, ขยับ ax/ay เท่าไร, ขนาดใหม่ } */
function normalize(d: DrawOps): { d: DrawOps; dx: number; dy: number; w: number; h: number } {
  const b = opsBox(d);
  if (!b) return { d, dx: 0, dy: 0, w: 0, h: 0 };
  const out = d.slice();
  let k = 0;
  while (k < out.length) {
    const n = ARGS[out[k]] ?? 0;
    for (let j = 1; j <= n; j += 2) { out[k + j] = Math.round((out[k + j] - b.x) * 1000) / 1000; out[k + j + 1] = Math.round((out[k + j + 1] - b.y) * 1000) / 1000; }
    k += n + 1;
  }
  return { d: out, dx: b.x, dy: b.y, w: Math.round(b.w * 1000) / 1000, h: Math.round(b.h * 1000) / 1000 };
}

/** ย้ายจุดปลายเส้น (พร้อมจุดดัดโค้งที่ติดกับจุดนั้น — โค้งไม่หัก) · dx,dy = มม. พิกัดไฟล์ → ชิ้นใหม่ (คิดกรอบใหม่ให้) */
export function moveHandle(p: BlockPiece, h: { s: number; i: number }, dx: number, dy: number): BlockPiece {
  const shift = (d: DrawOps): DrawOps => {
    const out = d.slice();
    out[h.i] += dx; out[h.i + 1] += dy;
    // หาคำสั่งที่จุดนี้อยู่ + คำสั่งถัดไป
    let k = 0, opAt = -1, next = -1;
    while (k < out.length) { const n = ARGS[out[k]] ?? 0; if (opAt >= 0) { next = k; break; } if (h.i > k && h.i <= k + n) opAt = k; k += n + 1; }
    if (opAt >= 0 && out[opAt] === OP.C) { out[opAt + 3] += dx; out[opAt + 4] += dy; }
    if (next >= 0 && out[next] === OP.C) { out[next + 1] += dx; out[next + 2] += dy; }
    return out;
  };
  if (!p.parts?.length) {
    const nz = normalize(shift(p.d));
    return { ...p, d: nz.d, ax: p.ax + nz.dx, ay: p.ay + nz.dy, ow: nz.w, oh: nz.h, w: nz.w, h: nz.h };
  }
  const atoms: BlockPiece[] = p.parts.map((q, s) => {
    if (s !== h.s) return { id: q.id, name: q.name, d: q.d, fill: q.fill, ow: q.ow, oh: q.oh, w: q.ow, h: q.oh, ax: q.ax, ay: q.ay, on: true };
    const nz = normalize(shift(q.d));
    return { id: q.id, name: q.name, d: nz.d, fill: q.fill, ow: nz.w, oh: nz.h, w: nz.w, h: nz.h, ax: q.ax + nz.dx, ay: q.ay + nz.dy, on: true };
  });
  const np = buildPiece(atoms, p.id, p.name);
  return { ...np, on: p.on, ...(p.color ? { color: p.color } : {}), ...(p.kind ? { kind: p.kind } : {}) };
}

/**
 * ชิ้นตัวหนังสือจากเส้นของ textToOps (ขนาดตัวอักษร 10 มม.) → วางในพิกัดไฟล์
 *   heightFile = สูงที่ต้องการ (มม. พิกัดไฟล์) · at = มุมซ้ายบน (พิกัดไฟล์)
 */
export function textPiece(t: { d: DrawOps; w: number; h: number }, opts: { id: string; name: string; color: string; heightFile: number; at: Pt }): BlockPiece {
  const k = t.h > 0 ? opts.heightFile / t.h : 1;
  const d = t.d.slice();
  let i = 0;
  while (i < d.length) { const n = ARGS[d[i]] ?? 0; for (let j = 1; j <= n; j++) d[i + j] = Math.round(d[i + j] * k * 1000) / 1000; i += n + 1; }
  const w = Math.round(t.w * k * 1000) / 1000, h = Math.round(t.h * k * 1000) / 1000;
  return { id: opts.id, name: opts.name, d, fill: "nonzero", ow: w, oh: h, w, h, ax: opts.at[0], ay: opts.at[1], on: true, color: opts.color };
}

/** ย้ายลำดับ id ใน sequence (ว่าง = ใช้ลำดับปัจจุบันของแผนเป็นตั้งต้น) */
export function reorderSequence(current: string[], planOrder: string[], from: number, to: number): string[] {
  const base = current.length ? [...current, ...planOrder.filter((id) => !current.includes(id))] : [...planOrder];
  const [m] = base.splice(from, 1);
  base.splice(to, 0, m);
  return base;
}

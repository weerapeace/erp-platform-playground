/**
 * ดัดรูปเอียงให้ตรง (perspective) — คณิตล้วน ไม่ใช้ไลบรารี (ของกลาง · ใช้ใน components/photo-capture)
 * --------------------------------------------------------------------------
 * ผู้ใช้จิ้ม 4 มุมของแผ่น/เอกสารที่ถ่ายเฉียง (บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย)
 * → หา homography จาก "สี่เหลี่ยมผลลัพธ์" ไป "4 มุมในรูปเดิม" แล้วไล่ทุกพิกเซลผลลัพธ์ ดึงสีจากรูปเดิม (bilinear)
 * ไฟล์นี้ไม่แตะ DOM → เทสต์ได้ (lib/__tests__/perspective-warp.test.ts) · ตัววาดลง canvas อยู่ใน components/photo-capture/straighten-modal
 */

export type Pt = { x: number; y: number };
/** ลำดับมุม: บนซ้าย, บนขวา, ล่างขวา, ล่างซ้าย */
export type Quad = [Pt, Pt, Pt, Pt];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** แก้สมการเชิงเส้น n×n (Gaussian elimination + pivot) — คืน null ถ้าแก้ไม่ได้ (มุมทับกัน/อยู่แนวเดียวกัน) */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-10) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** homography 3×3 (แถวต่อแถว, h33 = 1) ที่พา from[i] → to[i] · null = มุมใช้ไม่ได้ */
export function homography(from: Quad, to: Quad): number[] | null {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const h = solve(A, B);
  return h ? [...h, 1] : null;
}

export function applyH(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** ขนาดรูปผลลัพธ์ = ด้านที่ยาวกว่าของแต่ละคู่ แล้วย่อให้ด้านยาว ≤ maxSide */
export function outputSize(q: Quad, maxSide = 2400): { w: number; h: number } {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** 4 มุมเป็นสี่เหลี่ยมนูน (ไม่ไขว้กัน) ไหม — ไขว้ = ผลลัพธ์กลับด้าน/บิดเบี้ยว ต้องเตือนผู้ใช้ */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

type Pixels = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

/** ดัด src ตาม 4 มุม (พิกัดพิกเซลในรูปเดิม) → พิกเซล RGBA ขนาด outW×outH (bilinear · นอกรูป = ขาว) */
export function warpQuad(src: Pixels, quad: Quad, outW: number, outH: number): Uint8ClampedArray<ArrayBuffer> {
  const rect: Quad = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  const h = homography(rect, quad);
  if (!h) throw new Error("มุมที่เลือกใช้ไม่ได้ — ลองวางมุมให้ห่างกัน");
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width: sw, height: sh } = src;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const cx = u + 0.5, cy = v + 0.5;
      const w = h[6] * cx + h[7] * cy + h[8];
      const x = (h[0] * cx + h[1] * cy + h[2]) / w - 0.5;
      const y = (h[3] * cx + h[4] * cy + h[5]) / w - 0.5;
      const o = (v * outW + u) * 4;
      if (x < -0.5 || y < -0.5 || x > sw - 0.5 || y > sh - 0.5) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255; continue; }
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(x))), y0 = Math.max(0, Math.min(sh - 1, Math.floor(y)));
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
        const bot = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
    }
  }
  return out;
}

/** มุมเริ่มต้น = เข้ามาจากขอบรูป inset (สัดส่วน) */
export function defaultQuad(w: number, h: number, inset = 0.08): Quad {
  const ix = w * inset, iy = h * inset;
  return [{ x: ix, y: iy }, { x: w - ix, y: iy }, { x: w - ix, y: h - iy }, { x: ix, y: h - iy }];
}

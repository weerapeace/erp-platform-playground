/**
 * 📷 แก้รูปถ่ายก่อนลอกเส้น (Bag CAD รอบ I3) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   1) แก้มุมเอียง (perspective): คลิก 4 มุมของของที่รู้ขนาดจริง (กระดาษ A4 · แผ่นรองตัด · การ์ด) + พิมพ์กว้าง×สูงจริง
 *      → คำนวณการบิดภาพ (homography) → ได้ภาพมองตรงจากด้านบน + มาตราส่วนที่แน่นอน (ซม./จุดภาพ)
 *   2) จุดตรวจระยะ: คลิก 2 จุดบนรูป + ระยะจริง หลายคู่ → มาตราส่วนที่เข้ากับทุกคู่มากสุด + แต่ละคู่คลาดกี่ ซม. / กี่ % เทียบค่าคลาดที่ยอมได้
 *   3) ความคลาดของการลอกเส้น: ค่าความละเอียดเส้น (จุดภาพ) × มาตราส่วน = เส้นที่ลอกห่างขอบจริงได้ไม่เกินกี่ มม.
 *
 * ใช้ที่: components/pattern-studio/photo-modal (แท็บ รูปแพทเทิร์นกระดาษ) · เทสต์: lib/__tests__/pattern-photo.test.ts
 */
export type PPt = [number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** แก้สมการเชิงเส้น n×n (กำจัดเกาส์ + เลือกแถวหลัก) · แก้ไม่ได้ = null */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** การบิดภาพที่ส่ง 4 จุด src → 4 จุด dst (ลำดับตรงกัน) */
export function homography(src: PPt[], dst: PPt[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
}
export function applyH(H: Mat3, [x, y]: PPt): PPt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** เรียง 4 จุดที่คลิก (ลำดับใดก็ได้) เป็น ซ้ายบน → ขวาบน → ขวาล่าง → ซ้ายล่าง */
export function orderQuad(pts: PPt[]): PPt[] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const byAng = [...pts].sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));   // ตามเข็ม (แกน y ชี้ลง)
  let k = 0;
  byAng.forEach((p, i) => { if (p[0] + p[1] < byAng[k][0] + byAng[k][1]) k = i; });
  return [...byAng.slice(k), ...byAng.slice(0, k)];
}
/** 4 จุดเป็นรูปสี่เหลี่ยมนูน (ไม่ไขว้กัน) ไหม */
export function isConvexQuad(q: PPt[]): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], [cx, cy] = q[(i + 2) % 4];
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(z) < 1e-9) return false;
    if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/**
 * แก้มุมเอียง: ภาพเทา (w×h) + 4 มุมของกรอบอ้างอิง (จุดภาพ) + ขนาดจริง (ซม.) → ภาพมองตรง
 *   extend = ขยายพื้นที่ออกรอบกรอบอ้างอิงกี่เท่าของขนาดกรอบ (0 = เฉพาะในกรอบ · 0.5 = รอบละครึ่งกรอบ) · maxSide = ด้านยาวสุดของภาพผล (จุดภาพ)
 *   ส่วนที่อยู่นอกรูปเดิม = สีเฉลี่ยของขอบรูป (ไม่กลายเป็นชิ้นปลอม)
 */
export function rectifyGray(gray: Uint8Array, w: number, h: number, quad: PPt[], realW: number, realH: number, opts: { extend?: number; maxSide?: number } = {}): { gray: Uint8Array; w: number; h: number; cmPerPx: number; offset: PPt } | null {
  const q = orderQuad(quad);
  if (!isConvexQuad(q) || !(realW > 0) || !(realH > 0)) return null;
  const ext = Math.max(0, Math.min(2, opts.extend ?? 0)), maxSide = Math.max(100, opts.maxSide ?? 1000);
  const totW = realW * (1 + 2 * ext), totH = realH * (1 + 2 * ext);
  const pxPerCm = maxSide / Math.max(totW, totH), cmPerPx = 1 / pxPerCm;
  const ow = Math.max(1, Math.round(totW * pxPerCm)), oh = Math.max(1, Math.round(totH * pxPerCm));
  const ox = realW * ext * pxPerCm, oy = realH * ext * pxPerCm;
  const dst: PPt[] = [[ox, oy], [ox + realW * pxPerCm, oy], [ox + realW * pxPerCm, oy + realH * pxPerCm], [ox, oy + realH * pxPerCm]];
  const Hd = homography(dst, q);   // ผล → รูปเดิม
  if (!Hd) return null;
  let edge = 0, ne = 0;
  for (let x = 0; x < w; x++) { edge += gray[x] + gray[(h - 1) * w + x]; ne += 2; }
  for (let y = 0; y < h; y++) { edge += gray[y * w] + gray[y * w + w - 1]; ne += 2; }
  const fill = Math.round(edge / Math.max(1, ne));
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const [sx, sy] = applyH(Hd, [x + 0.5, y + 0.5]);
    const fx = sx - 0.5, fy = sy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) { out[y * ow + x] = fill; continue; }
    const tx = fx - x0, ty = fy - y0, i = y0 * w + x0;
    out[y * ow + x] = Math.round(gray[i] * (1 - tx) * (1 - ty) + gray[i + 1] * tx * (1 - ty) + gray[i + w] * (1 - tx) * ty + gray[i + w + 1] * tx * ty);
  }
  if (ext === 0 && ow > 8 && oh > 8) {   // ขอบกรอบอ้างอิงปนสีพื้นนอกกรอบ → ลอกเส้นจะเห็นเป็นกรอบปลอม: ใช้สีแถว/คอลัมน์ถัดเข้าไปแทน 2 จุดภาพ
    for (let y = 0; y < oh; y++) for (const [d, s] of [[0, 2], [1, 2], [ow - 1, ow - 3], [ow - 2, ow - 3]]) out[y * ow + d] = out[y * ow + s];
    for (const [d, s] of [[0, 2], [1, 2], [oh - 1, oh - 3], [oh - 2, oh - 3]]) out.copyWithin(d * ow, s * ow, s * ow + ow);
  }
  return { gray: out, w: ow, h: oh, cmPerPx, offset: [ox, oy] };
}

export type CheckPair = { a: PPt; b: PPt; real: number };
/**
 * มาตราส่วนจากจุดตรวจหลายคู่ (กำลังสองน้อยสุด: ซม./จุดภาพ = Σ(จริง×จุดภาพ) ÷ Σ(จุดภาพ²)) + แต่ละคู่คลาดเท่าไร
 *   fixed = มาตราส่วนที่รู้แล้ว (เช่น จากการแก้มุมเอียง) → ใช้ตรวจอย่างเดียว ไม่คำนวณใหม่
 */
export function checkScale(pairs: CheckPair[], tolCm: number, fixed?: number | null): { cmPerPx: number; rows: { px: number; real: number; got: number; err: number; pct: number; ok: boolean }[]; worst: number; ok: boolean } | null {
  const P = pairs.filter((p) => p.real > 0 && Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) > 0.5);
  if (!P.length) return null;
  const px = P.map((p) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]));
  const k = fixed && fixed > 0 ? fixed : P.reduce((s, p, i) => s + p.real * px[i], 0) / px.reduce((s, v) => s + v * v, 0);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const rows = P.map((p, i) => { const got = px[i] * k, err = got - p.real; return { px: r2(px[i]), real: p.real, got: r2(got), err: r2(err), pct: r2((Math.abs(err) / p.real) * 100), ok: Math.abs(err) <= tolCm + 1e-9 }; });
  const worst = rows.reduce((m, r) => Math.max(m, Math.abs(r.err)), 0);
  return { cmPerPx: k, rows, worst: r2(worst), ok: rows.every((r) => r.ok) };
}

/** ความคลาดของเส้นที่ลอก (มม.) จากค่าความละเอียดเส้น (จุดภาพ) · และกลับกัน */
export const traceTolMm = (epsPx: number, cmPerPx: number): number => Math.round(epsPx * cmPerPx * 10 * 10) / 10;
export const epsForTolMm = (tolMm: number, cmPerPx: number): number => (cmPerPx > 0 ? Math.max(0.5, Math.min(10, tolMm / 10 / cmPerPx)) : 2);

/**
 * 📷 ลอกเส้นรอบชิ้นจากรูปถ่ายแพทเทิร์นกระดาษ (รอบ 5 ของสตูดิโอแพทเทิร์น · 2026-11-10) — สูตรบริสุทธิ์ ไม่มีหน้าจอ ไม่ใช้ AI ไม่เสียเงิน
 *   รูป (ขาวดำ 0–255) → แยก "ชิ้น" ออกจาก "พื้น" ด้วยความสว่าง → หาเส้นรอบแต่ละชิ้น → ลดจุดให้เหลือเท่าที่จำเป็น → รูปทรงหน่วย ซม.
 *
 *   otsuThreshold   — หาค่าความสว่างที่แบ่งรูปเป็น 2 กลุ่มได้ชัดที่สุด
 *   traceGray       — ทั้งกระบวนการ: คืนเส้นรอบชิ้น (พิกัดจุดภาพ) เรียงจากชิ้นใหญ่ไปเล็ก
 *   simplifyClosed  — ลดจุดของเส้นรอบรูป (Douglas–Peucker) โดยรูปเพี้ยนไม่เกิน eps จุดภาพ
 *   contourShape    — เส้นรอบชิ้น (จุดภาพ) → รูปทรงของตัววาด (ซม.) ตามมาตราส่วนที่ผู้ใช้บอก
 *
 * ข้อจำกัด (บอกผู้ใช้ตรง ๆ ในหน้าจอ): ต้องถ่ายตรงจากด้านบน พื้นสีตัดกับกระดาษ · เงา/ขอบยับทำให้เส้นหยัก · โค้งกลายเป็นเส้นตรงสั้น ๆ ต่อกัน
 *   ระบบไม่รู้ขนาดจริงจากรูป → ผู้ใช้ต้องบอกความกว้างจริงของชิ้นหนึ่ง · ไม่รู้ว่าเส้นในรูปคือเส้นตัดหรือเส้นเย็บ
 * ใช้ที่: components/pattern-studio/photo-modal · เทสต์ lib/__tests__/pattern-trace.test.ts
 */
import type { Pt, Shape } from "@/lib/pattern-shape";

export type TraceBox = { x: number; y: number; w: number; h: number };
export type TraceContour = { pts: Pt[]; box: TraceBox; area: number };
export type TraceOpts = {
  /** ปรับค่าแบ่งชิ้น/พื้น จากค่าที่ระบบหาได้ (+ = นับจุดสว่างขึ้นเป็นสีเข้ม) */
  bias?: number;
  /** ชิ้นเข้มหรืออ่อนกว่าพื้น — auto = ดูจากขอบรูป (ขอบรูปส่วนใหญ่ = พื้น) */
  pieces?: "auto" | "dark" | "light";
  /** ชิ้นเล็กกว่านี้ (สัดส่วนของพื้นที่รูป) = จุดรบกวน ทิ้ง */
  minAreaFrac?: number;
  /** ลดจุด: ยอมให้เส้นเพี้ยนได้กี่จุดภาพ */
  eps?: number;
  maxPieces?: number;
};
export type TraceResult = { contours: TraceContour[]; threshold: number; darkPieces: boolean };

/** ค่าแบ่ง 2 กลุ่มความสว่างแบบ Otsu (0–255) */
export function otsuThreshold(gray: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = gray.length - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

const dist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  if (!L) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
function dp(P: Pt[], eps: number): Pt[] {   // เส้นเปิด — เก็บจุดแรกและจุดท้าย
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const stack: [number, number][] = [[0, P.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, fd = eps;
    for (let i = a + 1; i < b; i++) { const d = dist(P[i], P[a], P[b]); if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return P.filter((_, i) => keep[i]);
}
/** ลดจุดของเส้นรอบรูปปิด — แบ่งครึ่งที่จุดไกลสุดจากจุดแรก แล้วลดทีละครึ่ง */
export function simplifyClosed(P: Pt[], eps: number): Pt[] {
  if (P.length < 4) return P;
  let far = 0, fd = -1;
  for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = dp(P.slice(0, far + 1), eps), b = dp([...P.slice(far), P[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
const polyArea = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];   // ตามเข็ม (แกน y ลง) เริ่มจากขวา

/** รูปขาวดำ → เส้นรอบชิ้นทั้งหมด (จุดภาพ) เรียงจากใหญ่ไปเล็ก */
export function traceGray(gray: ArrayLike<number>, w: number, h: number, opts: TraceOpts = {}): TraceResult {
  const n = w * h;
  if (!(w > 2 && h > 2) || gray.length < n) return { contours: [], threshold: 127, darkPieces: true };
  const threshold = Math.max(1, Math.min(254, otsuThreshold(gray) + (opts.bias ?? 0)));
  // พื้น = กลุ่มที่อยู่ตามขอบรูปมากกว่า
  let darkBorder = 0, border = 0;
  for (let x = 0; x < w; x++) { darkBorder += +(gray[x] <= threshold) + +(gray[(h - 1) * w + x] <= threshold); border += 2; }
  for (let y = 1; y < h - 1; y++) { darkBorder += +(gray[y * w] <= threshold) + +(gray[y * w + w - 1] <= threshold); border += 2; }
  const darkPieces = opts.pieces === "dark" ? true : opts.pieces === "light" ? false : darkBorder * 2 < border;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = (gray[i] <= threshold) === darkPieces ? 1 : 0;

  const lab = new Int32Array(n), minArea = Math.max(12, (opts.minAreaFrac ?? 0.004) * n), eps = Math.max(0.5, opts.eps ?? 2);
  const out: TraceContour[] = [], stack = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || lab[s]) continue;
    const L = ++next;
    let top = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[top++] = s; lab[s] = L;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !lab[i - 1]) { lab[i - 1] = L; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !lab[i + 1]) { lab[i + 1] = L; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && !lab[i - w]) { lab[i - w] = L; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !lab[i + w]) { lab[i + w] = L; stack[top++] = i + w; }
    }
    if (area < minArea) continue;
    if (x1 - x0 >= w - 2 && y1 - y0 >= h - 2) continue;        // กินทั้งรูป = พื้นที่ถูกจัดกลุ่มผิด ไม่ใช่ชิ้น
    // เดินตามขอบ (Moore) เริ่มที่จุดบนสุด-ซ้ายสุดของชิ้น (= จุดแรกที่เจอ)
    const sx = s % w, sy = (s - sx) / w, inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === L;
    const pts: Pt[] = [];
    let x = sx, y = sy, d = 0;
    const limit = 4 * (w + h) + 8 * area;
    do {
      pts.push([x, y]);
      let moved = false;
      for (let k = 0; k < 8; k++) {
        const nd = (d + 6 + k) % 8, nx = x + DX[nd], ny = y + DY[nd];
        if (inside(nx, ny)) { x = nx; y = ny; d = nd; moved = true; break; }
      }
      if (!moved) break;
    } while (!(x === sx && y === sy) && pts.length < limit);
    const simple = simplifyClosed(pts, eps);
    if (simple.length < 3) continue;
    out.push({ pts: simple, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, area: polyArea(simple) });
  }
  out.sort((a, b) => b.area - a.area);
  return { contours: out.slice(0, opts.maxPieces ?? 24), threshold, darkPieces };
}

/** เส้นรอบชิ้น (จุดภาพ) → รูปทรงของตัววาด หน่วย ซม. (มุมซ้ายบนของกรอบ = 0,0) · จุดมากเกิน maxNodes = ลดจุดเพิ่มจนพอ */
export function contourShape(c: TraceContour, cmPerPx: number, maxNodes = 160): Shape | null {
  let P = c.pts, eps = 1;
  while (P.length > maxNodes && eps < 64) { eps *= 1.6; P = simplifyClosed(c.pts, eps); }
  if (P.length < 3 || !(cmPerPx > 0)) return null;
  const r = (v: number) => Math.round(v * cmPerPx * 100) / 100;
  const nodes = P.map(([x, y]) => ({ x: r(x - c.box.x), y: r(y - c.box.y) }));
  const uniq = nodes.filter((q, i) => { const p = nodes[(i + nodes.length - 1) % nodes.length]; return p.x !== q.x || p.y !== q.y; });
  return uniq.length >= 3 ? { k: "path", nodes: uniq } : null;
}

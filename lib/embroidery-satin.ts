/**
 * 🧵 ไฟล์ปัก — ซิกแซกเลี้ยวตามเส้น + ขอบซิกแซกรอบพื้นถม (ใช้คู่กับ lib/embroidery.ts)
 *
 *   ซิกแซกเลี้ยวตามเส้น (turningSatin):
 *     1) วาดชิ้นลงตารางจุดเล็ก ๆ (~1/6 ของความกว้างเส้น)
 *     2) หาระยะถึงขอบของทุกจุด + บีบชิ้นให้เหลือ "เส้นกลาง" หนา 1 จุด (Zhang-Suen)
 *     3) ตัดกิ่งสั้นที่งอกตามมุม · ต่อเส้นกลางเป็นเส้นยาวที่สุด (เลี้ยวไม่หักเกิน 90°)
 *     4) เดินตามเส้นกลางทีละ ½ ระยะฝี ยิงเส้นตั้งฉากไปชนขอบทั้งสองข้าง → ฝีสลับซ้าย/ขวา
 *     ฝีรองพื้น = เดินเส้นกลาง · ทำไม่ได้ (ชิ้นเล็กเกิน/รูปแปลก) → คืน null ให้ใช้ซิกแซกทิศเดียวแบบเดิม
 *
 *   ขอบซิกแซกรอบพื้นถม (satinBorder): เดินรอบขอบทุกวง ซิกแซกกว้าง bw มม. คร่อมขอบเข้าด้านใน (แบบอาร์มติดเสื้อ)
 *
 *   หน่วย = มม. · ไม่มีหน้าจอ (ใช้ได้ทั้งเบราว์เซอร์และเทสต์)
 */
import type { FillRule } from "@/lib/block-print";
import type { Pt } from "@/lib/embroidery";

/** ซิกแซกกว้างกว่านี้ แบ่งฝีกลางทาง (เหมือน SATIN_SPLIT ของ lib/embroidery) */
const SPLIT = 8;
const MAX_CELLS = 260_000;

type Grid = { w: number; h: number; cell: number; x0: number; y0: number; on: Uint8Array };

/** ช่วงที่อยู่ในชิ้นของเส้นแนวนอน y (ตามกฎเติมสี) */
function spansAt(rings: Pt[][], fill: FillRule, y: number): [number, number][] {
  const xs: { x: number; dir: number }[] = [];
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push({ x: a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), dir: b[1] > a[1] ? 1 : -1 });
  }
  xs.sort((p, q) => p.x - q.x);
  const out: [number, number][] = [];
  let w = 0, start = 0;
  for (const e of xs) {
    const was = fill === "evenodd" ? w % 2 !== 0 : w !== 0;
    w += fill === "evenodd" ? 1 : e.dir;
    const now = fill === "evenodd" ? w % 2 !== 0 : w !== 0;
    if (!was && now) start = e.x;
    else if (was && !now) out.push([start, e.x]);
  }
  return out;
}

/** จุด (x,y) อยู่ในชิ้นไหม (ตามกฎเติมสี) */
export function insideShape(rings: Pt[][], fill: FillRule, x: number, y: number): boolean {
  return spansAt(rings, fill, y).some(([a, b]) => x >= a && x <= b);
}

function rasterize(rings: Pt[][], fill: FillRule, cellWanted: number): Grid | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if (!Number.isFinite(x0)) return null;
  let cell = cellWanted;
  const cellsFor = (c: number) => (Math.ceil((x1 - x0) / c) + 4) * (Math.ceil((y1 - y0) / c) + 4);
  while (cellsFor(cell) > MAX_CELLS) cell *= 1.25;
  const w = Math.ceil((x1 - x0) / cell) + 4, h = Math.ceil((y1 - y0) / cell) + 4;
  const gx = x0 - 2 * cell, gy = y0 - 2 * cell;
  const on = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = gy + (j + 0.5) * cell;
    for (const [a, b] of spansAt(rings, fill, y)) {
      const c0 = Math.max(0, Math.ceil((a - gx) / cell - 0.5)), c1 = Math.min(w - 1, Math.floor((b - gx) / cell - 0.5));
      for (let i = c0; i <= c1; i++) on[j * w + i] = 1;
    }
  }
  return { w, h, cell, x0: gx, y0: gy, on };
}

/** ระยะถึงจุดนอกชิ้นที่ใกล้สุด (หน่วยช่อง · ประมาณแบบ 2 รอบ) */
function distanceField(g: Grid): Float32Array {
  const { w, h, on } = g;
  const d = new Float32Array(w * h);
  const INF = 1e9, D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? INF : 0;
  for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i - 1] + 1, d[i - w] + 1, d[i - w - 1] + D, d[i - w + 1] + D);
  }
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1, d[i + w + 1] + D, d[i + w - 1] + D);
  }
  return d;
}

/** บีบให้เหลือเส้นกลางหนา 1 ช่อง (Zhang-Suen) */
function thin(g: Grid): Uint8Array {
  const { w, h } = g;
  const img = g.on.slice();
  const del: number[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x; if (!img[i]) continue;
        const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1], p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0; for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
        if (A !== 1) continue;
        if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
        del.push(i);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
  return img;
}

/** เพื่อนบ้านของจุดเส้นกลาง — แนวทแยงนับเฉพาะเมื่อไม่มีทางอ้อมผ่านแนวตรง (กันจุดแยกปลอมตรงขั้นบันได) */
function neighbors(sk: Uint8Array, w: number, i: number): number[] {
  const N = sk[i - w], S = sk[i + w], E = sk[i + 1], W = sk[i - 1];
  const out: number[] = [];
  if (N) out.push(i - w); if (S) out.push(i + w); if (E) out.push(i + 1); if (W) out.push(i - 1);
  if (sk[i - w + 1] && !N && !E) out.push(i - w + 1);
  if (sk[i - w - 1] && !N && !W) out.push(i - w - 1);
  if (sk[i + w + 1] && !S && !E) out.push(i + w + 1);
  if (sk[i + w - 1] && !S && !W) out.push(i + w - 1);
  return out;
}

type Edge = { pts: number[]; a: number; b: number; used?: boolean };

/** เส้นกลาง → เส้นเชื่อมระหว่างจุดปลาย/จุดแยก (วงปิดที่ไม่มีจุดแยก = 1 เส้น a = b) */
function edgesOf(sk: Uint8Array, w: number): Edge[] {
  const deg = new Map<number, number[]>();
  for (let i = 0; i < sk.length; i++) if (sk[i]) deg.set(i, neighbors(sk, w, i));
  const isNode = (i: number) => (deg.get(i)?.length ?? 0) !== 2;
  const seen = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const edges: Edge[] = [];
  const walk = (start: number, next: number) => {
    const pts = [start];
    let prev = start, cur = next;
    seen.add(key(prev, cur));
    for (;;) {
      pts.push(cur);
      if (isNode(cur) || cur === start) break;
      const nx = (deg.get(cur) ?? []).find((n) => n !== prev && !seen.has(key(cur, n)));
      if (nx == null) break;
      seen.add(key(cur, nx)); prev = cur; cur = nx;
    }
    edges.push({ pts, a: start, b: cur });
  };
  for (const [i, ns] of deg) if (isNode(i)) for (const n of ns) if (!seen.has(key(i, n))) walk(i, n);
  // วงปิดล้วน (ไม่มีจุดแยกเลย)
  for (const [i, ns] of deg) if (!isNode(i) && ns.some((n) => !seen.has(key(i, n)))) walk(i, ns.find((n) => !seen.has(key(i, n)))!);
  // จุดเดี่ยว
  for (const [i, ns] of deg) if (!ns.length) edges.push({ pts: [i], a: i, b: i });
  return edges;
}

/** ตัดกิ่งสั้นที่งอกจากจุดแยก (เกิดตามมุมของตัวหนังสือ) */
function prune(sk: Uint8Array, w: number, dist: Float32Array) {
  for (let pass = 0; pass < 3; pass++) {
    const edges = edgesOf(sk, w);
    const degOf = (i: number) => neighbors(sk, w, i).length;
    let removed = 0;
    for (const e of edges) {
      if (e.a === e.b) continue;
      const da = degOf(e.a), db = degOf(e.b);
      if (!((da === 1 && db >= 3) || (db === 1 && da >= 3))) continue;
      const junction = da >= 3 ? e.a : e.b;
      if (e.pts.length < Math.max(3, dist[junction] * 1.6)) {
        for (const p of e.pts) if (p !== junction) sk[p] = 0;
        removed++;
      }
    }
    if (!removed) break;
  }
}

/** เส้นยาวที่ต่อแล้ว + ปลายแต่ละด้านไปจบที่จุดแยกไหม (จุดแยก = ไปชนเส้นอื่น → ตัดปลายตรง ไม่ปักทับเส้นนั้น) */
type Chained = { pts: number[]; startJ: boolean; endJ: boolean };

/** ต่อเส้นเชื่อมเป็นเส้นยาว (ที่จุดแยกเลือกทางที่ตรงที่สุด ไม่หักเกิน 90°) */
function chain(edges: Edge[], w: number): Chained[] {
  const raw = chainRaw(edges, w);
  const deg = new Map<number, number>();
  for (const e of edges) { if (e.a === e.b) continue; deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
  return raw.map((pts) => ({ pts, startJ: (deg.get(pts[0]) ?? 0) >= 3, endJ: (deg.get(pts[pts.length - 1]) ?? 0) >= 3 }));
}
function chainRaw(edges: Edge[], w: number): number[][] {
  const at = new Map<number, Edge[]>();
  for (const e of edges) { if (e.a === e.b && e.pts.length > 2) continue; for (const n of [e.a, e.b]) at.set(n, [...(at.get(n) ?? []), e]); }
  const xy = (i: number): Pt => [i % w, Math.floor(i / w)];
  const dir = (pts: number[], fromEnd: boolean): Pt => {
    const k = Math.min(pts.length - 1, 6);
    const [a, b] = fromEnd ? [xy(pts[pts.length - 1 - k]), xy(pts[pts.length - 1])] : [xy(pts[k]), xy(pts[0])];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  const paths: number[][] = [];
  // เริ่มจากเส้นที่ปลายด้านหนึ่งเป็นปลายเปิด (ปักต่อเนื่องได้ยาวสุด) · ที่เหลือค่อยตามมา
  const order = [...edges].sort((p, q) => Number((at.get(q.a)?.length ?? 0) === 1 || (at.get(q.b)?.length ?? 0) === 1) - Number((at.get(p.a)?.length ?? 0) === 1 || (at.get(p.b)?.length ?? 0) === 1) || q.pts.length - p.pts.length);
  for (const e0 of order) {
    if (e0.used) continue;
    e0.used = true;
    let path = (at.get(e0.b)?.length ?? 0) === 1 && (at.get(e0.a)?.length ?? 0) !== 1 ? [...e0.pts].reverse() : [...e0.pts];
    if (e0.a === e0.b) { paths.push(path); continue; }
    for (;;) {
      const end = path[path.length - 1];
      const d = dir(path, true);
      let best: Edge | null = null, bestCos = 0;
      for (const e of at.get(end) ?? []) {
        if (e.used) continue;
        const pts = e.a === end ? e.pts : [...e.pts].reverse();
        // ทิศออกจากจุดแยก (ใช้จุดถัด ๆ ไปของเส้นใหม่)
        const k = Math.min(pts.length - 1, 6);
        const p0 = xy(pts[0]), pk = xy(pts[k]);
        const L = Math.hypot(pk[0] - p0[0], pk[1] - p0[1]) || 1;
        const c = (d[0] * (pk[0] - p0[0]) + d[1] * (pk[1] - p0[1])) / L;
        if (c > bestCos) { bestCos = c; best = e; }
      }
      if (!best) break;
      best.used = true;
      const pts = best.a === end ? best.pts : [...best.pts].reverse();
      path = path.concat(pts.slice(1));
    }
    paths.push(path);
  }
  return paths;
}

const smooth = (pts: Pt[], r: number, closed: boolean): Pt[] => {
  if (r < 1 || pts.length < 3) return pts;
  return pts.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let k = -r; k <= r; k++) {
      let j = i + k;
      if (closed) j = (j + pts.length) % pts.length; else if (j < 0 || j >= pts.length) continue;
      sx += pts[j][0]; sy += pts[j][1]; n++;
    }
    // ปลายเส้นเปิด: ค่อย ๆ ลดการเกลี่ย (ไม่ให้ปลายหดเข้า)
    if (!closed && (i < r || i >= pts.length - r)) { const t = Math.min(i, pts.length - 1 - i) / r; return [pts[i][0] * (1 - t) + (sx / n) * t, pts[i][1] * (1 - t) + (sy / n) * t] as Pt; }
    return [sx / n, sy / n] as Pt;
  });
};

/** จุดทุก ๆ step มม. ตามแนวเส้น */
function resample(pts: Pt[], step: number, closed: boolean): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts;
  const out: Pt[] = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
    carry = L - (t - step);
  }
  if (!closed) { const last = src[src.length - 1], o = out[out.length - 1]; if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push(last); }
  return out;
}

/** ยิงเส้นจาก p ทิศ n ไปชนขอบใกล้สุด (ไม่เกิน max) → ระยะ หรือ null */
function rayHit(rings: Pt[][], p: Pt, n: Pt, max: number): number | null {
  let best: number | null = null;
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = n[0] * ey - n[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const ax = a[0] - p[0], ay = a[1] - p[1];
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * n[1] - ay * n[0]) / den;
    if (t > 1e-4 && t <= max && u >= 0 && u <= 1 && (best == null || t < best)) best = t;
  }
  return best;
}

const tangents = (pts: Pt[], reach: number, closed: boolean): Pt[] => pts.map((_, i) => {
  const j0 = closed ? (i - reach + pts.length) % pts.length : Math.max(0, i - reach);
  const j1 = closed ? (i + reach) % pts.length : Math.min(pts.length - 1, i + reach);
  const dx = pts[j1][0] - pts[j0][0], dy = pts[j1][1] - pts[j0][1];
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
});

/** ขาซิกแซก A→B ยาวเกิน SPLIT → เพิ่มฝีกลางทาง */
function pushLeg(out: Pt[], q: Pt) {
  const last = out[out.length - 1];
  if (last) {
    const L = Math.hypot(q[0] - last[0], q[1] - last[1]);
    if (L > SPLIT) { const n = Math.ceil(L / SPLIT); for (let k = 1; k < n; k++) out.push([last[0] + ((q[0] - last[0]) * k) / n, last[1] + ((q[1] - last[1]) * k) / n]); }
  }
  out.push(q);
}

/** เส้นทิศฝีเข็ม [x1, y1, x2, y2] (มม. พิกัดเดียวกับ rings) */
export type DirLine = [number, number, number, number];

/** ทิศฝีเข็มที่จุด p จากเส้นทิศที่ลากไว้ (เฉลี่ยแบบมุมคู่ ถ่วงตามระยะ — เส้นใกล้มีผลมาก) → เวกเตอร์หนึ่งหน่วย */
export function dirAt(lines: DirLine[], p: Pt, soft = 0.25): Pt | null {
  if (!lines.length) return null;
  let sx = 0, sy = 0;
  for (const [x1, y1, x2, y2] of lines) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / L2));
    const d = Math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy));
    const wgt = 1 / (d * d + soft);
    const a = Math.atan2(dy, dx) * 2;
    sx += Math.cos(a) * wgt; sy += Math.sin(a) * wgt;
  }
  if (Math.hypot(sx, sy) < 1e-12) return null;
  const a = Math.atan2(sy, sx) / 2;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * ซิกแซกเลี้ยวตามเส้น · spacing = ระยะฝีซิกแซก (มม.) · comp = ชดเชยผ้าหด (มม. ต่อข้าง)
 *   ฝีสั้นด้านในโค้ง: ฝั่งที่ฝีเบียดกัน ปักสั้นสลับยาว (ด้ายไม่กองเป็นก้อน)
 *   แยกเส้นที่จุดต่อ: เส้นที่ไปชนเส้นอื่น ตัดปลายตรงตรงขอบเส้นนั้น (ไม่ปักทับ)
 *   ฝีรองพื้นตามความกว้าง: < 1 มม. ไม่มี · < 2.5 เดินเส้นกลาง · < 4.5 เดินรอบขอบ · กว้างกว่า = เดินรอบขอบ + ซิกแซกห่าง
 *   lines = เส้นทิศฝีเข็มที่ลากเอง (ฝีวางตามเส้น แทนตั้งฉากกับเส้นกลาง)
 * คืน null = ทำไม่ได้ (ให้ใช้ซิกแซกทิศเดียวแทน)
 */
export function turningSatin(rings: Pt[][], fill: FillRule, opts: { spacing: number; comp: number; underlay: boolean; meanWidth: number; lines?: DirLine[] }): { under: Pt[][]; top: Pt[][] } | null {
  const mw = Math.max(0.3, opts.meanWidth);
  const g = rasterize(rings, fill, Math.min(0.25, Math.max(0.03, mw / 7)));
  if (!g) return null;
  const dist = distanceField(g);
  const sk = thin(g);
  prune(sk, g.w, dist);
  const edges = edgesOf(sk, g.w);
  if (!edges.length) return null;
  const paths = chain(edges, g.w);
  // ชิ้นทรงก้อน (วงกลม/จุด) ไม่มีแนวเส้นให้เลี้ยวตาม → ฝีจะแผ่เป็นดาว · ให้ใช้ซิกแซกทิศเดียวแทน
  let maxD = 0; for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  const skelLen = paths.reduce((s, p) => s + p.pts.length, 0) * g.cell;
  if (skelLen < maxD * g.cell * 2 * 2.2) return null;
  const toMm = (i: number): Pt => [g.x0 + ((i % g.w) + 0.5) * g.cell, g.y0 + (Math.floor(i / g.w) + 0.5) * g.cell];
  const dAt = (p: Pt) => {
    const x = Math.floor((p[0] - g.x0) / g.cell), y = Math.floor((p[1] - g.y0) / g.cell);
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0;
    return dist[y * g.w + x] * g.cell;
  };
  const top: Pt[][] = [], under: Pt[][] = [];
  const half = opts.spacing / 2;
  const lines = opts.lines ?? [];
  for (const path of paths) {
    const closed = path.pts.length > 3 && path.pts[0] === path.pts[path.pts.length - 1];
    let pts = path.pts.map(toMm);
    if (closed) pts = pts.slice(0, -1);
    const lenMm = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    if (lenMm < Math.max(0.3, mw * 0.3) && paths.length > 1) continue;   // เศษสั้น (ส่วนอื่นปักทับแล้ว)
    // จุดแยกที่ปลายเส้น (ไว้ตัดปลายตรง) — รัศมี = ความกว้างครึ่งหนึ่งของจุดแยก
    const jStart = !closed && path.startJ ? { p: toMm(path.pts[0]), r: dist[path.pts[0]] * g.cell * 0.85 } : null;
    const jEnd = !closed && path.endJ ? { p: toMm(path.pts[path.pts.length - 1]), r: dist[path.pts[path.pts.length - 1]] * g.cell * 0.85 } : null;
    pts = smooth(pts, Math.max(1, Math.min(10, Math.round(mw / (2 * g.cell)))), closed);
    // ปลายเปิดที่ไม่ใช่จุดแยก: ยืดออกตามทิศเส้นเกือบถึงปลายจริง (เส้นกลางสั้นกว่าเส้นจริงราวครึ่งความกว้าง)
    if (!closed && pts.length >= 2) {
      const ext = (a: Pt, b: Pt) => { const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, d = dAt(a) * 0.8; return [a[0] + ((a[0] - b[0]) / L) * d, a[1] + ((a[1] - b[1]) / L) * d] as Pt; };
      const k = Math.min(pts.length - 1, 3);
      pts = [...(jStart ? [] : [ext(pts[0], pts[k])]), ...pts, ...(jEnd ? [] : [ext(pts[pts.length - 1], pts[pts.length - 1 - k])])];
    }
    // เดินทีละช่วงสั้น ๆ แล้ว "ปักเมื่อขอบด้านใดด้านหนึ่งขยับครบ ½ ระยะฝี" — ทางโค้งด้านนอกยังแน่นเท่าทางตรง
    const fine = half / 4;
    let samples = resample(pts, fine, closed);
    // ตัดปลายที่จมอยู่ในเส้นอื่น (จุดแยก) → ปลายตรงชนขอบเส้นนั้นพอดี
    const near = (p: Pt, j: { p: Pt; r: number } | null) => !!j && Math.hypot(p[0] - j.p[0], p[1] - j.p[1]) < j.r;
    let s0 = 0, s1 = samples.length;
    while (s0 < s1 && near(samples[s0], jStart)) s0++;
    while (s1 > s0 && near(samples[s1 - 1], jEnd)) s1--;
    if (s1 - s0 < 3) continue;   // ทั้งเส้นอยู่ในจุดแยก (เส้นอื่นปักทับแล้ว)
    samples = samples.slice(s0, s1);
    const tan = tangents(samples, Math.max(1, Math.round(mw / fine / 2)), closed && s0 === 0);
    const blk: Pt[] = [];
    const edgeA: Pt[] = [], edgeB: Pt[] = [], widths: number[] = [];
    let side = 0;
    let lastA: Pt | null = null, lastB: Pt | null = null;
    const lastOn: (Pt | null)[] = [null, null];
    const shortNext = [false, false];
    // รอบแรก: ยิงเส้นหาขอบทุกจุด → ความกว้างกลาง ๆ ของเส้นนี้ (ไว้ตัดฝีพาดยาวผิดปกติตรงจุดต่อ)
    const hits = samples.map((p, i) => {
      let n: Pt = [-tan[i][1], tan[i][0]];
      const dl = dirAt(lines, p);
      if (dl) n = dl[0] * n[0] + dl[1] * n[1] >= 0 ? dl : [-dl[0], -dl[1]];
      const cap = Math.max(dAt(p) * 1.6 + g.cell, 0.3) * (dl ? 2.5 : 1);
      const sp = rayHit(rings, p, n, cap * 2), sm = rayHit(rings, p, [-n[0], -n[1]], cap * 2);
      if (sp == null || sm == null) return null;
      return { n, a: Math.min(sp, cap), b: Math.min(sm, cap), dl: !!dl };
    });
    const ws = hits.filter((h): h is NonNullable<typeof h> => !!h).map((h) => h.a + h.b).sort((x, y) => x - y);
    const wMid = ws[Math.floor(ws.length / 2)] ?? 0;
    samples.forEach((p, i) => {
      const h = hits[i];
      if (!h) return;
      const { n } = h;
      let { a, b } = h;
      // ฝั่งที่ยาวเกินเส้นปกติมาก = กำลังพาดเข้าเส้นอื่นตรงจุดต่อ (เส้นนั้นปักคลุมเอง) → หดเหลือครึ่งความกว้างปกติ
      if (!h.dl && wMid > 0) { const lim = wMid * 0.6; if (a > lim && a > b * 1.5) a = Math.max(b, lim); if (b > lim && b > a * 1.5) b = Math.max(a, lim); }
      if (a + b < 0.25) return;
      const A: Pt = [p[0] + n[0] * (a + opts.comp), p[1] + n[1] * (a + opts.comp)];
      const B: Pt = [p[0] - n[0] * (b + opts.comp), p[1] - n[1] * (b + opts.comp)];
      // เก็บขอบด้านใน (หดเข้า 0.4 มม.) ไว้ทำฝีรองพื้นทุก ~1.5 มม.
      {
        const lastE = edgeA.length ? edgeA[edgeA.length - 1] : null;
        const inA: Pt = [p[0] + n[0] * Math.max(0, a - 0.4), p[1] + n[1] * Math.max(0, a - 0.4)];
        if (!lastE || Math.hypot(inA[0] - lastE[0], inA[1] - lastE[1]) >= 1.5) { edgeA.push(inA); edgeB.push([p[0] - n[0] * Math.max(0, b - 0.4), p[1] - n[1] * Math.max(0, b - 0.4)]); }
      }
      widths.push(a + b);
      const moved = lastA && lastB ? Math.max(Math.hypot(A[0] - lastA[0], A[1] - lastA[1]), Math.hypot(B[0] - lastB[0], B[1] - lastB[1])) : Infinity;
      if (moved < half && i !== samples.length - 1) return;
      let q = side === 0 ? A : B;
      const other = side === 0 ? B : A;
      // ฝีสั้นด้านในโค้ง: ฝั่งนี้ขยับไปน้อยกว่าครึ่งระยะฝี (ด้ายเบียดกัน) → สลับฝีสั้น/ยาว
      const prev = lastOn[side];
      if (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) < opts.spacing * 0.6 && a + b > 1.2) {
        if (shortNext[side]) q = [q[0] + (other[0] - q[0]) * 0.35, q[1] + (other[1] - q[1]) * 0.35];
        shortNext[side] = !shortNext[side];
      } else shortNext[side] = false;
      pushLeg(blk, q);
      lastOn[side] = side === 0 ? A : B;
      lastA = A; lastB = B;
      side ^= 1;
    });
    if (blk.length < 2) continue;
    top.push(blk);
    if (!opts.underlay || lenMm < 1) continue;
    const wMed = [...widths].sort((x, y) => x - y)[Math.floor(widths.length / 2)] ?? 0;
    if (wMed < 1) continue;
    const center = samples.filter((_, i) => i % Math.max(1, Math.round(2 / fine)) === 0);
    if (wMed < 2.5 || edgeA.length < 2) under.push(center);
    else {
      // เดินรอบขอบ: ไปตามขอบ A แล้วกลับตามขอบ B
      under.push([...edgeA, ...[...edgeB].reverse()]);
      if (wMed >= 4.5) {
        const zz: Pt[] = [];
        for (let i = 0; i < edgeA.length; i++) zz.push(i % 2 ? edgeA[i] : edgeB[i]);
        if (zz.length >= 2) under.push(zz);
      }
    }
  }
  if (!top.length) return null;
  return { under, top };
}

/**
 * ขอบซิกแซกรอบพื้นถม (แบบอาร์ม) · bw = ความกว้างขอบ (มม.) · ปักทับขอบเข้าด้านใน + เกินขอบออกไปนิด (comp) กันเห็นผ้า
 * วงที่สั้น/แคบเกิน (ปักแล้วซิกแซกไขว้กัน) ข้าม
 */
export function satinBorder(rings: Pt[][], fill: FillRule, opts: { width: number; spacing: number; comp: number }): Pt[][] {
  const bw = opts.width;
  const out: Pt[][] = [];
  const half = opts.spacing / 2;
  for (const ring of rings) {
    let per = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    if (per < bw * 6) continue;
    const pts = smooth(resample(ring, Math.min(0.5, bw / 3), true), 1, true);
    const samples = resample(pts, half, true);
    const tan = tangents(samples, Math.max(1, Math.round(bw / half / 2)), true);
    // ด้านในของวงนี้: ลองจุดกลางวงสัก 2-3 จุด
    let inSign = 1;
    { let votes = 0; for (let k = 0; k < samples.length; k += Math.max(1, Math.floor(samples.length / 7))) { const n: Pt = [-tan[k][1], tan[k][0]]; const d = Math.min(0.3, bw / 2); votes += insideShape(rings, fill, samples[k][0] + n[0] * d, samples[k][1] + n[1] * d) ? 1 : -1; } inSign = votes >= 0 ? 1 : -1; }
    const blk: Pt[] = [];
    samples.forEach((p, i) => {
      const n: Pt = [-tan[i][1] * inSign, tan[i][0] * inSign];
      const depth = Math.min(bw, rayHit(rings, p, n, bw * 2) ?? bw);
      const q: Pt = i % 2 === 0 ? [p[0] - n[0] * opts.comp, p[1] - n[1] * opts.comp] : [p[0] + n[0] * depth, p[1] + n[1] * depth];
      blk.push(q);
    });
    if (blk.length > 2) { blk.push(blk[0]); out.push(blk); }
  }
  return out;
}

/**
 * ตรวจลายก่อนปัก: เส้นบางสุดในไฟล์ (มม. ในไฟล์) → ต้องปักกว้างอย่างน้อยเท่าไหร่ ให้เส้นหนา ≥ minStroke
 *   widths = ความกว้างเฉลี่ยของแต่ละชิ้น (มม. ในไฟล์) · designW = กว้างทั้งงานในไฟล์ (มม.)
 *   ไม่นับชิ้นจิ๋ว (เศษ) — ใช้ค่าที่ 5% บางสุด (งานมีชิ้นเยอะ ข้ามชิ้นบางผิดปกติ 1-2 ชิ้น)
 */
export function sizeAdvice(widths: number[], designW: number, minStroke = 1.5): { thinFile: number; minWidthMm: number } | null {
  const ws = widths.filter((w) => w > 0).sort((a, b) => a - b);
  if (!ws.length || designW <= 0) return null;
  const thinFile = ws[Math.floor((ws.length - 1) * 0.05)];
  return { thinFile, minWidthMm: Math.ceil((designW * (minStroke / thinFile)) / 5) * 5 };
}


/** ตัดเส้นให้เหลือเฉพาะช่วงที่อยู่ในชิ้น (ตัดตรงจุดที่ชนขอบพอดี) · comp = ยืดปลายออกนอกขอบนิด (ชดเชยผ้าหด) */
function clipToShape(line: Pt[], rings: Pt[][], fill: FillRule, comp: number): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  const cuts = (a: Pt, b: Pt): number[] => {
    const ts: number[] = [];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    for (const r of rings) for (let k = 0; k < r.length; k++) {
      const p = r[k], q = r[(k + 1) % r.length];
      const fx = q[0] - p[0], fy = q[1] - p[1], den = ex * fy - ey * fx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p[0] - a[0]) * fy - (p[1] - a[1]) * fx) / den, u = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    return ts.sort((x, y) => x - y);
  };
  const ext = (a: Pt, b: Pt): Pt => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [b[0] + ((b[0] - a[0]) / L) * comp, b[1] + ((b[1] - a[1]) / L) * comp]; };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const ts = [0, ...cuts(a, b), 1];
    for (let k = 1; k < ts.length; k++) {
      const t0 = ts[k - 1], t1 = ts[k], tm = (t0 + t1) / 2;
      const P = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (insideShape(rings, fill, ...P(tm))) {
        if (!cur.length) cur.push(t0 > 0 ? ext(P(t1), P(t0)) : P(t0));
        cur.push(t1 < 1 ? ext(P(t0), P(t1)) : P(t1));
        if (t1 < 1) { out.push(cur); cur = []; }
      } else if (cur.length) { out.push(cur); cur = []; }
    }
  }
  if (cur.length) out.push(cur);
  return out.filter((r) => r.length >= 2);
}

/**
 * ถมเต็มเลี้ยวตามเส้นทิศ (รอบ 5): แถวถมโค้งตามเส้นทิศที่ลากหลายเส้น (แทนแถวขนานทั้งชิ้น)
 *   1) ตารางจุดในชิ้น · ทุกจุดรู้ "ทิศแถว" จาก dirAt → ทิศตั้งฉาก n
 *   2) หาค่า φ ที่ความชันใกล้ n ที่สุด (ปรับค่าซ้ำแบบ Gauss-Seidel/SOR) → เส้นระดับ φ = แถว
 *   3) ตัดเส้นระดับทุก ๆ ระยะแถว (marching squares) → ยืดปลายถึงขอบชิ้น → ฝีละ len มม. เหลื่อมแบบก่ออิฐ
 *   คืนแต่ละแถวเป็นบล็อก (buildPlan ต่อแถวที่ใกล้กันให้เอง) · ทำไม่ได้ = null (ใช้มุมเดียวแบบเดิม)
 */
export function turningFill(rings: Pt[][], fill: FillRule, lines: DirLine[], opts: { spacing: number; len: number; comp: number }): Pt[][] | null {
  if (lines.length < 2) return null;
  const g = rasterize(rings, fill, Math.min(0.4, Math.max(0.15, opts.spacing * 0.7)));
  if (!g) return null;
  const { w, h, cell } = g;
  const N = w * h;
  const cx = (i: number) => g.x0 + ((i % w) + 0.5) * cell, cy = (i: number) => g.y0 + (Math.floor(i / w) + 0.5) * cell;
  // ทิศตั้งฉากกับแถว (n) ทุกจุด · หันไปทางเดียวกับค่าเฉลี่ย (กันพลิกกลับหัว)
  const nx = new Float32Array(N), ny = new Float32Array(N);
  const inside: number[] = [];
  let mx = 0, my = 0;
  // ขยายพื้นที่คำนวณออกนอกขอบ 2 ช่อง (แถวจะเลยขอบแล้วค่อยตัดตามรูป → ชิดขอบพอดี ไม่เหลือแถบว่าง)
  const dom = g.on.slice();
  for (let pass = 0; pass < 2; pass++) { const prev = dom.slice(); for (let i = 0; i < N; i++) if (!prev[i]) { const x = i % w; if ((x > 0 && prev[i - 1]) || (x < w - 1 && prev[i + 1]) || (i >= w && prev[i - w]) || (i + w < N && prev[i + w])) dom[i] = 1; } }
  for (let i = 0; i < N; i++) if (dom[i]) {
    const d = dirAt(lines, [cx(i), cy(i)], 4); if (!d) return null;
    nx[i] = -d[1]; ny[i] = d[0]; inside.push(i);
  }
  if (inside.length < 4) return null;
  // ค่าเฉลี่ยแบบมุมคู่ แล้วหันทุกจุดให้ไปทางเดียวกัน
  { let sx = 0, sy = 0; for (const i of inside) { const a = Math.atan2(ny[i], nx[i]) * 2; sx += Math.cos(a); sy += Math.sin(a); } const a = Math.atan2(sy, sx) / 2; mx = Math.cos(a); my = Math.sin(a); }
  // หันทิศให้ต่อเนื่องกันทีละจุดจากเพื่อนบ้าน (ทางโค้งเลี้ยวเกิน 90° เช่น หัวตัว P ไม่พลิกกลับหัวกลางทาง)
  {
    const seen = new Uint8Array(N);
    for (const s0 of inside) {
      if (seen[s0]) continue;
      if (nx[s0] * mx + ny[s0] * my < 0) { nx[s0] = -nx[s0]; ny[s0] = -ny[s0]; }
      seen[s0] = 1;
      const q = [s0];
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        for (const o of [1, -1, w, -w]) {
          const j = i + o; if (j < 0 || j >= N || seen[j] || !dom[j]) continue;
          if ((o === 1 && i % w === w - 1) || (o === -1 && i % w === 0)) continue;
          if (nx[i] * nx[j] + ny[i] * ny[j] < 0) { nx[j] = -nx[j]; ny[j] = -ny[j]; }
          seen[j] = 1; q.push(j);
        }
      }
    }
  }
  // φ เริ่มจากการฉายบนทิศเฉลี่ย แล้วปรับให้ความชันตาม n ทีละจุด
  const phi = new Float32Array(N);
  for (const i of inside) phi[i] = cx(i) * mx + cy(i) * my;
  const nb = [1, -1, w, -w];
  const iters = Math.min(400, 60 + Math.round(Math.sqrt(inside.length) * 3));
  for (let it = 0; it < iters; it++) {
    for (const i of inside) {
      let s = 0, c = 0;
      for (const o of nb) {
        const j = i + o; if (j < 0 || j >= N || !dom[j]) continue;
        const ddx = (o === 1 ? cell : o === -1 ? -cell : 0), ddy = (o === w ? cell : o === -w ? -cell : 0);
        s += phi[j] - (((nx[i] + nx[j]) / 2) * ddx + ((ny[i] + ny[j]) / 2) * ddy); c++;
      }
      if (c) phi[i] = phi[i] + 1.8 * (s / c - phi[i]);
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const i of inside) { lo = Math.min(lo, phi[i]); hi = Math.max(hi, phi[i]); }
  const rows: Pt[][] = [];
  const val = (x: number, y: number) => phi[y * w + x];
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && dom[y * w + x] === 1;
  /** เส้นระดับ φ = L → เส้นยาว (ตัดตามรูปชิ้นแล้ว) */
  const contours = (L: number): Pt[][] => {
    const segs: [Pt, Pt][] = [];
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      if (!ok(x, y) || !ok(x + 1, y) || !ok(x, y + 1) || !ok(x + 1, y + 1)) continue;
      const v = [val(x, y), val(x + 1, y), val(x + 1, y + 1), val(x, y + 1)];
      const P: Pt[] = [[cx(y * w + x), cy(y * w + x)], [cx(y * w + x + 1), cy(y * w + x)], [cx(y * w + x + 1), cy((y + 1) * w + x)], [cx(y * w + x), cy((y + 1) * w + x)]];
      const cross: Pt[] = [];
      for (let k = 0; k < 4; k++) {
        const a = v[k], b = v[(k + 1) % 4];
        if ((a < L) !== (b < L)) { const t = (L - a) / (b - a); cross.push([P[k][0] + (P[(k + 1) % 4][0] - P[k][0]) * t, P[k][1] + (P[(k + 1) % 4][1] - P[k][1]) * t]); }
      }
      if (cross.length === 2) segs.push([cross[0], cross[1]]);
      else if (cross.length === 4) { segs.push([cross[0], cross[1]]); segs.push([cross[2], cross[3]]); }
    }
    const key = (p: Pt) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
    const at = new Map<string, number[]>();
    segs.forEach((sg, i) => { for (const p of sg) { const k = key(p); at.set(k, [...(at.get(k) ?? []), i]); } });
    const used = new Uint8Array(segs.length);
    const out: Pt[][] = [];
    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      used[s0] = 1;
      const line: Pt[] = [segs[s0][0], segs[s0][1]];
      for (const dirEnd of [true, false]) {
        for (;;) {
          const end = dirEnd ? line[line.length - 1] : line[0];
          const nxt = (at.get(key(end)) ?? []).find((j) => !used[j]);
          if (nxt == null) break;
          used[nxt] = 1;
          const sg = segs[nxt], other = key(sg[0]) === key(end) ? sg[1] : sg[0];
          if (dirEnd) line.push(other); else line.unshift(other);
        }
      }
      out.push(...clipToShape(line, rings, fill, opts.comp));
    }
    return out;
  };
  const lenOf = (l: Pt[]) => l.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);
  /** เส้น → ฝีละ len มม. เหลื่อมแบบก่ออิฐ (เลื่อนจุดเริ่ม 1/3 ฝีทุกแถว) */
  const stitchRow = (line: Pt[], rowNo: number): Pt[] => {
    const phase = ((rowNo % 3) / 3) * opts.len;
    const pts: Pt[] = [line[0]];
    let acc = 0, nextAt = phase > 0.5 ? phase : phase + opts.len;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (acc + d >= nextAt) { const t = (nextAt - acc) / d; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); nextAt += opts.len; }
      acc += d;
    }
    const last = line[line.length - 1];
    if (Math.hypot(last[0] - pts[pts.length - 1][0], last[1] - pts[pts.length - 1][1]) > 0.3) pts.push(last); else pts[pts.length - 1] = last;
    return pts;
  };
  // ช่องที่มีแถวผ่านใกล้ ๆ แล้ว (ไว้หาช่องว่างตรงที่แถวถ่างออก)
  // ตารางละเอียดแยก (1/3 ระยะแถว) ไว้จำว่าตรงไหนมีแถวผ่านแล้ว
  const cc = opts.spacing / 3, cw = Math.ceil((w * cell) / cc), ch = Math.ceil((h * cell) / cc);
  const covered = new Uint8Array(cw * ch);
  const rc = Math.max(1, Math.round((opts.spacing * 0.6) / cc));
  const cellOf = (p: Pt) => { const x = Math.floor((p[0] - g.x0) / cell), y = Math.floor((p[1] - g.y0) / cell); return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x; };
  const covOf = (p: Pt) => { const x = Math.floor((p[0] - g.x0) / cc), y = Math.floor((p[1] - g.y0) / cc); return x < 0 || y < 0 || x >= cw || y >= ch ? -1 : y * cw + x; };
  const open = (p: Pt) => { const c = cellOf(p), v = covOf(p); return c >= 0 && v >= 0 && g.on[c] === 1 && !covered[v] && insideShape(rings, fill, p[0], p[1]); };
  const densify = (l: Pt[]): Pt[] => { const out: Pt[] = [l[0]]; for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cc * 0.5))); for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); } return out; };
  const mark = (l: Pt[]) => { for (const p of densify(l)) { const c = covOf(p); if (c < 0) continue; const x0 = c % cw, y0 = Math.floor(c / cw); for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < cw && y < ch && dx * dx + dy * dy <= rc * rc) covered[y * cw + x] = 1; } } };
  let rowNo = 0;
  for (let L = lo + opts.spacing / 2; L < hi; L += opts.spacing, rowNo++) {
    for (const run of contours(L)) { if (lenOf(run) < 0.3) continue; rows.push(stitchRow(run, rowNo)); mark(run); }
  }
  // รอบเติม: แถวครึ่งระยะ เฉพาะช่วงที่ยังว่าง (แถวโค้งแล้วถ่างออก เช่น ด้านนอกของโค้ง)
  rowNo = 0;
  for (let L = lo + opts.spacing; L < hi; L += opts.spacing / 2, rowNo++) {
    for (const run of contours(L)) {
      const pts = densify(run);
      let cur: Pt[] = [];
      const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 0.8) { rows.push(stitchRow(cur, rowNo)); mark(cur); } cur = []; };
      for (const p of pts) { if (open(p)) cur.push(p); else flush(); }
      flush();
    }
  }
  // รอบสุดท้าย: หย่อมที่ยังว่าง (ตรงที่แถวสองทิศมาบรรจบกันเป็นมุม) → แถวตรงสั้น ๆ ตามทิศเฉลี่ย
  {
    const rx = my, ry = -mx;   // ทิศแถวเฉลี่ย (ตั้งฉากกับ n เฉลี่ย)
    let o0 = Infinity, o1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const r of rings) for (const p of r) { const o = p[0] * mx + p[1] * my, t = p[0] * rx + p[1] * ry; o0 = Math.min(o0, o); o1 = Math.max(o1, o); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    let k = 0;
    for (let o = o0 + opts.spacing / 2; o < o1; o += opts.spacing, k++) {
      let cur: Pt[] = [];
      const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 0.6) { rows.push(stitchRow([cur[0], cur[cur.length - 1]], k)); mark(cur); } cur = []; };
      for (let t = t0; t <= t1; t += cc) {
        const p: Pt = [o * mx + t * rx, o * my + t * ry];
        if (open(p)) cur.push(p); else flush();
      }
      flush();
    }
  }
  return rows.length ? rows : null;
}

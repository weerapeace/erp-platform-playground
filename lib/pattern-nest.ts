/**
 * 🧩 วางชิ้นบนผ้าตามรูปจริง (true-shape nesting · Bag CAD รอบ I2) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   ต่างจากตัววางผ้าเดิม (lib/fabric-calc = วางตามกรอบสี่เหลี่ยม): ใช้เส้นตัดจริงของชิ้น ชิ้นโค้ง/เว้า/สามเหลี่ยมซ้อนเข้าหากันได้
 *   วิธี: แปลงชิ้นเป็นตาราง (ช่องละ res ซม. · นับช่องที่เส้นตัดแตะ = ไม่มีทางทับกันจริง) แล้ววางทีละชิ้น ใหญ่ก่อน
 *         หาตำแหน่งที่ใช้ความยาวผ้าน้อยที่สุด (ล่างสุด แล้วซ้ายสุด) · หมุนได้ตามทางผ้า (0°/180°) · หมุนได้ทุก 90° · หรือห้ามหมุน (ทางเดียว)
 *         ชิ้นคู่ซ้าย-ขวา: ชิ้นคี่กลับด้าน · เว้นรอยตัดระหว่างชิ้นตาม gap
 *   งานหนัก → เรียกใน Web Worker (components/pattern-sheet/nest.worker.ts) มีปุ่มยกเลิก
 *
 * ใช้ที่: components/pattern-sheet/nest-panel (หน้าพิมพ์ → วางบนผ้า) · เทสต์: lib/__tests__/pattern-nest.test.ts
 */
export type NPt = [number, number];
export type NestRot = "grain" | "free" | "none";
export type NestItem = { key: string; label: string; outline: NPt[]; qty: number; rot: NestRot; pair?: boolean };
export type NestOpts = { width: number; gap: number; res?: number; maxLength?: number };
export type NestPlace = { key: string; label: string; copy: number; x: number; y: number; rot: 0 | 90 | 180 | 270; flip: boolean; pts: NPt[] };
export type NestResult = { ok: boolean; places: NestPlace[]; width: number; length: number; efficiency: number; failed: string[]; res: number; stopped?: boolean };

const area = (P: NPt[]) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

function orient(P: NPt[], rot: number, flip: boolean): NPt[] {
  const c = Math.round(Math.cos((rot * Math.PI) / 180)), s = Math.round(Math.sin((rot * Math.PI) / 180));
  const Q = P.map(([x, y]): NPt => { const fx = flip ? -x : x; return [fx * c - y * s, fx * s + y * c]; });
  const mx = Math.min(...Q.map((q) => q[0])), my = Math.min(...Q.map((q) => q[1]));
  return Q.map(([x, y]) => [x - mx, y - my]);
}

/** ช่วง x ภายในรูปที่เส้นแนวนอน y ตัดผ่าน (คู่ x0,x1) */
function scan(P: NPt[], y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

type Mask = { w: number; h: number; rows: [number, number][][] };
/** แปลงรูปเป็นช่องตาราง (แบบเผื่อ: ช่องที่รูปแตะ = เต็ม) แล้วขยายออก pad ช่อง */
function rasterize(P: NPt[], res: number, pad: number): Mask {
  const W = Math.max(...P.map((p) => p[0])), H = Math.max(...P.map((p) => p[1]));
  const w = Math.max(1, Math.ceil(W / res - 1e-9)), h = Math.max(1, Math.ceil(H / res - 1e-9));
  const rows: [number, number][][] = [];
  for (let j = 0; j < h; j++) {
    const y0 = j * res, y1 = Math.min(H, (j + 1) * res);
    const ys = [y0 + 1e-6, (y0 + y1) / 2, y1 - 1e-6, ...P.map((p) => p[1]).filter((y) => y > y0 && y < y1)];
    const iv: [number, number][] = [];
    for (const y of ys) for (const [a, b] of scan(P, y)) iv.push([Math.max(0, Math.floor(a / res)), Math.min(w - 1, Math.ceil(b / res) - 1)]);
    for (const [[ax, ay], [bx, by]] of P.map((p, i) => [p, P[(i + 1) % P.length]] as [NPt, NPt])) {   // ขอบที่อยู่ในแถบนี้ (เส้นเกือบนอน)
      if (Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
      const t0 = ay === by ? 0 : Math.max(0, Math.min(1, (y0 - ay) / (by - ay))), t1 = ay === by ? 1 : Math.max(0, Math.min(1, (y1 - ay) / (by - ay)));
      const xa = ax + (bx - ax) * t0, xb = ax + (bx - ax) * t1;
      iv.push([Math.max(0, Math.floor(Math.min(xa, xb) / res)), Math.min(w - 1, Math.floor(Math.max(xa, xb) / res))]);
    }
    rows.push(merge(iv));
  }
  if (pad <= 0) return { w, h, rows };
  const R: [number, number][][] = [];
  for (let j = -pad; j < h + pad; j++) {
    const iv: [number, number][] = [];
    for (let k = Math.max(0, j - pad); k <= Math.min(h - 1, j + pad); k++) for (const [a, b] of rows[k]) iv.push([a, b + 2 * pad]);
    R.push(merge(iv));
  }
  return { w: w + 2 * pad, h: h + 2 * pad, rows: R };
}
function merge(iv: [number, number][]): [number, number][] {
  if (!iv.length) return [];
  iv.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[iv[0][0], iv[0][1]]];
  for (const [a, b] of iv.slice(1)) { const l = out[out.length - 1]; if (a <= l[1] + 1) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out;
}

/**
 * วางชิ้นทั้งหมดบนผ้ากว้าง width ซม. — คืนตำแหน่งทุกชิ้น + ความยาวผ้าที่ใช้ + % ใช้ผ้า
 *   onProgress(ชิ้นที่วางแล้ว, ทั้งหมด) · stop() คืน true = หยุด (ได้ผลเท่าที่วางไปแล้ว)
 */
export function nestShapes(items: NestItem[], opts: NestOpts, onProgress?: (done: number, total: number) => void, stop?: () => boolean): NestResult {
  const width = Math.max(5, opts.width), gap = Math.max(0, opts.gap);
  const res = opts.res ?? Math.min(1, Math.max(0.25, Math.round((width / 320) * 4) / 4));
  const pad = Math.ceil(gap / res - 1e-9);
  const W = Math.floor(width / res + 1e-9);
  const copies: { it: NestItem; copy: number; flip: boolean; a: number }[] = [];
  for (const it of items) { if (it.outline.length < 3) continue; const a = area(it.outline); for (let c = 0; c < Math.max(0, Math.round(it.qty)); c++) copies.push({ it, copy: c, flip: !!it.pair && c % 2 === 1, a }); }
  copies.sort((x, y) => y.a - x.a || x.it.key.localeCompare(y.it.key) || x.copy - y.copy);
  const total = copies.length;
  // ความยาวผ้าที่เผื่อไว้ก่อน = พื้นที่กรอบรวม ÷ หน้าผ้า × 1.4 + ชิ้นยาวสุด · ไม่พอ = ขยายทีละเท่าตัว (จนถึงเพดาน = ต่อชิ้นเรียงเดี่ยว)
  const dims = copies.map((c) => { const xs = c.it.outline.map((p) => p[0]), ys = c.it.outline.map((p) => p[1]); return [Math.max(...xs) - Math.min(...xs) + gap, Math.max(...ys) - Math.min(...ys) + gap]; });
  const cap = opts.maxLength ?? Math.max(50, dims.reduce((s, [a, b]) => s + Math.max(a, b), 0));
  const est = Math.min(cap, (dims.reduce((s, [a, b]) => s + a * b, 0) / width) * 1.4 + dims.reduce((m, [a, b]) => Math.max(m, a, b), 0) + 10);
  const Hcap = Math.ceil(cap / res) + 4;
  let H = Math.min(Hcap, Math.ceil(est / res) + 4);
  let occ = new Uint8Array(W * H), pre = new Int32Array((W + 1) * H);
  const grow = () => {
    if (H >= Hcap) return false;
    const H2 = Math.min(Hcap, H * 2), o2 = new Uint8Array(W * H2), p2 = new Int32Array((W + 1) * H2);
    o2.set(occ); p2.set(pre); occ = o2; pre = p2; H = H2;
    return true;
  };
  const rowPre = (y: number) => { let s = 0; const o = y * (W + 1); pre[o] = 0; for (let x = 0; x < W; x++) { s += occ[y * W + x]; pre[o + x + 1] = s; } };
  const busy = (y: number, a: number, b: number) => pre[y * (W + 1) + b + 1] - pre[y * (W + 1) + a] > 0;
  const masks = new Map<string, { m: Mask; d: Mask; pts: NPt[] }>();
  const resume = new Map<string, number>();   // ตำแหน่งก่อนหน้านี้ของชิ้นแบบเดียวกัน = วางไม่ได้แน่นอน (ช่องเต็มขึ้นอย่างเดียว)
  const places: NestPlace[] = [], failed: string[] = [];
  let maxY = 0, used = 0, done = 0, stopped = false;
  for (const c of copies) {
    if (stop?.()) { stopped = true; break; }
    const rots: (0 | 90 | 180 | 270)[] = c.it.rot === "none" ? [0] : c.it.rot === "grain" ? [0, 180] : [0, 90, 180, 270];
    let best: { y: number; x: number; rot: 0 | 90 | 180 | 270; key: string; m: Mask; d: Mask; pts: NPt[]; idx: number } | null = null;
    for (const rot of rots) {
      const mk = `${c.it.key}|${rot}|${c.flip ? 1 : 0}`;
      let mm = masks.get(mk);
      if (!mm) { const pts = orient(c.it.outline, rot, c.flip); mm = { m: rasterize(pts, res, 0), d: rasterize(pts, res, pad), pts }; masks.set(mk, mm); }
      const { m } = mm;
      if (m.w > W) continue;
      const cols = W - m.w + 1;
      let found = -1, idx = resume.get(mk) ?? 0, worse = false;
      for (;;) {
        const last = (H - m.h + 1) * cols - 1;
        for (; idx <= last; idx++) {
          const y = Math.floor(idx / cols), x = idx % cols;
          if (best && y + m.h > best.y + best.m.h) { worse = true; break; }   // แย่กว่าทางหมุนที่เจอแล้ว
          let ok = true;
          for (let r = 0; r < m.h && ok; r++) for (const [a, b] of m.rows[r]) if (busy(y + r, x + a, x + b)) { ok = false; break; }
          if (ok) { found = idx; break; }
        }
        if (found >= 0 || worse || !grow()) break;
      }
      if (found < 0) { if (!worse) resume.set(mk, idx); continue; }
      resume.set(mk, found);
      const y = Math.floor(found / cols), x = found % cols;
      if (!best || y + m.h < best.y + best.m.h || (y + m.h === best.y + best.m.h && x < best.x)) best = { y, x, rot, key: mk, m, d: mm.d, pts: mm.pts, idx: found };
    }
    done++;
    if (!best) { if (!failed.includes(c.it.label)) failed.push(c.it.label); onProgress?.(done, total); continue; }
    const { x, y, d } = best;
    for (let r = 0; r < d.h; r++) {   // จองช่อง (ขยายเผื่อรอยตัด)
      const yy = y + r - pad;
      if (yy < 0 || yy >= H) continue;
      for (const [a, b] of d.rows[r]) for (let xx = Math.max(0, x + a - pad); xx <= Math.min(W - 1, x + b - pad); xx++) occ[yy * W + xx] = 1;
      rowPre(yy);
    }
    maxY = Math.max(maxY, y + best.m.h);
    used += c.a;
    places.push({ key: c.it.key, label: c.it.label, copy: c.copy, x: x * res, y: y * res, rot: best.rot, flip: c.flip, pts: best.pts.map(([px, py]) => [Math.round((px + x * res) * 1000) / 1000, Math.round((py + y * res) * 1000) / 1000]) });
    onProgress?.(done, total);
  }
  const length = Math.round(maxY * res * 10) / 10;
  return { ok: !stopped && failed.length === 0 && places.length > 0, places, width, length, efficiency: length > 0 ? Math.round((used / (width * length)) * 1000) / 10 : 0, failed, res, ...(stopped ? { stopped } : {}) };
}

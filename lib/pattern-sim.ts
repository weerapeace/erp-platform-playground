/**
 * 🧵 จำลองวัสดุทิ้งตัวของกระเป๋าที่ประกอบแล้ว (รอบ 6 ของสตูดิโอแพทเทิร์น · 2026-11-10 · **ทดลอง**) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   เอากระเป๋าที่ประกอบจากชิ้นจริง (lib/pattern-assembly) มาแตกเป็นตาข่ายจุดเล็ก ๆ ที่ต่อกันด้วย "สปริง" แล้วปล่อยให้แรงโน้มถ่วงดึง
 *     • buildSimMesh  — แผ่นหน้า/หลัง = สามเหลี่ยมจากรูปชิ้นจริง (มีรูเจาะ) · ชิ้นคั่นกลาง = ตารางตามขอบที่เย็บ · จุดตามตะเข็บเป็นจุดเดียวกัน (เย็บติดกัน)
 *     • createBagSim  — ตัวจำลองแบบ position-based: ระยะระหว่างจุดคงเดิม (ผ้าไม่ยืด) · ต้านการพับ · แรงดึงกลับทรงเดิม (ความอยู่ทรง) · พื้นโต๊ะ · ของข้างใน
 *
 *   ⚠️ เป็นการประมาณเพื่อ "ให้เห็นภาพ" ว่าวัสดุแข็ง/นิ่มต่างกันยังไง ไม่ใช่การคำนวณวัสดุจริง:
 *     ไม่มีค่าน้ำหนัก/ความหนา/ความแข็งของวัสดุจริง · แผ่นหน้ากับแผ่นหลังกันทะลุกันแบบง่าย ๆ (ชิ้นข้างยังทะลุกันได้) · ไม่มีหู ซับใน แผ่นใส ในภาพจำลอง
 *   ค่า stiffness 1 = อยู่ทรงเท่าที่ประกอบ (ไม่ขยับ) · ยิ่งน้อยยิ่งทรุด · fill = มีของข้างในดันทรงไว้ (สัดส่วนของความสูง)
 *
 * ใช้ที่: components/pattern-3d (mode "sim") · components/pattern-studio/assembly-view · เทสต์ lib/__tests__/pattern-sim.test.ts
 */
import type { AssemblyOk } from "@/lib/pattern-assembly";
import type { Pt } from "@/lib/pattern-shape";

export type SimMesh = {
  n: number;
  rest: Float32Array;       // ตำแหน่งตอนประกอบ (x, y, z ต่อจุด)
  tri: Uint32Array;         // สามเหลี่ยม (3 จุดต่อรูป) — หันหน้าออกนอกกระเป๋า
  part: Uint8Array;         // จุดนี้เป็นของ 0 = แผ่นหน้า · 1 = แผ่นหลัง · 2 = ชิ้นคั่นกลาง
  pids: string[];           // รหัสชิ้นที่มีในตาข่าย
  vpid: Uint16Array;        // จุดนี้เป็นของชิ้นไหน (ลำดับใน pids) — จุดบนตะเข็บนับเป็นของแผ่นหน้า/หลัง
  edges: Uint32Array; edgeLen: Float32Array;     // ระยะที่ต้องคงเดิม (ผ้าไม่ยืด)
  bends: Uint32Array; bendLen: Float32Array;     // คู่จุดตรงข้ามของสามเหลี่ยมติดกัน (ต้านการพับ)
  stitches: Uint32Array;                          // คู่จุดที่เย็บติดกันแต่ตำแหน่งไม่ตรงกันพอดี (ดึงเข้าหากัน)
  width: number; height: number; depth: number;
};
/** stiffness = ความอยู่ทรงกลาง · perPiece = ความอยู่ทรงรายชิ้น (รหัสชิ้น → 0–1) ทับค่ากลางของชิ้นนั้น */
export type SimParams = { stiffness: number; fill: number; perPiece?: Record<string, number> };

const inPoly = (x: number, y: number, P: Pt[]) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
const distPoly = (x: number, y: number, P: Pt[]) => {
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
    m = Math.min(m, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  }
  return m;
};
/** แบ่งแต่ละช่วงของเส้นให้ยาวไม่เกิน cell (กติกาเดียวกันทุกที่ → จุดบนตะเข็บของสองชิ้นตรงกันพอดี) */
export function resampleLine(P: Pt[], cell: number, closed: boolean): Pt[] {
  const out: Pt[] = [], n = closed ? P.length : P.length - 1;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % P.length], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / cell - 1e-9));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed && P.length) out.push(P[P.length - 1]);
  return out;
}

/** สามเหลี่ยมแบบ Delaunay (Bowyer–Watson) ของชุดจุด 2 มิติ → ดัชนีจุด 3 ตัวต่อรูป */
export function delaunay(pts: Pt[]): number[] {
  const n = pts.length; if (n < 3) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const d = Math.max(x1 - x0, y1 - y0, 1) * 20, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const P: Pt[] = [...pts, [mx - d, my - d], [mx + d, my - d], [mx, my + d]];
  type T = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const mk = (a: number, b: number, c: number): T => {
    const [ax, ay] = P[a], [bx, by] = P[b], [qx, qy] = P[c];
    const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by)) || 1e-12;
    const cx = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / D;
    const cy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / D;
    return { a, b, c, cx, cy, r2: (ax - cx) ** 2 + (ay - cy) ** 2 };
  };
  let tris: T[] = [mk(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = P[i], bad: T[] = [], keep: T[] = [];
    for (const t of tris) ((px - t.cx) ** 2 + (py - t.cy) ** 2 < t.r2 * (1 + 1e-10) ? bad : keep).push(t);
    const edge = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      if (edge.has(k)) edge.delete(k); else edge.set(k, [u, v]);
    }
    tris = keep;
    for (const [u, v] of edge.values()) tris.push(mk(u, v, i));
  }
  const out: number[] = [];
  for (const t of tris) if (t.a < n && t.b < n && t.c < n) out.push(t.a, t.b, t.c);
  return out;
}

/** แผ่น 1 แผ่น (เส้นรอบ + รู) → จุด + สามเหลี่ยม (หมุนทวนเข็มเมื่อมองจากด้าน +z) */
export function panelMesh(outline: Pt[], holes: Pt[][], cell: number): { pts: Pt[]; tri: number[] } {
  const rings = [resampleLine(outline, cell, true), ...holes.filter((h) => h.length >= 3).map((h) => resampleLine(h, cell, true))];
  const pts: Pt[] = rings.flat();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of outline) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const dy = cell * 0.866;
  let row = 0;
  for (let y = y0 + dy / 2; y < y1; y += dy, row++) {
    for (let x = x0 + (row % 2 ? cell / 2 : cell * 0.25); x < x1; x += cell) {
      const jx = x + Math.sin(row * 12.9898 + x * 78.233) * cell * 0.03, jy = y + Math.cos(row * 4.1414 + x * 37.719) * cell * 0.03;   // ขยับนิดเดียว กันจุดเรียงเป็นวงกลมเดียวกันพอดี
      if (!inPoly(jx, jy, outline) || distPoly(jx, jy, outline) < cell * 0.5) continue;
      if (holes.some((h) => h.length >= 3 && (inPoly(jx, jy, h) || distPoly(jx, jy, h) < cell * 0.5))) continue;
      pts.push([jx, jy]);
    }
  }
  const all = delaunay(pts), tri: number[] = [];
  for (let i = 0; i < all.length; i += 3) {
    const a = pts[all[i]], b = pts[all[i + 1]], c = pts[all[i + 2]], cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const area2 = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area2) < 1e-6 || !inPoly(cx, cy, outline) || holes.some((h) => h.length >= 3 && inPoly(cx, cy, h))) continue;
    if (area2 > 0) tri.push(all[i], all[i + 1], all[i + 2]); else tri.push(all[i], all[i + 2], all[i + 1]);
  }
  return { pts, tri };
}

/** กระเป๋าที่ประกอบแล้ว → ตาข่ายสำหรับจำลอง · cell = ขนาดช่องตาข่าย (ซม.) ไม่ส่ง = เลือกให้ได้ราว 1,200 จุด */
export function buildSimMesh(A: AssemblyOk, cell?: number): SimMesh {
  const D = A.depth, zf = D / 2, zb = -D / 2;
  const c = cell ?? Math.max(1.2, Math.min(3, Math.sqrt((2 * A.width * A.height + (2 * A.height + A.width) * D) / 1200)));
  const pos: number[] = [], part: number[] = [], vpid: number[] = [], pids: string[] = [], tri: number[] = [], index = new Map<string, number>();
  const pidIx = (pid: string) => { const k = pids.indexOf(pid); return k >= 0 ? k : pids.push(pid) - 1; };
  const key = (x: number, y: number, z: number) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
  const vertex = (x: number, y: number, z: number, p: number, owner: number): number => {
    const k = key(x, y, z), hit = index.get(k);
    if (hit !== undefined) return hit;
    const i = part.length; index.set(k, i); pos.push(x, y, z); part.push(p); vpid.push(owner); return i;
  };
  const backBoundary: number[] = [];
  A.panels.forEach((pn, pi) => {
    if (pn.outline.length < 3) return;
    const m = panelMesh(pn.outline, pn.holes, c), z = pn.side > 0 ? zf : zb, p = pn.side > 0 ? 0 : 1;
    const owner = pidIx(pn.pid), ids = m.pts.map(([x, y]) => vertex(x, y, z, p, owner));
    if (pi === 1) for (let i = 0; i < resampleLine(pn.outline, c, true).length; i++) backBoundary.push(ids[i]);
    for (let i = 0; i < m.tri.length; i += 3) {
      const a = ids[m.tri[i]], b = ids[m.tri[i + 1]], q = ids[m.tri[i + 2]];
      if (pn.side > 0) tri.push(a, b, q); else tri.push(a, q, b);      // แผ่นหลังหันออกด้าน −z
    }
  });
  // ชิ้นคั่นกลาง: ลากขอบของแผ่นหน้าข้ามความลึก — แถวแรกใช้จุดของแผ่นหน้า · แถวสุดท้ายใช้จุดของแผ่นหลังถ้าตรงกัน ไม่งั้น "เย็บ" เข้าหาจุดใกล้สุด
  const stitches: number[] = [], nz = Math.max(1, Math.round(D / c));
  for (const sw of A.sweeps) {
    const line = resampleLine(sw.pts, c, false);
    if (line.length < 2) continue;
    const rows: number[][] = [], owner = pidIx(sw.pid);
    for (let j = 0; j <= nz; j++) {
      const z = zf + ((zb - zf) * j) / nz;
      rows.push(line.map(([x, y]) => {
        if (j === nz && !index.has(key(x, y, z)) && backBoundary.length) {
          const v = vertex(x, y, z, 2, owner);
          let best = -1, bd = c * 1.6;
          for (const b of backBoundary) { const d = Math.hypot(pos[b * 3] - x, pos[b * 3 + 1] - y); if (d < bd) { bd = d; best = b; } }
          if (best >= 0) stitches.push(v, best);
          return v;
        }
        return vertex(x, y, z, 2, owner);
      }));
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i + 1 < line.length; i++) {
      const a = rows[j][i], a2 = rows[j][i + 1], b = rows[j + 1][i], b2 = rows[j + 1][i + 1];
      if (a !== b && a !== a2 && b !== a2) tri.push(a, b, a2);
      if (a2 !== b && a2 !== b2 && b !== b2) tri.push(a2, b, b2);
    }
  }
  // สปริง: ขอบของสามเหลี่ยม (ไม่ยืด) + จุดตรงข้ามของสามเหลี่ยมที่ใช้ขอบร่วมกัน (ต้านพับ)
  const n = part.length, em = new Map<string, number[]>();
  for (let i = 0; i < tri.length; i += 3) for (const [u, v, w] of [[tri[i], tri[i + 1], tri[i + 2]], [tri[i + 1], tri[i + 2], tri[i]], [tri[i + 2], tri[i], tri[i + 1]]]) {
    const k = u < v ? `${u}_${v}` : `${v}_${u}`;
    (em.get(k) ?? em.set(k, []).get(k)!).push(w);
  }
  const edges: number[] = [], bends: number[] = [];
  const len = (a: number, b: number) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
  for (const [k, opp] of em) {
    const [u, v] = k.split("_").map(Number);
    edges.push(u, v);
    if (opp.length === 2 && opp[0] !== opp[1]) bends.push(opp[0], opp[1]);
  }
  const lens = (pairs: number[]) => Float32Array.from({ length: pairs.length / 2 }, (_, i) => len(pairs[i * 2], pairs[i * 2 + 1]));
  return {
    n, rest: Float32Array.from(pos), tri: Uint32Array.from(tri), part: Uint8Array.from(part), pids, vpid: Uint16Array.from(vpid),
    edges: Uint32Array.from(edges), edgeLen: lens(edges), bends: Uint32Array.from(bends), bendLen: lens(bends), stitches: Uint32Array.from(stitches),
    width: A.width, height: A.height, depth: D,
  };
}

export type BagSim = {
  mesh: SimMesh;
  /** ตำแหน่งปัจจุบัน (x, y, z ต่อจุด) — ตัวแสดง 3D อ่านตรงจากอาร์เรย์นี้ */
  pos: Float32Array;
  setParams: (p: SimParams) => void;
  /** เดินหน้า steps ก้าว → true = ยังขยับอยู่ · false = นิ่งแล้ว (ไม่คิดต่อจนกว่าจะเปลี่ยนค่า/เริ่มใหม่) */
  advance: (steps?: number) => boolean;
  reset: () => void;
  settled: () => boolean;
  /** ความสูงปัจจุบันของกระเป๋า (จุดสูงสุด) */
  height: () => number;
};

const G_STEP = 0.02;        // ระยะที่แรงโน้มถ่วงดึงลงต่อก้าว (ซม.)
const DAMP = 0.9;
const ITER = 6;
const GAP = 0.15;           // แผ่นหน้า/หลังห้ามเข้าใกล้กึ่งกลางเกินนี้ (กันทะลุกันแบบง่าย)

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export function createBagSim(mesh: SimMesh, params: SimParams = { stiffness: 0.5, fill: 0 }): BagSim {
  const n = mesh.n, pos = Float32Array.from(mesh.rest), prev = Float32Array.from(mesh.rest);
  let p = { ...params }, quiet = 0, steps = 0, done = false;
  // ค่าต่อจุด / ต่อสปริงพับ — คิดใหม่ทุกครั้งที่เปลี่ยนค่า (ไม่คิดในวงจำลอง)
  const kRestV = new Float32Array(n), kBendE = new Float32Array(mesh.bendLen.length);
  const prepare = () => {
    const base = clamp01(p.stiffness), sv = new Float32Array(n);
    const per = mesh.pids.map((pid) => { const v = p.perPiece?.[pid]; return v == null || !Number.isFinite(v) ? base : clamp01(v); });
    for (let v = 0; v < n; v++) {
      const s = per[mesh.vpid[v]] ?? base; sv[v] = s;
      // จุดอิสระจะทรุดลงได้ราว sag ซม. ก่อนแรงดึงกลับทรงเดิมจะสู้แรงโน้มถ่วงได้ (แข็งสุด = ไม่ทรุดเลย)
      const sag = mesh.height * 0.6 * (1 - s) * (1 - s);
      kRestV[v] = sag < 1e-4 ? 1 : Math.min(1, G_STEP / sag);
    }
    for (let e = 0; e < kBendE.length; e++) { const s = (sv[mesh.bends[e * 2]] + sv[mesh.bends[e * 2 + 1]]) / 2; kBendE[e] = 0.03 + 0.9 * s * s; }
  };
  const pair = (a: number, b: number, rest: number, k: number) => {
    const ax = a * 3, bx = b * 3, dx = pos[bx] - pos[ax], dy = pos[bx + 1] - pos[ax + 1], dz = pos[bx + 2] - pos[ax + 2];
    const d = Math.hypot(dx, dy, dz); if (d < 1e-9) return;
    const f = (0.5 * k * (d - rest)) / d;
    pos[ax] += dx * f; pos[ax + 1] += dy * f; pos[ax + 2] += dz * f; pos[bx] -= dx * f; pos[bx + 1] -= dy * f; pos[bx + 2] -= dz * f;
  };
  const step = (): number => {
    const fill = clamp01(p.fill);
    const fillH = fill * mesh.height, fillZ = Math.max(GAP, (mesh.depth / 2) * fill * 0.9);
    for (let i = 0; i < n * 3; i += 3) {
      const vx = (pos[i] - prev[i]) * DAMP, vy = (pos[i + 1] - prev[i + 1]) * DAMP, vz = (pos[i + 2] - prev[i + 2]) * DAMP;
      prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2];
      pos[i] += vx; pos[i + 1] += vy - G_STEP; pos[i + 2] += vz;
    }
    for (let it = 0; it < ITER; it++) {
      for (let e = 0; e < mesh.edgeLen.length; e++) pair(mesh.edges[e * 2], mesh.edges[e * 2 + 1], mesh.edgeLen[e], 1);
      for (let e = 0; e < mesh.bendLen.length; e++) pair(mesh.bends[e * 2], mesh.bends[e * 2 + 1], mesh.bendLen[e], kBendE[e]);
      for (let e = 0; e < mesh.stitches.length; e += 2) pair(mesh.stitches[e], mesh.stitches[e + 1], 0, 1);
      for (let v = 0, i = 0; v < n; v++, i += 3) {
        if (pos[i + 1] < 0) { pos[i + 1] = 0; pos[i] = prev[i] + (pos[i] - prev[i]) * 0.3; pos[i + 2] = prev[i + 2] + (pos[i + 2] - prev[i + 2]) * 0.3; }   // พื้นโต๊ะ + แรงเสียดทาน
        const zmin = fill > 0 && pos[i + 1] < fillH ? fillZ : GAP;
        if (mesh.part[v] === 0 && pos[i + 2] < zmin) pos[i + 2] = zmin;            // แผ่นหน้าอยู่ฝั่งหน้า (และถูกของข้างในดัน)
        else if (mesh.part[v] === 1 && pos[i + 2] > -zmin) pos[i + 2] = -zmin;     // แผ่นหลังอยู่ฝั่งหลัง
      }
    }
    let move = 0;
    for (let i = 0; i < n * 3; i++) {
      pos[i] += (mesh.rest[i] - pos[i]) * kRestV[(i / 3) | 0];
      if (!Number.isFinite(pos[i])) pos[i] = mesh.rest[i];                          // กันตัวเลขพัง (ไม่ควรเกิด)
      const d = Math.abs(pos[i] - prev[i]); if (d > move) move = d;
    }
    return move;
  };
  prepare();
  return {
    mesh, pos,
    setParams: (next) => { p = { ...next }; prepare(); done = false; quiet = 0; steps = 0; },
    advance: (count = 1) => {
      if (done) return false;
      for (let k = 0; k < count; k++) {
        const mv = step(); steps++;
        quiet = mv < 0.004 ? quiet + 1 : 0;
        if (quiet > 40 || steps > 1500) { done = true; break; }
      }
      return !done;
    },
    reset: () => { pos.set(mesh.rest); prev.set(mesh.rest); done = false; quiet = 0; steps = 0; },
    settled: () => done,
    height: () => { let m = 0; for (let i = 1; i < n * 3; i += 3) if (pos[i] > m) m = pos[i]; return m; },
  };
}

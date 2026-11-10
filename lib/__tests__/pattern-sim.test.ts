import { describe, expect, it } from "vitest";
import { BAG_DEFAULT, BAG_PRESETS, bagAttachRefs, bagGeometry, bagPieces, bagSeamRefs, type BagParams } from "@/lib/bag-templates";
import { assemble, type AsmPiece, type Attach, type AssemblyOk } from "@/lib/pattern-assembly";
import { movePiece, type Pt } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";
import { buildSimMesh, createBagSim, delaunay, resampleLine } from "@/lib/pattern-sim";

function asm(params: Partial<BagParams>): AssemblyOk {
  const G = bagGeometry({ ...BAG_DEFAULT, ...params }), list = bagPieces(G);
  const pieces: AsmPiece[] = list.map((q) => { const m = movePiece({ shape: q.shape, holes: q.holes }, q.at[0], q.at[1]); return { pid: q.key, name: q.name, count: q.count, shape: m.shape, holes: m.holes }; });
  const seams: Seam[] = bagSeamRefs(G).map((r, i) => ({ id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } }));
  const attaches: Attach[] = bagAttachRefs(G).map((r, i) => ({ id: `a${i}`, kind: r.kind, pid: r.piece, on: r.on, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail }));
  const A = assemble(pieces, seams, attaches);
  if (!A.ok) throw new Error("assemble failed");
  return A;
}
const run = (sim: ReturnType<typeof createBagSim>, max = 2000) => { let i = 0; while (sim.advance(10) && i++ < max / 10); return sim; };

describe("ตาข่ายจำลอง (buildSimMesh)", () => {
  it("แบ่งเส้น: ทุกช่วงยาวไม่เกินช่อง · เส้นปิดไม่ซ้ำจุดแรก · เส้นเปิดมีจุดท้าย", () => {
    const sq: Pt[] = [[0, 0], [10, 0], [10, 4], [0, 4]];
    expect(resampleLine(sq, 2, true)).toHaveLength(5 + 2 + 5 + 2);
    const open = resampleLine([[0, 0], [5, 0]], 2, false);
    expect(open).toEqual([[0, 0], [5 / 3, 0], [10 / 3, 0], [5, 0]]);
  });
  it("delaunay: สี่เหลี่ยม 4 จุด = 2 รูป · จุดเดียวกลาง = 4 รูป", () => {
    expect(delaunay([[0, 0], [4, 0], [4, 3], [0, 3]]).length).toBe(6);
    expect(delaunay([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2.1]]).length).toBe(12);
  });
  it("Tote ใบกลาง: จุดตามตะเข็บใช้ร่วมกัน (ไม่ต้องเย็บเพิ่ม) · สามเหลี่ยมทุกรูปหันออกนอก · ระยะสปริงไม่เป็นศูนย์", () => {
    const A = asm({}), M = buildSimMesh(A);
    expect(M.n).toBeGreaterThan(300); expect(M.n).toBeLessThan(2500);
    expect(M.stitches.length).toBe(0);                          // หน้า/หลังรูปเดียวกัน → จุดขอบตรงกันพอดี
    expect(new Set(M.part)).toEqual(new Set([0, 1, 2]));
    let out = 0, total = 0;
    for (let i = 0; i < M.tri.length; i += 3) {
      const [a, b, c] = [M.tri[i], M.tri[i + 1], M.tri[i + 2]].map((v) => [M.rest[v * 3], M.rest[v * 3 + 1], M.rest[v * 3 + 2]]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 - A.height / 2, (a[2] + b[2] + c[2]) / 3];
      total++; if (nrm[0] * cen[0] + nrm[1] * cen[1] + nrm[2] * cen[2] > 0) out++;
    }
    expect(out / total).toBeGreaterThan(0.97);
    expect(Math.min(...M.edgeLen)).toBeGreaterThan(0.05);
    expect(M.bendLen.length).toBeGreaterThan(M.edgeLen.length * 0.7);
  });
  it("กระเป๋าโชว์ (ตัวหน้ามีรู): ไม่มีสามเหลี่ยมปิดรู · ตัวหลังคนละชิ้นก็เย็บติดกับชิ้นคั่นกลางได้", () => {
    const A = asm(BAG_PRESETS[1].params), M = buildSimMesh(A), hole = A.panels[0].holes[0];
    const hx = hole.reduce((s, p) => s + p[0], 0) / hole.length, hy = hole.reduce((s, p) => s + p[1], 0) / hole.length;
    for (let i = 0; i < M.tri.length; i += 3) {
      const v = [M.tri[i], M.tri[i + 1], M.tri[i + 2]];
      if (v.some((k) => M.part[k] !== 0 || M.rest[k * 3 + 2] < 0)) continue;
      const cx = v.reduce((s, k) => s + M.rest[k * 3], 0) / 3, cy = v.reduce((s, k) => s + M.rest[k * 3 + 1], 0) / 3;
      expect(Math.hypot(cx - hx, cy - hy)).toBeGreaterThan(1);
    }
    expect(M.stitches.length % 2).toBe(0);
  });
});

describe("ตัวจำลองวัสดุทิ้งตัว (createBagSim)", () => {
  it("แข็งสุด = ไม่ขยับ นิ่งทันที", () => {
    const M = buildSimMesh(asm({}), 3), sim = run(createBagSim(M, { stiffness: 1, fill: 0 }));
    expect(sim.settled()).toBe(true);
    let d = 0; for (let i = 0; i < M.n * 3; i++) d = Math.max(d, Math.abs(sim.pos[i] - M.rest[i]));
    expect(d).toBeLessThan(1e-4);
  });
  it("ยิ่งนิ่มยิ่งทรุด · ไม่ทะลุพื้น · ตัวเลขไม่พัง · แผ่นหน้ากับแผ่นหลังไม่สลับฝั่ง", () => {
    const M = buildSimMesh(asm({}), 3);
    const firm = run(createBagSim(M, { stiffness: 0.8, fill: 0 })), soft = run(createBagSim(M, { stiffness: 0.15, fill: 0 }));
    expect(firm.height()).toBeGreaterThan(soft.height());
    expect(M.height - firm.height()).toBeLessThan(1.5);
    expect(M.height - soft.height()).toBeGreaterThan(1.5);
    for (let v = 0; v < M.n; v++) {
      const y = soft.pos[v * 3 + 1], z = soft.pos[v * 3 + 2];
      expect(Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      if (M.part[v] === 0) expect(z).toBeGreaterThan(0);
      if (M.part[v] === 1) expect(z).toBeLessThan(0);
    }
  });
  it("มีของข้างใน = ทรงช่วงล่างถูกดันไว้ (หนากว่าตอนไม่มีของ) · เริ่มใหม่ = กลับทรงประกอบ", () => {
    const M = buildSimMesh(asm({}), 3);
    const depthAt = (sim: ReturnType<typeof createBagSim>) => { let zf = 0, n = 0; for (let v = 0; v < M.n; v++) if (M.part[v] === 0 && sim.pos[v * 3 + 1] < M.height * 0.4) { zf += sim.pos[v * 3 + 2]; n++; } return zf / Math.max(1, n); };
    const empty = run(createBagSim(M, { stiffness: 0.1, fill: 0 })), full = run(createBagSim(M, { stiffness: 0.1, fill: 0.8 }));
    expect(depthAt(full)).toBeGreaterThan(depthAt(empty) - 1e-6);
    expect(depthAt(full)).toBeGreaterThanOrEqual((M.depth / 2) * 0.8 * 0.9 - 1e-3);
    full.reset();
    expect(full.settled()).toBe(false);
    expect(Array.from(full.pos.slice(0, 30))).toEqual(Array.from(M.rest.slice(0, 30)));
  });
});

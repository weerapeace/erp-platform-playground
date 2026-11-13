/** Bag CAD รอบ I2: ขยายไซซ์ + วางชิ้นบนผ้าตามรูปจริง */
import { describe, expect, it } from "vitest";
import { nestShapes, type NPt } from "@/lib/pattern-nest";
import { buildGradedFile, cleanGrading, gradePiece, gradeSeamReport, gradeShape, gradeSizeCsv, gradeSizes, type GradeSpec } from "@/lib/pattern-grading";
import { pieceEdges } from "@/lib/pattern-seams";
import { shapeBox, type Shape } from "@/lib/pattern-shape";

const tri = (a: number): NPt[] => [[0, 0], [a, 0], [0, a]];
const rect = (w: number, h: number): NPt[] => [[0, 0], [w, 0], [w, h], [0, h]];
const inside = (P: NPt[], x: number, y: number) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

describe("วางชิ้นบนผ้าตามรูปจริง", () => {
  it("สามเหลี่ยม 2 ชิ้น (หมุนได้) ซ้อนกันเป็นสี่เหลี่ยม — สั้นกว่าวางตามกรอบมาก", () => {
    const r = nestShapes([{ key: "t", label: "T", outline: tri(20), qty: 2, rot: "free" }], { width: 21, gap: 0, res: 0.25 });
    expect(r.ok).toBe(true);
    expect(r.places).toHaveLength(2);
    expect(r.length).toBeLessThan(24);   // วางตามกรอบ = 40
  });
  it("สี่เหลี่ยม 10×5 ×4 บนผ้ากว้าง 20 → แถวละ 2 ยาว 10", () => {
    const r = nestShapes([{ key: "r", label: "R", outline: rect(10, 5), qty: 4, rot: "grain" }], { width: 20, gap: 0, res: 0.5 });
    expect(r.ok).toBe(true); expect(r.length).toBeCloseTo(10, 5); expect(r.efficiency).toBeCloseTo(100, 0);
  });
  it("ไม่ทับกัน + เว้นรอยตัด: จุดในชิ้นหนึ่งไม่อยู่ในอีกชิ้น", () => {
    const r = nestShapes([{ key: "a", label: "A", outline: [[0, 0], [12, 0], [12, 4], [4, 4], [4, 12], [0, 12]], qty: 3, rot: "free" }, { key: "b", label: "B", outline: tri(9), qty: 3, rot: "free" }], { width: 30, gap: 0.5, res: 0.25 });
    expect(r.ok).toBe(true);
    for (let i = 0; i < r.places.length; i++) for (let j = i + 1; j < r.places.length; j++) {
      for (const [x, y] of r.places[i].pts) {
        const P = r.places[j].pts;
        const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
        const tx = x + (cx - x) * 1e-3, ty = y + (cy - y) * 1e-3;
        expect(inside(P, tx, ty)).toBe(false);
      }
    }
    for (const p of r.places) for (const [x] of p.pts) { expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(30 + 1e-6); }
  });
  it("ตามทางผ้า = หมุนได้แค่ 0/180 · ทางเดียว = ไม่หมุน", () => {
    const g = nestShapes([{ key: "r", label: "R", outline: rect(4, 20), qty: 2, rot: "grain" }], { width: 25, gap: 0 , res: 0.5 });
    expect(g.places.every((p) => p.rot === 0 || p.rot === 180)).toBe(true);
    const n = nestShapes([{ key: "r", label: "R", outline: tri(10), qty: 3, rot: "none" }], { width: 40, gap: 0, res: 0.5 });
    expect(n.places.every((p) => p.rot === 0)).toBe(true);
  });
  it("ชิ้นกว้างเกินหน้าผ้า = บอกว่าวางไม่ได้ · หยุดกลางทาง = ได้ผลเท่าที่วาง", () => {
    const r = nestShapes([{ key: "w", label: "กว้าง", outline: rect(50, 60), qty: 1, rot: "none" }], { width: 40, gap: 0 });
    expect(r.ok).toBe(false); expect(r.failed).toEqual(["กว้าง"]);
    let k = 0;
    const s = nestShapes([{ key: "r", label: "R", outline: rect(5, 5), qty: 10, rot: "grain" }], { width: 50, gap: 0 }, undefined, () => ++k > 3);
    expect(s.stopped).toBe(true); expect(s.places).toHaveLength(3);
  });
  it("ชิ้นจำนวนมาก: พื้นที่ขยายเองจนวางครบ (ไม่จองหน่วยความจำล่วงหน้าเกินจำเป็น)", () => {
    const r = nestShapes([{ key: "r", label: "R", outline: rect(10, 10), qty: 300, rot: "grain" }, { key: "t", label: "T", outline: tri(12), qty: 100, rot: "free" }], { width: 100, gap: 0.5, res: 0.5 });
    expect(r.ok).toBe(true); expect(r.places).toHaveLength(400);
    expect(r.length).toBeGreaterThan(330); expect(r.length).toBeLessThan(520);
  });
  it("คู่ซ้าย-ขวา: ชิ้นคี่กลับด้าน", () => {
    const r = nestShapes([{ key: "p", label: "P", outline: tri(10), qty: 2, rot: "grain", pair: true }], { width: 40, gap: 0, res: 0.5 });
    expect(r.places.map((p) => p.flip).sort()).toEqual([false, true]);
  });
});

const spec: GradeSpec = { sizes: ["S", "M", "L"], base: 1, def: { dw: 2, dh: 1, anchor: "c" }, rules: {} };
describe("ขยายไซซ์", () => {
  it("กฎกลาง: กว้าง +2 สูง +1 ต่อไซซ์ จากกลางชิ้น · ไซซ์ตั้งต้นไม่เปลี่ยน", () => {
    const s: Shape = { k: "rect", x: 10, y: 10, w: 20, h: 10 };
    expect(gradeShape(s, spec.def, 0)).toBe(s);
    const L = shapeBox(gradeShape(s, spec.def, 1)), S = shapeBox(gradeShape(s, spec.def, -1));
    expect([L.x, L.y, L.w, L.h]).toEqual([9, 9.5, 22, 11]);
    expect([S.x, S.y, S.w, S.h]).toEqual([11, 10.5, 18, 9]);
  });
  it("กฎรายจุด: จุดที่ 2 ขยับ +3,0 ต่อไซซ์ (สี่เหลี่ยมกลายเป็นเส้นหัก)", () => {
    const g = gradeShape({ k: "rect", x: 0, y: 0, w: 10, h: 10 }, { dw: 0, dh: 0, pts: [{ n: 2, dx: 3, dy: 0 }] }, 2) as { k: "path"; nodes: { x: number; y: number }[] };
    expect(g.k).toBe("path"); expect(g.nodes[2]).toEqual({ x: 16, y: 10 }); expect(g.nodes[1]).toEqual({ x: 10, y: 0 });
  });
  it("มุมซ้ายบนเป็นจุดยึด: มุมนั้นอยู่ที่เดิม · จุดบาก/เส้นใน ตามสัดส่วน", () => {
    const p = { pid: "a", shape: { k: "rect", x: 0, y: 0, w: 10, h: 10 } as Shape, notches: [[10, 5]] as [number, number][], inner: [{ id: "i", kind: "sew" as const, pts: [[5, 0], [5, 10]] as [number, number][] }] };
    const q = gradePiece(p, { dw: 10, dh: 0, anchor: "tl" }, 1);
    expect(shapeBox(q.shape)).toMatchObject({ x: 0, y: 0, w: 20, h: 10 });
    expect(q.notches).toEqual([[20, 5]]); expect(q.inner![0].pts).toEqual([[10, 0], [10, 10]]);
  });
  it("ตรวจตะเข็บทุกไซซ์: ชิ้นข้างไม่ขยายตาม = ไซซ์ที่ไม่ใช่ตั้งต้นไม่ผ่าน", () => {
    const pieces = [{ pid: "f", shape: { k: "rect", x: 0, y: 0, w: 20, h: 10 } as Shape }, { pid: "g", shape: { k: "rect", x: 0, y: 20, w: 20, h: 4 } as Shape }];
    const seams = [{ id: "s", a: { pid: "f", from: 0, count: 1, n: pieceEdges(pieces[0].shape).length }, b: { pid: "g", from: 0, count: 1, n: 4 } }];
    const rep = gradeSeamReport(pieces, seams, { ...spec, rules: { g: { dw: 0, dh: 0 } } });
    expect(rep.map((r) => r.bad.length)).toEqual([1, 0, 1]);
    const rep2 = gradeSeamReport(pieces, seams, { ...spec, rules: { g: { dw: 2, dh: 0 } } });
    expect(rep2.every((r) => r.bad.length === 0)).toBe(true);
  });
  it("ตรวจข้อมูล + ไฟล์ทุกไซซ์ + ตาราง CSV", () => {
    expect(cleanGrading({ sizes: ["S"], base: 0 })).toBeNull();
    expect(cleanGrading({ sizes: ["S", "M", "M", " L "], base: 9, def: { dw: 2, dh: "x" }, rules: { a: { dw: 1, dh: 1, anchor: "zz", pts: [{ n: 1, dx: 0, dy: 0 }, { n: 2, dx: 1, dy: 0 }] } } }))
      .toEqual({ sizes: ["S", "M", "L"], base: 0, def: { dw: 2, dh: 0 }, rules: { a: { dw: 1, dh: 1, pts: [{ n: 2, dx: 1, dy: 0 }] } } });
    const pieces = [{ pid: "a", name: "หน้า", shape: { k: "rect", x: 0, y: 0, w: 20, h: 10 } as Shape }];
    expect(gradeSizes(pieces, spec).map((s) => s.step)).toEqual([-1, 0, 1]);
    const f = JSON.parse(buildGradedFile({ name: "x", pieces, seams: [] }, spec));
    expect(f.kind).toBe("erp-pattern-graded"); expect(f.sizes).toHaveLength(3); expect(f.sizes[1].base).toBe(true);
    const csv = gradeSizeCsv(pieces, spec);
    expect(csv.split("\r\n")[1]).toContain("18,9");
  });
});

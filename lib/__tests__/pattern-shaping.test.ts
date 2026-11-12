/** เครื่องมือทรงกระเป๋า (Bag CAD รอบ F): เกล็ด · มุมกล่อง · ผ่าแล้วกาง · จีบ · ชิ้นข้างจากขอบ · แถบทากาว · take · อัตรารูด · ชดเชยความหนา */
import { describe, expect, it } from "vitest";
import { boxCorner, dartOnEdge, edgeBandLine, gussetFromEdges, gussetRun, pleatPiece, pleatTake, slashSpread, withTakes } from "@/lib/pattern-shaping";
import { checkSeam, cleanEdgeMeta, cleanSeams, pieceEdges, sideLength, type Seam } from "@/lib/pattern-seams";
import { pieceGeometry, shapeBox, type Shape } from "@/lib/pattern-shape";
import { remapEdgeMeta, edgePlan } from "@/lib/pattern-edge-map";
import { checkPattern } from "@/lib/pattern-check";
import { cleanMatProps, cleanPieceInfo, matFoldComp } from "@/lib/pattern-project";
import { assemble } from "@/lib/pattern-assembly";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const len = (s: Shape) => pieceEdges(s).reduce((m, e) => m + e.len, 0);
const area = (s: Shape) => pieceGeometry({ shape: s }).finishedArea;

describe("เกล็ด", () => {
  it("เกล็ดปิด: รูปเดิม · ช่วงปากติด take = กว้างปาก · ขาเกล็ด + กลางเกล็ด + รอยบาก 2 จุด", () => {
    const r = dartOnEdge(R(0, 0, 30, 20), 2, { at: 15, width: 3, depth: 6 })!;
    expect(pieceEdges(r.shape)).toHaveLength(6);
    expect(area(r.shape)).toBeCloseTo(600, 3);
    expect(r.take[3]).toBeCloseTo(3, 3);
    expect(r.inner?.map((l) => l.kind)).toEqual(["sew", "fold"]);
    expect(r.inner?.[0].pts[1][1]).toBeCloseTo(14, 3);              // ขอบล่าง y = 20 → ปลายเกล็ดลึกเข้าไป 6 = y 14
    expect(r.notches).toHaveLength(2);
  });
  it("เกล็ดเปิด: ตัดตัว V ออก · ขาสองข้าง take เต็ม · คู่ขาเย็บในชิ้น · ความยาวที่เย็บ = ยาวขอบ − กว้างปาก", () => {
    const s = R(0, 0, 30, 20), r = dartOnEdge(s, 2, { at: 15, width: 3, depth: 6, open: true })!;
    expect(area(r.shape)).toBeCloseTo(600 - 9, 3);                  // V กว้าง 3 ลึก 6 = 9 ตร.ซม.
    expect(r.legs).toEqual([[3, 4]]);
    const n = pieceEdges(r.shape).length, meta = withTakes(null, n, r.take);
    const sewn = sideLength({ shape: r.shape, meta }, { pid: "a", from: 2, count: 4, n });
    expect(sewn).toBeCloseTo(27, 3);
  });
  it("ปากเกล็ดเกินขอบ / ลึก 0 = ทำไม่ได้", () => {
    expect(dartOnEdge(R(0, 0, 30, 20), 2, { at: 1, width: 3, depth: 6 })).toBeNull();
    expect(dartOnEdge(R(0, 0, 30, 20), 2, { at: 15, width: 3, depth: 0 })).toBeNull();
  });
});

describe("มุมกล่อง", () => {
  it("ตัดเหลี่ยม 5 × 5 ที่มุมล่างซ้าย: พื้นที่หาย 25 · ขาสองข้างยาว 5 · take + คู่ขา", () => {
    const s = R(0, 0, 30, 20), r = boxCorner(s, 3, 5)!;
    expect(area(r.shape)).toBeCloseTo(575, 3);
    expect(r.legs).toEqual([[3, 4]]);
    const E = pieceEdges(r.shape);
    expect(E[3].len).toBeCloseTo(5, 3); expect(E[4].len).toBeCloseTo(5, 3);
    expect(checkSeam(new Map([["a", r.shape]]), { id: "x", a: { pid: "a", from: 3, count: 1, n: 6 }, b: { pid: "a", from: 4, count: 1, n: 6 }, rev: true, self: true }).status).toBe("ok");
  });
  it("ตะเข็บข้าง+ก้นเดิมตามขอบใหม่ และนับเฉพาะส่วนที่เย็บจริง", () => {
    const s = R(0, 0, 30, 20), r = boxCorner(s, 3, 5)!, plan = edgePlan(s, r.shape)!;
    expect(plan).not.toBeNull();
    const meta = withTakes(remapEdgeMeta(null, plan).meta, plan.newN, r.take);
    expect(sideLength({ shape: r.shape, meta }, { pid: "a", from: 1, count: 5, n: 6 })).toBeCloseTo(20 + 25 + 15, 3);   // ขวา 20 + ล่าง 25 + ซ้าย 15
  });
  it("มุมเว้า / ขอบสั้นกว่าขนาด = ทำไม่ได้", () => {
    expect(boxCorner(R(0, 0, 30, 20), 3, 25)).toBeNull();
    const L: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }] };
    expect(boxCorner(L, 3, 2)).toBeNull();
  });
});

describe("ผ่าแล้วกาง", () => {
  it("กางขนาน 4 ซม. ที่ x = 10: กว้างขึ้น 4 · พื้นที่ +4×สูง · ได้ช่องกาง 2 ช่วง", () => {
    const r = slashSpread(R(0, 0, 30, 20), { axis: "v", at: 10, amount: 4 })!;
    const b = shapeBox(r.shape);
    expect(b.w).toBeCloseTo(34, 3); expect(area(r.shape)).toBeCloseTo(680, 3);
    expect(r.gaps).toHaveLength(2);
  });
  it("หมุนกาง (จุดหมุนล่าง): ขอบล่างยาวเท่าเดิม · ขอบบนยาวขึ้น ≈ ระยะกาง", () => {
    const s = R(0, 0, 30, 20), r = slashSpread(s, { axis: "v", at: 15, amount: 6, mode: "pivot", hinge: "max" })!;
    expect(r.gaps).toHaveLength(1);
    const [g0, g1] = r.gaps[0];
    expect(Math.hypot(g1[0] - g0[0], g1[1] - g0[1])).toBeCloseTo(6, 3);   // ช่องกางที่ปลายบน = 6
    expect(len(r.shape)).toBeCloseTo(len(s) + 6, 3);                       // หมุนไม่เปลี่ยนความยาวขอบเดิม
  });
  it("เส้นผ่าไม่โดนชิ้น = ทำไม่ได้", () => { expect(slashSpread(R(0, 0, 30, 20), { axis: "v", at: 40, amount: 4 })).toBeNull(); });
});

describe("จีบ", () => {
  it("จีบทบ 2 จีบ ลึก 2: กว้างขึ้น 8 · เนื้อจีบบนขอบบน+ล่างติด take 4 ช่วง · ความยาวที่เย็บเท่าเดิม", () => {
    const s = R(0, 0, 30, 20), r = pleatPiece(s, { axis: "v", n: 2, depth: 2 })!;
    expect(pleatTake(2)).toBe(4);
    expect(shapeBox(r.shape).w).toBeCloseTo(38, 3);
    expect(Object.keys(r.take)).toHaveLength(4);
    const top = pieceEdges(r.shape).filter((e) => e.pts.every((p) => Math.abs(p[1]) < 1e-3));
    expect(top.reduce((m, e) => m + e.len - (r.take[e.i] ?? 0), 0)).toBeCloseTo(30, 3);   // ขอบบนหลังพับจีบ = 30 เท่าเดิม
    expect(r.inner).toHaveLength(4);                                 // 2 จีบ × (วางทับ + พับ)
    expect(r.notches).toHaveLength(8);
  });
  it("จีบกล่อง = 4 × ลึก ต่อจีบ · มีเส้นชนกลาง", () => {
    const r = pleatPiece(R(0, 0, 30, 20), { axis: "v", n: 1, depth: 1.5, kind: "box" })!;
    expect(shapeBox(r.shape).w).toBeCloseTo(36, 3);
    expect(r.inner?.map((l) => l.kind)).toEqual(["fold", "mark", "fold"]);
  });
});

describe("ชิ้นข้างจากขอบ", () => {
  it("ยาว = ขอบข้าง+ก้นตามจริง · รอยบากที่รอยต่อขอบ · เดินหาขอบจนเจอขอบปาก", () => {
    const s = R(0, 0, 30, 20);
    expect(gussetRun(s, 1, [1, 0, 0, 0])).toBe(3);                   // ขอบบนพับ = ปาก → ขวา ล่าง ซ้าย
    const g = gussetFromEdges(s, 1, 3, 8)!;
    expect(g.length).toBeCloseTo(70, 3);
    expect(shapeBox(g.shape)).toMatchObject({ w: 70, h: 8 });
    expect(g.notches).toHaveLength(4);
  });
  it("วงรีวัดตามเส้นโค้ง · หัก take ของเกล็ด", () => {
    const e = gussetFromEdges({ k: "ellipse", x: 0, y: 0, w: 20, h: 20 }, 0, 1, 5)!;
    expect(e.length).toBeCloseTo(Math.PI * 20, 0);
    const d = dartOnEdge(R(0, 0, 30, 20), 2, { at: 15, width: 3, depth: 6, open: true })!, n = pieceEdges(d.shape).length;
    expect(gussetFromEdges(d.shape, 1, 6, 8, withTakes(null, n, d.take))!.length).toBeCloseTo(20 + 27 + 20, 3);
  });
});

describe("take · อัตรารูด · ตะเข็บในชิ้น · ชดเชยความหนา · แนวทากาว", () => {
  it("เก็บ take ในค่ารายขอบ · ขอบถูกแบ่ง = take หลุด (ไม่นับซ้ำ)", () => {
    const s = R(0, 0, 30, 20);
    expect(cleanEdgeMeta(s, [{ take: 2 }, {}, {}, {}])?.[0].take).toBe(2);
    expect(cleanEdgeMeta(s, [{ take: 99 }, {}, {}, {}])).toBeNull();
    const split: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }] };
    expect(remapEdgeMeta([{ take: 2 }, { take: 1 }, {}, {}], edgePlan(s, split)!).meta?.map((m) => m.take ?? 0)).toEqual([0, 0, 1, 0, 0]);
  });
  it("อัตรารูด 1.5: 45 กับ 30 = ผ่าน · 40 กับ 30 = เตือน gather-off · เก็บค่า ratio/self", () => {
    const shapes = new Map<string, Shape>([["a", R(0, 0, 45, 10)], ["b", R(0, 0, 30, 10)], ["c", R(0, 0, 40, 10)]]);
    const seam = (b: string): Seam => ({ id: "g", a: { pid: "a", from: 0, count: 1, n: 4 }, b: { pid: b, from: 0, count: 1, n: 4 }, ease: true, ratio: 1.5 });
    expect(checkSeam(shapes, seam("b")).status).toBe("ok");
    const off = checkSeam(new Map([["a", R(0, 0, 40, 10)], ["b", R(0, 0, 30, 10)]]), seam("b"));
    expect(off.status).toBe("mismatch"); expect(off.ratio).toBeCloseTo(1.33, 2);
    const issues = checkPattern([{ pid: "a", name: "a", shape: R(0, 0, 40, 10) }, { pid: "b", name: "b", shape: R(0, 0, 30, 10) }], [seam("b")]);
    expect(issues.some((x) => x.code === "gather-off")).toBe(true);
    expect(cleanSeams([{ ...seam("b"), self: true, ratio: 9 }], new Set(["a", "b"]))[0]).toMatchObject({ self: true });
    expect(cleanSeams([{ ...seam("b"), ratio: 9 }], new Set(["a", "b"]))[0].ratio).toBeUndefined();
  });
  it("ตะเข็บในชิ้น (self) ไม่ทำให้ประกอบ 3D พัง", () => {
    const front = boxCorner(R(0, 0, 30, 20), 3, 4)!;
    const pieces = [{ pid: "f", name: "หน้า", count: 1, shape: front.shape, holes: [] }, { pid: "b", name: "หลัง", count: 1, shape: R(0, 0, 30, 20), holes: [] }];
    const seams: Seam[] = [
      { id: "s1", a: { pid: "f", from: 1, count: 1, n: 6 }, b: { pid: "b", from: 1, count: 1, n: 4 } },
      { id: "s2", a: { pid: "f", from: 3, count: 1, n: 6 }, b: { pid: "f", from: 4, count: 1, n: 6 }, rev: true, self: true },
    ];
    const A = assemble(pieces, seams, []);
    expect(A.ok).toBe(true);
  });
  it("ชดเชยความหนา: ขอบพับได้เผื่อเพิ่ม comp × จำนวนทบ · ค่าจากวัสดุ = ที่ช่างตั้ง หรือความหนา", () => {
    const s = R(0, 0, 30, 20);
    const base = pieceGeometry({ shape: s, allow: 1, foldEdges: [1, 0, 0, 0] }).cutBox.h;
    const comp = pieceGeometry({ shape: s, allow: 1, foldEdges: [2, 0, 0, 0], info: { comp: 0.15 } }).cutBox.h;
    expect(comp - base).toBeCloseTo(0.3, 3);
    expect(cleanPieceInfo({ comp: 0.12 })).toEqual({ comp: 0.12 });
    expect(matFoldComp(cleanMatProps({ m: { stiff: 0.5, thick: 1.2 } }).m)).toBeCloseTo(0.12, 3);
    expect(matFoldComp(cleanMatProps({ m: { stiff: 0.5, thick: 1.2, fold: 2 } }).m)).toBeCloseTo(0.2, 3);
  });
  it("แนวทากาวขนานขอบ เข้าในชิ้นตามระยะ", () => {
    expect(edgeBandLine(R(0, 0, 30, 20), 0, 1.5)).toEqual([[0, 1.5], [30, 1.5]]);
    expect(edgeBandLine(R(0, 0, 30, 20), 2, 1)).toEqual([[30, 19], [0, 19]]);
  });
});

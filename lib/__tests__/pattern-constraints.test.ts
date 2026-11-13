/** Bag CAD รอบ I1: เงื่อนไขรูปชิ้น + ขนาดบังคับ · คู่ที่ขัดกัน · ความอิสระ · ตามขอบใหม่ · ตัดชิ้นตามเส้น */
import { describe, expect, it } from "vitest";
import { cleanConstraints, constraintNow, cutAlongLine, freedom, remapConstraints, solveConstraints, type Constraint } from "@/lib/pattern-constraints";
import { pieceEdges } from "@/lib/pattern-seams";
import { edgePlan } from "@/lib/pattern-edge-map";
import { pieceGeometry, shapeBox, type Shape } from "@/lib/pattern-shape";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
const quad = (pts: [number, number][]): Shape => ({ k: "path", nodes: pts.map(([x, y]) => ({ x, y })) });
const C = (c: Omit<Constraint, "id">, id = Math.random().toString(36).slice(2, 8)): Constraint => ({ id, ...c });
const lens = (s: Shape) => pieceEdges(s).map((e) => Math.round(e.len * 100) / 100);

describe("ขนาดบังคับ + เงื่อนไข", () => {
  it("ขอบบนยาว 25 + บน/ล่างแนวนอน + ข้างแนวตั้ง → สี่เหลี่ยม 25 กว้าง", () => {
    const r = solveConstraints(R(20, 15), [C({ kind: "length", e: 0, v: 25 }), C({ kind: "horizontal", e: 0 }), C({ kind: "horizontal", e: 2 }), C({ kind: "vertical", e: 1 }), C({ kind: "vertical", e: 3 }), C({ kind: "equal", e: 0, f: 2 })]);
    expect(r.ok).toBe(true);
    expect(lens(r.shape)[0]).toBeCloseTo(25, 1); expect(lens(r.shape)[2]).toBeCloseTo(25, 1);
    expect(shapeBox(r.shape).h).toBeCloseTo(15, 1);
  });
  it("สี่เหลี่ยมเบี้ยว → ตั้งฉาก + มุม 90° ที่จุด", () => {
    const s = quad([[0, 0], [20, 2], [21, 15], [-1, 14]]);
    const r = solveConstraints(s, [C({ kind: "perpendicular", e: 0, f: 1 }), C({ kind: "angle", n: 3, v: 90 })]);
    expect(r.ok).toBe(true);
    expect(constraintNow(r.shape, C({ kind: "angle", n: 3, v: 90 }))).toBeCloseTo(90, 0);
  });
  it("มุมภายในของสี่เหลี่ยม = 90 ทุกมุม (ทิศวนได้ทั้งสองแบบ)", () => {
    for (const s of [R(10, 5), quad([[0, 0], [0, 5], [10, 5], [10, 0]])]) for (let n = 0; n < 4; n++) expect(constraintNow(s, C({ kind: "angle", n, v: 90 }))).toBeCloseTo(90, 3);
  });
  it("สมมาตรซ้าย-ขวา: จุดสะท้อนกันรอบเส้นกลาง", () => {
    const s = quad([[0, 0], [10, 0], [12, 10], [-1, 10]]);
    const r = solveConstraints(s, [C({ kind: "symmetric", axis: "v" })]);
    expect(r.ok).toBe(true);
    const n = (r.shape as { nodes: { x: number; y: number }[] }).nodes, mid = (Math.min(...n.map((q) => q.x)) + Math.max(...n.map((q) => q.x))) / 2;
    expect(n[0].x + n[1].x).toBeCloseTo(2 * mid, 2); expect(n[2].x + n[3].x).toBeCloseTo(2 * mid, 2);
  });
  it("ขัดกันเอง: ขอบเดียวกันยาว 10 และ 20 → ไม่ผ่าน + บอกคู่ที่ชน", () => {
    const r = solveConstraints(R(20, 15), [C({ kind: "length", e: 0, v: 10 }, "a"), C({ kind: "length", e: 0, v: 20 }, "b"), C({ kind: "vertical", e: 1 }, "c")]);
    expect(r.ok).toBe(false);
    expect(r.conflicts.some(([x, y]) => (x === "a" && y === "b") || (x === "b" && y === "a"))).toBe(true);
    expect(r.conflicts.some(([x, y]) => x === "c" || y === "c")).toBe(false);
  });
  it("ความอิสระ: 4 จุด = 5 · ใส่ 5 เงื่อนไข = ครบพอดี · เกิน = ติดลบ", () => {
    expect(freedom(4, [])).toBe(5);
    expect(freedom(4, Array.from({ length: 5 }, () => C({ kind: "horizontal", e: 0 })))).toBe(0);
    expect(freedom(4, [C({ kind: "symmetric", axis: "v" }), C({ kind: "length", e: 0, v: 3 }), C({ kind: "length", e: 1, v: 3 })])).toBe(-1);
  });
  it("ตรวจข้อมูล: ชนิดแปลก/ค่าไม่ครบ = ทิ้ง · ขอบเดียวกันสองฝั่ง = ทิ้ง", () => {
    expect(cleanConstraints([{ id: "a", kind: "length", e: 0, v: 12 }, { id: "b", kind: "equal", e: 1, f: 1 }, { id: "c", kind: "fly" }, { id: "d", kind: "angle", n: 2 }])).toEqual([{ id: "a", kind: "length", e: 0, v: 12 }]);
    expect(cleanConstraints("x")).toBeNull();
  });
  it("แบ่งขอบแล้ว: เงื่อนไขของขอบที่ไม่ถูกแบ่งตามไป · ขอบที่ถูกแบ่ง = ทิ้ง", () => {
    const s = R(30, 20), split: Shape = quad([[0, 0], [15, 0], [30, 0], [30, 20], [0, 20]]);
    const out = remapConstraints([C({ kind: "horizontal", e: 0 }, "top"), C({ kind: "vertical", e: 1 }, "right"), C({ kind: "length", e: 2, v: 30 }, "bot")], edgePlan(s, split)!);
    expect(out.map((c) => [c.id, c.e])).toEqual([["right", 2], ["bot", 3]]);
  });
});

describe("ตัดชิ้นตามเส้น", () => {
  it("ตัดสี่เหลี่ยม 30×20 ด้วยเส้นแนวตั้งที่ x = 12 → 2 ชิ้น พื้นที่รวมเท่าเดิม · ขอบตัดยาวเท่ากัน", () => {
    const r = cutAlongLine(R(30, 20), [12, 5], [12, 15])!;
    const aL = pieceGeometry({ shape: r.left }).finishedArea, aR = pieceGeometry({ shape: r.right }).finishedArea;
    expect(aL + aR).toBeCloseTo(600, 3); expect(Math.min(aL, aR)).toBeCloseTo(240, 3);
    const eL = pieceEdges(r.left)[r.cutEdge[0]].len, eR = pieceEdges(r.right)[r.cutEdge[1]].len;
    expect(eL).toBeCloseTo(20, 3); expect(eR).toBeCloseTo(20, 3);
    expect(r.side([5, 10])).not.toBe(r.side([20, 10]));
    const leftIsWest = shapeBox(r.left).x < 1;
    expect(r.sides[0]).toBe(r.side(leftIsWest ? [5, 10] : [20, 10])); expect(r.sides[1]).toBe(-r.sides[0]);
  });
  it("เส้นไม่ผ่านชิ้น = ทำไม่ได้", () => { expect(cutAlongLine(R(30, 20), [40, 0], [40, 10])).toBeNull(); });
});

import { describe, expect, it } from "vitest";
import {
  cleanLineShape, flipPiece, foldPiece, lineCutSize, lineShapeArea, nearestSegment, offsetPolygon, parseSvgShapes, pieceGeometry,
  refitLineShape, shapeArea, shapeBox, shapeInside, splitSegment, toPathShape, toggleSmooth, type PNode, type Shape,
} from "@/lib/pattern-shape";

const close = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);
const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });

describe("เผื่อพับ (เส้นตัด)", () => {
  it("สี่เหลี่ยม 10×10 เผื่อ 1 → ตัด 12×12 · หดเข้า 1 → 8×8", () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const o = offsetPolygon(sq, 1);
    const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-1); expect(Math.max(...xs)).toBeCloseTo(11); expect(Math.max(...ys)).toBeCloseTo(11);
    const i = offsetPolygon(sq, -1);
    expect(Math.min(...i.map((p) => p[0]))).toBeCloseTo(1);
    // ทิศทางกลับ (ทวนเข็ม) ก็ขยายออกเหมือนกัน
    const rev = offsetPolygon([...sq].reverse(), 1);
    expect(Math.min(...rev.map((p) => p[0]))).toBeCloseTo(-1);
  });
  it("pieceGeometry: เผื่อ 0.3 + รูเจาะหดเข้า · พื้นที่ตัดหักรู · รูเล็กกว่าเผื่อ = หาย", () => {
    const g = pieceGeometry({ shape: R(0, 0, 20, 30), holes: [R(5, 5, 10, 4), R(2, 20, 0.4, 0.4)], allow: 0.3 });
    close(g.cutBox.w, 20.6); close(g.cutBox.h, 30.6);
    expect(g.holesCut).toHaveLength(1);   // รู 0.4 ซม. เล็กกว่า 2×0.3 → หาย
    close(g.cutArea, 20.6 * 30.6 - 9.4 * 3.4, 0.05);
    close(g.finishedArea, 600 - 40 - 0.16, 0.01);
    expect(lineCutSize({ shape: R(0, 0, 20, 30), allow: 1 })).toEqual({ w: 22, h: 32 });
  });
});

describe("เก็บ / คิดในบรรทัด", () => {
  it("cleanLineShape เก็บรู เผื่อพับ รหัสชิ้น ชื่อชิ้น · รูเลื่อนตามเส้นนอก", () => {
    const ls = cleanLineShape({ shape: R(10, 10, 20, 30), holes: [R(15, 15, 10, 4), { k: "rect", w: -1, h: 1 }], allow: 0.3, pid: "pc_1", name: "  ตัวหน้า  ", basis: "area" })!;
    expect(ls.shape).toEqual(R(0, 0, 20, 30));
    expect(ls.holes).toEqual([R(5, 5, 10, 4)]);
    expect(ls).toMatchObject({ allow: 0.3, pid: "pc_1", name: "ตัวหน้า", basis: "area" });
    expect(cleanLineShape({ shape: R(0, 0, 1, 1), pid: "bad id!", allow: -2 })).toEqual({ v: 1, shape: R(0, 0, 1, 1), basis: "box" });
    close(lineShapeArea(ls)!, 20.6 * 30.6 - 9.4 * 3.4, 0.05);
  });
  it("refitLineShape: กว้าง/ยาวในตาราง = ขนาดตัด → หักเผื่อพับ 2 ข้างเป็นขนาดสำเร็จ · รูยืดตาม", () => {
    const ls = cleanLineShape({ shape: R(0, 0, 20, 30), holes: [R(5, 5, 10, 4)], allow: 1 })!;
    const r = refitLineShape(ls, 42, null)!;   // ตัด 42 → สำเร็จ 40
    expect(r.shape).toEqual(R(0, 0, 40, 30));
    expect(r.holes).toEqual([R(10, 5, 20, 4)]);
  });
});

describe("รูเจาะ / พับครึ่ง / กลับด้าน", () => {
  it("shapeInside: วงกลมในสี่เหลี่ยม = ใช่ · ล้นขอบ = ไม่", () => {
    expect(shapeInside({ k: "ellipse", x: 5, y: 5, w: 4, h: 4 }, R(0, 0, 20, 20))).toBe(true);
    expect(shapeInside({ k: "ellipse", x: 18, y: 5, w: 4, h: 4 }, R(0, 0, 20, 20))).toBe(false);
  });
  it("SVG path หลายเส้น: เส้นในเส้น = รูเจาะของชิ้น (ไม่แยกเป็นชิ้น)", () => {
    const imp = parseSvgShapes(`<svg width="30cm" height="30cm" viewBox="0 0 30 30"><path d="M0 0H20V20H0Z M5 5H10V10H5Z"/><rect x="25" y="0" width="5" height="5"/></svg>`)!;
    expect(imp.pieces).toHaveLength(2);
    expect(imp.pieces[0].holes).toHaveLength(1);
    close(shapeArea(imp.pieces[0].holes[0]), 25);
  });
  it("พับครึ่งสี่เหลี่ยม = กว้างสองเท่า + รูสะท้อน · วงกลมพับไม่ได้", () => {
    const f = foldPiece({ shape: R(0, 0, 10, 20), holes: [R(2, 2, 3, 3)] }, "x")!;
    expect(f.shape).toEqual(R(0, 0, 20, 20));
    expect(f.holes.map((h) => shapeBox(h).x)).toEqual([2, 15]);
    expect(foldPiece({ shape: { k: "ellipse", x: 0, y: 0, w: 5, h: 5 } }, "x")).toBeNull();
  });
  it("พับครึ่งรูปจากจุดที่มีเส้นแนบขอบขวา → สมมาตร พื้นที่สองเท่า · ไม่มีเส้นแนบ = null", () => {
    const half: Shape = { k: "path", nodes: [{ x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 15 }, { x: 0, y: 5 }] };
    const f = foldPiece({ shape: half }, "x")!;
    close(shapeArea(f.shape), shapeArea(half) * 2);
    expect(shapeBox(f.shape)).toMatchObject({ x: 0, w: 20 });
    const tri: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 10 }] };
    expect(foldPiece({ shape: tri }, "x")).toBeNull();
  });
  it("กลับด้าน: กรอบเดิม รูย้ายฝั่ง · พื้นที่เท่าเดิม", () => {
    const p = flipPiece({ shape: toPathShape(R(0, 0, 10, 10)), holes: [R(1, 1, 2, 2)] });
    expect(shapeBox(p.shape)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(shapeBox(p.holes[0]).x).toBe(7);
  });
});

describe("แก้จุด", () => {
  it("แทรกจุดกลางเส้นโค้ง รูปทรงไม่เปลี่ยน · สลับมุม/โค้ง", () => {
    const circle = toPathShape({ k: "ellipse", x: 0, y: 0, w: 10, h: 10 });
    if (circle.k !== "path") throw new Error("path");
    const near = nearestSegment(circle.nodes, [5 + 5 * Math.SQRT1_2, 5 + 5 * Math.SQRT1_2]);
    expect(near.dist).toBeLessThan(0.05);
    const more = splitSegment(circle.nodes, near.i, near.t);
    expect(more).toHaveLength(5);
    close(shapeArea({ k: "path", nodes: more }), shapeArea(circle), 0.01);
    const sq: PNode[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const sm = toggleSmooth(sq, 1);
    expect(sm[1].ox).toBeCloseTo(10 / 6); expect(sm[1].oy).toBeCloseTo(10 / 6);   // ขนานเส้นจากจุดก่อน → จุดถัดไป
    expect(toggleSmooth(sm, 1)[1]).toEqual({ x: 10, y: 0 });
  });
});

describe("หน้าแพทเทิร์น: เส้นตัด + เส้นเย็บ + รู", () => {
  it("บรรทัดมีเผื่อพับ 1 ซม. + รู → ชิ้นขนาดตัด · มีเส้นเย็บ · DXF มี layer SEW · รูอยู่ชั้น HOLE แยกจากเส้นรอบชิ้น", async () => {
    const { patternPieces, shelfLayout, buildPatternDxf } = await import("@/lib/pattern-sheet");
    const [p] = patternPieces([{ calc_method: "area_face", item_name: "หนัง", width_cm: 22, length_cm: 32, pieces: 2,
      shape: { v: 1, shape: R(0, 0, 20, 30), holes: [R(5, 5, 10, 4)], allow: 1, name: "ตัวหน้า", basis: "box" } }]);
    expect(p).toMatchObject({ w: 22, h: 32, name: "หนัง · ตัวหน้า" });
    expect(p.sewD).toContain("M1 1");
    expect(p.holes).toHaveLength(1);
    const dxf = buildPatternDxf(shelfLayout([p], 40));
    expect(dxf).toContain("\nSEW\n");
    expect((dxf.match(/\n8\nCUT\n/g) ?? []).length).toBe(p.outline!.length);
    expect((dxf.match(/\n8\nHOLE\n/g) ?? []).length).toBe(p.holes![0].length);
  });
});

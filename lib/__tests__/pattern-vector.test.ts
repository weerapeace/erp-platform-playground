import { describe, expect, it } from "vitest";
import { cleanLineShape, defaultGrain, untangle, flipPiece, fitPiece, foldPiece, midEdgeNotches, movePiece, notchSegments, offsetShape, roundCorners, rotatePiece, shapeArea, shapeBox, toPathShape, type Shape } from "@/lib/pattern-shape";

const close = (a: number, b: number, eps = 0.02) => expect(Math.abs(a - b)).toBeLessThan(eps);
const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });

describe("ลบมุมโค้ง / เส้นขนาน", () => {
  it("สี่เหลี่ยม 10×10 มุมมน 2 → พื้นที่ 100 − (4−π)·4 · รูปจากจุดได้เท่ากัน · วงกลมไม่เปลี่ยน", () => {
    const exact = 100 - (4 - Math.PI) * 4;
    close(shapeArea(roundCorners(R(0, 0, 10, 10), 2)), exact, 0.05);
    close(shapeArea(roundCorners(toPathShape(R(0, 0, 10, 10)), 2)), exact, 0.05);
    const c: Shape = { k: "ellipse", x: 0, y: 0, w: 5, h: 5 };
    expect(roundCorners(c, 2)).toBe(c);
  });
  it("รัศมีใหญ่เกินขอบ = ลดลงเอง (ไม่ทับกัน) · กรอบเท่าเดิม", () => {
    const s = roundCorners(toPathShape(R(0, 0, 4, 4)), 10);
    expect(shapeBox(s)).toMatchObject({ w: 4, h: 4 });
    close(shapeArea(s), Math.PI * 4, 0.1);   // กลายเป็นวงกลม r=2
  });
  it("เส้นขนาน: สี่เหลี่ยม −1 = เล็กลงรอบด้าน · หดจนหาย = null", () => {
    expect(offsetShape(R(0, 0, 10, 20), -1)).toEqual(R(1, 1, 8, 18));
    expect(offsetShape(R(0, 0, 1, 1), -1)).toBeNull();
    const tri: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }] };
    expect(shapeArea(offsetShape(tri, -1)!)).toBeLessThan(shapeArea(tri));
  });
});

describe("เส้นทางผ้า / รอยบาก", () => {
  it("เส้นทางผ้าตั้งต้น = แนวตั้งกลางชิ้น · รอยบากกลางขอบตรง", () => {
    expect(defaultGrain(R(0, 0, 10, 20))).toEqual([[5, 3], [5, 17]]);
    expect(midEdgeNotches(R(0, 0, 10, 2))).toEqual([[5, 0], [5, 2]]);   // ขอบ 2 ซม. สั้นกว่า 3 = ข้าม
  });
  it("เส้นรอยบาก: เริ่มที่เส้นตัด (เผื่อพับ 1) เข้าไปในชิ้น 0.5", () => {
    const sew: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const [[a, b]] = notchSegments(sew, [[5, 0]], 1, 0.5);
    close(a[0], 5); close(a[1], -1); close(b[1], -0.5);
  });
  it("ย้าย/ยืด/หมุน/กลับด้าน/พับ พาเส้นทางผ้า+รอยบากไปด้วย · เก็บลงบรรทัดได้", () => {
    const p = { shape: R(0, 0, 10, 20), holes: [], grain: defaultGrain(R(0, 0, 10, 20)), notches: [[5, 0] as [number, number]] };
    expect(movePiece(p, 2, 3).notches).toEqual([[7, 3]]);
    expect(fitPiece(p, 0, 0, 20, 20).grain).toEqual([[10, 3], [10, 17]]);
    const r = rotatePiece(p, 90);
    close(r.notches![0][0], 15); close(r.notches![0][1], 10);
    expect(flipPiece({ ...p, notches: [[2, 0] as [number, number]] }).notches).toEqual([[8, 0]]);
    expect(foldPiece(p, "x")!.notches).toEqual([[5, 0], [15, 0]]);
    const ls = cleanLineShape({ shape: R(10, 10, 10, 20), grain: [[15, 13], [15, 27]], notches: [[15, 10], ["x", 1]] })!;
    expect(ls.grain).toEqual([[5, 3], [5, 17]]);
    expect(ls.notches).toEqual([[5, 0]]);
  });
});

describe("ใบแพทเทิร์น + ปรับขนาดจากตาราง พาเครื่องหมายไปด้วย", () => {
  it("พิมพ์ขนาดใหม่ในตาราง (refit) → เส้นทางผ้า/รอยบากยืดตาม", async () => {
    const { refitLineShape } = await import("@/lib/pattern-shape");
    const ls = cleanLineShape({ v: 1, shape: R(0, 0, 10, 20), basis: "area", grain: [[5, 3], [5, 17]], notches: [[10, 10]] })!;
    const r = refitLineShape(ls, 20, 40)!;
    expect(r.grain).toEqual([[10, 6], [10, 34]]);
    expect(r.notches).toEqual([[20, 20]]);
  });
  it("patternPieces: มีเส้นทางผ้า+รอยบาก → ได้เส้น GRAIN/NOTCH ใน DXF + SVG", async () => {
    const { patternPieces, shelfLayout, buildPatternDxf, buildPatternSvg } = await import("@/lib/pattern-sheet");
    const pieces = patternPieces([{ item_name: "หนัง", shape: { v: 1, shape: R(0, 0, 10, 20), basis: "area", allow: 1, grain: [[5, 3], [5, 17]], notches: [[10, 10]] } }]);
    expect(pieces[0].grainSegs).toHaveLength(5);   // ก้าน + หัว 4 เส้น
    expect(pieces[0].grainSegs![0]).toEqual([[6, 4], [6, 18]]);   // เลื่อนตามเผื่อพับ 1
    expect(pieces[0].notchSegs).toHaveLength(1);
    const [a, b] = pieces[0].notchSegs![0];
    close(a[0], 12); close(a[1], 11); close(b[0], 11.5); close(b[1], 11);   // จากเส้นตัด (ขวาสุด x=12) เข้าใน 0.5
    const lay = shelfLayout(pieces, 50);
    const dxf = buildPatternDxf(lay);
    expect(dxf).toContain("GRAIN");
    expect(dxf).toContain("NOTCH");
    expect(buildPatternSvg(lay)).toContain(pieces[0].marksD!);
  });
});

describe("เส้นขนานด้านในของมุมโค้ง", () => {
  it("มุมโค้ง 0.5 ทำเส้นขนานเข้าใน 1 → มุมกลายเป็นเหลี่ยมสะอาด (ไม่มีห่วงไขว้) · พื้นที่ ≈ 8×8", () => {
    const inner = offsetShape(roundCorners(R(0, 0, 10, 10), 0.5), -1)!;
    expect(inner).not.toBeNull();
    close(shapeArea(inner), 64, 0.15);
    const b = shapeBox(inner); close(b.x, 1, 0.05); close(b.w, 8, 0.05);
  });
  it("untangle: เลข 8 → เหลือห่วงใหญ่", () => {
    const P: [number, number][] = [[0, 0], [10, 10], [10, 0], [0, 10]];   // ไขว้ตรงกลาง
    expect(untangle(P).length).toBeLessThan(5);
    const sq: [number, number][] = [[0, 0], [5, 0], [5, 5], [0, 5]];
    expect(untangle(sq)).toEqual(sq);
  });
});

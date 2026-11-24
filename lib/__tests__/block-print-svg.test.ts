import { describe, expect, it } from "vitest";
import { opsBox } from "@/lib/block-print";
import { parsePathData, shapeOps, svgUnitScale } from "@/lib/block-print-svg";

describe("อ่านเส้นจากไฟล์ SVG", () => {
  it("คำสั่งตัวเล็ก (ระยะสัมพัทธ์) + H V Z", () => {
    expect(parsePathData("m10 10 h5 v5 h-5z")).toEqual([0, 10, 10, 1, 15, 10, 1, 15, 15, 1, 10, 15, 4]);
  });
  it("ตัวเลขติดกันแบบ Illustrator (1.5.5 / -2-3)", () => {
    expect(parsePathData("M1.5.5L-2-3")).toEqual([0, 1.5, 0.5, 1, -2, -3]);
  });
  it("S ใช้จุดจับสะท้อน · T ใช้จุดควบคุมสะท้อน", () => {
    const d = parsePathData("M0 0C0 10 10 10 10 0S20 -10 20 0");
    expect(d.slice(10, 13)).toEqual([2, 10, -10]);
    const q = parsePathData("M0 0Q5 10 10 0T20 0");
    expect(q.slice(8)).toEqual([3, 15, -10, 20, 0]);
  });
  it("โค้งวงรี A = ครึ่งวงกลมรัศมี 5 กรอบถูก · ธงติดกัน '01'", () => {
    const b = opsBox(parsePathData("M0 5A5 5 0 0 1 10 5"))!;
    expect(b.w).toBeCloseTo(10, 3);
    expect(b.h).toBeCloseTo(5, 3);
    const b2 = opsBox(parsePathData("M0 5a5 5 0 0110 0"))!;
    expect(b2.w).toBeCloseTo(10, 3);
  });
  it("รูปทรงพื้นฐาน: สี่เหลี่ยมมุมมน วงกลม polygon", () => {
    const at = (o: Record<string, number>) => (n: string) => o[n] ?? 0;
    expect(opsBox(shapeOps("rect", at({ x: 1, y: 2, width: 10, height: 4, rx: 1 }))!)).toMatchObject({ x: 1, y: 2, w: 10, h: 4 });
    const c = opsBox(shapeOps("circle", at({ cx: 5, cy: 5, r: 5 }))!)!;
    expect(c.w).toBeCloseTo(10, 3);
    expect(shapeOps("polygon", at({}), "0,0 10,0 5,8")).toEqual([0, 0, 0, 1, 10, 0, 1, 5, 8, 4]);
    expect(shapeOps("rect", at({ width: 0, height: 4 }))).toBeNull();
  });
  it("หน่วยไฟล์: mm ตรง · Illustrator px = pt · อื่น ๆ 96 ต่อนิ้ว", () => {
    expect(svgUnitScale("50mm", 100, false)).toBeCloseTo(0.5, 6);
    expect(svgUnitScale("72px", 72, true)).toBeCloseTo(25.4 / 72, 6);
    expect(svgUnitScale("96", 96, false)).toBeCloseTo(25.4 / 96, 6);
    expect(svgUnitScale(null, 0, true)).toBeCloseTo(25.4 / 72, 6);
  });
});

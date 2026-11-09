import { describe, expect, it } from "vitest";
import {
  cleanLineShape, fitShape, lineShapeArea, normalizeShape, parsePathData, parseSvgShapes, parseTransform, refitLineShape,
  shapeArea, shapeBox, shapePathD, shapePerimeter, shapeStats, snapTo, type Shape,
} from "@/lib/pattern-shape";

const close = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("snapTo", () => {
  it("ดูดเข้าตามระยะ · 0 = ไม่ดูด (ปัด 2 ตำแหน่ง)", () => {
    expect(snapTo(12.34, 0.1)).toBe(12.3);
    expect(snapTo(12.36, 0.5)).toBe(12.5);
    expect(snapTo(12.6, 1)).toBe(13);
    expect(snapTo(12.6, 5)).toBe(15);
    expect(snapTo(12.345, 0)).toBe(12.35);
  });
});

describe("พื้นที่ / รอบรูป / กรอบ", () => {
  it("สี่เหลี่ยม · วงกลม · รูปจากจุด", () => {
    const r: Shape = { k: "rect", x: 0, y: 0, w: 30, h: 35 };
    expect(shapeArea(r)).toBe(1050);
    expect(shapePerimeter(r)).toBe(130);
    const c: Shape = { k: "ellipse", x: 0, y: 0, w: 10, h: 10 };
    close(shapeArea(c), Math.PI * 25);
    close(shapePerimeter(c), Math.PI * 10);
    const tri: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] };
    expect(shapeArea(tri)).toBe(50);
    expect(shapeBox(tri)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(shapeStats(tri).fill).toBe(0.5);
  });
  it("วงกลมจากเส้นโค้ง 4 ช่วง (หูจับ) ได้พื้นที่ใกล้ πr²", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="0" cy="0" r="72" transform="rotate(30)"/></svg>`;
    const imp = parseSvgShapes(svg)!;
    expect(imp.shapes[0].k).toBe("path");   // หมุน = แปลงเป็นเส้นโค้ง
    close(shapeArea(imp.shapes[0]), Math.PI * 2.54 * 2.54, 0.02);   // r = 72pt = 2.54 ซม.
  });
});

describe("ยืด / เลื่อน / เก็บ", () => {
  it("fitShape ยืดรูปจากจุดทั้งจุดและหูจับ · normalize เริ่มที่ 0,0", () => {
    const p: Shape = { k: "path", nodes: [{ x: 5, y: 5, ox: 2, oy: 0 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }] };
    const f = fitShape(p, 0, 0, 20, 10);
    expect(shapeBox(f)).toEqual({ x: 0, y: 0, w: 20, h: 10 });
    expect(f.k === "path" && f.nodes[0].ox).toBe(4);
    expect(shapeBox(normalizeShape(p))).toMatchObject({ x: 0, y: 0 });
  });
  it("cleanLineShape กันข้อมูลผิด · lineShapeArea ใช้เฉพาะโหมดพื้นที่จริง · refit ตามกว้างยาวในตาราง", () => {
    expect(cleanLineShape(null)).toBeNull();
    expect(cleanLineShape({ shape: { k: "rect", w: -1, h: 3 } })).toBeNull();
    expect(cleanLineShape({ shape: { k: "path", nodes: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } })).toBeNull();
    const ls = cleanLineShape({ shape: { k: "ellipse", x: 3, y: 4, w: 10, h: 10 }, basis: "area" })!;
    expect(ls.shape).toEqual({ k: "ellipse", x: 0, y: 0, w: 10, h: 10 });
    expect(lineShapeArea(ls)).toBe(78.54);
    expect(lineShapeArea({ ...ls, basis: "box" })).toBeNull();
    expect(refitLineShape(ls, 20, null)!.shape).toEqual({ k: "ellipse", x: 0, y: 0, w: 20, h: 10 });
  });
  it("shapePathD วาดได้ทั้ง 3 แบบ", () => {
    expect(shapePathD({ k: "rect", x: 0, y: 0, w: 2, h: 3 }, 1, 1)).toBe("M1 1H3V4H1Z");
    expect(shapePathD({ k: "path", nodes: [{ x: 0, y: 0 }, { x: 4, y: 0, ox: 0, oy: 2 }, { x: 4, y: 4 }] })).toBe("M0 0L4 0C4 2 4 4 4 4Z");
  });
});

describe("นำเข้า SVG (Illustrator)", () => {
  it("ไม่ใช่ SVG / ไม่มีรูปปิด = null", () => {
    expect(parseSvgShapes("hello")).toBeNull();
    expect(parseSvgShapes(`<svg><line x1="0" y1="0" x2="10" y2="0"/></svg>`)).toBeNull();
  });
  it("หน่วย Illustrator 72 ต่อนิ้ว: สี่เหลี่ยม 850×992 pt = 30×35 ซม. · เลื่อนกลุ่มให้เริ่ม 0,0", () => {
    const imp = parseSvgShapes(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1100"><rect x="100" y="50" width="850.394" height="992.126"/><circle cx="1050" cy="150" r="85.04"/></svg>`)!;
    expect(imp.shapes).toHaveLength(2);
    const b = shapeBox(imp.shapes[0]);
    close(b.w, 30); close(b.h, 35); close(b.x, 0); close(b.y, 0);
    expect(imp.shapes[1].k).toBe("ellipse");
    close(shapeBox(imp.shapes[1]).w, 6);
  });
  it("ไฟล์ที่ระบุ width เป็น mm ใช้ขนาดตามไฟล์ · transform ของกลุ่ม · ข้าม defs/clipPath", () => {
    const imp = parseSvgShapes(`<svg width="200mm" height="100mm" viewBox="0 0 2000 1000"><defs><rect width="999" height="999"/></defs><g transform="translate(100 100)"><rect width="1000" height="500"/></g><clipPath><rect width="5" height="5"/></clipPath></svg>`)!;
    expect(imp.shapes).toHaveLength(1);
    expect(imp.unitNote).toContain("200mm");
    close(shapeBox(imp.shapes[0]).w, 10); close(shapeBox(imp.shapes[0]).h, 5);
  });
  it("path: เส้นตรง + โค้ง C + ปิดทับจุดแรก · หลายเส้น = หลายชิ้น · มุมมน rx", () => {
    const subs = parsePathData("M0 0 H100 V100 C100 150 0 150 0 100 Z M200 0 l50 0 l0 50 z");
    expect(subs).toHaveLength(2);
    expect(subs[0].length).toBe(4);   // 0,0 · 100,0 · 100,100 · 0,100 (เส้นปิดกลับจุดแรก = Z)
    expect(subs[1].length).toBe(3);
    const rr = parseSvgShapes(`<svg><rect width="72" height="72" rx="18"/></svg>`)!;
    const a = shapeArea(rr.shapes[0]);
    const side = 2.54, r = 0.635;
    close(a, side * side - (4 - Math.PI) * r * r, 0.02);
  });
  it("parseTransform: translate + scale + rotate", () => {
    expect(parseTransform("translate(10 20) scale(2)")).toEqual([2, 0, 0, 2, 10, 20]);
    const m = parseTransform("rotate(90)");
    close(m[0], 0); close(m[1], 1); close(m[2], -1);
  });
  it("arc (A) ครึ่งวงกลม → พื้นที่ใกล้ครึ่ง πr²", () => {
    const imp = parseSvgShapes(`<svg width="10cm" height="10cm" viewBox="0 0 10 10"><path d="M0 5 A5 5 0 0 1 10 5 Z"/></svg>`)!;
    close(shapeArea(imp.shapes[0]), (Math.PI * 25) / 2, 0.05);
  });
});

describe("ต่อกับตีราคา / แพทเทิร์น", () => {
  it("calcCostQty ใช้พื้นที่จริงแทน กว้าง×ยาว เมื่อส่ง area_cm2", async () => {
    const { calcCostQty } = await import("@/lib/design-sheets-meta");
    const base = { calc_method: "area_100", width_cm: 8, length_cm: 8, pieces: 2, face_width_cm: null, waste_percent: 0, divisor: 100 };
    expect(calcCostQty(base)).toBe(1.28);                       // 8×8×2 ÷ 100
    expect(calcCostQty({ ...base, area_cm2: 50.27 })).toBe(1.0054);   // วงกลม 50.27 × 2 ÷ 100
  });
  it("patternPieces: บรรทัดที่วาดรูปทรง = ชิ้นรูปทรงจริง (d + จุดรอบรูป) · DXF เป็นเส้นรอบรูป", async () => {
    const { patternPieces, shelfLayout, buildPatternDxf, buildPatternSvg } = await import("@/lib/pattern-sheet");
    const pieces = patternPieces([
      { calc_method: "area_face", item_name: "ผ้า", width_cm: 8, length_cm: 8, pieces: 1, shape: { v: 1, shape: { k: "ellipse", x: 0, y: 0, w: 8, h: 8 }, basis: "area" } },
      { calc_method: "area_face", item_name: "ผ้า", width_cm: 10, length_cm: 5, pieces: 1 },
    ]);
    expect(pieces[0].d).toContain("A4 4");
    expect(pieces[0].outline!.length).toBeGreaterThan(10);
    expect(pieces[1].d).toBeNull();
    const L = shelfLayout(pieces, 40);
    const dxf = buildPatternDxf(L);
    expect((dxf.match(/\nLINE\n/g) ?? []).length).toBe(pieces[0].outline!.length + 4);   // วงกลม = เส้นรอบรูป · สี่เหลี่ยม = 4 เส้น
    expect(buildPatternSvg(L)).toContain("<path transform=");
  });
});

/** เครื่องมือ 2D ที่เพิ่มในรอบ E: ขอบ · มุม · หลายเหลี่ยม · ดูดจุด · มุมเส้นตัด · พับสองทบ · แบบรอยบาก · รอยบากคู่ของตะเข็บ */
import { describe, expect, it } from "vitest";
import { bendEdge, chamferCorner, cornerAngle, edgeRadius, filletCorner, joinEdgeWithNext, moveEdge, notchStyleSegs, objectSnap, polygonInBox, polygonShape, splitEdgeAt, splitEdgeEven } from "@/lib/pattern-edit";
import { cleanFoldEdges, cleanLineShape, foldSecondLines, pieceGeometry, polyBox, shapeBox, type Pt, type Shape } from "@/lib/pattern-shape";
import { pieceEdges, checkSeam, type Seam } from "@/lib/pattern-seams";
import { checkPattern } from "@/lib/pattern-check";
import { cleanPieceInfo, projectPatternLines, projectPieceRows, type ProjectPiece } from "@/lib/pattern-project";
import { buildPatternDxf, patternPieces, shelfLayout } from "@/lib/pattern-sheet";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const lens = (s: Shape) => pieceEdges(s).map((e) => Math.round(e.len * 100) / 100);

describe("คำสั่งขอบ", () => {
  it("แบ่งขอบตามระยะ / เท่ากัน N ส่วน — ความยาวรวมเท่าเดิม", () => {
    const s = splitEdgeAt(R(0, 0, 26, 24), 0, 10)!;
    expect(lens(s)).toEqual([10, 16, 24, 26, 24]);
    expect(lens(splitEdgeEven(R(0, 0, 26, 24), 2, 4)!)).toEqual([26, 24, 6.5, 6.5, 6.5, 6.5, 24]);
    expect(splitEdgeAt(R(0, 0, 26, 24), 0, 0)).toBeNull();
    expect(splitEdgeAt(R(0, 0, 26, 24), 0, 26)).toBeNull();
  });
  it("แบ่งขอบโค้งตามระยะจริงบนเส้นโค้ง", () => {
    const arc = bendEdge(R(0, 0, 20, 10), 0, 3)!;
    const L = pieceEdges(arc)[0].len, s = splitEdgeAt(arc, 0, L / 2)!;
    const E = pieceEdges(s);
    expect(E[0].len).toBeCloseTo(L / 2, 1);
    expect(E[1].len).toBeCloseTo(L / 2, 1);
  });
  it("รวมกับขอบถัดไป = ลบจุดปลาย · เหลือน้อยกว่า 3 จุดไม่ได้", () => {
    expect(pieceEdges(joinEdgeWithNext(R(0, 0, 10, 10), 0)!)).toHaveLength(3);
    expect(joinEdgeWithNext(polygonShape(0, 0, 5, 3), 0)).toBeNull();
  });
  it("เลื่อนขอบ: สี่เหลี่ยมยังเป็นสี่เหลี่ยม · ขอบบนออก 2 = สูงขึ้น 2 · หดจนพัง = ไม่ทำ", () => {
    expect(moveEdge(R(0, 0, 26, 24), 0, 2)).toEqual({ k: "rect", x: 0, y: -2, w: 26, h: 26 });
    expect(moveEdge(R(0, 0, 26, 24), 1, -6)).toEqual({ k: "rect", x: 0, y: 0, w: 20, h: 24 });
    expect(moveEdge(R(0, 0, 10, 10), 2, -12)).toBeNull();
    const tri = polygonShape(0, 0, 10, 3), before = shapeBox(tri).h, moved = moveEdge(tri, 1, 2)!;   // ขอบล่างของสามเหลี่ยม
    expect(shapeBox(moved).h).toBeCloseTo(before + 2, 1);
  });
  it("ดัดขอบตรงเป็นโค้ง: โก่งออกตามระยะ · รัศมีตรงสูตร · 0 = กลับเป็นเส้นตรง", () => {
    const s = bendEdge(R(0, 0, 20, 10), 0, 2)!;   // ขอบบน โก่งขึ้น 2 ซม.
    expect(shapeBox(s).y).toBeCloseTo(-2, 1);
    const r = edgeRadius(pieceEdges(s)[0].pts)!;
    expect(r).toBeCloseTo((100 + 4) / 4, 0);   // R = (c²/4 + h²) / 2h = (100 + 4) / 4 = 26
    const flat = bendEdge(s, 0, 0)!;
    expect(shapeBox(flat).y).toBeCloseTo(0, 5);
    expect(edgeRadius(pieceEdges(flat)[0].pts)).toBeNull();
    expect(bendEdge(R(0, 0, 20, 10), 0, 11)).toBeNull();   // เกินครึ่งวงกลม
  });
});

describe("คำสั่งมุม (จุด)", () => {
  it("มุมภายใน: สี่เหลี่ยม 90° · สามเหลี่ยมด้านเท่า 60° · จุดเว้า > 180°", () => {
    expect(cornerAngle(R(0, 0, 10, 10), 1)).toBe(90);
    expect(cornerAngle(polygonShape(0, 0, 10, 3), 0)).toBeCloseTo(60, 0);
    const L: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }] };
    expect(cornerAngle(L, 3)).toBe(270);
  });
  it("มุมโค้ง/ตัดมุม เฉพาะจุดเดียว — มุมอื่นไม่เปลี่ยน", () => {
    const f = filletCorner(R(0, 0, 20, 10), 1, 2)!;
    expect(pieceEdges(f)).toHaveLength(5);
    expect(cornerAngle(f, 0)).toBe(90);
    const c = chamferCorner(R(0, 0, 20, 10), 2, 1)!;
    expect(lens(c)).toEqual([20, 9, 1.41, 19, 10]);
    expect(filletCorner(f, 1, 1)).toBeNull();   // จุดที่โค้งอยู่แล้ว
  });
});

describe("วาด + ดูดจุด", () => {
  it("หลายเหลี่ยม N ด้าน · พอดีกรอบที่ลาก", () => {
    expect(pieceEdges(polygonShape(0, 0, 10, 6))).toHaveLength(6);
    const b = shapeBox(polygonInBox(2, 3, 20, 10, 5));
    expect([b.x, b.y, b.w, b.h].map((v) => Math.round(v * 100) / 100)).toEqual([2, 3, 20, 10]);
  });
  it("ดูดเข้าจุดยอด / กึ่งกลางขอบ ในระยะที่กำหนด", () => {
    expect(objectSnap([R(0, 0, 10, 10)], [10.2, 0.1], 0.5)).toEqual({ at: [10, 0], kind: "end" });
    expect(objectSnap([R(0, 0, 10, 10)], [5.1, -0.2], 0.5)).toEqual({ at: [5, 0], kind: "mid" });
    expect(objectSnap([R(0, 0, 10, 10)], [3, 3], 0.5)).toBeNull();
  });
});

describe("มุมเส้นตัด · พับสองทบ · แบบรอยบาก (ใบพิมพ์ + DXF)", () => {
  it("มุมตัด/มุมมน = พื้นที่ตัดน้อยกว่ามุมแหลม · กรอบเท่าเดิม", () => {
    const g = (corner?: "miter" | "bevel" | "round") => pieceGeometry({ shape: R(0, 0, 20, 10), allow: 1, corner });
    const m = g("miter"), b = g("bevel"), r = g("round");
    expect(polyBox(m.cut)).toEqual({ x: -1, y: -1, w: 22, h: 12 });
    expect(b.cutArea).toBeLessThan(m.cutArea); expect(r.cutArea).toBeLessThan(m.cutArea); expect(r.cutArea).toBeGreaterThan(b.cutArea);
    expect(b.cutArea).toBeCloseTo(22 * 12 - 4 * 0.5, 3);
    expect(r.cutArea).toBeCloseTo(20 * 10 + 2 * 20 + 2 * 10 + Math.PI, 1);
    expect(pieceGeometry({ shape: R(0, 0, 20, 10), allow: 1, info: { corner: "bevel" } }).cutArea).toBeCloseTo(b.cutArea, 6);
  });
  it("พับสองทบ: เก็บค่า 2 · เส้นพับที่สองอยู่นอกเส้นเย็บครึ่งเผื่อ", () => {
    expect(cleanFoldEdges(R(0, 0, 10, 5), [2, 0, 1, 0])).toEqual([2, 0, 1, 0]);
    const L = foldSecondLines(R(0, 0, 10, 5), [2, 0, 0, 0], [3, 1, 1, 1]);
    expect(L).toHaveLength(1);
    expect(L[0].every((p) => Math.abs(p[1] - -1.5) < 1e-6)).toBe(true);
  });
  it("แบบรอยบาก: คู่ = 2 เส้นขนาน · V = 2 เส้นชนที่ปลาย", () => {
    const seg: [Pt, Pt] = [[0, 0], [0, 1]];
    expect(notchStyleSegs(seg, "single")).toEqual([seg]);
    const d = notchStyleSegs(seg, "double", 0.3); expect(d).toHaveLength(2); expect(d[0][0][0]).toBeCloseTo(-0.15); expect(d[1][0][0]).toBeCloseTo(0.15);
    const v = notchStyleSegs(seg, "v"); expect(v[0][1]).toEqual([0, 1]); expect(v[1][1]).toEqual([0, 1]);
  });
  it("ข้อมูลชิ้น → บรรทัดพิมพ์: มุมเส้นตัด / แบบรอยบาก / ทางผ้าทางเดียว / เส้นวัด ไปถึงใบพิมพ์และ DXF", () => {
    const info = cleanPieceInfo({ corner: "round", notch: "double", nap: true, face: "down", pair: true, junk: 1 });
    expect(info).toEqual({ corner: "round", notch: "double", nap: true, face: "down", pair: true });
    const p: ProjectPiece = { pid: "a", name: "ตัวหน้า", count: 1, allow: 1, shape: R(0, 0, 20, 10), holes: [], grain: [[10, 2], [10, 8]], notches: [[10, 0]], at: [0, 0], info: info!,
      inner: [{ id: "d1", kind: "dim", pts: [[2, 5], [18, 5]] }] };
    const line = projectPatternLines([p])[0];
    const ls = cleanLineShape(line.shape)!;
    expect(ls.corner).toBe("round"); expect(ls.notchStyle).toBe("double"); expect(ls.nap).toBe(true);
    const [pp] = patternPieces([line]);
    expect(pp.notchSegs).toHaveLength(2);           // รอยบากคู่ = 2 เส้น
    expect(pp.grainSegs).toHaveLength(3);           // ทางเดียว = ก้าน + หัว 2 ขีด
    expect(pp.dims?.[0].label).toBe("16 cm");
    expect(pp.innerSegs ?? []).toHaveLength(0);     // เส้นวัดไม่อยู่ชั้น INNER
    expect(projectPieceRows([p])[0].cut).toBe("วางคว่ำหน้า · ตัดคู่ซ้าย-ขวา · ทางผ้าทางเดียว");
    const dxf = buildPatternDxf(shelfLayout([pp], 100));
    expect(dxf).toContain("DIM"); expect(dxf).toContain("16 cm");   // เส้นวัดออก DXF ชั้น DIM พร้อมตัวเลข
    const fold2 = patternPieces(projectPatternLines([{ ...p, foldEdges: [2, 0, 0, 0] }]))[0];
    expect(fold2.foldSegs).toHaveLength(2);          // พับสองทบ = เส้นพับ 2 เส้น
  });
});

describe("เดินตะเข็บ: รอยบากคู่", () => {
  const A = { pid: "a", name: "A", shape: R(0, 0, 20, 10), mats: [{ id: "m" }] }, B = { pid: "b", name: "B", shape: R(0, 20, 20, 5), mats: [{ id: "m" }] };
  const seam: Seam = { id: "s", a: { pid: "a", from: 2, count: 1, n: 4 }, b: { pid: "b", from: 0, count: 1, n: 4 }, rev: true };
  it("ตำแหน่งตรงกัน (ด้านกลับทิศนับจากปลาย) = ไม่เตือน", () => {
    expect(checkSeam({ a: A.shape, b: B.shape }, seam).status).toBe("ok");
    const list = checkPattern([{ ...A, notches: [[5, 10]] }, { ...B, notches: [[5, 20]] }], [seam]);
    expect(list.some((x) => x.code === "notch-mismatch")).toBe(false);
  });
  it("จำนวนไม่เท่า / ตำแหน่งคลาด = เตือน", () => {
    expect(checkPattern([{ ...A, notches: [[5, 10]] }, B], [seam]).find((x) => x.code === "notch-mismatch")?.data.nb).toBe(0);
    const off = checkPattern([{ ...A, notches: [[5, 10]] }, { ...B, notches: [[6, 20]] }], [seam]).find((x) => x.code === "notch-mismatch");
    expect(off?.data.d).toBeCloseTo(1, 3);
  });
});

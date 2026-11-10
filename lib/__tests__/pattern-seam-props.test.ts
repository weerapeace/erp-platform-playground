import { describe, expect, it } from "vitest";
import { cleanEdgeMeta, cleanSeams, cleanSeamTop, pieceEdges, pointAlong, setEdgeLength } from "@/lib/pattern-seams";
import { cleanProjectPieces } from "@/lib/pattern-project";
import type { Shape } from "@/lib/pattern-shape";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
const side = (pid: string, from: number) => ({ pid, from, count: 1, n: 4 });

describe("ค่ารายตะเข็บ (ชื่อ · วิธีเย็บ · เดินด้ายทับ)", () => {
  it("cleanSeams เก็บค่าที่ถูกรูปแบบ · ทิ้งค่าแปลก โดยตะเข็บยังอยู่", () => {
    const out = cleanSeams([
      { id: "s1", a: side("a", 0), b: side("b", 2), name: "  ข้าง–ก้น ด้านหน้า  ", kind: "lapped", top: { off: 2.04, rows: 2, spi: 8 }, rev: true },
      { id: "s2", a: side("a", 1), b: side("b", 3), name: "", kind: "glued", top: { off: 99, rows: 1, spi: 8 } },
      { id: "s3", a: side("a", 2), b: side("b", 0), top: { off: 3, rows: 7, spi: 10 } },
    ], new Set(["a", "b"]));
    expect(out[0]).toEqual({ id: "s1", a: side("a", 0), b: side("b", 2), rev: true, name: "ข้าง–ก้น ด้านหน้า", kind: "lapped", top: { off: 2, rows: 2, spi: 8 } });
    expect(out[1]).toEqual({ id: "s2", a: side("a", 1), b: side("b", 3) });
    expect(out[2].top).toEqual({ off: 3, rows: 1, spi: 10 });
  });
  it("cleanSeamTop: ขอบเขต ห่าง 0.5–30 มม. · ฝีเข็ม 2–20 ต่อนิ้ว", () => {
    expect(cleanSeamTop({ off: 0.5, rows: 1, spi: 2 })).toEqual({ off: 0.5, rows: 1, spi: 2 });
    for (const bad of [null, 5, { off: 0.2, spi: 8 }, { off: 2, spi: 25 }, { off: "2", spi: 8 }, { off: 2 }]) expect(cleanSeamTop(bad)).toBeNull();
  });
});

describe("ค่ารายขอบ (กุ้น · เดินด้ายทับ)", () => {
  it("cleanEdgeMeta: ต้องครบทุกขอบ และมีอย่างน้อย 1 ขอบที่ตั้งค่า", () => {
    expect(cleanEdgeMeta(R(10, 5), [{ bind: true }, {}, { top: 3.04 }, null])).toEqual([{ bind: true }, {}, { top: 3 }, {}]);
    expect(cleanEdgeMeta(R(10, 5), [{ bind: true }])).toBeNull();
    expect(cleanEdgeMeta(R(10, 5), [{}, {}, {}, {}])).toBeNull();
    expect(cleanEdgeMeta(R(10, 5), [{ top: 99 }, { bind: "yes" }, {}, {}])).toBeNull();
    expect(cleanEdgeMeta(R(10, 5), "x")).toBeNull();
  });
  it("แพทเทิร์นในแอป: เก็บค่ารายขอบ · จำนวนไม่ตรง = ไม่เก็บ", () => {
    const [p] = cleanProjectPieces([{ pid: "a", allow: 1, shape: R(10, 5), edgeMeta: [{ top: 3 }, {}, {}, { bind: true }] }]);
    expect(p.edgeMeta).toEqual([{ top: 3 }, {}, {}, { bind: true }]);
    expect(cleanProjectPieces([{ pid: "b", shape: R(10, 5), edgeMeta: [{ top: 3 }] }])[0].edgeMeta).toBeUndefined();
  });
});

describe("แก้ขอบด้วยตัวเลข", () => {
  it("setEdgeLength สี่เหลี่ยม: ขอบบน/ล่าง = กว้าง · ขอบข้าง = สูง", () => {
    expect(setEdgeLength(R(10, 5), 0, 12)).toMatchObject({ w: 12, h: 5 });
    expect(setEdgeLength(R(10, 5), 2, 8)).toMatchObject({ w: 8, h: 5 });
    expect(setEdgeLength(R(10, 5), 3, 7.5)).toMatchObject({ w: 10, h: 7.5 });
    expect(setEdgeLength(R(10, 5), 0, 0)).toBeNull();
  });
  it("รูปจากจุด: ขอบตรง = เลื่อนจุดปลายตามแนวเดิม ได้ความยาวตามสั่ง · ขอบโค้ง/วงรี แก้ด้วยเลขไม่ได้", () => {
    const tri: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 6, y: 8 }, { x: 0, y: 8 }] };
    const out = setEdgeLength(tri, 0, 20)!;
    expect(pieceEdges(out)[0].len).toBeCloseTo(20, 3);
    expect(out.k === "path" && out.nodes[1]).toMatchObject({ x: 12, y: 16 });
    expect(out.k === "path" && out.nodes[2]).toMatchObject({ x: 0, y: 8 });          // จุดอื่นไม่ขยับ
    const last = setEdgeLength(tri, 2, 4)!;                                           // ขอบสุดท้าย: จุดปลาย = จุดแรก
    expect(last.k === "path" && last.nodes[0]).toMatchObject({ x: 0, y: 4 });
    const curved: Shape = { k: "path", nodes: [{ x: 0, y: 0, ox: 3 }, { x: 10, y: 0 }, { x: 5, y: 8 }] };
    expect(setEdgeLength(curved, 0, 12)).toBeNull();
    expect(setEdgeLength({ k: "ellipse", x: 0, y: 0, w: 10, h: 10 }, 0, 40)).toBeNull();
  });
  it("pointAlong: จุดตามระยะบนเส้น (ข้ามมุมได้) · เกินความยาว = ไม่มี", () => {
    const P: [number, number][] = [[0, 0], [10, 0], [10, 5]];
    expect(pointAlong(P, 4)).toEqual([4, 0]);
    expect(pointAlong(P, 12)).toEqual([10, 2]);
    expect(pointAlong(P, 15)).toEqual([10, 5]);
    expect(pointAlong(P, 15.5)).toBeNull();
    expect(pointAlong(P, -1)).toBeNull();
  });
});

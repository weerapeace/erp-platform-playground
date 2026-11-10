import { describe, expect, it } from "vitest";
import {
  cleanLineShape, edgeAllowances, flattenShape, flattenWithEdges, notchSegments, offsetPolygon, offsetPolygonBy, pieceGeometry, refitLineShape, shapeEdgeCount,
  type Pt, type Shape,
} from "@/lib/pattern-shape";
import { patternPieces } from "@/lib/pattern-sheet";
import { cleanProjectPieces, projectPatternLines, projectSummary } from "@/lib/pattern-project";

const close = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);
const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
const area = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

describe("เผื่อเย็บรายขอบ (allowEdges)", () => {
  it("สี่เหลี่ยม 10×10: ขอบบนเผื่อ 3 ขอบอื่น 1 → ขนาดตัด 12 × 14 · เส้นเย็บไม่เปลี่ยน", () => {
    const g = pieceGeometry({ shape: R(10, 10), allow: 1, allowEdges: [3, 1, 1, 1] });
    close(g.cutBox.w, 12); close(g.cutBox.h, 14);
    close(g.cutBox.y, -3);                                  // ขอบบน (y น้อย) ยื่นขึ้น 3
    close(g.finished.w, 10); close(g.finished.h, 10);
    close(g.cutArea, 12 * 14);
    expect(g.segAllow).toEqual([3, 1, 1, 1]);
  });
  it("ขอบหนึ่งเผื่อ 0 ที่เหลือ 1 → ขอบนั้นไม่ยื่น", () => {
    const g = pieceGeometry({ shape: R(10, 10), allow: 1, allowEdges: [0, 1, 1, 1] });
    close(g.cutBox.y, 0); close(g.cutBox.h, 11); close(g.cutBox.w, 12);
  });
  it("ใช้ไม่ได้ = กลับไปค่าเดียวทั้งชิ้น: จำนวนไม่ครบ · เท่ากับค่ารวมทุกขอบ · ไม่ใช่รายการ", () => {
    expect(edgeAllowances(R(10, 10), [3, 1, 1], 1)).toBeNull();
    expect(edgeAllowances(R(10, 10), [1, 1, 1, 1], 1)).toBeNull();
    expect(edgeAllowances(R(10, 10), "x", 1)).toBeNull();
    const g = pieceGeometry({ shape: R(10, 10), allow: 1, allowEdges: [3, 1, 1] });
    expect(g.segAllow).toBeNull();
    close(g.cutBox.h, 12);
    expect(edgeAllowances(R(10, 10), [99, -5, 1, 1], 1)).toEqual([20, 0, 1, 1]);   // ค่าเกิน/ติดลบถูกปรับ
  });
  it("ทุกขอบเท่ากัน ผลตรงกับตัวขยายแบบค่าเดียว", () => {
    const P = flattenShape(R(20, 8));
    close(area(offsetPolygonBy(P, [2, 2, 2, 2])), area(offsetPolygon(P, 2)), 1e-9);
  });
  it("รูปจากจุดที่มีโค้ง: ทุกช่วงของโค้งใช้ค่าของขอบเดียวกัน · จำนวนขอบ = จำนวนจุด", () => {
    const s: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 20, y: 0, oy: 6 }, { x: 20, y: 20, iy: -6 }, { x: 0, y: 20 }] };
    expect(shapeEdgeCount(s)).toBe(4);
    const fe = flattenWithEdges(s);
    expect(fe.pts).toEqual(flattenShape(s));
    expect(new Set(fe.edge)).toEqual(new Set([0, 1, 2, 3]));
    expect(fe.edge.filter((e) => e === 1).length).toBeGreaterThan(10);
    const g = pieceGeometry({ shape: s, allow: 1, allowEdges: [4, 1, 1, 1] });
    close(g.cutBox.y, -4, 0.02);
    close(g.cutBox.h, 20 + 4 + 1, 0.05);
  });
  it("รอยบากเริ่มจากเส้นตัดของขอบนั้น", () => {
    const g = pieceGeometry({ shape: R(10, 10), allow: 1, allowEdges: [3, 1, 1, 1] });
    const [top] = notchSegments(g.sew, [[5, 0]], 1, 0.5, g.segAllow), [bottom] = notchSegments(g.sew, [[5, 10]], 1, 0.5, g.segAllow);
    close(top[0][1], -3); close(top[1][1], -2.5);
    close(bottom[0][1], 11); close(bottom[1][1], 10.5);
  });
  it("cleanLineShape: เก็บรายขอบที่ครบ · ทิ้งที่จำนวนไม่ตรง", () => {
    expect(cleanLineShape({ v: 1, shape: R(10, 10), basis: "box", allow: 1, allowEdges: [3, 1, 1, 1] })?.allowEdges).toEqual([3, 1, 1, 1]);
    expect(cleanLineShape({ v: 1, shape: R(10, 10), basis: "box", allow: 1, allowEdges: [3, 1] })?.allowEdges).toBeUndefined();
    expect(cleanLineShape({ v: 1, shape: R(10, 10), basis: "box", allow: 1 })?.allowEdges).toBeUndefined();
  });
  it("พิมพ์ขนาดตัดในตาราง → ขนาดสำเร็จหักส่วนเผื่อจริงของแต่ละด้าน", () => {
    const ls = cleanLineShape({ v: 1, shape: R(10, 10), basis: "box", allow: 1, allowEdges: [3, 1, 1, 1] })!;
    const out = refitLineShape(ls, 22, 24)!;                 // ตัด 22 × 24 → สำเร็จ 20 × 20 (ซ้ายขวา 1+1 · บนล่าง 3+1)
    const g = pieceGeometry(out);
    close(g.finished.w, 20); close(g.finished.h, 20);
    close(g.cutBox.w, 22); close(g.cutBox.h, 24);
    expect(out.allowEdges).toEqual([3, 1, 1, 1]);
  });
  it("หน้าพิมพ์/ไฟล์ตัด: ชิ้นที่เผื่อเฉพาะบางขอบ (ค่ารวม 0) ยังมีเส้นตัดแยกจากเส้นเย็บ", () => {
    const [p] = patternPieces([{ item_name: "หนัง", pieces: 1, shape: { v: 1, shape: R(10, 10), basis: "box", allowEdges: [2, 0, 0, 0] } }]);
    expect(p.h).toBe(12); expect(p.w).toBe(10);
    expect(p.sewD).toBeTruthy();
    expect(p.sewOutline).toHaveLength(4);
  });
  it("แพทเทิร์นในแอป: เก็บรายขอบ · สรุปพื้นที่และบรรทัดส่งพิมพ์ใช้รายขอบ", () => {
    const [piece] = cleanProjectPieces([{ pid: "a", name: "ตัวหน้า", count: 2, allow: 1, allowEdges: [3, 1, 1, 1], shape: R(10, 10), holes: [], notches: [], at: [0, 0] }]);
    expect(piece.allowEdges).toEqual([3, 1, 1, 1]);
    close(projectSummary([piece]).areaCm2, 12 * 14 * 2);
    const [line] = projectPatternLines([piece]);
    const [pp] = patternPieces([line]);
    expect([pp.w, pp.h, pp.count, pp.name]).toEqual([12, 14, 2, "ตัวหน้า"]);
    expect(cleanProjectPieces([{ pid: "b", allow: 1, allowEdges: [3], shape: R(5, 5) }])[0].allowEdges).toBeUndefined();
  });
});

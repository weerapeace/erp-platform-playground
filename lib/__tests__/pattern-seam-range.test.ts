import { describe, expect, it } from "vitest";
import { checkSeam, cleanSeams, edgeBusy, isPartialSeam, posOnLine, rangeFree, rangedSide, sideLength, sidePoints, sideRange, subLine, type Seam } from "@/lib/pattern-seams";
import { assemble } from "@/lib/pattern-assembly";
import { projectSeamRows } from "@/lib/pattern-project";
import type { Pt, Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const body = R(0, 0, 38, 12), strap = R(0, 20, 30, 4);

describe("เย็บบางช่วงของขอบ (t0/t1)", () => {
  it("subLine ตัดช่วงของเส้น รวมจุดหักที่อยู่ในช่วง", () => {
    const P: Pt[] = [[0, 0], [10, 0], [10, 10]];
    expect(subLine(P, 2, 6)).toEqual([[2, 0], [6, 0]]);
    expect(subLine(P, 8, 14)).toEqual([[8, 0], [10, 0], [10, 4]]);
    expect(subLine(P, 10, 12)).toEqual([[10, 0], [10, 2]]);
  });
  it("sidePoints / sideLength ใช้เฉพาะช่วงที่เย็บ · ด้านเต็มขอบเหมือนเดิม", () => {
    expect(sidePoints(body, { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 })).toEqual([[9, 0], [13, 0]]);
    expect(sideLength(body, { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 })).toBeCloseTo(4);
    expect(sideLength(body, { pid: "a", from: 0, count: 1, n: 4 })).toBeCloseTo(38);
  });
  it("ชิ้นถูกย่อจนขอบสั้นกว่าช่วง → ตัดช่วงให้อยู่บนขอบ · ไม่เหลือช่วง = ต้องเย็บใหม่", () => {
    const side = { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 };
    expect(sideRange(R(0, 0, 11, 12), side)).toEqual({ t0: 9, t1: 11, full: 11 });
    expect(sidePoints(R(0, 0, 8, 12), side)).toBeNull();
    const seam: Seam = { id: "s", a: side, b: { pid: "b", from: 3, count: 1, n: 4 } };
    expect(checkSeam({ a: R(0, 0, 8, 12), b: strap }, seam).status).toBe("broken");
    expect(checkSeam({ a: body, b: strap }, seam)).toMatchObject({ status: "ok", la: 4, lb: 4 });
  });
  it("rangedSide: คลุมทั้งขอบ = ด้านเต็มขอบ (ไม่มี t0/t1)", () => {
    expect(rangedSide("a", 0, 4, 0, 38, 38)).toEqual({ pid: "a", from: 0, count: 1, n: 4 });
    expect(rangedSide("a", 0, 4, 9.004, 13, 38)).toEqual({ pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 });
  });
  it("posOnLine บอกระยะตามเส้นของจุดที่ใกล้ที่สุด", () => {
    expect(posOnLine([[0, 0], [10, 0], [10, 10]], [4, 3])).toEqual({ pos: 4, d: 3 });
    expect(posOnLine([[0, 0], [10, 0], [10, 10]], [12, 6]).pos).toBeCloseTo(16);
  });
  it("ขอบเดียวมีได้หลายตะเข็บ ห้ามทับกัน (ชนปลายกันได้)", () => {
    const seams: Seam[] = [
      { id: "s1", a: { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 }, b: { pid: "b", from: 3, count: 1, n: 4 } },
      { id: "s2", a: { pid: "a", from: 0, count: 1, n: 4, t0: 25, t1: 29 }, b: { pid: "b", from: 1, count: 1, n: 4 } },
    ];
    const busy = edgeBusy(seams, "a", 0, 4, 38);
    expect(busy).toEqual([[9, 13], [25, 29]]);
    expect(rangeFree(busy, 13, 25)).toBe(true);
    expect(rangeFree(busy, 12, 20)).toBe(false);
    expect(rangeFree(edgeBusy(seams, "a", 0, 4, 38, { id: "s1", which: "a" }), 10, 14)).toBe(true);   // กำลังย้ายตัวเอง ไม่นับช่วงเดิมของตัวเอง
    expect(edgeBusy(seams, "b", 3, 4, 4)).toEqual([[0, 4]]);                                           // ด้านเต็มขอบ = ทั้งขอบ
  });
  it("cleanSeams เก็บช่วงและค่าตั้งใจให้ย่น · ช่วงผิดรูปแบบ = ถือเป็นเต็มขอบ", () => {
    const pids = new Set(["a", "b"]);
    const out = cleanSeams([
      { id: "s1", a: { pid: "a", from: 0, count: 1, n: 4, t0: 9.001, t1: 13 }, b: { pid: "b", from: 3, count: 1, n: 4 }, ease: true },
      { id: "s2", a: { pid: "a", from: 2, count: 1, n: 4, t0: 5, t1: 5 }, b: { pid: "b", from: 1, count: 1, n: 4, t0: -1, t1: 3 } },
    ], pids);
    expect(out[0]).toEqual({ id: "s1", a: { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 }, b: { pid: "b", from: 3, count: 1, n: 4 }, ease: true });
    expect(out[1]).toEqual({ id: "s2", a: { pid: "a", from: 2, count: 1, n: 4 }, b: { pid: "b", from: 1, count: 1, n: 4 } });
    expect(out.map(isPartialSeam)).toEqual([true, false]);
  });
  it("ตะเข็บบางช่วงไม่ถูกใช้หาทรงกระเป๋า (ประกอบตามกติกาใช้เฉพาะตะเข็บเต็มขอบ)", () => {
    const pieces = [{ pid: "a", name: "ตัวหน้า", count: 1, shape: body, holes: [] }, { pid: "b", name: "สาย", count: 1, shape: strap, holes: [] }];
    const A = assemble(pieces, [{ id: "s1", a: { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 13 }, b: { pid: "b", from: 3, count: 1, n: 4 } }]);
    expect(A).toMatchObject({ ok: false, reason: "no-seams" });
  });
  it("ตารางตะเข็บของใบพิมพ์บอกช่วง และบอกว่าตั้งใจให้ย่น", () => {
    const mk = (pid: string, name: string, shape: Shape) => ({ pid, name, count: 1, allow: 0, shape, holes: [], grain: null, notches: [], at: [0, 0] as [number, number] });
    const rows = projectSeamRows([mk("a", "ตัวหน้า", body), mk("b", "สาย", strap)], [{ id: "s1", a: { pid: "a", from: 0, count: 1, n: 4, t0: 9, t1: 14 }, b: { pid: "b", from: 3, count: 1, n: 4 }, ease: true }]);
    expect(rows[0]).toMatchObject({ a: "ตัวหน้า · ขอบ 1 ช่วง 9.0–14.0 ซม.", b: "สาย · ขอบ 4", la: 5, lb: 4, status: "mismatch", ease: true });
  });
});

import { describe, expect, it } from "vitest";
import { followerSeams, linkedShape, type LinkSeamPiece } from "@/lib/pattern-link";
import { checkSeam, type Seam } from "@/lib/pattern-seams";
import type { Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
// ตัวหน้า 30×20 (สมมาตรซ้ายขวา) · ชิ้นข้างซ้าย 8×20 เย็บขอบขวา (ขอบ 2) กับขอบซ้ายของตัวหน้า (ขอบ 4)
const front: LinkSeamPiece = { pid: "front", shape: R(20, 0, 30, 20) };
const sideL: LinkSeamPiece = { pid: "sideL", shape: R(0, 0, 8, 20) };
const twinOf = (m: LinkSeamPiece, pid: string, x: number, y = 0): LinkSeamPiece => ({ pid, shape: linkedShape(m.shape, { to: m.pid, mirror: "x" }, { x, y }), link: { to: m.pid, mirror: "x" } });
const sideR = twinOf(sideL, "sideR", 60);
const whole = (pid: string, from: number) => ({ pid, from, count: 1, n: 4 });
const sLeft: Seam = { id: "s1", a: whole("sideL", 1), b: whole("front", 3), kind: "turned" };
const shapes = (ps: LinkSeamPiece[]) => Object.fromEntries(ps.map((p) => [p.pid, p.shape]));

describe("ตะเข็บตามชิ้นคู่ (followerSeams)", () => {
  it("ชิ้นคู่กลับซ้ายขวา: ขอบของชิ้นคู่กลับฝั่ง และไปเย็บกับขอบฝั่งตรงข้ามของตัวหน้า", () => {
    const ps = [front, sideL, sideR], { add, skipped } = followerSeams(ps, [sLeft], "sideR", "t");
    expect(skipped).toBe(0);
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ a: whole("sideR", 3), b: whole("front", 1), kind: "turned" });   // ขอบซ้ายของชิ้นคู่ กับขอบขวาของตัวหน้า
    expect(checkSeam(shapes(ps), add[0]).status).toBe("ok");
  });
  it("ตะเข็บบางช่วง: ช่วงบนขอบปากถูกสะท้อนไปอีกฝั่ง (9–13 ของ 30 → 17–21)", () => {
    const strap: LinkSeamPiece = { pid: "strap", shape: R(0, 30, 4, 12) }, strap2 = twinOf(strap, "strap2", 10, 30);
    const s: Seam = { id: "s2", a: { pid: "front", from: 0, count: 1, n: 4, t0: 9, t1: 13 }, b: whole("strap", 0) };
    const { add } = followerSeams([front, strap, strap2], [s], "strap2", "t");
    expect(add[0].a).toEqual({ pid: "front", from: 0, count: 1, n: 4, t0: 17, t1: 21 });
    expect(add[0].b).toEqual(whole("strap2", 0));
  });
  it("มีตะเข็บนั้นอยู่แล้ว = ไม่สร้างซ้ำ · ขอบฝั่งตรงข้ามเย็บไปแล้ว = ข้าม", () => {
    const first = followerSeams([front, sideL, sideR], [sLeft], "sideR", "t").add;
    expect(followerSeams([front, sideL, sideR], [sLeft, ...first], "sideR", "u")).toEqual({ add: [], skipped: 0 });
    const taken: Seam = { id: "x", a: whole("front", 1), b: whole("other", 3) };
    expect(followerSeams([front, sideL, sideR, { pid: "other", shape: R(80, 0, 8, 20) }], [sLeft, taken], "sideR", "t")).toEqual({ add: [], skipped: 1 });
  });
  it("ชิ้นที่เย็บด้วยไม่สมมาตรซ้ายขวา = หาขอบคู่ไม่เจอ ข้าม (ไม่เดา)", () => {
    const skew: LinkSeamPiece = { pid: "front", shape: { k: "path", nodes: [{ x: 20, y: 0 }, { x: 50, y: 0 }, { x: 56, y: 20 }, { x: 20, y: 20 }] } };
    expect(followerSeams([skew, sideL, sideR], [sLeft], "sideR", "t")).toEqual({ add: [], skipped: 1 });
  });
  it("ชุดซับใน (ไม่กลับด้าน): ตะเข็บของตัวนอก → ตะเข็บระหว่างชิ้นซับในคู่กัน · ชิ้นอื่นไม่มีชิ้นตาม = ข้าม", () => {
    const lin = (m: LinkSeamPiece, pid: string): LinkSeamPiece => ({ pid, shape: linkedShape(m.shape, { to: m.pid }, { x: (m.shape as { x: number }).x, y: 40 }), link: { to: m.pid } });
    const fL = lin(front, "fL"), sL = lin(sideL, "sL");
    const { add, skipped } = followerSeams([front, sideL, fL, sL], [sLeft], "sL", "t");
    expect(skipped).toBe(0);
    expect(add[0]).toMatchObject({ a: whole("sL", 1), b: whole("fL", 3) });
    expect(followerSeams([front, sideL, sL], [sLeft], "sL", "t")).toEqual({ add: [], skipped: 1 });
  });
  it("ชุด 1 ขอบกับหลายชิ้น: ตะเข็บที่คัดลอกยังอยู่ชุดเดียวกัน (รหัสชุดใหม่)", () => {
    const g1: Seam = { ...sLeft, id: "g1", group: "gA" };
    const { add } = followerSeams([front, sideL, sideR], [g1], "sideR", "t");
    expect(add[0].group).toBe("gAmt");
  });
  it("ไม่ใช่ชิ้นตาม = ไม่ทำอะไร", () => {
    expect(followerSeams([front, sideL], [sLeft], "sideL", "t")).toEqual({ add: [], skipped: 0 });
  });
});

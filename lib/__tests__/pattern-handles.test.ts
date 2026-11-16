/** Bag CAD รอบ J2: หูหิ้วม้วน + ห่วงยึด */
import { describe, expect, it } from "vitest";
import { cordLength, handleDims, pairHandlePieces, pairSpots, rolledDiameter, rollSection, spotCenters } from "@/lib/pattern-handles";
import { cleanAttaches } from "@/lib/pattern-assembly";
import type { Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });

describe("หูม้วน", () => {
  it("โตของหูม้วน: ไม่มีเชือก = กว้าง ÷ π · มีเชือก 10 มม. = 1.15 ซม.", () => {
    expect(rolledDiameter(3.5)).toBeCloseTo(1.11, 2); expect(rolledDiameter(3.5, 10)).toBe(1.15);
    expect(rollSection(3.5, 10, 4)).toMatchObject({ dia: 1.15, cord: 1, wrap: 3.6, tail: 4 });
  });
  it("ขนาดหูจากชิ้น: ยาวโผล่ = ยาวชิ้น − ปลาย 2 ข้าง · กว้าง = ด้านสั้น", () => {
    expect(handleDims(R(0, 0, 55.7, 3.5))).toEqual({ len: 47.7, w: 3.5 });
  });
  it("ไส้เชือกต่อใบ = รวมยาวหูม้วนที่ใส่เชือก (หูแบน / ไม่ใส่เชือก ไม่นับ)", () => {
    expect(cordLength([{ len: 40, style: "mix", cord: 10 }, { len: 40, style: "roll", cord: 8 }, { len: 40, style: "flat", cord: 10 }, { len: 30, style: "mix" }])).toBe(80);
  });
});

describe("จุดติดหู", () => {
  const body = { shape: R(10, 20, 40, 30), inner: [
    { id: "a", kind: "mark" as const, name: "จุดติดหู", pts: [[18, 20], [18, 23], [20, 23], [20, 20]] as [number, number][] },
    { id: "b", kind: "mark" as const, name: "จุดติดหู", pts: [[40, 20.5], [40, 23], [42, 23], [42, 20.5]] as [number, number][] },
    { id: "c", kind: "mark" as const, pts: [[30, 30], [35, 30]] as [number, number][] },
  ] };
  it("เอาเฉพาะเส้นชื่อจุดติดหู · พิกัดเทียบมุมชิ้น (กลางกว้าง · บนสุด)", () => {
    expect(spotCenters(body)).toEqual([[9, 0], [31, 0.5]]);
  });
  it("จับคู่แถวเดียวกัน คู่นอกสุดก่อน · แถวที่เหลือจุดเดียวไม่ใช้", () => {
    expect(pairSpots([[9, 0], [31, 0.5], [12, 1], [28, 0], [20, 15]])).toEqual([[[9, 0], [31, 0.5]], [[12, 1], [28, 0]]]);
  });
  it("ชิ้นหูยาวเท่ากันจับคู่เป็นนอก+ใน · ยาวต่างกันไม่จับ", () => {
    const P = [{ pid: "h1", shape: R(0, 0, 55.7, 3.5) }, { pid: "h2", shape: R(0, 5, 55.6, 3.5) }, { pid: "h3", shape: R(0, 10, 40, 3) }];
    expect(pairHandlePieces(P).map((x) => [x.main.pid, x.inner?.pid])).toEqual([["h1", "h2"], ["h3", undefined]]);
  });
});

describe("จุดติดแบบใหม่ในข้อมูล", () => {
  it("หูมีแบบ/เชือก/ชั้นใน · ห่วงมีชนิด · ค่าแปลกถูกทิ้ง", () => {
    const pids = new Set(["f", "h", "h2", "t"]);
    const out = cleanAttaches([
      { id: "a1", kind: "handle", pid: "h", on: "f", a: [5, 0], b: [25, 0], len: 40, w: 3.5, style: "mix", cord: 10, inner: "h2" },
      { id: "a2", kind: "tab", pid: "t", on: "f", a: [2, 1], tab: "dring" },
      { id: "a3", kind: "tab", pid: "t", on: "f", a: [2, 1], tab: "laser" },
      { id: "a4", kind: "handle", pid: "h2", on: "f", a: [5, 0], b: [25, 0], len: 40, w: 3.5, style: "neon", cord: 99, inner: "zz" },
    ], pids);
    expect(out[0]).toMatchObject({ style: "mix", cord: 10, inner: "h2" });
    expect(out[1]).toMatchObject({ kind: "tab", tab: "dring", a: [2, 1] });
    expect(out).toHaveLength(3);
    expect(out[2].style).toBeUndefined(); expect(out[2].cord).toBeUndefined(); expect(out[2].inner).toBeUndefined();
  });
});

import { heightForLen, lenForHeight } from "@/lib/pattern-handles";
describe("ความสูงหู ↔ ความยาว", () => {
  it("สูงกว่าครึ่งวง: ไป-กลับได้ค่าเดิม · โคนห่าง 20 สูง 16 = ยาว ~43.4", () => {
    expect(lenForHeight(20, 16)).toBeCloseTo(43.4, 1);
    expect(heightForLen(20, lenForHeight(20, 16))).toBeCloseTo(16, 1);
    expect(heightForLen(20, lenForHeight(20, 6))).toBeCloseTo(6, 0);
  });
});

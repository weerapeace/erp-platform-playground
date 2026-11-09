import { describe, expect, it } from "vitest";
import { booleanPieces } from "@/lib/pattern-boolean";
import { shapeArea, shapeBox, type Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const close = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);
const net = (p: { shape: Shape; holes: Shape[] }) => shapeArea(p.shape) - p.holes.reduce((m, h) => m + shapeArea(h), 0);
const nodes = (s: Shape) => (s.k === "path" ? s.nodes.length : 4);

describe("รวม (union)", () => {
  it("สี่เหลี่ยม 2 อันซ้อนครึ่ง → ชิ้นเดียว 150 ตร.ซม. กรอบ 15×10", () => {
    const r = booleanPieces("union", [{ shape: R(0, 0, 10, 10) }, { shape: R(5, 0, 10, 10) }]);
    expect(r).toHaveLength(1);
    close(net(r[0]), 150);
    expect(shapeBox(r[0].shape)).toMatchObject({ x: 0, y: 0, w: 15, h: 10 });
    expect(nodes(r[0].shape)).toBe(4);   // ขอบตรงต่อกัน = ไม่มีจุดเกิน
  });
  it("ชนขอบกันพอดี (ขอบทับกัน) → ชิ้นเดียว 4 มุม", () => {
    const r = booleanPieces("union", [{ shape: R(0, 0, 10, 10) }, { shape: R(10, 0, 10, 10) }]);
    expect(r).toHaveLength(1);
    close(net(r[0]), 200);
    expect(nodes(r[0].shape)).toBe(4);
  });
  it("รูปตัว L (ขอบทับบางช่วง) · 3 ชิ้นต่อกัน", () => {
    const L = booleanPieces("union", [{ shape: R(0, 0, 10, 4) }, { shape: R(0, 4, 4, 6) }]);
    expect(L).toHaveLength(1); close(net(L[0]), 64); expect(nodes(L[0].shape)).toBe(6);
    const three = booleanPieces("union", [{ shape: R(0, 0, 4, 4) }, { shape: R(3, 0, 4, 4) }, { shape: R(6, 0, 4, 4) }]);
    expect(three).toHaveLength(1); close(net(three[0]), 40);
  });
  it("ไม่ได้ซ้อนกัน → ได้ 2 ชิ้นแยก · ชิ้นเล็กอยู่ข้างในทั้งชิ้น → ได้ชิ้นใหญ่", () => {
    expect(booleanPieces("union", [{ shape: R(0, 0, 5, 5) }, { shape: R(10, 0, 5, 5) }])).toHaveLength(2);
    const r = booleanPieces("union", [{ shape: R(0, 0, 10, 10) }, { shape: R(2, 2, 3, 3) }]);
    expect(r).toHaveLength(1); close(net(r[0]), 100); expect(r[0].holes).toHaveLength(0);
  });
  it("วงกลม + สี่เหลี่ยมทับครึ่งวง → ครึ่งวงกลม + สี่เหลี่ยม", () => {
    const c: Shape = { k: "ellipse", x: 0, y: 0, w: 10, h: 10 };
    const r = booleanPieces("union", [{ shape: c }, { shape: R(5, 0, 10, 10) }]);
    expect(r).toHaveLength(1);
    close(net(r[0]), shapeArea(c) / 2 + 100, 0.2);
  });
});

describe("ตัดออก (subtract)", () => {
  it("ตัดสี่เหลี่ยมเล็กกลางชิ้น → ได้รู", () => {
    const r = booleanPieces("subtract", [{ shape: R(0, 0, 10, 10) }, { shape: R(3, 3, 4, 4) }]);
    expect(r).toHaveLength(1);
    expect(r[0].holes).toHaveLength(1);
    close(net(r[0]), 84);
  });
  it("แถบตัดผ่ากลาง → แยกเป็น 2 ชิ้น · ตัดมุม → เหลือรูปตัว L", () => {
    const two = booleanPieces("subtract", [{ shape: R(0, 0, 10, 4) }, { shape: R(4, -1, 2, 6) }]);
    expect(two).toHaveLength(2); close(net(two[0]), 16); close(net(two[1]), 16);
    const L = booleanPieces("subtract", [{ shape: R(0, 0, 10, 10) }, { shape: R(5, 5, 10, 10) }]);
    expect(L).toHaveLength(1); close(net(L[0]), 75); expect(nodes(L[0].shape)).toBe(6);
  });
  it("ขอบทับกันพอดี: ตัดครึ่งบนออก → เหลือครึ่งล่าง 4 มุม", () => {
    const r = booleanPieces("subtract", [{ shape: R(0, 0, 10, 10) }, { shape: R(0, 0, 10, 5) }]);
    expect(r).toHaveLength(1); close(net(r[0]), 50); expect(nodes(r[0].shape)).toBe(4);
    expect(shapeBox(r[0].shape)).toMatchObject({ y: 5, h: 5 });
  });
  it("ตัดด้วยหลายชิ้น · ตัดจนหมด = ว่าง · ไม่โดนกัน = เหมือนเดิม", () => {
    const r = booleanPieces("subtract", [{ shape: R(0, 0, 10, 10) }, { shape: R(1, 1, 2, 2) }, { shape: R(6, 6, 2, 2) }]);
    expect(r).toHaveLength(1); expect(r[0].holes).toHaveLength(2); close(net(r[0]), 92);
    expect(booleanPieces("subtract", [{ shape: R(2, 2, 3, 3) }, { shape: R(0, 0, 10, 10) }])).toHaveLength(0);
    const same = booleanPieces("subtract", [{ shape: R(0, 0, 5, 5) }, { shape: R(10, 10, 2, 2) }]);
    expect(same).toHaveLength(1); close(net(same[0]), 25);
  });
  it("ชิ้นที่มีรูอยู่แล้ว ตัดเพิ่มทับรูเดิมบางส่วน → รูรวมกัน", () => {
    const r = booleanPieces("subtract", [{ shape: R(0, 0, 10, 10), holes: [R(2, 2, 3, 3)] }, { shape: R(4, 2, 3, 3) }]);
    expect(r).toHaveLength(1); expect(r[0].holes).toHaveLength(1); close(net(r[0]), 100 - 15);
  });
});

describe("ส่วนทับ (intersect)", () => {
  it("ซ้อนครึ่ง → 5×10 · ไม่ซ้อน = ว่าง · ขอบทับพอดี = ครึ่งที่ทับ", () => {
    const r = booleanPieces("intersect", [{ shape: R(0, 0, 10, 10) }, { shape: R(5, 0, 10, 10) }]);
    expect(r).toHaveLength(1); close(net(r[0]), 50);
    expect(shapeBox(r[0].shape)).toMatchObject({ x: 5, w: 5, h: 10 });
    expect(booleanPieces("intersect", [{ shape: R(0, 0, 5, 5) }, { shape: R(10, 0, 5, 5) }])).toHaveLength(0);
    const half = booleanPieces("intersect", [{ shape: R(0, 0, 10, 10) }, { shape: R(0, 0, 10, 5) }]);
    expect(half).toHaveLength(1); close(net(half[0]), 50);
  });
  it("3 ชิ้น → เฉพาะที่ซ้อนกันทั้ง 3", () => {
    const r = booleanPieces("intersect", [{ shape: R(0, 0, 10, 10) }, { shape: R(5, 0, 10, 10) }, { shape: R(0, 5, 20, 10) }]);
    expect(r).toHaveLength(1); close(net(r[0]), 25);
  });
});

describe("สุ่มทดสอบ 400 คู่ (ขอบตรงกริด ทับกันบ่อย) — พื้นที่ต้องลงตัวเสมอ", () => {
  it("รวม = A + B − ทับ · ตัดออก = A − ทับ", () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const g = (n: number) => Math.round(rnd() * n * 2) / 2;   // กริด 0.5 ซม.
    const sum = (r: { shape: Shape; holes: Shape[] }[]) => r.reduce((m, p) => m + net(p), 0);
    for (let k = 0; k < 400; k++) {
      const mk = (): Shape => (k % 5 === 0 && rnd() < 0.5 ? { k: "ellipse", x: g(8), y: g(8), w: 2 + g(8), h: 2 + g(8) } : R(g(8), g(8), 0.5 + g(8), 0.5 + g(8)));
      const A = mk(), B = mk();
      const a = shapeArea(A), b = shapeArea(B);
      const tol = A.k === "ellipse" || B.k === "ellipse" ? 0.15 : 1e-3;
      const I = sum(booleanPieces("intersect", [{ shape: A }, { shape: B }]));
      const U = sum(booleanPieces("union", [{ shape: A }, { shape: B }]));
      const S = sum(booleanPieces("subtract", [{ shape: A }, { shape: B }]));
      expect(Math.abs(U - (a + b - I))).toBeLessThan(tol);
      expect(Math.abs(S - (a - I))).toBeLessThan(tol);
    }
  });
});

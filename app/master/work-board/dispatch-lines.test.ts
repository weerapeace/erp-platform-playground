import { describe, expect, it } from "vitest";
import { dispLinesCheck, type DispLine } from "./dispatch-lines-rules";

const desks = [{ id: "d1", name: "โต๊ะเสถียร" }, { id: "d2", name: "ช่างเหมา" }];
const L = (p: Partial<DispLine>): DispLine => ({ key: Math.random().toString(36), deptId: "d1", crewIds: [], qty: 0, rate: "", ...p });

describe("dispLinesCheck — แถวจ่ายงานใบเดียว", () => {
  it("จ่ายครบแถวเดียว = ผ่าน", () => {
    const c = dispLinesCheck([L({ qty: 300 })], 300, desks);
    expect(c.errors).toEqual([]);
    expect(c).toMatchObject({ total: 300, left: 0, n: 1 });
  });
  it("จ่ายไม่หมด = ผ่าน + บอกที่ค้างรอจ่าย", () => {
    const c = dispLinesCheck([L({ qty: 150 }), L({ deptId: "d2", crewIds: ["c1"], qty: 100 })], 300, desks);
    expect(c.errors).toEqual([]);
    expect(c).toMatchObject({ total: 250, left: 50, n: 2 });
  });
  it("จ่ายเกินที่เหลือ = ห้าม", () => {
    const c = dispLinesCheck([L({ qty: 200 }), L({ qty: 150 })], 300, desks);
    expect(c.errors[0]).toContain("จ่ายเกิน 50");
  });
  it("งานเหมาไม่เลือกคน / ไม่เลือกโต๊ะ / จำนวน 0 = บอกรายแถว", () => {
    const a = L({ deptId: "d2", qty: 10 }), b = L({ deptId: "", qty: 10 }), z = L({ qty: 0 });
    const c = dispLinesCheck([a, b, z], 300, desks);
    expect(c.lineErr[a.key]).toContain("งานเหมา");
    expect(c.lineErr[b.key]).toContain("เลือกโต๊ะ");
    expect(c.lineErr[z.key]).toContain("ใส่จำนวน");
    expect(c.n).toBe(2);
  });
});

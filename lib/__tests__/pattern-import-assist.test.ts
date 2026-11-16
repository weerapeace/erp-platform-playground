/** Bag CAD รอบ J1: ช่วยหลังนำเข้า — เดาชนิดชิ้น · ชื่อไทย · ชิ้นเหมือนกัน · เดาตะเข็บ · ตำแหน่งติดหู */
import { describe, expect, it } from "vitest";
import { autoNames, groupIdentical, guessPieceTypes, handleSpots, isConfident, suggestSeams } from "@/lib/pattern-import-assist";
import type { Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const trap = (x: number, top: number, bot: number, h: number, flip = false): Shape => {
  const d = (bot - top) / 2, pts = flip ? [[x + d + 3, 0], [x + d + top, 0], [x + bot, h], [x, h]] : [[x + d, 0], [x + d + top - 3, 0], [x + bot, h], [x, h]];
  return { k: "path", nodes: pts.map(([px, py]) => ({ x: px, y: py })) };
};

describe("เดาชนิดชิ้น + ชื่อไทย", () => {
  const pieces = [R(0, 0, 40, 30), R(50, 0, 40, 30), R(0, 40, 12, 30), R(20, 40, 12, 30), R(0, 80, 50, 3), R(0, 90, 40, 1.5), R(0, 95, 2, 2), R(0, 100, 40, 10)].map((shape) => ({ shape }));
  const types = guessPieceTypes(pieces);
  it("ใหญ่สุด = ตัวกระเป๋า · ซ้ำ = ข้าง · ยาวแคบ = หู/แถบซิป · เล็กมาก = แถบเล็ก · ยาวปานกลาง = ก้น", () => {
    expect(types).toEqual(["body", "body", "side", "side", "handle", "zip", "tab", "base"]);
  });
  it("ชื่อ: ตัวหน้า ตัวหลัง · ชนิดที่มีหลายชิ้นใส่เลข · ชนิดชิ้นเดียวไม่ใส่", () => {
    expect(autoNames(types)).toEqual(["ตัวหน้า", "ตัวหลัง", "ชิ้นข้าง 1", "ชิ้นข้าง 2", "หู", "แถบซิป", "แถบเล็ก", "ก้น"]);
  });
});

describe("ชิ้นเหมือนกัน", () => {
  it("รูปเดียวกันวางคนละที่ = กลุ่มเดียว · กลับซ้าย-ขวา = mirror · ขนาดต่าง = ไม่รวม", () => {
    const g = groupIdentical([{ shape: trap(0, 20, 30, 15) }, { shape: trap(40, 20, 30, 15, true) }, { shape: trap(80, 20, 30, 15) }, { shape: trap(0, 20, 31, 15) }]);
    expect(g).toHaveLength(1);
    expect(g[0].members).toEqual([0, 1, 2]);
    expect(g[0].mirror).toEqual([false, true, false]);
  });
});

describe("เดาตะเข็บ", () => {
  it("ขอบข้างตัวหน้า (30) ↔ ขอบยาวชิ้นข้าง (30) · ไม่พาดข้ามมุม · ขอบใช้ครั้งเดียว · มั่นใจ = ติ๊กให้", () => {
    const pieces = [{ shape: R(0, 0, 40, 30) }, { shape: R(50, 0, 12, 30) }];
    const types = ["body", "side"] as const;
    const s = suggestSeams(pieces, [...types]);
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s.every((x) => x.a.count === 1 && x.b.count === 1)).toBe(true);
    expect(s[0].la).toBeCloseTo(30, 3); expect(s[0].pct).toBe(100); expect(s[0].diff).toBe(0);
    expect(isConfident(s[0], [...types])).toBe(true);
    const used = new Set<string>();
    for (const x of s) for (const k of [`${x.a.i}:${x.a.from}`, `${x.b.i}:${x.b.from}`]) { expect(used.has(k)).toBe(false); used.add(k); }
  });
  it("หู / แถบเล็ก / ช่องใส่ของ ไม่ถูกจับคู่อัตโนมัติ · ขอบเดียวกันของชิ้นเหมือนกัน (ซ้อนชั้น) ไม่นับ", () => {
    expect(suggestSeams([{ shape: R(0, 0, 40, 30) }, { shape: R(0, 50, 40, 3) }], ["body", "handle"])).toEqual([]);
    const s = suggestSeams([{ shape: R(0, 0, 40, 10) }, { shape: R(0, 20, 40, 10) }], ["base", "base"]);
    expect(s.every((x) => !(x.a.from === x.b.from))).toBe(true);
  });
});

describe("ตำแหน่งติดหู", () => {
  it("กรอบ/ตัว U เล็กบนตัวกระเป๋า = จุดติดหู · เส้นตรง / กรอบใหญ่ / บนหู = ไม่นับ", () => {
    const body = { shape: R(0, 0, 40, 30), inner: [
      { id: "u", kind: "mark" as const, pts: [[5, 0], [5, 3], [7, 3], [7, 0]] as [number, number][] },
      { id: "line", kind: "mark" as const, pts: [[10, 5], [30, 5]] as [number, number][] },
      { id: "big", kind: "mark" as const, pts: [[10, 10], [25, 10], [25, 20], [10, 20], [10, 10]] as [number, number][] },
    ] };
    const handle = { shape: R(0, 40, 50, 3), inner: [{ id: "h", kind: "mark" as const, pts: [[1, 40.5], [1, 42], [2, 42], [2, 40.5]] as [number, number][] }] };
    expect(handleSpots([body, handle], ["body", "handle"])).toEqual([["u"], []]);
  });
});

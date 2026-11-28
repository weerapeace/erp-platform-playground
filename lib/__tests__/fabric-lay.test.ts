import { describe, expect, it } from "vitest";
import {
  applyM, bagLetters, bagStatus, checkResults, cleanBags, cleanItems, cleanLayPieces, describePlaced, fabricLeftPct, fabricSize,
  findFreeSpot, invertM, itemMatrix, layIssues, letterOf, newItem, normRot, pieceLocal, placeAll, polyArea, polysOverlap, rectShape, regionLabel,
  type LayBag, type LayItem, type LayPiece,
} from "@/lib/fabric-lay";

const PID = "11111111-1111-1111-1111-111111111111";
const front: LayPiece = { id: "pf", part: "front", name: "ด้านหน้า", shape: rectShape(32, 24), count: 1, mirror: false, allow: 1, src: "rect" };
const side: LayPiece = { id: "ps", part: "side", name: "ด้านข้าง", shape: rectShape(10, 24), count: 2, mirror: true, allow: 0, src: "rect" };
const pats = { [PID]: { pieces: [front, side] } };
const bag: LayBag = { key: "b1", pattern_id: PID, label: "ใบที่ 1", color: "#2563eb" };

describe("รูปชิ้น + เผื่อเย็บ", () => {
  it("เส้นตัด = เส้นเย็บ + เผื่อรอบชิ้น", () => {
    const L = pieceLocal(front);
    expect(L.w).toBeCloseTo(34, 5);
    expect(L.h).toBeCloseTo(26, 5);
    expect(L.area).toBeCloseTo(34 * 26, 3);
  });
  it("ไม่เผื่อ = ขนาดเท่าเส้นเย็บ", () => {
    const L = pieceLocal(front, false);
    expect([L.w, L.h]).toEqual([32, 24]);
  });
});

describe("หมุน / พลิก / ย้าย", () => {
  it("กลางชิ้นอยู่ที่ x,y เสมอ ไม่ว่าหมุนกี่องศา", () => {
    for (const rot of [0, 90, 37, 180, 270]) {
      const m = itemMatrix({ x: 50, y: 40, rot, flip: false }, 34, 26);
      const [cx, cy] = applyM(m, [17, 13]);
      expect(cx).toBeCloseTo(50, 6); expect(cy).toBeCloseTo(40, 6);
    }
  });
  it("หมุน 90° = กว้างยาวสลับกัน", () => {
    const [p] = placeAll([{ id: "i1", bag: "b1", piece: "pf", copy: 0, x: 50, y: 40, rot: 90, flip: false }], [bag], pats);
    expect(p.box.w).toBeCloseTo(26, 5); expect(p.box.h).toBeCloseTo(34, 5);
  });
  it("พลิก = มุมซ้ายบนของชิ้นไปอยู่ขวา", () => {
    const m = itemMatrix({ x: 0, y: 0, rot: 0, flip: true }, 10, 4);
    expect(applyM(m, [0, 0])).toEqual([5, -2]);
  });
  it("เมทริกซ์ย้อนกลับได้", () => {
    const m = itemMatrix({ x: 12, y: 7, rot: 33, flip: true }, 20, 10);
    const back = applyM(invertM(m), applyM(m, [3, 4]));
    expect(back[0]).toBeCloseTo(3, 6); expect(back[1]).toBeCloseTo(4, 6);
  });
  it("normRot วนอยู่ใน 0–359.9", () => {
    expect(normRot(-90)).toBe(270); expect(normRot(450)).toBe(90);
  });
});

describe("เช็กปัญหา", () => {
  const items: LayItem[] = [
    { id: "a", bag: "b1", piece: "pf", copy: 0, x: 20, y: 15, rot: 0, flip: false },
    { id: "b", bag: "b1", piece: "pf", copy: 0, x: 30, y: 15, rot: 0, flip: false },
    { id: "c", bag: "b1", piece: "ps", copy: 0, x: 88, y: 15, rot: 0, flip: false },
  ];
  it("ทับกัน + ล้นผ้า", () => {
    const placed = placeAll(items, [bag], pats);
    const is = layIssues(placed, 90, 60);
    expect(is.overlaps).toEqual([["a", "b"]]);
    expect(is.outside).toEqual(["c"]);
  });
  it("ขอบแตะพอดีไม่นับว่าทับ", () => {
    const A: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const B: [number, number][] = [[10, 0], [20, 0], [20, 10], [10, 10]];
    expect(polysOverlap(A, B)).toBe(false);
    expect(polysOverlap(A, [[5, 5], [15, 5], [15, 15], [5, 15]])).toBe(true);
    expect(polysOverlap(A, [[2, 2], [4, 2], [4, 4], [2, 4]])).toBe(true);   // อยู่ข้างในทั้งชิ้น
  });
  it("ทับส่วนที่ตัดไปแล้ว", () => {
    const placed = placeAll([items[0]], [bag], pats);
    const zone: [number, number][][] = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
    expect(layIssues(placed, 90, 60, zone).onCut).toEqual(["a"]);
  });
});

describe("กระเป๋าครบไหม + ชิ้นคู่", () => {
  it("นับชิ้นที่ขาดตามจำนวน", () => {
    const st = bagStatus([bag], [{ id: "a", bag: "b1", piece: "pf", copy: 0, x: 20, y: 15, rot: 0, flip: false }], pats)[0];
    expect(st.need).toBe(3); expect(st.placed).toBe(1);
    expect(st.missing.map((m) => `${m.piece.id}#${m.copy}`)).toEqual(["ps#0", "ps#1"]);
  });
  it("ชิ้นคู่ ตัวที่ 2 พลิกให้เอง", () => {
    expect(newItem("b1", side, 0, [5, 5]).flip).toBe(false);
    expect(newItem("b1", side, 1, [5, 5]).flip).toBe(true);
  });
  it("หาที่ว่างไม่ทับชิ้นเดิม", () => {
    const placed = placeAll([{ id: "a", bag: "b1", piece: "pf", copy: 0, x: 17, y: 13, rot: 0, flip: false }], [bag], pats);
    const L = pieceLocal(side);
    const at = findFreeSpot(L, 90, 60, placed.map((p) => p.cut));
    const [q] = placeAll([{ id: "n", bag: "b1", piece: "ps", copy: 0, x: at[0], y: at[1], rot: 0, flip: false }], [bag], pats);
    expect(polysOverlap(q.cut, placed[0].cut)).toBe(false);
  });
});

describe("ป้าย + คำอธิบาย", () => {
  it("letterOf", () => { expect(letterOf(0)).toBe("A"); expect(letterOf(25)).toBe("Z"); expect(letterOf(26)).toBe("AA"); });
  it("เรียงป้ายตามลำดับชิ้นในแบบตัด", () => {
    const placed = placeAll([
      { id: "s2", bag: "b1", piece: "ps", copy: 1, x: 70, y: 20, rot: 0, flip: true },
      { id: "f", bag: "b1", piece: "pf", copy: 0, x: 20, y: 15, rot: 0, flip: false },
      { id: "s1", bag: "b1", piece: "ps", copy: 0, x: 55, y: 20, rot: 0, flip: false },
    ], [bag], pats);
    const L = bagLetters(placed, "b1", [front, side]);
    expect([L.get("f"), L.get("s1"), L.get("s2")]).toEqual(["A", "B", "C"]);
  });
  it("ตำแหน่งเป็นคำ", () => {
    expect(regionLabel(5, 5, 90, 60)).toBe("ซ้ายบน");
    expect(regionLabel(45, 30, 90, 60)).toBe("กลางผืน");
    expect(regionLabel(85, 30, 90, 60)).toBe("ขวากลาง");
  });
  it("คำอธิบายมีส่วน ขนาด และตำแหน่งบนผ้า", () => {
    const [p] = placeAll([{ id: "f", bag: "b1", piece: "pf", copy: 0, x: 18, y: 14, rot: 0, flip: false, note: "กวางอยู่กลาง" }], [bag], pats);
    const t = describePlaced(p, "A", 90, 60);
    expect(t).toContain("ด้านหน้า");
    expect(t).toContain("32×24 ซม.");
    expect(t).toContain("ซ้ายบน");
    expect(t).toContain("กวางอยู่กลาง");
  });
});

describe("ตรวจค่าที่ส่งมา", () => {
  it("ชิ้นรหัสซ้ำ = ไม่ผ่าน", () => {
    expect(cleanLayPieces([front, front]).ok).toBe(false);
    const r = cleanLayPieces([{ ...front, count: 99, allow: 50, part: "xx" }]);
    expect(r.ok && r.value[0]).toMatchObject({ count: 20, allow: 5, part: "other" });
  });
  it("ชิ้นที่อ้างกระเป๋าที่ไม่มี = ไม่ผ่าน", () => {
    const bags = cleanBags([bag]);
    expect(bags.ok).toBe(true);
    expect(cleanItems([{ id: "a", bag: "zz", piece: "pf", x: 1, y: 1 }], bags.ok ? bags.value : []).ok).toBe(false);
    expect(cleanItems([{ id: "a", bag: "b1", piece: "pf", x: 1, y: 1, rot: -90 }], bags.ok ? bags.value : [])).toMatchObject({ ok: true, value: [{ rot: 270, copy: 0, flip: false }] });
  });
});

describe("ผ้า", () => {
  it("ตรวจระยะ: คลาดเกิน 1% (ขั้นต่ำ 5 มม.) = เตือน", () => {
    const r = checkResults([{ a: [0, 0], b: [50, 0], real: 50 }, { a: [0, 0], b: [0, 52], real: 50 }]);
    expect(r[0].ok).toBe(true); expect(r[1].ok).toBe(false); expect(r[1].err).toBe(2);
  });
  it("ขนาด เล็ก/กลาง/ใหญ่ + เหลือกี่ %", () => {
    expect(fabricSize(45, 45)).toBe("s"); expect(fabricSize(90, 60)).toBe("m"); expect(fabricSize(140, 95)).toBe("l"); expect(fabricSize(null, null)).toBe(null);
    expect(fabricLeftPct(100, 100, 2500)).toBe(75);
  });
  it("พื้นที่รูปหลายเหลี่ยม", () => { expect(polyArea([[0, 0], [10, 0], [10, 5], [0, 5]])).toBe(50); });
});

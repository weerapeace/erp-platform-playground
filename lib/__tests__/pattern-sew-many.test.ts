import { describe, expect, it } from "vitest";
import { assemble, type AsmPiece } from "@/lib/pattern-assembly";
import { cleanSeams, edgeBusy, rangeFree, rangedSide, sideLength, type Seam } from "@/lib/pattern-seams";
import { buildSewn } from "@/lib/pattern-sewn";
import type { Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
// กระเป๋ากลม: ตัวหน้า/ตัวหลัง = วงกลมชิ้นเดียว ตัด 2 · รอบวงมี 2 ชิ้นมาต่อกัน: แถบซิปด้านบน 20 ซม. + แถบก้น (ยาวเท่าที่เหลือ) กว้าง 6 ซม.
const circle: Shape = { k: "ellipse", x: 0, y: 0, w: 20, h: 20 };
const whole = { pid: "c", from: 0, count: 1, n: 1 };
const L = sideLength(circle, whole) as number, rest = Math.round((L - 20) * 1000) / 1000;
const pieces: AsmPiece[] = [
  { pid: "c", name: "ตัวหน้า / ตัวหลัง", count: 2, shape: circle, holes: [] },
  { pid: "top", name: "แถบซิป", count: 1, shape: R(30, 0, 20, 6), holes: [] },
  { pid: "bot", name: "แถบก้น", count: 1, shape: R(30, 10, rest, 6), holes: [] },
];
const mk = (id: string, t0: number, t1: number, pid: string, edge: number, group?: string): Seam => ({ id, a: rangedSide("c", 0, 1, t0, t1, L), b: { pid, from: edge, count: 1, n: 4 }, ...(group ? { group } : {}) });
// ขอบบนของแถบ (ขอบ 1) เย็บกับตัวหน้า · ขอบล่าง (ขอบ 3) เย็บกับตัวหลัง — ช่วงเดียวกันของวงกลม (ชิ้นเดียวกัน ตัด 2)
const grouped: Seam[] = [mk("f1", 0, 20, "top", 0, "g1"), mk("f2", 20, L, "bot", 0, "g1"), mk("b1", 0, 20, "top", 2, "g2"), mk("b2", 20, L, "bot", 2, "g2")];

describe("เย็บ 1 ขอบกับหลายชิ้น", () => {
  it("rangeFree: ชิ้นที่ตัด 2 ชิ้น ช่วงเดียวกันเย็บซ้ำได้ 2 แนว (ไม่เกินจำนวนตัด)", () => {
    const busy = edgeBusy([grouped[0], grouped[1]], "c", 0, 1, L);
    expect(rangeFree(busy, 0, 20)).toBe(false);
    expect(rangeFree(busy, 0, 20, 2)).toBe(true);
    expect(rangeFree(edgeBusy(grouped, "c", 0, 1, L), 0, 20, 2)).toBe(false);
  });
  it("cleanSeams เก็บรหัสชุด · รหัสแปลก = ไม่เก็บ", () => {
    const out = cleanSeams([grouped[0], { ...grouped[1], group: "ไม่ถูก รูปแบบ" }], new Set(["c", "top", "bot"]));
    expect(out[0].group).toBe("g1");
    expect(out[1].group).toBeUndefined();
  });
  it("ตัวประกอบทรงใช้ตะเข็บชุดนี้หาชิ้นคั่นกลางหลายชิ้นรอบแผ่นเดียวได้", () => {
    const A = assemble(pieces, grouped);
    expect(A).toMatchObject({ ok: true, kind: "wrap", front: "c", back: "c", depth: 6 });
    if (!A.ok) return;
    expect([...A.bridges].sort()).toEqual(["bot", "top"]);
    expect(A.sweeps.map((s) => s.pid).sort()).toEqual(["bot", "top"]);
    expect(A.loose).toEqual([]);
    expect(A.notes).not.toContain("mismatch");
  });
  it("ตะเข็บบางช่วงแบบเดียวกันแต่ไม่มีชุด (เช่น เย็บด้วยเครื่องมือเย็บบางช่วง) ไม่ถูกใช้หาทรง", () => {
    expect(assemble(pieces, grouped.map(({ group: _g, ...s }) => { void _g; return s; }))).toMatchObject({ ok: false });
  });
  it("ภาพเย็บติด: ประกอบเป็นกระเป๋ากลมครบ 3 ชิ้น ไม่มีชิ้นเหลือ", () => {
    const sc = buildSewn(pieces, grouped);
    expect(sc.asm?.ok).toBe(true);
    expect(sc.joined).toBe(3);
    expect(sc.notes).toEqual([]);
    expect(sc.parts).toEqual([]);
  });
});

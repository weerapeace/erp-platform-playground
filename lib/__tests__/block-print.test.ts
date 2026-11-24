import { describe, expect, it } from "vitest";
import {
  PT_TO_MM, cleanPieces, dimGeometry, equalHeight, fmtDim, isWhiteFill, layoutPage, mergePieces, opsBox, opsToSvgPath,
  piecesFromOperatorList, resetPieceSize, setPieceSize, type BlockPiece,
} from "@/lib/block-print";

const OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, fill: 22, eoFill: 23, stroke: 20, endPath: 28, showText: 44, setFillRGBColor: 59, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const VIEW = [0, 0, 200, 100];
const sq = (x: number, y: number, s: number) => new Float32Array([0, x, y, 1, x + s, y, 1, x + s, y + s, 1, x, y + s, 4]);
const path = (paint: number, data: Float32Array) => [paint, [data], null];
const list = (items: [number, unknown[]][]) => ({ fnArray: items.map((i) => i[0]), argsArray: items.map((i) => i[1]) });

const piece = (id: string, w: number, h: number, on = true): BlockPiece => ({ id, name: id, d: [0, 0, 0, 1, w, 0, 1, w, h, 1, 0, h, 4], fill: "nonzero", ow: w, oh: h, w, h, ax: 0, ay: 0, on });

describe("อ่านคำสั่งวาดจากไฟล์ .ai", () => {
  it("เส้นที่เติมสี = 1 ชิ้น · แปลง pt เป็น มม. และกลับแกน y", () => {
    const r = piecesFromOperatorList(list([[91, path(22, sq(10, 10, 20))]]), OPS, VIEW);
    expect(r.pieces).toHaveLength(1);
    const p = r.pieces[0];
    expect(p.ow).toBeCloseTo(20 * PT_TO_MM, 2);
    expect(p.ax).toBeCloseTo(10 * PT_TO_MM, 2);
    expect(p.ay).toBeCloseTo((100 - 30) * PT_TO_MM, 2);
    expect(opsBox(p.d)).toMatchObject({ x: 0, y: 0 });
  });
  it("ข้ามเส้นขอบ ตัวหนังสือ พื้นขาว และ clip · นับไว้บอกผู้ใช้", () => {
    const r = piecesFromOperatorList(list([
      [91, path(20, sq(0, 0, 5))],
      [44, []],
      [10, []], [59, ["#ffffff"]], [91, path(22, sq(0, 0, 100))], [11, []],
      [91, path(28, sq(0, 0, 50))],
      [91, path(22, sq(50, 50, 10))],
    ]), OPS, VIEW);
    expect(r.pieces).toHaveLength(1);
    expect(r.skipped).toEqual({ strokes: 1, texts: 1, images: 0, whites: 1, backgrounds: 0 });
  });
  it("คิด transform + form ซ้อน · eoFill = evenodd", () => {
    const r = piecesFromOperatorList(list([
      [10, []], [12, [2, 0, 0, 2, 0, 0]], [74, [[1, 0, 0, 1, 5, 0], null]], [91, path(23, sq(0, 0, 10))], [75, []], [11, []],
    ]), OPS, VIEW);
    expect(r.pieces[0].ow).toBeCloseTo(20 * PT_TO_MM, 2);
    expect(r.pieces[0].ax).toBeCloseTo(10 * PT_TO_MM, 2);
    expect(r.pieces[0].fill).toBe("evenodd");
  });
  it("เรียงชิ้นแถวบนก่อน แล้วซ้ายไปขวา · ตั้งชื่อ ชิ้น 1..n", () => {
    const r = piecesFromOperatorList(list([
      [91, path(22, sq(100, 70, 10))], [91, path(22, sq(10, 70, 10))], [91, path(22, sq(10, 10, 10))],
    ]), OPS, VIEW);
    expect(r.pieces.map((p) => Math.round(p.ax / PT_TO_MM))).toEqual([10, 100, 10]);
    expect(r.pieces.map((p) => p.name)).toEqual(["ชิ้น 1", "ชิ้น 2", "ชิ้น 3"]);
  });
  it("พื้นหลังสีเต็มอาร์ตบอร์ด = ไม่ติ๊กส่งออก และไม่นับลำดับชิ้น", () => {
    const full = new Float32Array([0, 0, 0, 1, 200, 0, 1, 200, 100, 1, 0, 100, 4]);
    const r = piecesFromOperatorList(list([[91, path(22, sq(10, 10, 10))], [91, path(22, full)], [91, path(22, sq(60, 10, 10))]]), OPS, VIEW);
    expect(r.pieces.find((p) => p.name === "พื้นหลัง")?.on).toBe(false);
    expect(r.skipped.backgrounds).toBe(1);
    expect(r.pieces.filter((p) => p.on).map((p) => p.name)).toEqual(["ชิ้น 1", "ชิ้น 2"]);
  });
  it("สีขาวรู้ได้ทั้งแบบ #hex และตัวเลข", () => {
    expect(isWhiteFill(["#FFFFFF"])).toBe(true);
    expect(isWhiteFill(["#000000"])).toBe(false);
    expect(isWhiteFill([1, 1, 1])).toBe(true);
    expect(isWhiteFill([255, 255, 254])).toBe(true);
    expect(isWhiteFill([0.5])).toBe(false);
  });
});

describe("กรอบของเส้น", () => {
  it("คิดโค้งตามรูปจริง ไม่ใช่จุดจับ", () => {
    const b = opsBox([0, 0, 0, 2, 0, 10, 10, 10, 10, 0]);
    expect(b!.h).toBeCloseTo(7.5, 5);
    expect(b!.w).toBeCloseTo(10, 5);
  });
  it("โค้ง 2 จุดแปลงเป็นโค้งปกติ", () => {
    expect(opsToSvgPath([0, 0, 0, 3, 5, 10, 10, 0])).toMatch(/^M0 0C/);
  });
});

describe("ขนาด", () => {
  const g = piece("g", 43.2, 68.2);
  it("ล็อกสัดส่วน", () => {
    const p = setPieceSize(g, "w", 21.6, true);
    expect(p.h).toBeCloseTo(34.1, 3);
    expect(setPieceSize(g, "h", 10, false).w).toBe(43.2);
  });
  it("ค่าแปลก ๆ ไม่เปลี่ยนอะไร · กลับขนาดเดิมได้", () => {
    expect(setPieceSize(g, "w", -1, true)).toBe(g);
    expect(resetPieceSize(setPieceSize(g, "w", 5, true))).toMatchObject({ w: 43.2, h: 68.2 });
  });
  it("ให้ทุกชิ้นที่ติ๊กสูงเท่ากัน (ชิ้นที่ไม่ติ๊กไม่เปลี่ยน)", () => {
    const out = equalHeight([piece("E", 28.2, 43), piece("N", 38.9, 50), piece("x", 10, 10, false)], "E");
    expect(out[1].h).toBe(43);
    expect(out[1].w).toBeCloseTo(38.9 * 43 / 50, 3);
    expect(out[2].h).toBe(10);
  });
  it("รวมชิ้นตามตำแหน่งเดิม", () => {
    const a = { ...piece("a", 10, 10), ax: 0, ay: 0 }, b = { ...piece("b", 10, 10), ax: 20, ay: 5 };
    const out = mergePieces([a, b, piece("c", 1, 1)], ["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", ow: 30, oh: 15, w: 30, h: 15 });
  });
});

describe("ตัวเลขบนเส้นบอกขนาด", () => {
  it("แบบตัวอย่าง 4.32 cm / 4.3 cm", () => {
    expect(fmtDim(43.2, "cm")).toBe("4.32 cm");
    expect(fmtDim(43, "cm")).toBe("4.3 cm");
    expect(fmtDim(43.25, "mm")).toBe("43.3 mm");
  });
  it("ตัวเลขสูงหมุนอยู่ขวา ตัวเลขกว้างอยู่ล่าง", () => {
    const g = dimGeometry({ id: "g", x: 20, y: 20, w: 43.2, h: 68.2 }, "cm");
    expect(g.texts).toEqual([
      expect.objectContaining({ text: "6.82 cm", rotate: 90 }),
      expect.objectContaining({ text: "4.32 cm", rotate: 0 }),
    ]);
    expect(g.lines.filter((l) => l.kind === "dim")).toHaveLength(6);
  });
});

describe("จัดหน้า PDF", () => {
  it("3 ชิ้นแบบตัวอย่าง ลงหน้า A4 เดียว", () => {
    const lay = layoutPage([piece("g", 43.2, 68.2), piece("E", 28.2, 43), piece("N", 38.9, 43)], "A4");
    expect(lay.ok).toBe(true);
    if (lay.ok) {
      expect(lay.items).toHaveLength(3);
      for (const it of lay.items) { expect(it.x).toBeGreaterThan(0); expect(it.x + it.w).toBeLessThan(lay.pageW); }
      // ชิดล่างในแถวเดียวกัน
      expect(lay.items[0].y + lay.items[0].h).toBeCloseTo(lay.items[1].y + lay.items[1].h, 5);
    }
  });
  it("ชิ้นใหญ่เกินกระดาษ = แจ้งเตือน ไม่ย่อเอง", () => {
    const lay = layoutPage([piece("big", 300, 50)], "A4");
    expect(lay.ok).toBe(false);
    if (!lay.ok) expect(lay.tooBig).toEqual(["big"]);
    expect(layoutPage([piece("big", 300, 50)], "A3").ok).toBe(true);
  });
  it("ยาวเกินแนวตั้ง → ใช้แนวนอน", () => {
    const lay = layoutPage([piece("long", 200, 20)], "A4");
    expect(lay.ok && lay.orientation).toBe("landscape");
  });
  it("ไม่ได้ติ๊กอะไร = แจ้งเตือน", () => {
    expect(layoutPage([piece("a", 10, 10, false)], "A4").ok).toBe(false);
  });
});

describe("ตรวจข้อมูลก่อนบันทึก", () => {
  it("รับชิ้นที่ถูกต้อง", () => {
    const r = cleanPieces([piece("a", 10, 10)]);
    expect(r.ok).toBe(true);
  });
  it("ปฏิเสธเส้นเพี้ยน ขนาดติดลบ รหัสซ้ำ", () => {
    expect(cleanPieces([{ ...piece("a", 10, 10), d: [9, 1, 2] }]).ok).toBe(false);
    expect(cleanPieces([{ ...piece("a", 10, 10), w: -1 }]).ok).toBe(false);
    expect(cleanPieces([piece("a", 1, 1), piece("a", 2, 2)]).ok).toBe(false);
    expect(cleanPieces("x").ok).toBe(false);
  });
});

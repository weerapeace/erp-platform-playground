import { describe, it, expect } from "vitest";
import { detectPieces, inkMask, pieceNames, readingOrder, mergeOverlapping, vectorFileProblem, exportScale, edgeWhiteMask, isVectorFile, isPostScript } from "../vector-split";

/** ภาพ w×h โปร่งใส + วาดสี่เหลี่ยมทึบ */
function canvasOf(w: number, h: number, rects: [number, number, number, number][], bg?: [number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  if (bg) for (let i = 0; i < w * h; i++) { a[i * 4] = bg[0]; a[i * 4 + 1] = bg[1]; a[i * 4 + 2] = bg[2]; a[i * 4 + 3] = 255; }
  for (const [x, y, rw, rh] of rects)
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) { const p = (yy * w + xx) * 4; a[p] = 230; a[p + 1] = 60; a[p + 2] = 60; a[p + 3] = 255; }
  return a;
}

describe("detectPieces", () => {
  it("ตาราง 2×2 ชิ้นห่างกัน → 4 ชิ้น เรียงซ้าย→ขวา บน→ล่าง", () => {
    const img = canvasOf(100, 100, [[60, 10, 20, 20], [10, 10, 20, 20], [10, 60, 20, 20], [60, 60, 20, 20]]);
    const b = detectPieces(inkMask(img, 100, 100, false), 100, 100, { gap: 5 });
    expect(b.map((x) => [x.x, x.y])).toEqual([[10, 10], [60, 10], [10, 60], [60, 60]]);
    expect(b[0]).toEqual({ x: 10, y: 10, w: 20, h: 20 });
  });
  it("ชิ้นที่ห่างกันน้อยกว่า gap = ชิ้นเดียว (หัวใจ + ขีดรอบ ๆ)", () => {
    const img = canvasOf(100, 100, [[10, 10, 20, 20], [32, 12, 3, 3]]);
    const b = detectPieces(inkMask(img, 100, 100, false), 100, 100, { gap: 6 });
    expect(b).toHaveLength(1);
    expect(b[0]).toEqual({ x: 10, y: 10, w: 25, h: 20 });
  });
  it("แผ่นขาวรองพื้น: ไม่ลบ = ก้อนเดียว · ลบพื้นขาว = แยกชิ้นได้", () => {
    const img = canvasOf(100, 100, [[10, 10, 20, 20], [60, 60, 20, 20]], [255, 255, 255]);
    expect(detectPieces(inkMask(img, 100, 100, false), 100, 100, { gap: 5 })).toHaveLength(1);
    expect(detectPieces(inkMask(img, 100, 100, true), 100, 100, { gap: 5 })).toHaveLength(2);
  });
  it("ว่างเปล่า = ไม่มีชิ้น", () => {
    expect(detectPieces(new Uint8Array(100), 10, 10)).toEqual([]);
  });
});

describe("edgeWhiteMask", () => {
  it("ขาวข้างในชิ้น (ไม่ต่อขอบ) ไม่โดนลบ", () => {
    const img = canvasOf(20, 20, [[5, 5, 10, 10]], [255, 255, 255]);
    const p = (10 * 20 + 10) * 4; img[p] = 255; img[p + 1] = 255; img[p + 2] = 255;   // จุดขาวกลางชิ้น
    const bg = edgeWhiteMask(img, 20, 20);
    expect(bg[0]).toBe(1);
    expect(bg[10 * 20 + 10]).toBe(0);
  });
});

describe("helpers", () => {
  it("ตั้งชื่อเติมศูนย์", () => {
    expect(pieceNames("heart_", 3)).toEqual(["heart_01", "heart_02", "heart_03"]);
    expect(pieceNames("", 1)).toEqual(["piece_01"]);
    expect(pieceNames("x", 120)[119]).toBe("x120");
  });
  it("รวมกรอบที่ทับกัน", () => {
    expect(mergeOverlapping([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }, { x: 50, y: 50, w: 5, h: 5 }])).toHaveLength(2);
  });
  it("เรียงแถว: ต่างความสูงนิดหน่อยยังเป็นแถวเดียว", () => {
    const r = readingOrder([{ x: 50, y: 2, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 40, w: 10, h: 10 }]);
    expect(r.map((b) => b.x + "," + b.y)).toEqual(["0,0", "50,2", "0,40"]);
  });
  it("ตรวจหัวไฟล์", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(vectorFileProblem(enc("%PDF-1.6 ..."), "a.ai")).toBeNull();
    // PostScript (.eps / .ai รุ่นเก่า) เปิดได้แล้ว — แปลงเป็น PDF ก่อน
    expect(vectorFileProblem(enc("%!PS-Adobe-3.0 EPSF-3.0"), "h.eps")).toBeNull();
    expect(isPostScript(enc("%!PS-Adobe-3.0 EPSF-3.0"), "h.eps")).toBe(true);
    expect(isPostScript(enc("%!PS-Adobe-3.0"), "old.ai")).toBe(true);
    expect(isPostScript(new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0]), "x.bin")).toBe(true);
    expect(isPostScript(enc("%PDF-1.6"), "a.ai")).toBe(false);
    expect(vectorFileProblem(enc("<svg"), "a.svg")).toBeNull();
    expect(vectorFileProblem(enc("GIF89a"), "x.pdf")).toMatch(/\.eps/);
  });
  it("สเกลส่งออก: ด้านยาวตามที่เลือก · 300 DPI · เพดาน 4096", () => {
    expect(exportScale({ x: 0, y: 0, w: 100, h: 50 }, 1024)).toBeCloseTo(10.24);
    expect(exportScale({ x: 0, y: 0, w: 72, h: 72 }, "actual")).toBeCloseTo(300 / 72);
    expect(exportScale({ x: 0, y: 0, w: 10, h: 10 }, 2048)).toBeCloseTo(204.8);
    expect(exportScale({ x: 0, y: 0, w: 2000, h: 10 }, "actual")).toBeCloseTo(4096 / 2000);
  });
  it("รู้จักไฟล์ออกแบบ", () => {
    expect(isVectorFile({ name: "h.EPS" })).toBe(true);
    expect(isVectorFile({ name: "x.png", type: "image/png" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildPiece, pieceShapes, type BlockPiece } from "@/lib/block-print";
import { baseItem, cleanLayouts, itemInk } from "@/lib/block-print-layout";
import { cleanSymbolInput, pieceFromSymbol, symbolFromPiece, symbolSvg } from "@/lib/block-print-symbols";

const sq = (id: string, ax: number, ay: number, s: number, fill: "nonzero" | "evenodd" = "nonzero"): BlockPiece =>
  ({ id, name: id, d: [0, 0, 0, 1, s, 0, 1, s, s, 1, 0, s, 4], fill, ow: s, oh: s, w: s, h: s, ax, ay, on: true });

describe("คลังสัญลักษณ์", () => {
  it("ชิ้นรวม → สัญลักษณ์ → ชิ้นใหม่ ได้รูปเดิม ขนาดที่ตั้งไว้ และแยกคืนได้", () => {
    const merged = { ...buildPiece([sq("a", 0, 0, 2, "evenodd"), sq("b", 5, 1, 2)], "m", "หน้ายิ้ม"), w: 14, h: 6 };
    const sym = symbolFromPiece(merged, "ทั่วไป");
    expect(sym).toMatchObject({ name: "หน้ายิ้ม", category: "ทั่วไป", ow: 7, oh: 3, w: 14, h: 6 });
    expect(sym.parts.map((p) => p.fill)).toEqual(["evenodd", "nonzero"]);
    const back = pieceFromSymbol(sym, "s1", 100, 50)!;
    expect(back).toMatchObject({ id: "s1", ow: 7, oh: 3, w: 14, h: 6, ax: 100, ay: 50, name: "หน้ายิ้ม" });
    expect(back.parts).toHaveLength(2);
    expect(pieceShapes(back)[1].d.slice(0, 3)).toEqual([0, 5, 1]);
  });
  it("สัญลักษณ์เส้นเดียว = ชิ้นธรรมดา", () => {
    const p = pieceFromSymbol(symbolFromPiece(sq("x", 3, 3, 4)), "s2", 0, 0)!;
    expect(p.parts).toBeUndefined();
    expect(p).toMatchObject({ id: "s2", ow: 4, oh: 4 });
  });
  it("SVG ตามขนาดที่ใช้บ่อย", () => {
    expect(symbolSvg({ ...symbolFromPiece(sq("x", 0, 0, 4)), w: 8, h: 8 })).toContain('width="8mm" height="8mm"');
  });
  it("ตรวจข้อมูลก่อนบันทึก", () => {
    const ok = cleanSymbolInput(JSON.parse(JSON.stringify(symbolFromPiece(sq("x", 0, 0, 4)))));
    expect(ok.ok).toBe(true);
    expect(cleanSymbolInput({ ...symbolFromPiece(sq("x", 0, 0, 4)), name: " " }).ok).toBe(false);
    expect(cleanSymbolInput({ ...symbolFromPiece(sq("x", 0, 0, 4)), parts: [{ d: [9] }] }).ok).toBe(false);
    expect(cleanSymbolInput({ ...symbolFromPiece(sq("x", 0, 0, 4)), w: 0 }).ok).toBe(false);
  });
  it("สัญลักษณ์ในบล็อก: วาดตามกรอบ · บันทึกผ่านการตรวจ", () => {
    const sym = symbolFromPiece(sq("x", 0, 0, 4));
    const it0 = { ...baseItem("vector", 10, 10, 8, 8), parts: sym.parts, dw: sym.ow, dh: sym.oh, label: "จุด" };
    const ink = itemInk(it0, new Map());
    expect(ink[0].d.slice(0, 6)).toEqual([0, 10, 10, 1, 18, 10]);
    const r = cleanLayouts(JSON.parse(JSON.stringify([{ id: "b", name: "b", w: 30, h: 30, items: [it0] }])));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.layouts[0].items[0]).toMatchObject({ t: "vector", label: "จุด", dw: 4 });
  });
});

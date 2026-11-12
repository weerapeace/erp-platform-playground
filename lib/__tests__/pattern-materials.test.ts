/** Bag CAD รอบ G2: วัสดุ 3 ส่วน + ป้ายสอบเทียบ · ลายผ้าขนาดจริง · ชุดสี · ชั้นโฟม · เดินด้ายทับบนชิ้น */
import { describe, expect, it } from "vitest";
import { PIECE_ROLES, cleanColorways, cleanMatProps, cleanPieceInfo, projectPatternLines, topstitchLines, type ProjectPiece } from "@/lib/pattern-project";
import { buildPatternDxf, patternPieces, shelfLayout } from "@/lib/pattern-sheet";
import { cleanLineShape, type Shape } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });

describe("ค่าของวัสดุ: หน้าตา / ฟิสิกส์ / ผลิต", () => {
  it("เก็บลายผ้า ป้ายสอบเทียบ หน้าผ้า น้ำหนัก หมายเหตุ · ค่าแปลกทิ้ง · เรียบ = ไม่มีลาย", () => {
    const m = cleanMatProps({ a: { stiff: 0.6, thick: 1.2, color: "#112233", cal: true, tex: { kind: "check", size: 2.5, color2: "#FFFFFF" }, roll: 137.4, gsm: 420, note: " ด้านมันออก " } }).a;
    expect(m).toMatchObject({ cal: true, tex: { kind: "check", size: 2.5, color2: "#ffffff" }, roll: 137, gsm: 420, note: "ด้านมันออก" });
    const bad = cleanMatProps({ b: { stiff: 0.6, thick: 1, tex: { kind: "plain", size: 2 }, roll: 2, gsm: 99999, cal: "yes" } }).b;
    expect(bad.tex).toBeUndefined(); expect(bad.roll).toBeUndefined(); expect(bad.gsm).toBeUndefined(); expect(bad.cal).toBeUndefined();
  });
  it("ชุดสี: เก็บชื่อ + สีต่อวัสดุ (hex) · รหัสซ้ำ/ไม่มีชื่อ = ทิ้ง · ไม่เกิน 20 ชุด", () => {
    const cw = cleanColorways([{ id: "a", name: " ดำ-แทน ", colors: { m1: "#AABBCC", m2: "red" } }, { id: "a", name: "ซ้ำ", colors: {} }, { id: "b", name: "", colors: {} }]);
    expect(cw).toEqual([{ id: "a", name: "ดำ-แทน", colors: { m1: "#aabbcc" } }]);
    expect(cleanColorways(Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `ชุด ${i}`, colors: {} })))).toHaveLength(20);
  });
  it("ชั้นโฟมเลือกได้ในชนิดชิ้น", () => {
    expect(PIECE_ROLES.map((r) => r.key)).toContain("foam");
    expect(cleanPieceInfo({ role: "foam" })).toEqual({ role: "foam" });
  });
});

describe("เดินด้ายทับบนชิ้น", () => {
  it("ขอบที่ตั้งเดินด้ายทับ 3 มม. → เส้นห่างเข้าใน 0.3 ซม. · ตะเข็บ 2 แถว → 2 เส้นต่อขอบ", () => {
    const s = R(30, 20);
    expect(topstitchLines(s, "a", [{ top: 3 }, {}, {}, {}])).toEqual([[[0, 0.3], [30, 0.3]]]);
    const seam: Seam = { id: "x", a: { pid: "a", from: 1, count: 1, n: 4 }, b: { pid: "b", from: 3, count: 1, n: 4 }, top: { off: 5, rows: 2, spi: 8 } };
    const L = topstitchLines(s, "a", null, [seam]);
    expect(L).toHaveLength(2); expect(L[0][0][0]).toBeCloseTo(29.5, 3); expect(L[1][0][0]).toBeCloseTo(28.9, 3);
  });
  it("ไปถึงใบพิมพ์ + DXF ชั้น STITCH", () => {
    const p: ProjectPiece = { pid: "a", name: "ตัวหน้า", count: 1, allow: 1, shape: R(30, 20), holes: [], grain: null, notches: [], at: [0, 0], edgeMeta: [{ top: 3 }, {}, {}, {}] };
    const line = projectPatternLines([p])[0];
    expect(cleanLineShape(line.shape)?.stitch).toHaveLength(1);
    const [pp] = patternPieces([line]);
    expect(pp.stitchSegs).toHaveLength(1);
    expect(buildPatternDxf(shelfLayout([pp], 100))).toContain("STITCH");
  });
});

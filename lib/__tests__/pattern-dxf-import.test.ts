import { describe, expect, it } from "vitest";
import { BAG_DEFAULT, bagGeometry, bagPieces } from "@/lib/bag-templates";
import { loopShape, parseDxfPattern } from "@/lib/pattern-dxf-import";
import { cleanProjectPieces, projectPatternLines } from "@/lib/pattern-project";
import { pieceEdges } from "@/lib/pattern-seams";
import { flattenShape, shapeBox, type Pt } from "@/lib/pattern-shape";
import { buildPatternDxf, patternPieces, shelfLayout } from "@/lib/pattern-sheet";

const perim = (P: Pt[]) => P.reduce((s, q, i) => s + Math.hypot(q[0] - P[(i + 1) % P.length][0], q[1] - P[(i + 1) % P.length][1]), 0);
// ตัวช่วยเขียนไฟล์ DXF ตัวอย่าง
const E = (...kv: (string | number)[]) => kv.map(String);
const poly = (layer: string, pts: Pt[], closed = true) => [...E(0, "POLYLINE", 8, layer, 66, 1, 70, closed ? 1 : 0), ...pts.flatMap(([x, y]) => E(0, "VERTEX", 8, layer, 10, x, 20, y)), ...E(0, "SEQEND")];
const line = (layer: string, a: Pt, b: Pt) => E(0, "LINE", 8, layer, 10, a[0], 20, a[1], 11, b[0], 21, b[1]);
const text = (layer: string, s: string, p: Pt = [10, 10]) => E(0, "TEXT", 8, layer, 10, p[0], 20, p[1], 40, 5, 1, s);
const file = (blocks: string[][], ents: string[], header: string[] = []) => [
  ...(header.length ? [...E(0, "SECTION", 2, "HEADER"), ...header, ...E(0, "ENDSEC")] : []),
  ...E(0, "SECTION", 2, "BLOCKS"), ...blocks.flat(), ...E(0, "ENDSEC"),
  ...E(0, "SECTION", 2, "ENTITIES"), ...ents, ...E(0, "ENDSEC", 0, "EOF"),
].join("\r\n");
const block = (name: string, body: string[]) => [...E(0, "BLOCK", 8, 0, 2, name, 10, 0, 20, 0), ...body, ...E(0, "ENDBLK")];
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe("นำเข้า DXF — ไฟล์ที่ระบบนี้ส่งออกเอง (ไป-กลับ)", () => {
  const G = bagGeometry(BAG_DEFAULT);
  const pieces = cleanProjectPieces(bagPieces(G).map((q) => ({ pid: q.key, name: q.name, count: q.count, allow: q.allow, allowEdges: q.allowEdges, shape: q.shape, holes: q.holes, at: q.at })));
  const dxf = buildPatternDxf(shelfLayout(patternPieces(projectPatternLines(pieces)), 140));
  const imp = parseDxfPattern(dxf);
  it("ได้ชิ้นครบ ขนาดสำเร็จตรงกับต้นฉบับ หน่วยอ่านจากหัวไฟล์", () => {
    expect(imp).not.toBeNull();
    expect(imp!.detected).toBe("mm");
    expect(imp!.pieces).toHaveLength(pieces.length);
    const want = pieces.map((p) => { const b = shapeBox(p.shape); return [Math.round(b.w), Math.round(b.h)]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(imp!.pieces.map((p) => [Math.round(p.w), Math.round(p.h)]).sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual(want);
  });
  it("จำนวนตัดอ่านจากป้าย · เผื่อเย็บกลับมาเป็นค่าของชิ้น", () => {
    const want = pieces.map((p) => p.count).sort();
    expect(imp!.pieces.map((p) => p.count).sort()).toEqual(want);
    expect(imp!.pieces.every((p) => p.allow > 0)).toBe(true);
  });
  it("ตัวหน้าทรงโค้งกลับมาเป็นขอบไม่กี่ขอบ (ไม่ใช่จุดย่อยเป็นร้อย) และเส้นรอบรูปยาวเท่าเดิม", () => {
    const src = pieces.find((p) => p.pid === "front")!, got = imp!.pieces.find((p) => Math.round(p.w) === Math.round(shapeBox(src.shape).w) && Math.round(p.h) === Math.round(shapeBox(src.shape).h))!;
    expect(got.edges).toBeLessThanOrEqual(12);
    expect(pieceEdges(got.shape).length).toBe(got.edges);
    expect(Math.abs(perim(flattenShape(got.shape)) - perim(flattenShape(src.shape)))).toBeLessThan(0.6);
  });
  it("ชิ้นสี่เหลี่ยมกลับมาเป็นสี่เหลี่ยม (4 ขอบ)", () => {
    expect(imp!.pieces.some((p) => p.shape.k === "rect")).toBe(true);
  });
});

describe("นำเข้า DXF — แบบโรงงานเสื้อผ้า (1 ชิ้น = 1 บล็อก · ชั้นเป็นตัวเลข)", () => {
  const b1 = block("P1", [
    ...poly("1", rect(0, 0, 320, 220)), ...poly("14", rect(10, 10, 300, 200)),
    ...line("8", [60, 150], [260, 150]), ...E(0, "POINT", 8, "4", 10, 160, 20, 0), ...line("7", [160, 40], [160, 180]),
    ...text("1", "Piece Name: FRONT"), ...text("1", "Quantity: 2"), ...text("1", "Size: M"),
  ]);
  const b2 = block("P2", [...E(0, "LWPOLYLINE", 8, "1", 90, 4, 70, 1, 10, 0, 20, 0, 10, 120, 20, 0, 10, 120, 20, 400, 10, 0, 20, 400), ...text("1", "Piece Name: GUSSET")]);
  const dxf = file([b1, b2], [...E(0, "INSERT", 8, 0, 2, "P1", 10, 0, 20, 0), ...E(0, "INSERT", 8, 0, 2, "P2", 10, 400, 20, 0)]);
  const imp = parseDxfPattern(dxf)!;
  it("ชื่อชิ้น จำนวนตัด เส้นเย็บ เผื่อเย็บ", () => {
    expect(imp.detected).toBeNull();                 // ไม่มีหน่วยในหัวไฟล์ → ใช้ มม.
    expect(imp.unit).toBe("mm");
    const front = imp.pieces.find((p) => p.name === "FRONT")!, gus = imp.pieces.find((p) => p.name === "GUSSET")!;
    expect(front).toMatchObject({ count: 2, w: 30, h: 20, allow: 1 });
    expect(front.shape).toMatchObject({ k: "rect", w: 30, h: 20 });
    expect(gus).toMatchObject({ count: 1, w: 12, h: 40, allow: 0 });
    expect(gus.at[0]).toBeGreaterThan(front.at[0] + 30);          // ตำแหน่งที่วางในไฟล์ยังอยู่
  });
  it("เส้นใน รอยบาก เส้นทางผ้า มาพร้อมชิ้น และอยู่ในตำแหน่งเดียวกับชิ้น", () => {
    const front = imp.pieces.find((p) => p.name === "FRONT")!, b = shapeBox(front.shape);
    expect(front.inner).toHaveLength(1);
    expect(front.inner[0].pts.map((q) => [q[0] - b.x, q[1] - b.y])).toEqual([[5, 6], [25, 6]]);   // y กลับด้าน: เส้นเย็บบนสุดอยู่ที่ 210 มม. เส้นในที่ 150 มม. = ต่ำจากขอบบน 6 ซม.
    expect(front.notches).toHaveLength(1);
    expect(front.notches[0][1] - b.y).toBeCloseTo(20, 3);                                       // รอยบากที่ขอบล่าง ถูกดึงมาอยู่บนเส้นเย็บ
    expect(front.grain).not.toBeNull();
    expect(Math.abs(front.grain![0][1] - front.grain![1][1])).toBeCloseTo(14, 3);
  });
  it("เปลี่ยนหน่วยเป็นนิ้ว = ขนาดคูณ 25.4 เท่าของ มม.", () => {
    const inch = parseDxfPattern(dxf, "inch")!;
    expect(inch.pieces.find((p) => p.name === "GUSSET")!.w).toBeCloseTo(12 * 25.4, 0);
  });
  it("ไฟล์ที่มีแต่บล็อก (ไม่ได้วาง) = เรียงชิ้นต่อกัน ไม่ซ้อนกัน", () => {
    const only = parseDxfPattern(file([b1, b2], []))!;
    expect(only.pieces).toHaveLength(2);
    const [a, c] = [...only.pieces].sort((p, q) => p.at[0] - q.at[0]);
    expect(c.at[0]).toBeGreaterThanOrEqual(a.at[0] + a.w + 2);
  });
});

describe("นำเข้า DXF — เส้นและกรณีขอบ", () => {
  it("เส้นสั้น ๆ ที่ปลายชนกัน ถูกต่อเป็นวงปิด · วงข้างในเล็ก ๆ = รูเจาะ · เส้นเปิดข้างใน = เส้นใน", () => {
    const o = rect(0, 0, 200, 100), h = rect(80, 30, 40, 20);
    const segs = (P: Pt[]) => P.flatMap((a, i) => line("0", a, P[(i + 1) % P.length]));
    const imp = parseDxfPattern(file([], [...segs(o), ...segs(h), ...line("0", [20, 80], [60, 80])]))!;
    expect(imp.pieces).toHaveLength(1);
    expect(imp.pieces[0]).toMatchObject({ w: 20, h: 10, allow: 0 });
    expect(imp.pieces[0].holes).toHaveLength(1);
    expect(imp.pieces[0].inner).toHaveLength(1);
  });
  it("วงข้างในที่ใหญ่เกือบเท่าเส้นตัด (ชั้นเดียวกัน) = เส้นเย็บ ไม่ใช่รู", () => {
    const imp = parseDxfPattern(file([], [...poly("0", rect(0, 0, 220, 120)), ...poly("0", rect(10, 10, 200, 100))]))!;
    expect(imp.pieces[0]).toMatchObject({ w: 20, h: 10, allow: 1 });
    expect(imp.pieces[0].holes).toHaveLength(0);
  });
  it("วงกลมที่เก็บเป็นจุดถี่ ๆ = ขอบโค้ง 4 ขอบ เส้นรอบวงยาวเท่าเดิม", () => {
    const P: Pt[] = Array.from({ length: 72 }, (_, i) => [10 + 10 * Math.cos((i * Math.PI) / 36), 10 + 10 * Math.sin((i * Math.PI) / 36)]);
    const s = loopShape(P)!;
    expect(s.k === "path" && s.nodes.length).toBe(4);
    expect(Math.abs(perim(flattenShape(s)) - 2 * Math.PI * 10)).toBeLessThan(0.2);
  });
  it("สี่เหลี่ยมมุมมน = ขอบตรง 4 + ขอบโค้ง 4 (มุมถูกแยกจากเส้นโค้ง)", () => {
    const arc = (cx: number, cy: number, a0: number): Pt[] => Array.from({ length: 9 }, (_, i) => [cx + 3 * Math.cos(a0 + (i * Math.PI) / 16), cy + 3 * Math.sin(a0 + (i * Math.PI) / 16)]);
    const P: Pt[] = [...arc(27, 17, 0), ...arc(3, 17, Math.PI / 2), ...arc(3, 3, Math.PI), ...arc(27, 3, (3 * Math.PI) / 2)];
    const s = loopShape(P)!;
    expect(s.k === "path" && s.nodes.length).toBeLessThanOrEqual(8);
    expect(shapeBox(s)).toMatchObject({ x: 0, y: 0 });
    expect(Math.abs(perim(flattenShape(s)) - (2 * 24 + 2 * 14 + 2 * Math.PI * 3))).toBeLessThan(0.3);
  });
  it("ไม่ใช่ไฟล์ DXF / ไม่มีวงปิด = อ่านไม่ได้", () => {
    expect(parseDxfPattern("<svg></svg>")).toBeNull();
    expect(parseDxfPattern(file([], line("0", [0, 0], [10, 0])))).toBeNull();
  });
  it("มีเส้น SPLINE = แจ้งว่ารูปใกล้เคียง", () => {
    const sp = E(0, "SPLINE", 8, "0", 70, 1, 10, 0, 20, 0, 10, 100, 20, 0, 10, 100, 20, 100, 10, 0, 20, 100);
    expect(parseDxfPattern(file([], sp))!.notes).toContain("spline");
  });
});

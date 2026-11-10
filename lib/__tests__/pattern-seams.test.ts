import { describe, expect, it } from "vitest";
import { BAG_DEFAULT, BAG_PRESETS, bagGeometry, bagPieces, bagSeamRefs } from "@/lib/bag-templates";
import { checkSeam, cleanSeams, extendSide, pieceEdges, seamLabel, sideHasEdge, sideLength, sidePoints, type Seam } from "@/lib/pattern-seams";
import { cleanProjectPatch, cleanProjectPieces, projectSummary, projectThumb, type ProjectPiece } from "@/lib/pattern-project";
import { shapePerimeter, type Shape } from "@/lib/pattern-shape";

const close = (a: number, b: number, eps = 0.02) => expect(Math.abs(a - b)).toBeLessThan(eps);
const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });

describe("ขอบของชิ้น (pieceEdges)", () => {
  it("สี่เหลี่ยม = 4 ขอบ บน ขวา ล่าง ซ้าย · รวมกัน = รอบรูป", () => {
    const E = pieceEdges(R(30, 12));
    expect(E.map((e) => e.len)).toEqual([30, 12, 30, 12]);
    expect(E[0].pts).toEqual([[0, 0], [30, 0]]);
    expect(E[2].pts).toEqual([[30, 12], [0, 12]]);
  });
  it("วงกลม = 1 ขอบทั้งรอบ · รูปจากปากกา = ขอบละช่วง รวมกัน = รอบรูป", () => {
    const c: Shape = { k: "ellipse", x: 0, y: 0, w: 10, h: 10 };
    expect(pieceEdges(c)).toHaveLength(1);
    close(pieceEdges(c)[0].len, shapePerimeter(c), 0.01);
    const front = bagPieces(bagGeometry(BAG_DEFAULT))[0].shape;
    const E = pieceEdges(front);
    expect(E).toHaveLength(6);                                // ข้าง โค้ง ก้น โค้ง ข้าง ปาก
    close(E.reduce((s, e) => s + e.len, 0), shapePerimeter(front), 0.01);
  });
});

describe("ด้านของตะเข็บ", () => {
  it("หลายขอบติดกันต่อเป็นเส้นเดียว · วนรอบรูปได้", () => {
    const s = R(30, 12);
    close(sideLength(s, { pid: "p", from: 0, count: 2, n: 4 })!, 42, 1e-9);
    close(sideLength(s, { pid: "p", from: 3, count: 2, n: 4 })!, 42, 1e-9);      // ซ้าย → บน
    expect(sidePoints(s, { pid: "p", from: 3, count: 2, n: 4 })).toEqual([[0, 12], [0, 0], [30, 0]]);
  });
  it("จำนวนขอบเปลี่ยน / ลำดับเกิน = ใช้ไม่ได้ (null) ไม่เดาให้", () => {
    expect(sideLength(R(30, 12), { pid: "p", from: 0, count: 1, n: 6 })).toBeNull();
    expect(sideLength(R(30, 12), { pid: "p", from: 4, count: 1, n: 4 })).toBeNull();
    expect(sideLength(R(30, 12), { pid: "p", from: 0, count: 5, n: 4 })).toBeNull();
  });
  it("ต่อขอบได้เฉพาะขอบที่ติดกับปลาย", () => {
    const side = { pid: "p", from: 1, count: 1, n: 6 };
    expect(extendSide(side, 2)).toEqual({ pid: "p", from: 1, count: 2, n: 6 });
    expect(extendSide(side, 0)).toEqual({ pid: "p", from: 0, count: 2, n: 6 });
    expect(extendSide(side, 4)).toBeNull();
    expect(extendSide(side, 1)).toBeNull();
    expect(sideHasEdge({ pid: "p", from: 5, count: 2, n: 6 }, 0)).toBe(true);
  });
});

describe("ตรวจตะเข็บ (checkSeam)", () => {
  const seam = (a: [string, number], b: [string, number]): Seam => ({ id: "s1", a: { pid: a[0], from: a[1], count: 1, n: 4 }, b: { pid: b[0], from: b[1], count: 1, n: 4 } });
  it("ยาวเท่ากัน = ok · ต่างกัน = mismatch พร้อมส่วนต่าง · ชิ้นหาย = broken", () => {
    const shapes = { a: R(15, 5), b: R(18, 5), c: R(15, 9) };
    expect(checkSeam(shapes, seam(["a", 0], ["c", 2])).status).toBe("ok");
    const bad = checkSeam(shapes, seam(["a", 0], ["b", 0]));
    expect(bad.status).toBe("mismatch");
    close(bad.diff, 3, 1e-9);
    expect(checkSeam(shapes, seam(["a", 0], ["zz", 0])).status).toBe("broken");
  });
  it("ตะเข็บจากแม่แบบทุกแบบ ยาวเท่ากันทุกคู่ (รวมปากบานมาก · ก้นเหลี่ยม · ช่องโชว์)", () => {
    const cases = [...BAG_PRESETS.map((p) => p.params), { flare: 8, H: 14, r: 0 }, { flare: 8, H: 14, r: 3, hem: 5, sa: 0.5 }, { flare: 0, hem: 0 }, { r: 0, strip: false, flare: 6, win: "rect" as const }];
    for (const c of cases) {
      const G = bagGeometry({ ...BAG_DEFAULT, ...c }), pieces = bagPieces(G), refs = bagSeamRefs(G);
      const shapes: Record<string, Shape> = Object.fromEntries(pieces.map((q) => [q.key, q.shape]));
      expect(refs.length).toBeGreaterThan(0);
      refs.forEach((r, i) => {
        const chk = checkSeam(shapes, { id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } });
        expect(`${JSON.stringify(c)} ${r.key}${i} ${chk.status} ${chk.diff.toFixed(3)}`).toBe(`${JSON.stringify(c)} ${r.key}${i} ok ${chk.diff.toFixed(3)}`);
      });
    }
  });
  it("ชื่อตะเข็บ A…Z, AA", () => {
    expect([0, 1, 25, 26, 27].map(seamLabel)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
  it("cleanSeams: ทิ้งตะเข็บที่ชี้ชิ้นที่ไม่มี / รูปแบบผิด / รหัสซ้ำ", () => {
    const ok = { id: "s1", a: { pid: "a", from: 0, count: 1, n: 4 }, b: { pid: "b", from: 2, count: 1, n: 4 } };
    const out = cleanSeams([ok, { ...ok }, { ...ok, id: "s2", b: { pid: "gone", from: 0, count: 1, n: 4 } }, { ...ok, id: "s3", a: { pid: "a", from: 9, count: 1, n: 4 } }, "x", null], new Set(["a", "b"]));
    expect(out).toEqual([ok]);
  });
});

describe("แพทเทิร์น 1 ใบ (pattern-project)", () => {
  const piece = (pid: string, w: number, h: number, extra: Partial<ProjectPiece> = {}): ProjectPiece => ({ pid, name: "ชิ้น", count: 1, allow: 1, shape: R(w, h), holes: [], grain: null, notches: [], at: [0, 0], ...extra });
  it("cleanProjectPieces: รูปผิด / รหัสซ้ำ = ทิ้ง · ค่าแปลก = ปรับ", () => {
    const out = cleanProjectPieces([piece("a", 10, 10), piece("a", 5, 5), { pid: "b", shape: { k: "rect", x: 0, y: 0, w: -1, h: 5 } }, piece("c", 4, 4, { count: 0, allow: 99 }), 7]);
    expect(out.map((p) => p.pid)).toEqual(["a", "c"]);
    expect(out[1].count).toBe(1);
    expect(out[1].allow).toBe(20);
  });
  it("projectSummary: จำนวนชิ้นรวมจำนวนตัด · พื้นที่ตัดรวมเผื่อเย็บ", () => {
    const s = projectSummary([piece("a", 10, 10, { count: 2 }), piece("b", 20, 5)]);
    expect(s.pieceCount).toBe(3);
    close(s.areaCm2, 12 * 12 * 2 + 22 * 7, 1e-6);
  });
  it("projectThumb: ได้ขนาด + เส้น · ไม่มีชิ้น = null", () => {
    expect(projectThumb([])).toBeNull();
    const t = projectThumb([piece("a", 10, 10)])!;
    expect(t.startsWith("12 12|M")).toBe(true);
  });
  it("cleanProjectPatch: ชื่อว่าง = ไม่ผ่าน · ชิ้นผิดรูป = ไม่ผ่าน · ตะเข็บตรวจกับชิ้นชุดใหม่", () => {
    expect(cleanProjectPatch({ name: "  " }, []).error).toBeTruthy();
    expect(cleanProjectPatch({ pieces: [{ pid: "x" }] }, []).error).toBeTruthy();
    const seam = { id: "s1", a: { pid: "a", from: 0, count: 1, n: 4 }, b: { pid: "b", from: 0, count: 1, n: 4 } };
    const r = cleanProjectPatch({ name: "Tote", pieces: [piece("a", 10, 10)], seams: [seam], status: "ready" }, []);
    expect(r.error).toBeNull();
    expect(r.patch.seams).toEqual([]);                        // ชิ้น b ไม่มี → ตะเข็บทิ้ง
    expect(r.patch.status).toBe("ready");
    expect(cleanProjectPatch({ status: "zzz" }, []).error).toBeTruthy();
  });
  it("ชิ้นจากแม่แบบทุกแบบ (โค้ง · รูหัวใจ · รอยบาก) ผ่านตัวตรวจก่อนบันทึกครบทุกชิ้น ไม่มีอะไรหาย", () => {
    for (const preset of BAG_PRESETS) {
      const list = bagPieces(bagGeometry({ ...BAG_DEFAULT, ...preset.params }));
      const sent = list.map((q, i) => ({ pid: `pc${i}`, name: q.name, count: q.count, allow: q.allow, allowEdges: q.allowEdges, shape: q.shape, holes: q.holes, grain: q.grain, notches: q.notches, at: q.at }));
      const r = cleanProjectPatch({ pieces: JSON.parse(JSON.stringify(sent)), seams: [] }, []);
      expect(r.error).toBeNull();
      expect(r.patch.pieces).toHaveLength(list.length);
      r.patch.pieces!.forEach((p, i) => {
        expect(p.holes).toHaveLength(list[i].holes.length);
        expect(p.notches).toHaveLength(list[i].notches.length);
        expect(p.allowEdges ?? null).toEqual(list[i].allowEdges);
        expect(pieceEdges(p.shape)).toHaveLength(pieceEdges(list[i].shape).length);
      });
    }
  });
});

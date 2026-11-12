import { describe, expect, it } from "vitest";
import { MAT_PRESETS, cleanMatProps, cleanPieceInfo, cleanProjectPatch, cleanProjectPieces, pieceStiffness, projectPatternLines, projectPieceRows } from "@/lib/pattern-project";
import { patternPieces } from "@/lib/pattern-sheet";
import { BAG_DEFAULT, bagAttachRefs, bagGeometry, bagPieces, bagSeamRefs } from "@/lib/bag-templates";
import { assemble, type AssemblyOk } from "@/lib/pattern-assembly";
import { movePiece, type Shape } from "@/lib/pattern-shape";
import { buildSimMesh, createBagSim } from "@/lib/pattern-sim";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });

describe("ค่าของชิ้น (รหัส · ชนิด · แผ่นเสริม · ปาดขอบ · แข็งอยู่ทรง)", () => {
  it("cleanPieceInfo เก็บค่าที่ถูกรูปแบบ · ค่าแปลก/ว่างทั้งหมด = ไม่มี", () => {
    expect(cleanPieceInfo({ code: " FR-01 ", role: "body", bond: "fusible", skive: 8.04, solid: true })).toEqual({ code: "FR-01", role: "body", bond: "fusible", skive: 8, solid: true });
    expect(cleanPieceInfo({ code: "", role: "robot", bond: "glue", skive: 999, solid: "yes" })).toBeNull();
    expect(cleanPieceInfo(null)).toBeNull();
  });
  it("แพทเทิร์นในแอป: เก็บค่าของชิ้น · รหัสชิ้นออกในหมายเหตุของตารางชิ้น · มีแถวรายละเอียดชิ้นให้ใบพิมพ์", () => {
    const pieces = cleanProjectPieces([
      { pid: "a", name: "ตัวหน้า", shape: R(30, 20), info: { code: "FR-01", role: "body", bond: "board", skive: 8, solid: true } },
      { pid: "b", name: "ซับใน", shape: R(30, 20), info: { nothing: 1 } },
    ]);
    expect(pieces[0].info).toEqual({ code: "FR-01", role: "body", bond: "board", skive: 8, solid: true });
    expect(pieces[1].info).toBeUndefined();
    expect(patternPieces(projectPatternLines(pieces)).map((p) => p.note)).toEqual(["FR-01", null]);
    expect(projectPieceRows(pieces)).toEqual([{ piece: "ตัวหน้า", code: "FR-01", role: "ตัวกระเป๋า", bond: "กระดาษแข็ง / แผ่นรอง", skive: 8, solid: true, cut: "" }]);
  });
});

describe("ค่าของวัสดุ + ความอยู่ทรงของชิ้น", () => {
  it("cleanMatProps: บีบค่าเข้าขอบเขต · สีต้องเป็นรหัสสี 6 หลัก · รายการที่ไม่ครบถูกทิ้ง", () => {
    expect(cleanMatProps({ m1: { preset: "pu", stiff: 0.7, thick: 1.2, color: "#AABBCC" }, m2: { stiff: 9, thick: 0, preset: "nope", color: "red" }, m3: { stiff: "x" }, m4: 5 }))
      .toEqual({ m1: { preset: "pu", stiff: 0.7, thick: 1.2, color: "#aabbcc" }, m2: { stiff: 1, thick: 0.1 } });
    expect(cleanMatProps([1, 2])).toEqual({});
    expect(MAT_PRESETS.every((p) => p.stiff >= 0 && p.stiff <= 1 && p.thick > 0)).toBe(true);
  });
  it("pieceStiffness: แข็งอยู่ทรง = 1 · ไม่งั้นใช้ค่าวัสดุ (ไม่มี = ค่ากลาง) แล้วบวกแผ่นเสริม", () => {
    const props = { m1: { stiff: 0.3, thick: 0.5 } };
    const base = { pid: "a", name: "", count: 1, allow: 0, shape: R(10, 10), holes: [], grain: null, notches: [], at: [0, 0] as [number, number] };
    expect(pieceStiffness(base, props, 0.5)).toMatchObject({ s: 0.5 });
    expect(pieceStiffness({ ...base, mats: [{ id: "m1", name: "ไนลอน" }] }, props, 0.5)).toEqual({ s: 0.3, why: "วัสดุ ไนลอน" });
    expect(pieceStiffness({ ...base, mats: [{ id: "m1", name: "ไนลอน" }], info: { bond: "fusible" } }, props, 0.5).s).toBe(0.5);
    expect(pieceStiffness({ ...base, mats: [{ id: "m1", name: "ไนลอน" }], info: { bond: "board" } }, props, 0.5).s).toBe(0.9);
    expect(pieceStiffness({ ...base, info: { bond: "foam" } }, props, 0.2).s).toBe(0.5);
    expect(pieceStiffness({ ...base, mats: [{ id: "m1", name: "ไนลอน" }], info: { solid: true } }, props, 0.5)).toEqual({ s: 1, why: "ตั้งให้แข็งอยู่ทรง" });
  });
  it("บันทึกแพทเทิร์น: ช่อง template รับค่าวัสดุ + จุดติด + เป้าหมายตีราคาได้ (ไม่ถูกตัดเพราะยาว)", () => {
    const matProps = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`11111111-1111-1111-1111-${String(i).padStart(12, "0")}`, { preset: "pu", stiff: 0.7, thick: 1.2, color: "#aabbcc" }]));
    const { patch, error } = cleanProjectPatch({ template: { matProps, attach: [], costing: { sheet_id: "x" } } }, []);
    expect(error).toBeNull();
    expect(Object.keys((patch.template as { matProps: object }).matProps)).toHaveLength(30);
  });
});

describe("ตัวจำลอง: ความอยู่ทรงรายชิ้น", () => {
  const G = bagGeometry(BAG_DEFAULT), list = bagPieces(G);
  const pieces = list.map((q) => { const m = movePiece({ shape: q.shape, holes: q.holes }, q.at[0], q.at[1]); return { pid: q.key, name: q.name, count: q.count, shape: m.shape, holes: m.holes }; });
  const seams = bagSeamRefs(G).map((r, i) => ({ id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } }));
  const A = assemble(pieces, seams, bagAttachRefs(G).map((r, i) => ({ id: `a${i}`, kind: r.kind, pid: r.piece, on: r.on, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail }))) as AssemblyOk;
  const M = buildSimMesh(A, 3);
  const run = (sim: ReturnType<typeof createBagSim>) => { let i = 0; while (sim.advance(10) && i++ < 200); return sim; };
  it("ตาข่ายรู้ว่าจุดไหนเป็นของชิ้นไหน", () => {
    expect([...M.pids].sort()).toEqual(["front", "strip"]);
    expect(M.vpid.length).toBe(M.n);
    expect(new Set(M.vpid)).toEqual(new Set([0, 1]));
  });
  it("ตัวหน้า/หลังแข็ง ชิ้นข้างนิ่ม → ทรุดน้อยกว่านิ่มทั้งใบ · ทุกชิ้นแข็ง = ไม่ขยับ", () => {
    const allSoft = run(createBagSim(M, { stiffness: 0.15, fill: 0 }));
    const mixed = run(createBagSim(M, { stiffness: 0.15, fill: 0, perPiece: { front: 1 } }));
    const allFirm = run(createBagSim(M, { stiffness: 0.15, fill: 0, perPiece: { front: 1, strip: 1 } }));
    expect(mixed.height()).toBeGreaterThan(allSoft.height() + 1);
    expect(M.height - mixed.height()).toBeLessThan(0.5);        // แผ่นหน้า/หลังแข็ง → ความสูงแทบไม่ลด
    let d = 0; for (let i = 0; i < M.n * 3; i++) d = Math.max(d, Math.abs(allFirm.pos[i] - M.rest[i]));
    expect(d).toBeLessThan(1e-4);
    const sim = createBagSim(M, { stiffness: 1, fill: 0 });
    sim.setParams({ stiffness: 1, fill: 0, perPiece: { front: 0.1, strip: 0.1 } });   // เปลี่ยนค่าทีหลังก็มีผล
    expect(run(sim).height()).toBeLessThan(M.height - 1.5);
  });
});

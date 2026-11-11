import { describe, expect, it } from "vitest";
import { BAG_DEFAULT, bagAttachRefs, bagGeometry, bagPieces, bagSeamRefs } from "@/lib/bag-templates";
import { assemble, type AsmPiece } from "@/lib/pattern-assembly";
import { freeEdges, liningPlan, pocketPlan, POCKET_HEM } from "@/lib/pattern-lining";
import { cleanProjectPieces, projectPatternLines, projectSeamRows } from "@/lib/pattern-project";
import { checkSeam, cleanSeams, edgeBusy, isPartialSeam, sideLength, sidePoints, type Seam } from "@/lib/pattern-seams";
import { buildSewn, isSewnExtra, type SewnPart } from "@/lib/pattern-sewn";
import { cleanInnerLines, flipPiece, movePiece, rotatePiece, shapeBox, type InnerLine, type Shape } from "@/lib/pattern-shape";
import { buildPatternDxf, patternPieces, shelfLayout } from "@/lib/pattern-sheet";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const box = (p: SewnPart) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], p.pos[i]); hi[i % 3] = Math.max(hi[i % 3], p.pos[i]); }
  return { lo, hi };
};

describe("เส้นในชิ้น", () => {
  const U: InnerLine = { id: "u1", kind: "sew", pts: [[20, 9], [20, 20], [8, 20], [8, 9]], name: "ช่องใส่ของ" };
  it("cleanInnerLines เก็บเส้นที่ถูกรูปแบบ · ชนิดแปลก / จุดเดียว / รหัสซ้ำ = ทิ้ง", () => {
    expect(cleanInnerLines([U, { id: "u1", kind: "sew", pts: [[0, 0], [1, 1]] }, { id: "x", kind: "nope", pts: [[0, 0], [1, 1]] }, { id: "y", kind: "slit", pts: [[0, 0]] }, 5])).toEqual([U]);
    expect(cleanInnerLines(null)).toEqual([]);
  });
  it("ย้าย / หมุน / กลับด้านชิ้น เส้นในไปตามชิ้น", () => {
    const p = { shape: R(0, 0, 28, 26), holes: [], inner: [U] };
    expect(movePiece(p, 5, 3).inner?.[0].pts[0]).toEqual([25, 12]);
    expect(flipPiece(p, "x").inner?.[0].pts[0]).toEqual([8, 9]);                 // กลับซ้ายขวารอบกึ่งกลาง x = 14
    const r = rotatePiece(p, 90).inner?.[0].pts ?? [];
    expect(r).toHaveLength(4);
    expect(Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1])).toBeCloseTo(11);    // ความยาวของช่วงเท่าเดิม
  });
  it("บันทึกแพทเทิร์น: เก็บเส้นในของชิ้น · ออกในใบพิมพ์และไฟล์ตัดเป็นชั้น INNER", () => {
    const pieces = cleanProjectPieces([{ pid: "a", name: "ซับในหลัง", shape: R(10, 10, 28, 26), inner: [{ ...U, pts: U.pts.map(([x, y]) => [x + 10, y + 10]) }, { id: "bad", kind: "sew", pts: [] }] }]);
    expect(pieces[0].inner).toHaveLength(1);
    const pp = patternPieces(projectPatternLines(pieces));
    expect(pp[0].innerSegs?.[0][0]).toEqual([20, 9]);                            // ย้ายมาอยู่ในกรอบของชิ้น (มุมซ้ายบน = 0,0)
    expect(pp[0].innerD).toContain("M20 9");
    const dxf = buildPatternDxf(shelfLayout(pp, 140));
    expect((dxf.match(/\nINNER\n/g) ?? []).length).toBe(3);                      // 3 ช่วงของเส้นรูปตัว U
  });
});

describe("เย็บกับเส้นในชิ้น", () => {
  const host = { shape: R(0, 0, 28, 26), inner: [{ id: "u1", kind: "sew" as const, pts: [[20, 9], [20, 20], [8, 20], [8, 9]] as [number, number][] }] };
  const pocket = R(40, 0, 12, 11);
  const seam: Seam = { id: "s", a: { pid: "h", from: 0, count: 1, n: 1, inner: "u1" }, b: { pid: "p", from: 1, count: 3, n: 4 } };
  it("ด้านบนเส้นใน = ทั้งเส้น · ยาวเท่ากับ 3 ขอบของชิ้นปะ", () => {
    expect(sidePoints(host, seam.a)).toEqual(host.inner[0].pts);
    expect(sideLength(host, seam.a)).toBeCloseTo(34);
    expect(checkSeam({ h: host, p: pocket }, seam)).toMatchObject({ status: "ok", la: 34, lb: 34 });
  });
  it("ส่งแค่รูปชิ้น (ไม่มีเส้นใน) หรือเส้นถูกลบ = ต้องเย็บใหม่", () => {
    expect(checkSeam({ h: host.shape, p: pocket }, seam).status).toBe("broken");
    expect(checkSeam({ h: { shape: host.shape, inner: [] }, p: pocket }, seam).status).toBe("broken");
  });
  it("ด้านบนเส้นในไม่กินขอบของชิ้น และนับเป็นตะเข็บบางช่วง (ไม่ใช้หาทรงกระเป๋า)", () => {
    expect(edgeBusy([seam], "h", 0, 1, 28)).toEqual([]);
    expect(isPartialSeam(seam)).toBe(true);
    expect(cleanSeams([seam], new Set(["h", "p"]))[0].a).toEqual({ pid: "h", from: 0, count: 1, n: 1, inner: "u1" });
  });
  it("ตารางตะเข็บของใบพิมพ์เรียกด้านนั้นว่าเส้นใน", () => {
    const mk = (pid: string, name: string, shape: Shape, inner?: InnerLine[]) => ({ pid, name, count: 1, allow: 0, shape, holes: [], grain: null, notches: [], at: [0, 0] as [number, number], ...(inner ? { inner } : {}) });
    const rows = projectSeamRows([mk("h", "ซับในหลัง", host.shape, [{ ...host.inner[0], name: "ช่องใส่ของ" }]), mk("p", "ช่องใส่ของ", pocket)], [seam]);
    expect(rows[0]).toMatchObject({ a: "ซับในหลัง · เส้นใน ช่องใส่ของ", status: "ok" });
  });
});

describe("ตัวช่วยเพิ่มช่อง (pocketPlan)", () => {
  const host = shapeBox(R(10, 40, 28, 26));
  it("ช่องใส่ของ: เส้นในรูปตัว U กึ่งกลางชิ้น + ชิ้นปะที่ขอบบนพับ + เย็บ 3 ขอบ ยาวเท่าเส้นใน", () => {
    const pl = pocketPlan(host, { kind: "patch", w: 18, depth: 11, top: 9 }, "t");
    expect(pl.line).toMatchObject({ kind: "sew", pts: [[33, 49], [33, 60], [15, 60], [15, 49]] });
    expect(pl.piece.shape).toEqual({ k: "rect", x: 0, y: 0, w: 18, h: 11 });
    expect(pl.piece.allowEdges).toEqual([POCKET_HEM, 0, 0, 0]);
    expect(pl.piece.foldEdges).toEqual([1, 0, 0, 0]);
    const seam: Seam = { id: "s", a: { pid: "h", from: 0, count: 1, n: 1, inner: pl.line.id }, b: { pid: "p", ...pl.side } };
    expect(checkSeam({ h: { shape: R(10, 40, 28, 26), inner: [pl.line] }, p: pl.piece.shape }, seam)).toMatchObject({ status: "ok", la: 40, lb: 40 });
    expect(pl.warnings).toEqual([]);
  });
  it("ช่องซิป: ช่องเจาะยาวเท่าซิป + ถุงกว้างกว่าข้างละ 1 ยาว 2 เท่า มีแนวพับครึ่ง + เย็บช่วงกลางขอบบนของถุง", () => {
    const pl = pocketPlan(host, { kind: "zip", w: 16, depth: 12, top: 4 }, "t");
    expect(pl.line).toMatchObject({ kind: "slit", pts: [[16, 44], [32, 44]] });
    expect(pl.piece.shape).toEqual({ k: "rect", x: 0, y: 0, w: 18, h: 24 });
    expect(pl.piece.inner?.[0]).toMatchObject({ kind: "fold", pts: [[0, 12], [18, 12]] });
    expect(pl.side).toEqual({ from: 0, count: 1, n: 4, t0: 1, t1: 17 });
  });
  it("เตือนเมื่อกว้างเกินชิ้น หรือยาวเลยก้น", () => {
    expect(pocketPlan(host, { kind: "patch", w: 30, depth: 11, top: 9 }, "t").warnings).toEqual(["too-wide"]);
    expect(pocketPlan(host, { kind: "patch", w: 18, depth: 20, top: 9 }, "t").warnings).toEqual(["past-bottom"]);
  });
});

describe("ซับใน: สร้างจากตัวนอก + ภาพเย็บติด", () => {
  const G = bagGeometry(BAG_DEFAULT), list = bagPieces(G);
  const outer: AsmPiece[] = list.map((q) => { const m = movePiece({ shape: q.shape, holes: q.holes }, q.at[0], q.at[1]); return { pid: q.key as string, name: q.name, count: q.count, shape: m.shape, holes: m.holes }; });
  const seams: Seam[] = bagSeamRefs(G).map((r, i) => ({ id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } }));
  const att = bagAttachRefs(G).map((r, i) => ({ id: `a${i}`, kind: r.kind, pid: r.piece as string, on: r.on as string, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail }));
  const A = assemble(outer, seams, att);
  if (!A.ok) throw new Error("แม่แบบต้องประกอบได้");
  const body = [...new Set([A.front, A.back, ...A.bridges])];
  const plan = liningPlan(outer, seams, body, "t");
  const lining: AsmPiece[] = body.map((pid) => { const p = outer.find((x) => x.pid === pid)!, m = movePiece({ shape: p.shape, holes: p.holes }, 0, plan.dy); return { pid: plan.map[pid], name: `ซับใน ${p.name}`, count: p.count, shape: m.shape, holes: m.holes, layer: "lining" as const }; });
  const all = [...outer, ...lining], allSeams = [...seams, ...plan.seams];

  it("liningPlan: คัดลอกเฉพาะชิ้นตัวกระเป๋า พร้อมตะเข็บชุดเดียวกัน วางใต้ชิ้นทั้งหมด", () => {
    expect(Object.keys(plan.map).sort()).toEqual([...body].sort());
    expect(plan.seams).toHaveLength(seams.filter((s) => body.includes(s.a.pid) && body.includes(s.b.pid)).length);
    expect(plan.seams.every((s) => Object.values(plan.map).includes(s.a.pid) && Object.values(plan.map).includes(s.b.pid))).toBe(true);
    const bottom = Math.max(...outer.map((p) => { const b = shapeBox(p.shape); return b.y + b.h; })), top = Math.min(...lining.map((p) => shapeBox(p.shape).y));
    expect(top).toBeGreaterThan(bottom);
  });
  it("ชั้นซับในประกอบแยกจากตัวนอก · ตัวนอกไม่ถูกรบกวน", () => {
    const A2 = assemble(all, allSeams, att), L = assemble(all, allSeams, [], "lining");
    expect(A2).toMatchObject({ ok: true, front: A.front, depth: A.depth });
    expect(A2.ok && A2.loose.some((pid) => Object.values(plan.map).includes(pid))).toBe(false);   // ชิ้นซับในไม่อยู่ในรายการของตัวนอกเลย
    expect(L).toMatchObject({ ok: true, depth: A.depth, front: plan.map[A.front] });
  });
  it("ภาพเย็บติด: มีซับในซ้อนข้างใน · ช่องใส่ของแนบผิวซับในหลังด้านในกระเป๋า · ถุงช่องซิปอยู่หลังซับในและพับครึ่ง", () => {
    const hostPid = plan.map[A.back], host = lining.find((p) => p.pid === hostPid)!, hb = shapeBox(host.shape);
    const pk = pocketPlan(hb, { kind: "patch", w: 14, depth: 9, top: 10 }, "p"), zp = pocketPlan(hb, { kind: "zip", w: 14, depth: 10, top: 4 }, "z");
    const withLines = all.map((p) => (p.pid === hostPid ? { ...p, inner: [pk.line, zp.line] } : p));
    const extra: AsmPiece[] = [
      { pid: "pk", name: "ช่องใส่ของ", count: 1, shape: movePiece({ shape: pk.piece.shape }, 300, 0).shape, holes: [], layer: "lining" },
      { pid: "zb", name: "ถุงช่องซิป", count: 1, shape: movePiece({ shape: zp.piece.shape }, 330, 0).shape, holes: [], layer: "lining", inner: movePiece({ shape: zp.piece.shape, inner: zp.piece.inner }, 330, 0).inner ?? [] },
    ];
    const more: Seam[] = [
      { id: "k1", a: { pid: hostPid, from: 0, count: 1, n: 1, inner: pk.line.id }, b: { pid: "pk", ...pk.side } },
      { id: "k2", a: { pid: hostPid, from: 0, count: 1, n: 1, inner: zp.line.id }, b: { pid: "zb", ...zp.side } },
    ];
    const sc = buildSewn([...withLines, ...extra], [...allSeams, ...more], att);
    expect(sc.asm?.ok).toBe(true);
    expect(sc.lining?.asm.ok).toBe(true);
    expect(sc.notes).toEqual([]);
    const D = sc.asm!.depth, k = sc.lining!.k, zBack = (-D / 2) * k;
    const pkP = sc.parts.find((p) => p.pid === "pk")!, zbP = sc.parts.find((p) => p.pid === "zb")!;
    expect(pkP).toMatchObject({ kind: "patch", layer: "lining", on: hostPid });
    expect(isSewnExtra(pkP)).toBe(true);
    const b1 = box(pkP), b2 = box(zbP);
    expect(b1.lo[2]).toBeGreaterThan(zBack); expect(b1.hi[2]).toBeLessThan(zBack + 1);          // ด้านในกระเป๋า (หน้าแผ่นซับในหลัง)
    expect(b1.hi[0] - b1.lo[0]).toBeCloseTo(14 * k, 0);
    expect(b2.hi[2]).toBeLessThan(zBack); expect(b2.lo[2]).toBeGreaterThan(-D / 2 - 0.5);       // อยู่ระหว่างซับในกับตัวนอก
    expect(b2.hi[1] - b2.lo[1]).toBeLessThan(10 * k + 0.6);                                     // พับครึ่ง = เห็นลึกแค่ครึ่งของชิ้น
    expect(sc.marks).toHaveLength(1);                                                           // ช่องเจาะ (ซิป) วาดเป็นเส้นบนซับใน
    expect(sc.marks[0].pts[0][2]).toBeGreaterThan(zBack);
    expect(sc.lines.map((l) => l.id).sort()).toEqual(["k1", "k2"]);
  });
  it("freeEdges: ขอบของตัวหน้าที่ไม่ได้เย็บ = ปาก", () => {
    const f = outer.find((p) => p.pid === A.front)!;
    expect(freeEdges(f.pid, f.shape, seams).length).toBeGreaterThan(0);
  });
});

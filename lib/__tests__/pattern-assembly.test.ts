import { describe, expect, it } from "vitest";
import { BAG_DEFAULT, BAG_PRESETS, bagAttachRefs, bagGeometry, bagPieces, bagSeamRefs, type BagParams } from "@/lib/bag-templates";
import { assemble, cleanAttaches, type AsmPiece, type Attach, type AssemblyOk } from "@/lib/pattern-assembly";
import { movePiece, rotatePiece, type Pt, type Shape } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";

const close = (a: number, b: number, eps = 0.05) => expect(Math.abs(a - b)).toBeLessThan(eps);
const polyLen = (P: Pt[]) => P.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0);
const signed = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

/** จำลองสิ่งที่หน้าจอทำตอนวางชิ้นจากแม่แบบ: ชิ้นย้ายไปตำแหน่งบนกระดาน + ตะเข็บ/จุดติดอ้างรหัสชิ้น */
function fromTemplate(params: Partial<BagParams>) {
  const G = bagGeometry({ ...BAG_DEFAULT, ...params }), list = bagPieces(G);
  const pieces: AsmPiece[] = list.map((q) => { const m = movePiece({ shape: q.shape, holes: q.holes }, q.at[0], q.at[1]); return { pid: q.key, name: q.name, count: q.count, shape: m.shape, holes: m.holes }; });
  const seams: Seam[] = bagSeamRefs(G).map((r, i) => ({ id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } }));
  const attaches: Attach[] = bagAttachRefs(G).map((r, i) => ({ id: `a${i}`, kind: r.kind, pid: r.piece, on: r.on, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail }));
  return { G, pieces, seams, attaches };
}
const ok = (a: ReturnType<typeof assemble>): AssemblyOk => { expect(a.ok).toBe(true); return a as AssemblyOk; };

describe("ประกอบกระเป๋าจากตะเข็บ (assemble)", () => {
  it("Tote ใบกลาง: ตัวหน้า/หลังแผ่นเดียวกัน + ชิ้นข้าง+ก้นพันรอบ · ลึก = กว้างของชิ้นข้าง", () => {
    const { G, pieces, seams, attaches } = fromTemplate({});
    const A = ok(assemble(pieces, seams, attaches));
    expect(A.kind).toBe("wrap");
    expect([A.front, A.back, A.bridges]).toEqual(["front", "front", ["strip"]]);
    close(A.depth, 12);
    close(A.height, 28);                                      // รูปชิ้น = ขนาดสำเร็จ (พับปากเป็นเผื่อรายขอบ ไม่อยู่ในรูป)
    expect(A.sweeps).toHaveLength(1);
    close(polyLen(A.sweeps[0].pts), G.Lg, 0.1);
    expect(A.sweeps[0].dir[1]).toBeLessThan(-0.9);            // ผิวข้าง+ก้นอยู่ใต้/รอบแผ่น → แยกชิ้นลงล่าง
    expect(A.handles.map((h) => h.side)).toEqual([1, -1]);    // หูทั้งสองฝั่ง
    close(A.handles[0].a[1], 28, 0.05);                       // โคนหูอยู่ระดับปากกระเป๋า
    close(A.handles[0].b[0] - A.handles[0].a[0], 14, 0.05);
    expect(A.steps.map((s) => s.key)).toEqual(["handle", "gusset", "back"]);
    expect(A.loose).toEqual([]);
    expect(A.notes).toEqual([]);
  });
  it("แผ่นอยู่ในกรอบมาตรฐาน: กึ่งกลาง x = 0 · ก้น y = 0 · ผิวข้างเรียงทวนเข็ม จากปากซ้ายไปปากขวา", () => {
    const { pieces, seams, attaches } = fromTemplate({});
    const A = ok(assemble(pieces, seams, attaches)), O = A.panels[0].outline;
    close(Math.min(...O.map((p) => p[1])), 0, 1e-6);
    close(Math.min(...O.map((p) => p[0])) + Math.max(...O.map((p) => p[0])), 0, 1e-6);
    const s = A.sweeps[0].pts;
    expect(s[0][0]).toBeLessThan(0);
    expect(s[s.length - 1][0]).toBeGreaterThan(0);
    expect(signed(s)).toBeGreaterThan(0);
  });
  it("กระเป๋าโชว์: ตัวหน้า (มีรู) กับตัวหลังคนละชิ้น · แผ่น PVC อยู่หลังรู · หูฝั่งละเส้น", () => {
    const { pieces, seams, attaches } = fromTemplate(BAG_PRESETS[1].params);
    const A = ok(assemble(pieces, seams, attaches));
    expect([A.front, A.back]).toEqual(["front", "back"]);
    expect(A.panels[0].holes).toHaveLength(1);
    expect(A.panels[1].holes).toHaveLength(0);
    expect(A.behind).toHaveLength(1);
    const hole = A.panels[0].holes[0], hx = (Math.min(...hole.map((p) => p[0])) + Math.max(...hole.map((p) => p[0]))) / 2;
    close(A.behind[0].x + A.behind[0].w / 2, hx, 0.05);
    expect(A.handles.map((h) => h.side).sort()).toEqual([-1, 1]);
    expect(A.steps.map((s) => s.key)).toEqual(["behind", "handle", "gusset", "back"]);
    expect(A.loose).toEqual([]);
  });
  it("ก้นเหลี่ยมแยกชิ้น: เลือกแผ่นใหญ่เป็นตัวหน้า · ข้าง + ก้น เป็นชิ้นสะพาน 3 ผิว", () => {
    const { pieces, seams, attaches } = fromTemplate(BAG_PRESETS[2].params);
    const A = ok(assemble(pieces, seams, attaches));
    expect(A.front).toBe("front");
    expect([...A.bridges].sort()).toEqual(["bottom", "side"]);
    close(A.depth, 15);
    expect(A.sweeps).toHaveLength(3);
    expect(A.loose).toEqual([]);
  });
  it("ไม่มีหูติด ก็ยังเลือกแผ่นใหญ่เป็นตัวหน้า · ชิ้นที่ไม่ได้เย็บ = ยังไม่ได้ประกอบ", () => {
    const { pieces, seams } = fromTemplate(BAG_PRESETS[2].params);
    const A = ok(assemble(pieces, seams, []));
    expect(A.front).toBe("front");
    expect(A.loose).toEqual(["handle"]);
    expect(A.steps.map((s) => s.key)).toEqual(["gusset", "back"]);
  });
  it("หมุนตัวหน้าบนกระดาน 90° ผลประกอบเหมือนเดิม (ปากยังหันขึ้น)", () => {
    const { pieces, seams } = fromTemplate({});
    const turned = pieces.map((p) => (p.pid === "front" ? { ...p, ...rotatePiece({ shape: p.shape, holes: p.holes }, 90) } : p));
    const A = ok(assemble(turned, seams, []));
    close(A.height, 28, 0.1);
    close(A.width, 38, 0.2);
    expect(A.sweeps[0].dir[1]).toBeLessThan(-0.9);
  });
  it("ซองแบน: สี่เหลี่ยม 2 แผ่นเย็บ 3 ขอบ → pouch ปากหันขึ้น", () => {
    const R = (x: number): Shape => ({ k: "rect", x, y: 0, w: 20, h: 15 });
    const pieces: AsmPiece[] = [{ pid: "a", name: "หน้า", count: 1, shape: R(0), holes: [] }, { pid: "b", name: "หลัง", count: 1, shape: R(30), holes: [] }];
    const seams: Seam[] = [{ id: "s", a: { pid: "a", from: 1, count: 3, n: 4 }, b: { pid: "b", from: 1, count: 3, n: 4 } }];   // ขวา-ล่าง-ซ้าย
    const A = ok(assemble(pieces, seams));
    expect(A.kind).toBe("pouch");
    close(A.height, 15); close(A.width, 20);
    expect(A.sweeps[0].dir[1]).toBeLessThan(-0.9);
    expect(A.steps.map((s) => s.key)).toEqual(["back"]);
  });
  it("ประกอบไม่ได้ = บอกเหตุผล ไม่เดา", () => {
    const { pieces } = fromTemplate({});
    expect(assemble([], [])).toEqual({ ok: false, reason: "no-pieces", loose: [] });
    expect(assemble(pieces, []).ok).toBe(false);
    const self: Seam[] = [{ id: "s", a: { pid: "strip", from: 0, count: 1, n: 4 }, b: { pid: "strip", from: 2, count: 1, n: 4 } }];
    const r = assemble(pieces, self);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-structure");
  });
  it("ตะเข็บยาวไม่เท่ากันยังประกอบได้ แต่มีหมายเหตุ", () => {
    const { pieces, seams } = fromTemplate({});
    const longer = pieces.map((p) => (p.pid === "strip" && p.shape.k === "rect" ? { ...p, shape: { ...p.shape, w: p.shape.w + 3 } } : p));
    expect(ok(assemble(longer, seams)).notes).toContain("mismatch");
  });
  it("toLocal: จุดในกรอบประกอบ แปลงกลับเป็นจุดติดของแผ่นได้ตรงกับที่แม่แบบให้มา", () => {
    const { pieces, seams, attaches } = fromTemplate({});
    const A = ok(assemble(pieces, seams, attaches)), h = A.handles[0], at = attaches[0];
    const a = A.toLocal.front(h.a), b = A.toLocal.front(h.b);
    close(a[0], at.a![0], 1e-6); close(a[1], at.a![1], 1e-6);
    close(b[0], at.b![0], 1e-6); close(b[1], at.b![1], 1e-6);
    close(A.panelH[0], 28, 0.05);
  });
  it("ติดหูเอง: วางโคนหูในกรอบประกอบ (ห่าง 10 · ต่ำจากปาก 2) → หูขึ้นตรงจุดนั้น แม้ตัวหน้าถูกหมุนบนกระดาน · ชิ้นหูไม่ค้างเป็นชิ้นยังไม่ได้ประกอบ", () => {
    const { pieces, seams } = fromTemplate(BAG_PRESETS[1].params);            // ตัวหน้ากับตัวหลังคนละชิ้น
    const turned = pieces.map((p) => (p.pid === "front" ? { ...p, ...rotatePiece({ shape: p.shape, holes: p.holes }, 90) } : p));
    const A0 = ok(assemble(turned, seams, []));
    expect(A0.loose).toContain("handle");
    const mk = (side: "front" | "back", id: string): Attach => {
      const top = A0.panelH[side === "front" ? 0 : 1] - 2;
      return { id, kind: "handle", pid: "handle", on: side === "front" ? A0.front : A0.back, a: A0.toLocal[side]([-5, top]), b: A0.toLocal[side]([5, top]), len: 40, w: 2.5, tail: 4 };
    };
    const mine = [mk("front", "h0"), mk("back", "h1")];
    expect(cleanAttaches(mine, new Set(turned.map((p) => p.pid)))).toHaveLength(2);
    const A = ok(assemble(turned, seams, mine));
    expect(A.loose).not.toContain("handle");
    expect(A.handles.map((h) => h.side).sort()).toEqual([-1, 1]);
    for (const h of A.handles) {
      close(h.a[0], -5, 1e-6); close(h.b[0], 5, 1e-6);
      close(h.a[1], A.height - 2, 0.05); close(h.b[1], A.height - 2, 0.05);
    }
    expect(A.steps.map((s) => s.key)).toContain("handle");
  });
  it("cleanAttaches: ทิ้งจุดติดที่ชี้ชิ้นที่ไม่มี / ค่าผิด / รหัสซ้ำ", () => {
    const good: Attach = { id: "a1", kind: "handle", pid: "h", on: "f", a: [1, 2], b: [9, 2], len: 40, w: 2.5, tail: 4 };
    const out = cleanAttaches([good, { ...good, id: "a2", on: "gone" }, { ...good, id: "a3", len: -1 }, { id: "a4", kind: "behind", pid: "h", on: "f" }, { ...good }, 5], new Set(["h", "f"]));
    expect(out.map((x) => x.id)).toEqual(["a1", "a4"]);
  });
});

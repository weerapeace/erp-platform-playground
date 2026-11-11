import { describe, expect, it } from "vitest";
import { buildSewn, isSewnExtra, type SewnPart } from "@/lib/pattern-sewn";
import { BAG_DEFAULT, bagAttachRefs, bagGeometry, bagPieces, bagSeamRefs } from "@/lib/bag-templates";
import { movePiece, type Shape } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const P = (pid: string, name: string, shape: Shape) => ({ pid, name, count: 1, shape, holes: [] });
// ตัวหน้า 38×12 (ขอบบน = ขอบ 1) · สายหู 30×4 (ปลายซ้าย = ขอบ 4 · ปลายขวา = ขอบ 2) · แถบ 4×5 (ขอบบน = ขอบ 1)
const body = P("body", "ตัวหน้า", R(0, 0, 38, 12)), strap = P("strap", "สายหู", R(2, 20, 30, 4)), tab = P("tab", "แถบ", R(40, 20, 4, 5));
const mouth = (t0: number, t1: number) => ({ pid: "body", from: 0, count: 1, n: 4, t0, t1 });
const sL: Seam = { id: "sL", a: mouth(9, 13), b: { pid: "strap", from: 3, count: 1, n: 4 } };
const sR: Seam = { id: "sR", a: mouth(25, 29), b: { pid: "strap", from: 1, count: 1, n: 4 } };
const sT: Seam = { id: "sT", a: mouth(17, 21), b: { pid: "tab", from: 0, count: 1, n: 4 } };

const box = (p: SewnPart) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], p.pos[i]); hi[i % 3] = Math.max(hi[i % 3], p.pos[i]); }
  return { lo, hi };
};
const part = (sc: ReturnType<typeof buildSewn>, pid: string) => sc.parts.find((p) => p.pid === pid)!;
/** ความยาวของแถบตามแนวเส้นกลาง: วัดจากจุดบนตาข่ายที่เดิมอยู่บนขอบยาวด้านบนของสาย (y = 20 บนกระดาน) — เรียงตาม x เดิม */
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("ภาพเย็บติด (buildSewn)", () => {
  it("ไม่มีตะเข็บ = ยังไม่มีอะไรเย็บติด ทุกชิ้นวางแบน", () => {
    const sc = buildSewn([body, strap, tab], []);
    expect(sc.joined).toBe(0);
    expect(sc.asm).toBeNull();
    expect(sc.parts.map((p) => p.kind)).toEqual(["loose", "loose", "loose"]);
    expect(sc.notes.map((n) => n.why)).toEqual(["unsewn", "unsewn", "unsewn"]);
  });
  it("สายหูเย็บปลายสองข้างกับขอบปาก = ห่วงโค้งเหนือขอบปาก โคนอยู่ตรงช่วงที่เย็บ", () => {
    const sc = buildSewn([body, strap, tab], [sL, sR]);
    expect(sc.joined).toBe(2);
    expect(part(sc, "body").kind).toBe("base");
    const lp = part(sc, "strap"), b = box(lp);
    expect(lp.kind).toBe("loop");
    expect(lp.on).toBe("body");                                                    // เกาะอยู่กับชิ้นหลัก → ภาพเย็บทีละขั้นขยับตามแผ่นนั้น
    expect(sc.lines.every((l) => l.on === "body")).toBe(true);
    // ตัวหน้ากว้าง 38 → กึ่งกลาง x = 0 · ขอบปากอยู่ที่ y = 12 · โคนซ้ายช่วง 9–13 → x −10…−6 · โคนขวา 25–29 → x 6…10
    expect(b.lo[0]).toBeGreaterThan(-10.6); expect(b.hi[0]).toBeLessThan(10.6);
    expect(b.lo[1]).toBeGreaterThan(11.5);
    // โคนห่างกัน 16 ซม. สายยาว 30 ซม. → โค้งสูงเหนือขอบปากราว 9–13 ซม.
    expect(b.hi[1] - 12).toBeGreaterThan(8); expect(b.hi[1] - 12).toBeLessThan(13.5);
    expect(sc.lines.map((l) => l.id).sort()).toEqual(["sL", "sR"]);
    expect(sc.lines.every((l) => !l.bad)).toBe(true);
    expect(sc.notes).toEqual([{ pid: "tab", name: "แถบ", why: "unsewn" }]);
  });
  it("ย้ายตะเข็บ = โคนหูย้ายตาม · โคนชิดกัน = หูโค้งสูงขึ้น (สายยาวเท่าเดิม)", () => {
    const far = box(part(buildSewn([body, strap], [sL, sR]), "strap"));
    const near = box(part(buildSewn([body, strap], [{ ...sL, a: mouth(13, 17) }, { ...sR, a: mouth(21, 25) }]), "strap"));
    expect(near.lo[0]).toBeGreaterThan(far.lo[0] + 3);
    expect(near.hi[1]).toBeGreaterThan(far.hi[1] + 1);
  });
  it("ห่วงยาวเท่าชิ้นจริง (ไม่ยืดไม่หด)", () => {
    const lp = part(buildSewn([body, strap], [sL, sR]), "strap");
    // จุดบนขอบซ้าย-ขวาของสายในตาข่าย: จุดแรก ๆ ของตาข่ายคือเส้นรอบรูป (เรียงตามขอบ) → วัดระยะสะสมตามขอบบน (ยาว 30)
    const n = lp.pos.length / 3, pts = Array.from({ length: n }, (_, i) => [lp.pos[i * 3], lp.pos[i * 3 + 1], lp.pos[i * 3 + 2]]);
    let len = 0, k = 1;
    for (; k < n; k++) { const d = dist(pts[k], pts[k - 1]); if (len + d > 30.5) break; len += d; if (len > 29.5) break; }
    expect(len).toBeGreaterThan(28.5); expect(len).toBeLessThan(31.5);
  });
  it("โคนห่างกันเกินความยาวสาย = บอกว่ายาวไม่ถึง", () => {
    const sc = buildSewn([P("body", "ตัวหน้า", R(0, 0, 60, 12)), strap], [{ ...sL, a: mouth(2, 6) }, { ...sR, a: mouth(52, 56) }]);
    expect(sc.notes).toContainEqual({ pid: "strap", name: "สายหู", why: "short" });
  });
  it("ชิ้นที่เย็บตะเข็บเดียว = แผ่นพับเกาะที่ตะเข็บ ยื่นขึ้นจากขอบปาก", () => {
    const sc = buildSewn([body, strap, tab], [sT]);
    const tb = part(sc, "tab"), b = box(tb);
    expect(tb.kind).toBe("flap");
    expect(b.lo[0]).toBeCloseTo(-2, 1); expect(b.hi[0]).toBeCloseTo(2, 1);     // ช่วง 17–21 ของขอบกว้าง 38 → x −2…2
    expect(b.lo[1]).toBeCloseTo(12, 1); expect(b.hi[1]).toBeGreaterThan(16);     // เริ่มที่ขอบปาก สูงขึ้นไปเกือบ 5 ซม.
    expect(b.lo[2]).toBeLessThan(-0.5);                                           // เอนเข้าด้านในเล็กน้อย
    expect(sc.joined).toBe(2);
  });
  it("สายยาวที่เย็บปลายเดียวกับขอบปาก = ห้อยลงมาด้านนอก ไม่ทะลุพื้น", () => {
    const sc = buildSewn([body, strap], [sL]);
    const st = part(sc, "strap"), b = box(st);
    expect(st.kind).toBe("hang");
    expect(b.hi[1]).toBeLessThan(12.5); expect(b.lo[1]).toBeGreaterThan(0);
    expect(b.hi[2]).toBeGreaterThan(10);                                          // ส่วนที่ยาวเกินความสูงวางราบไปข้างหน้า
  });
  it("ตะเข็บยาวไม่เท่ากัน = เส้นตะเข็บในภาพเป็นสีเตือน · ตั้งใจให้ย่น = ไม่เตือน", () => {
    const bad: Seam = { ...sT, a: mouth(17, 23) };
    expect(buildSewn([body, tab], [bad]).lines[0].bad).toBe(true);
    expect(buildSewn([body, tab], [{ ...bad, ease: true }]).lines[0].bad).toBe(false);
  });
  it("ชิ้นที่เย็บ 3 จุด = ยังประกอบไม่ได้ วางไว้ข้างหน้าพร้อมหมายเหตุ (ไม่เดาภาพ)", () => {
    const s3: Seam = { id: "s3", a: mouth(31, 35), b: { pid: "strap", from: 0, count: 1, n: 4, t0: 13, t1: 17 } };
    const sc = buildSewn([body, strap], [sL, sR, s3]);
    expect(part(sc, "strap").kind).toBe("loose");
    expect(sc.notes).toEqual([{ pid: "strap", name: "สายหู", why: "unsupported" }]);
    expect(sc.joined).toBe(0);
  });
  it("กระเป๋าจากแม่แบบ (ตะเข็บเต็มขอบ) = ใช้ทรงที่ประกอบได้ · ชิ้นเสริมเย็บบางช่วงกับตัวหน้าได้", () => {
    const G = bagGeometry(BAG_DEFAULT), list = bagPieces(G);
    const pieces = list.map((q) => { const m = movePiece({ shape: q.shape, holes: q.holes }, q.at[0], q.at[1]); return { pid: q.key as string, name: q.name, count: q.count, shape: m.shape, holes: m.holes }; });
    const seams: Seam[] = bagSeamRefs(G).map((r, i) => ({ id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } }));
    const att = bagAttachRefs(G).map((r, i) => ({ id: `a${i}`, kind: r.kind, pid: r.piece as string, on: r.on as string, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail }));
    const base = buildSewn(pieces, seams, att);
    expect(base.asm?.ok).toBe(true);
    expect(base.joined).toBeGreaterThanOrEqual(2);
    // เพิ่มแถบเล็ก เย็บกับช่วงหนึ่งของขอบที่ยังว่างของตัวหน้า (ขอบที่ไม่ได้เย็บกับชิ้นข้าง = ขอบปาก)
    const front = pieces.find((p) => p.pid === base.asm!.front)!, used = new Set(seams.flatMap((s) => [s.a, s.b]).filter((s) => s.pid === front.pid).flatMap((s) => Array.from({ length: s.count }, (_, k) => (s.from + k) % s.n)));
    const nEdges = seams.find((s) => s.a.pid === front.pid)?.a.n ?? seams.find((s) => s.b.pid === front.pid)!.b.n;
    const free = Array.from({ length: nEdges }, (_, i) => i).find((i) => !used.has(i))!;
    const extra = { pid: "x", name: "แถบ", count: 1, shape: R(200, 0, 4, 5), holes: [] };
    const sc = buildSewn([...pieces, extra], [...seams, { id: "sx", a: { pid: front.pid, from: free, count: 1, n: nEdges, t0: 2, t1: 6 }, b: { pid: "x", from: 0, count: 1, n: 4 } }], att);
    expect(sc.asm?.ok).toBe(true);
    const xp = part(sc, "x");
    expect(xp.kind).toBe("flap");
    expect(xp.on).toBe(front.pid);
    expect(sc.parts.filter(isSewnExtra).map((p) => p.pid)).toEqual(["x"]);
    expect(box(xp).lo[1]).toBeGreaterThan(sc.asm!.height - 1);                    // เกาะที่ขอบปาก (บนสุดของตัวกระเป๋า)
    expect(Math.abs(box(xp).lo[2] - sc.asm!.depth / 2)).toBeLessThan(2.5);        // อยู่ที่แผ่นหน้า
    expect(sc.joined).toBe(base.joined + 1);
  });

  // ── งานขอบในภาพ: ขอบที่ติดซิป / กุ๊น = เส้นตามขอบของชิ้นที่วางแล้ว
  const meta4 = (m: Record<number, { bind?: boolean; zip?: boolean }>) => [0, 1, 2, 3].map((i) => m[i] ?? {});
  it("ไม่ได้ตั้งค่าขอบ = ไม่มีเส้นงานขอบ · ชิ้นที่ยังไม่เย็บ (วางแบน) ก็เห็นซิป/กุ๊นบนชิ้น ลอยเหนือชิ้นเล็กน้อย", () => {
    expect(buildSewn([body, strap, tab], []).finishes).toEqual([]);
    const sc = buildSewn([{ ...body, edgeMeta: meta4({ 0: { zip: true }, 1: { bind: true } }) }, strap], []);
    expect(sc.finishes.map((f) => [f.pid, f.edge, f.kind])).toEqual([["body", 0, "zip"], ["body", 1, "bind"]]);
    const zip = sc.finishes[0];
    expect(zip.n).toEqual([0, 1, 0]);
    expect(dist(zip.pts[0], zip.pts[zip.pts.length - 1])).toBeCloseTo(38, 3);            // ยาวเท่าขอบบนของตัวหน้า
    expect(zip.pts.every((q) => Math.abs(q[1] - 0.25) < 1e-6)).toBe(true);               // เหนือชิ้นที่วางแบน (0.05) อีก 0.2
    expect(dist(sc.finishes[1].pts[0], sc.finishes[1].pts[sc.finishes[1].pts.length - 1])).toBeCloseTo(12, 3);
  });
  it("ซิปเฉพาะบางช่วงของขอบ = เส้นในภาพยาวเท่าช่วง อยู่ตรงช่วงนั้น", () => {
    const sc = buildSewn([{ ...body, edgeMeta: [{ zip: true, zipR: [10, 30] }, {}, {}, {}] }], []);
    const [zip] = sc.finishes, whole = buildSewn([{ ...body, edgeMeta: meta4({ 0: { zip: true } }) }], []).finishes[0];
    expect(dist(zip.pts[0], zip.pts[zip.pts.length - 1])).toBeCloseTo(20, 3);
    expect(dist(zip.pts[0], whole.pts[0])).toBeCloseTo(10, 3);                             // เริ่มห่างจากต้นขอบ 10
  });
  it("ชิ้นหลักที่ตั้งขึ้น (มีชิ้นมาเย็บ) = เส้นงานขอบอยู่บนผิวแผ่นนั้น หันออกด้านหน้า", () => {
    const sc = buildSewn([{ ...body, edgeMeta: meta4({ 0: { zip: true } }) }, strap], [sL, sR]);
    const [zip] = sc.finishes, base = box(part(sc, "body"));
    expect(zip.n).toEqual([0, 0, 1]);
    expect(zip.pts.every((q) => Math.abs(q[1] - base.hi[1]) < 1e-6 && Math.abs(q[2] - 0.2) < 1e-6)).toBe(true);   // ขอบบนของแผ่น ลอยจากผิว 0.2
    expect(Math.abs(zip.pts[0][0] - zip.pts[zip.pts.length - 1][0])).toBeCloseTo(38, 3);
  });
  it("กระเป๋าที่ประกอบจากแม่แบบ: ซิปที่ขอบปากของตัวหน้า = อยู่บนแผ่นหน้า ที่ความสูงปากกระเป๋า และไปกับแผ่นหน้า", () => {
    const G = bagGeometry(BAG_DEFAULT), list = bagPieces(G);
    const pieces = list.map((q) => { const m = movePiece({ shape: q.shape, holes: q.holes }, q.at[0], q.at[1]); return { pid: q.key as string, name: q.name, count: q.count, shape: m.shape, holes: m.holes }; });
    const seams: Seam[] = bagSeamRefs(G).map((r, i) => ({ id: `s${i}`, a: { pid: r.a.piece, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: r.b.piece, from: r.b.from, count: r.b.count, n: r.b.n } }));
    const base = buildSewn(pieces, seams);
    const front = pieces.find((p) => p.pid === base.asm!.front)!, used = new Set(seams.flatMap((s) => [s.a, s.b]).filter((s) => s.pid === front.pid).flatMap((s) => Array.from({ length: s.count }, (_, k) => (s.from + k) % s.n)));
    const nEdges = seams.find((s) => s.a.pid === front.pid)?.a.n ?? seams.find((s) => s.b.pid === front.pid)!.b.n;
    const free = Array.from({ length: nEdges }, (_, i) => i).find((i) => !used.has(i))!;
    const sc = buildSewn(pieces.map((p) => (p.pid === front.pid ? { ...p, edgeMeta: Array.from({ length: nEdges }, (_, i) => (i === free ? { zip: true } : {})) } : p)), seams);
    expect(sc.asm?.ok).toBe(true);
    const [zip] = sc.finishes;
    expect([zip.pid, zip.edge, zip.kind, zip.on]).toEqual([front.pid, free, "zip", sc.asm!.front]);
    expect(zip.pts.every((q) => Math.abs(q[2] - (sc.asm!.depth / 2 + 0.2)) < 1e-6)).toBe(true);
    expect(Math.max(...zip.pts.map((q) => q[1]))).toBeGreaterThan(sc.asm!.height - 1);
  });
});

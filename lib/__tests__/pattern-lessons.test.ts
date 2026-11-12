/**
 * บทเรียนเรียนไปทำไป (Bag CAD รอบ C) — ตัวตรวจต้องดูจากรูปทรงจริง: A14 (ไม่ทำแล้วกดถัดไป = ไม่ผ่าน) · A15 (ทำถูกแล้วย้อน = กลับเป็นไม่ผ่าน)
 */
import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, LESSONS, cleanProgress, cornerRadius, evalLesson, lessonById, missingBefore, seamTwisted, type LessonCtx, type LessonDemo, type LessonPiece } from "@/lib/pattern-lessons";
import { roundCorners, type Shape } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";

const L = (cm: number) => `${Math.round(cm * 100) / 10} มม.`;
const piecesOfSeed = (id: number): LessonPiece[] => (lessonById(id)!.seed!().pieces).map((p) => {
  // ย้ายรูปไปตำแหน่ง at (เหมือนกระดานวาง) — สี่เหลี่ยมแบบ rect
  const s = p.shape.k === "rect" ? { ...p.shape, x: p.at[0], y: p.at[1] } : p.shape;
  return { pid: p.pid, name: p.name, shape: s, holes: p.holes, allow: p.allow, allowEdges: p.allowEdges ?? null };
});
const ctx = (pieces: LessonPiece[], extra: Partial<LessonCtx> = {}): LessonCtx => ({ pieces, seams: [], selPid: null, events: new Set(), tol: 0.05, ...extra });
const apply = (c: LessonCtx, d: LessonDemo | null): LessonCtx => {
  if (!d) return c;
  let pieces = c.pieces.map((p) => { const x = d.patch?.find((q) => q.pid === p.pid); return x ? { ...p, ...(x.shape ? { shape: x.shape } : {}), ...(x.allow != null ? { allow: x.allow } : {}), ...("allowEdges" in x ? { allowEdges: x.allowEdges } : {}) } : p; });
  pieces = [...pieces, ...(d.add ?? []).map((a, i) => ({ pid: `add${i}`, name: a.name, shape: a.shape, allow: a.allow ?? 0 }))];
  return { ...c, pieces, seams: d.seams ?? c.seams };
};

describe("สารบัญบทเรียน", () => {
  it("บท 1–5 เปิดได้ มีขั้นตอนครบ · บท 6–12 บอกว่ามาในรอบไหน (ไม่มีปุ่มหลอก)", () => {
    expect(LESSONS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const l of LESSONS.filter((x) => x.id <= 5)) { expect(l.ready).toBe(true); expect(l.steps.length).toBeGreaterThan(0); expect(l.seed).toBeTypeOf("function"); for (const s of l.steps) expect(s.hints).toHaveLength(3); }
    for (const l of LESSONS.filter((x) => x.id > 5)) { expect(l.ready).toBe(false); expect(l.round).toMatch(/^[A-I]$/); }
  });
});

describe("บท 1 รู้จักพื้นที่ทำงาน (นับจากสิ่งที่ผู้ใช้ทำจริง)", () => {
  it("ยังไม่ทำ = ไม่ผ่าน · ทำครบ 4 อย่าง = ผ่าน", () => {
    const l = lessonById(1)!;
    expect(evalLesson(l, ctx(piecesOfSeed(1)), L).done).toBe(false);
    const r = evalLesson(l, ctx(piecesOfSeed(1), { events: new Set(["sel", "pick-3d", "tool:measure", "panel:check"]) }), L);
    expect(r.done).toBe(true);
  });
});

describe("บท 2 ชิ้นแรก", () => {
  const l = lessonById(2)!;
  it("A14: ไม่วาดอะไรแล้วกดถัดไป = ไม่ผ่าน", () => { const r = evalLesson(l, ctx([]), L); expect(r.done).toBe(false); expect(r.current).toBe(0); });
  it("ขนาดผิด = บอกขนาดตอนนี้กับที่ต้องการ · ถูก = ผ่าน (กลับด้านก็ได้)", () => {
    const off = evalLesson(l, ctx([{ pid: "a", name: "", shape: { k: "rect", x: 0, y: 0, w: 19.8, h: 15 }, allow: 0 }]), L);
    expect(off.steps[0].ok).toBe(true); expect(off.steps[1].ok).toBe(false);
    expect(off.steps[1].msg?.th).toContain("198 มม.");
    expect(evalLesson(l, ctx([{ pid: "a", name: "", shape: { k: "rect", x: 0, y: 0, w: 15, h: 20 }, allow: 0 }]), L).done).toBe(true);
  });
  it("ทำให้ดู → ผ่าน", () => { const c0 = ctx([]); const c1 = apply(c0, l.steps[0].demo!(c0)); expect(evalLesson(l, c1, L).done).toBe(true); });
});

describe("บท 3 ขอบและมุม", () => {
  const l = lessonById(3)!;
  it("ขยายแล้วยังไม่ทำมุม = ขั้น 2 ไม่ผ่าน · มุมมน 10 มม. = ผ่าน", () => {
    const wide: LessonPiece = { pid: "a", name: "", shape: { k: "rect", x: 2, y: 2, w: 25, h: 15 }, allow: 0 };
    const r1 = evalLesson(l, ctx([wide]), L);
    expect(r1.steps[0].ok).toBe(true); expect(r1.steps[1].ok).toBe(false); expect(r1.steps[1].msg?.th).toContain("ยังไม่มีมุมมน");
    const round = { ...wide, shape: roundCorners(wide.shape, 1) };
    expect(cornerRadius(round.shape).corners).toBe(4);
    expect(cornerRadius(round.shape).r.every((r) => Math.abs(r - 1) < 0.01)).toBe(true);
    expect(evalLesson(l, ctx([round]), L).done).toBe(true);
  });
  it("รัศมีผิด (5 มม.) = บอกรัศมีที่วัดได้", () => {
    const r = evalLesson(l, ctx([{ pid: "a", name: "", shape: roundCorners({ k: "rect", x: 0, y: 0, w: 25, h: 15 }, 0.5), allow: 0 }]), L);
    expect(r.steps[1].ok).toBe(false); expect(r.steps[1].msg?.th).toContain("5 มม.");
  });
  it("ทำให้ดูครบสองขั้น → ผ่าน", () => {
    let c = ctx(piecesOfSeed(3));
    c = apply(c, l.steps[0].demo!(c)); c = apply(c, l.steps[1].demo!(c));
    expect(evalLesson(l, c, L).done).toBe(true);
  });
});

describe("บท 4 เผื่อเย็บ", () => {
  const l = lessonById(4)!;
  const seed = () => { const p = lessonById(4)!.seed!().pieces[0]; return { pid: p.pid, name: p.name, shape: p.shape, allow: p.allow, allowEdges: p.allowEdges ?? null } as LessonPiece; };
  it("ข้อความบอกขอบที่ยังไม่ใช่ 7 มม. และจำนวนที่เป็นแล้ว (ตามสเปก)", () => {
    const r = evalLesson(l, ctx([seed()], { selPid: "ls4" }), L);
    expect(r.steps[0].ok).toBe(true); expect(r.steps[1].ok).toBe(false);
    expect(r.steps[1].msg?.th).toMatch(/ขอบ 1 \(5 มม\.\).*อีก 7 ขอบเป็น 7 มม\. แล้ว/);
  });
  it("A15: ทำถูกแล้วย้อนกลับ = กลับเป็นไม่ผ่าน", () => {
    const ok = { ...seed(), allow: 0.7, allowEdges: null };
    expect(evalLesson(l, ctx([ok], { selPid: "ls4" }), L).done).toBe(true);
    expect(evalLesson(l, ctx([seed()], { selPid: "ls4" }), L).done).toBe(false);
  });
  it("ไม่มีเผื่อเย็บเลย = ขั้นตรวจเส้นตัดไม่ผ่าน", () => {
    const r = evalLesson(l, ctx([{ ...seed(), allow: 0, allowEdges: null }], { selPid: "ls4" }), L);
    expect(r.steps[1].msg?.th).toContain("ทุกขอบยังเป็น 0 มม.");
    expect(r.steps[2].ok).toBe(false);
  });
});

describe("บท 5 เย็บสองชิ้น", () => {
  const l = lessonById(5)!;
  const base = piecesOfSeed(5);
  const seam = (rev?: boolean): Seam => ({ id: "x", a: { pid: "ls5a", from: 2, count: 1, n: 4 }, b: { pid: "ls5b", from: 0, count: 1, n: 4 }, ...(rev ? { rev: true } : {}) });
  it("ขอบล่างตัวหน้า (ขวา→ซ้าย) กับขอบบนแถบก้น (ซ้าย→ขวา) เย็บตรง ๆ = บิด · กลับทิศ = ไม่บิด", () => {
    expect(seamTwisted(base, seam())).toBe(true);
    expect(seamTwisted(base, seam(true))).toBe(false);
    const r = evalLesson(l, ctx(base, { seams: [seam()] }), L);
    expect(r.steps.map((s) => s.ok)).toEqual([true, true, false]);
    expect(evalLesson(l, ctx(base, { seams: [seam(true)] }), L).done).toBe(true);
  });
  it("ยาวไม่เท่า = บอกระยะที่ต่าง", () => {
    const s: Seam = { id: "y", a: { pid: "ls5a", from: 1, count: 1, n: 4 }, b: { pid: "ls5b", from: 0, count: 1, n: 4 } };
    const r = evalLesson(l, ctx(base, { seams: [s] }), L);
    expect(r.steps[1].ok).toBe(false); expect(r.steps[1].msg?.th).toContain("80 มม.");
  });
  it("ทำให้ดู → เย็บถูกขอบ ถูกทิศ · ทำให้ดูขั้นกลับทิศ = สลับทิศ", () => {
    const c1 = apply(ctx(base), l.steps[0].demo!(ctx(base)));
    expect(evalLesson(l, c1, L).done).toBe(true);
    const c2 = apply(ctx(base, { seams: [seam()] }), l.steps[2].demo!(ctx(base, { seams: [seam()] })));
    expect(evalLesson(l, c2, L).done).toBe(true);
  });
});

describe("ความคืบหน้า (เก็บต่อคน)", () => {
  it("ล้างค่าผิดรูป · เก็บเฉพาะบทที่มีจริง", () => {
    expect(cleanProgress(null)).toBeNull();
    expect(cleanProgress({ v: 1, lessons: { "2": { st: "done", at: "2026-11-12T00:00:00Z", ver: 1, pid: "00000000-0000-4000-8000-000000000001" }, "99": { st: "done" }, "3": { st: "weird" } } }))
      .toEqual({ v: 1, lessons: { "2": { st: "done", at: "2026-11-12T00:00:00Z", ver: 1, pid: "00000000-0000-4000-8000-000000000001" } } });
    expect(missingBefore(4, { v: 1, lessons: { "1": { st: "done", at: "", ver: 1 } } })).toEqual([2, 3]);
    expect(missingBefore(1, EMPTY_PROGRESS)).toEqual([]);
  });
  it("seed ของทุกบทเป็นชิ้นที่ใช้ได้ (มีรูปและตำแหน่ง)", () => {
    for (const l of LESSONS.filter((x) => x.ready)) for (const p of l.seed!().pieces) { expect(p.pid).toMatch(/^ls/); expect((p.shape as Shape).k).toBeTruthy(); expect(p.at).toHaveLength(2); }
  });
});

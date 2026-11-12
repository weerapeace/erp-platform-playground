/**
 * Bag CAD รอบ A + B (2026-11-12): หน่วยความยาว · จับคู่ขอบเมื่อแบ่ง/ลบจุด · ตรวจแบบก่อนผลิต
 *   ตรงกับ acceptance A02 (สลับหน่วยแล้วขนาดจริงไม่เปลี่ยน) · A05 (เย็บ 10 กับ 15 ซม. ต้องแจ้งต่าง 5 ซม.) · A06 (แบ่งขอบที่มีตะเข็บ → ตะเข็บตาม)
 */
import { describe, expect, it } from "vitest";
import { formatLength, fromUnit, parseLength, toUnit } from "@/lib/length-units";
import { edgePlan, migrateSeams, remapEdgeMeta, remapEdgeValues, remapSide } from "@/lib/pattern-edge-map";
import { checkPattern, cleanSeamTol, describeIssue, selfCrosses, summarize, type CheckPiece } from "@/lib/pattern-check";
import { checkSeam, cleanEdgeMeta, type Seam } from "@/lib/pattern-seams";
import { splitSegment, toPathShape, type PNode, type Shape } from "@/lib/pattern-shape";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });
const cm = (s: string, u: "mm" | "cm" | "in" = "cm") => { const r = parseLength(s, u); return r.ok ? r.cm : NaN; };

describe("หน่วยความยาว (lib/length-units)", () => {
  it("อ่านค่าที่มีหน่วยและสมการง่าย ๆ", () => {
    expect(cm("7 mm")).toBeCloseTo(0.7);
    expect(cm("0.7 cm")).toBeCloseTo(0.7);
    expect(cm("1 in")).toBeCloseTo(2.54);
    expect(cm("1\"")).toBeCloseTo(2.54);
    expect(cm("7 มม.")).toBeCloseTo(0.7);
    expect(cm("2 นิ้ว")).toBeCloseTo(5.08);
    expect(cm("260/2", "mm")).toBeCloseTo(13);
    expect(cm("(26+2)*2")).toBeCloseTo(56);
    expect(cm("26 cm + 5", "mm")).toBeCloseTo(26.5);   // 5 ไม่มีหน่วย = หน่วยตั้งต้น (มม.)
    expect(cm("1 in + 5 mm")).toBeCloseTo(3.04);
    expect(cm("7 mm * 2")).toBeCloseTo(1.4);
    expect(cm("-3")).toBeCloseTo(-3);
    expect(cm(".5")).toBeCloseTo(0.5);
    expect(cm("10 cm / 2 cm", "mm")).toBeCloseTo(0.5);  // ความยาว/ความยาว = ตัวเลข → ใช้หน่วยตั้งต้น
  });
  it("ผิดรูปแบบ = บอกเหตุผล ไม่ใช้ eval", () => {
    for (const bad of ["", "abc", "1/0", "2 cm * 3 cm", "(1+2", "1 mm mm", "alert(1)", "1;2", "5 / 2 cm"]) {
      const r = parseLength(bad, "cm");
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.th.length).toBeGreaterThan(0);
    }
  });
  it("A02: สลับหน่วยแสดงไปมา ขนาดจริงไม่เปลี่ยน", () => {
    const real = 26.05;
    let v = real;
    for (const u of ["mm", "cm", "in", "mm"] as const) { const shown = formatLength(v, u, { label: false }); v = cm(shown, u); }
    expect(v).toBeCloseTo(real, 2);
    expect(toUnit(fromUnit(3, "in"), "in")).toBeCloseTo(3);
    expect(formatLength(0.7, "mm")).toBe("7 มม.");
    expect(formatLength(26, "cm", { label: "en" })).toBe("26 cm");
    expect(formatLength(2.54, "in", { label: false })).toBe("1");
  });
});

describe("จับคู่ขอบเมื่อแบ่ง/ลบจุด (lib/pattern-edge-map)", () => {
  const rect = R(0, 0, 26, 24), path = toPathShape(rect) as Extract<Shape, { k: "path" }>;
  const split: Shape = { k: "path", nodes: splitSegment(path.nodes, 2, 0.5) };   // แบ่งขอบล่าง (ขอบที่ 3) ที่กึ่งกลาง → 5 ขอบ
  it("แผนจับคู่: ขอบล่างกลายเป็น 2 ช่วง", () => {
    const plan = edgePlan(rect, split)!;
    expect(plan.newN).toBe(5);
    expect(plan.map).toEqual([0, 1, 2, 4]);
    expect(plan.own.map((o) => o.k)).toEqual([0, 1, 2, 2, 3]);
    expect(plan.own[3].a).toBeCloseTo(13);
  });
  it("A06: ตะเข็บ 3 ขอบ (ซ้าย ล่าง ขวา) ย้ายตามโดยไม่ขึ้น 'ต้องกำหนดใหม่'", () => {
    const plan = edgePlan(rect, split)!;
    const seam: Seam = { id: "s1", a: { pid: "f", from: 1, count: 3, n: 4 }, b: { pid: "g", from: 0, count: 1, n: 4 } };
    const before = checkSeam({ f: rect, g: R(0, 40, 74, 8) }, seam);
    const m = migrateSeams([seam], new Map([["f", plan]]));
    expect(m.changed).toBe(true);
    expect(m.seams[0].a).toEqual({ pid: "f", from: 1, count: 4, n: 5 });
    const after = checkSeam({ f: split, g: R(0, 40, 74, 8) }, m.seams[0]);
    expect(after.status).not.toBe("broken");
    expect(after.la).toBeCloseTo(before.la ?? 0, 1);
  });
  it("ตะเข็บบางช่วงคงระยะเดิม · ตะเข็บรอบชิ้นทั้งชิ้นนับขอบใหม่ครบ", () => {
    const plan = edgePlan(rect, split)!;
    expect(remapSide({ pid: "f", from: 2, count: 1, n: 4, t0: 3, t1: 20 }, plan)).toEqual({ pid: "f", from: 2, count: 2, n: 5, t0: 3, t1: 20 });
    expect(remapSide({ pid: "f", from: 0, count: 4, n: 4 }, plan)).toEqual({ pid: "f", from: 0, count: 5, n: 5 });
  });
  it("เผื่อเย็บรายขอบ/ซิปบางช่วงตามไปถูกช่วง", () => {
    const plan = edgePlan(rect, split)!;
    expect(remapEdgeValues([1, 0.7, 0.5, 0.7], plan)).toEqual([1, 0.7, 0.5, 0.5, 0.7]);
    const meta = cleanEdgeMeta(rect, [{}, {}, { zip: true, zipR: [4, 20] }, { open: true }])!;
    const r = remapEdgeMeta(meta, plan);
    expect(r.lost).toBe(0);
    expect(r.meta![2]).toEqual({ zip: true, zipR: [4, 13] });
    expect(r.meta![3]).toEqual({ zip: true, zipR: [0, 7] });
    expect(r.meta![4]).toEqual({ open: true });
  });
  it("ลบจุด (รวมขอบ): ตะเข็บที่ปลายยังอยู่ตามได้ · ปลายหาย = ไม่เดา", () => {
    const merged: Shape = { k: "path", nodes: path.nodes.filter((_, i) => i !== 2) as PNode[] };   // ลบมุมขวาล่าง → ขอบขวา+ขอบล่าง รวมเป็นเส้นทแยง
    const plan = edgePlan(rect, merged)!;
    expect(plan.newN).toBe(3);
    expect(remapSide({ pid: "f", from: 1, count: 2, n: 4 }, plan)).toEqual({ pid: "f", from: 1, count: 1, n: 3 });
    expect(remapSide({ pid: "f", from: 1, count: 1, n: 4 }, plan)).toBeNull();
    const m = migrateSeams([{ id: "s", a: { pid: "f", from: 1, count: 1, n: 4 }, b: { pid: "g", from: 0, count: 1, n: 4 } }], new Map([["f", plan]]));
    expect(m.lost).toBe(1);
    expect(m.changed).toBe(false);
  });
  it("วงรี = จับคู่ไม่ได้ (ทำงานแบบเดิม)", () => {
    expect(edgePlan({ k: "ellipse", x: 0, y: 0, w: 10, h: 10 }, toPathShape({ k: "ellipse", x: 0, y: 0, w: 10, h: 10 }))).toBeNull();
  });
  it("ขอบเปิดตั้งใจ เก็บได้ใน edgeMeta", () => {
    expect(cleanEdgeMeta(rect, [{ open: true }, {}, {}, {}])).toEqual([{ open: true }, {}, {}, {}]);
    expect(cleanEdgeMeta(rect, [{ open: "yes" }, {}, {}, {}])).toBeNull();
  });
});

describe("ตรวจแบบก่อนผลิต (lib/pattern-check)", () => {
  const L = (v: number) => `${Math.round(v * 100) / 10} mm`;
  const front: CheckPiece = { pid: "f", name: "ตัวหน้า", shape: R(0, 0, 26, 24), allow: 0.7, mats: [{ id: "m1" }] };
  const gus: CheckPiece = { pid: "g", name: "ข้าง", shape: R(0, 40, 74, 8), allow: 0.7, mats: [{ id: "m1" }] };
  const seam: Seam = { id: "s1", a: { pid: "f", from: 1, count: 3, n: 4 }, b: { pid: "g", from: 0, count: 1, n: 4 } };
  it("ยาวเท่ากัน: เหลือแค่ขอบที่ยังไม่ได้เย็บ (ปากกระเป๋า + ขอบชิ้นข้าง)", () => {
    const list = checkPattern([front, gus], [seam]);
    expect(list.filter((x) => x.level === "error")).toEqual([]);
    const open = list.filter((x) => x.code === "edge-open");
    expect(open.map((x) => x.pids[0]).sort()).toEqual(["f", "g"]);
    expect(open.find((x) => x.pids[0] === "f")!.edges).toEqual([0]);
  });
  it("ติ๊กขอบเปิดตั้งใจ / ขอบพับ / ซิปทั้งขอบ = ไม่เตือน", () => {
    const f2 = { ...front, edgeMeta: [{ open: true }, {}, {}, {}] };
    const g2 = { ...gus, foldEdges: [0, 1, 0, 1], edgeMeta: [{}, {}, { zip: true }, {}] };
    expect(checkPattern([f2, g2], [seam]).filter((x) => x.code === "edge-open")).toEqual([]);
  });
  it("A05: เย็บ 10 กับ 15 ซม. → แจ้งต่าง 5 ซม. ไม่ยืดชิ้นเอง", () => {
    const a: CheckPiece = { pid: "a", name: "A", shape: R(0, 0, 10, 5), mats: [] }, b: CheckPiece = { pid: "b", name: "B", shape: R(0, 10, 15, 5), mats: [] };
    const s: Seam = { id: "x", a: { pid: "a", from: 0, count: 1, n: 4 }, b: { pid: "b", from: 0, count: 1, n: 4 } };
    const iss = checkPattern([a, b], [s]).find((x) => x.code === "seam-mismatch")!;
    expect(iss.level).toBe("error");
    expect(iss.data.diff).toBeCloseTo(5);
    expect(describeIssue(iss, L).th).toContain("50 mm");
    const eased = checkPattern([a, b], [{ ...s, ease: true }]).find((x) => x.seamId === "x")!;
    expect(eased.level).toBe("info");
  });
  it("ค่าคลาด: ต่าง 1 มม. — เกิน 0.5 มม. (ค่าเริ่ม) แต่ไม่เกิน 2 มม.", () => {
    const f2 = { ...front, shape: R(0, 0, 26.1, 24) };
    expect(checkPattern([f2, gus], [seam]).some((x) => x.code === "seam-mismatch")).toBe(true);
    expect(checkPattern([f2, gus], [seam], { tol: 0.2 }).some((x) => x.code === "seam-mismatch")).toBe(false);
    expect(cleanSeamTol("abc")).toBe(0.05);
    expect(cleanSeamTol(0.2)).toBe(0.2);
  });
  it("ตะเข็บอ้างขอบที่เปลี่ยนแล้ว = error ต้องเลือกขอบใหม่", () => {
    const s: Seam = { ...seam, a: { ...seam.a, n: 5 } };
    expect(checkPattern([front, gus], [s]).find((x) => x.code === "seam-broken")?.level).toBe("error");
  });
  it("รูหลุด/ชิดขอบ · เส้นตัดกันเอง · ขอบสั้น · ไม่มีวัสดุ", () => {
    const holes: Shape[] = [{ k: "ellipse", x: 10, y: 0.2, w: 6, h: 6 }, { k: "rect", x: 24, y: 10, w: 4, h: 2 }];
    const bow: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }] };
    const dup: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10.05, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const list = checkPattern([{ ...front, holes }, { pid: "b", name: "", shape: bow, mats: [] }, { pid: "d", name: "D", shape: dup, mats: [{ id: "m" }] }], []);
    const codes = list.map((x) => x.code);
    expect(codes).toContain("hole-near");
    expect(codes).toContain("hole-out");
    expect(codes).toContain("self-cross");
    expect(codes).toContain("short-edge");
    expect(codes).toContain("no-material");
    expect(codes).toContain("no-name");
    const s = summarize(list);
    expect(s.errors).toBeGreaterThanOrEqual(2);
    expect(list[0].level).toBe("error");   // เรียง error ก่อน
  });
  it("selfCrosses: สี่เหลี่ยมปกติไม่ตัด · โบว์ตัด", () => {
    expect(selfCrosses([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
    expect(selfCrosses([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
  });
});

/** ตัวสร้างชิ้นกระเป๋า (Bag CAD รอบ F2): สาย/หู · กุ๊น · ช่องโชว์บนชิ้น · ช่อง เมฆ/แมว/หมี · แผ่นกั้น · อัปเดตจากแม่แบบโดยเก็บงานแก้มือ */
import { describe, expect, it } from "vitest";
import { alignTo, bindCutWidth, bindingPlan, sameGeometry, strapPlan, templateUpdatePlan, topEdgeIndex, windowPlan, windowShape, STRAP_DEFAULT } from "@/lib/pattern-bagparts";
import { BAG_WINDOW_KINDS, bagGeometry, bagPieces, bagSeamRefs, bagWindowShape } from "@/lib/bag-templates";
import { toteKit } from "@/lib/bag-kits";
import { pieceGeometry, shapeBox, shapeInside, type Shape } from "@/lib/pattern-shape";
import { pieceEdges } from "@/lib/pattern-seams";

const R = (x: number, y: number, w: number, h: number): Shape => ({ k: "rect", x, y, w, h });

describe("สาย / หูหิ้ว", () => {
  it("พับครึ่ง: ตัดกว้าง 2 เท่า + เผื่อเย็บ · ยาว = โผล่ + 2 × โคน · รอยบากโคน 4 จุด · ขอบยาวเย็บเข้าหากัน", () => {
    const r = strapPlan({ ...STRAP_DEFAULT, w: 2.5, L: 45, attach: 4, sa: 1 })!;
    expect(shapeBox(r.piece.shape)).toMatchObject({ w: 53, h: 5 });
    expect(r.cutW).toBe(7); expect(r.piece.allow).toBe(1);
    expect(r.piece.notches).toHaveLength(4);
    expect(r.piece.selfSeams).toEqual([{ a: 0, b: 2, rev: true }]);
    expect(r.piece.count).toBe(2);
  });
  it("4 ทบ = กว้าง 4 เท่า ไม่เผื่อ · เส้นพับ 3 เส้น · ประกบ 2 ชั้น = ตัด 2 เท่า", () => {
    const r = strapPlan({ ...STRAP_DEFAULT, fold: "four", layers: 2, w: 2 })!;
    expect(shapeBox(r.piece.shape).h).toBe(8); expect(r.piece.allow).toBe(0);
    expect(r.piece.inner).toHaveLength(3); expect(r.piece.count).toBe(4);
  });
  it("ค่าไม่สมเหตุผล = ไม่สร้าง", () => { expect(strapPlan({ ...STRAP_DEFAULT, w: 0.1 })).toBeNull(); });
});

describe("กุ๊น / หุ้มขอบ", () => {
  it("กว้างตัดตามชนิด · แบ่งเป็นแถบไม่เกิน 140 ซม. เผื่อต่อ 2 ซม. · ผ้าตัดเฉียง", () => {
    expect(bindCutWidth(1, "double")).toBe(4); expect(bindCutWidth(1, "single")).toBe(3.2); expect(bindCutWidth(1, "wrap")).toBe(2);
    const r = bindingPlan(300, { w: 1, kind: "double", bias: true })!;
    expect(r.need).toBe(305); expect(r.strips).toBe(3);
    expect(r.stripLen * r.strips).toBeGreaterThanOrEqual(305 + 2 * 2);
    expect(r.stripLen).toBeLessThanOrEqual(140);
    const [a, b] = r.piece.grain!; expect(Math.abs(b[0] - a[0])).toBeCloseTo(Math.abs(b[1] - a[1]), 3);   // ลูกศรเฉียง 45°
  });
  it("ไม่มีกุ๊น = ไม่สร้าง", () => { expect(bindingPlan(0, { w: 1, kind: "double", bias: true })).toBeNull(); });
});

describe("ช่องโชว์ เมฆ / แมว / หมี", () => {
  it("ทุกรูปอยู่ในกรอบที่สั่ง · มีพื้นที่ · แมวหูแหลมถึงขอบบน", () => {
    for (const k of BAG_WINDOW_KINDS) {
      const s = bagWindowShape(k, 2, 3, 12, 10), b = shapeBox(s);
      expect(b.x).toBeCloseTo(2, 2); expect(b.y).toBeCloseTo(3, 2); expect(b.w).toBeCloseTo(12, 2); expect(b.h).toBeCloseTo(10, 2);
      expect(pieceGeometry({ shape: s }).finishedArea).toBeGreaterThan(40);
    }
    const cat = bagWindowShape("cat", 0, 0, 10, 10);
    expect(cat.k === "path" && cat.nodes.filter((n) => n.y < 0.05).length).toBeGreaterThanOrEqual(2);
  });
  it("แม่แบบ: ช่องแมว + แผ่นกั้น → มีแผ่นกั้น 1 ชิ้น + ตะเข็บ D ประกบตัวหน้า (ข้าง+ก้น) · 2 ช่องพอดี", () => {
    const G = bagGeometry({ win: "cat", winType: "window", div: true });
    expect(G.win?.kind).toBe("cat"); expect(G.win?.div).toBe(true);
    const P = bagPieces(G);
    expect(P.filter((q) => q.key === "divider")).toHaveLength(1);
    const D = bagSeamRefs(G).filter((s) => s.key === "D");
    expect(D).toHaveLength(1); expect(D[0].kind).toBe("lapped");
    const kit = toteKit({ win: "cat", winType: "window", div: true });
    expect(kit.seams.some((s) => s.b.piece === "divider" && s.kind === "lapped")).toBe(true);
    expect(bagPieces(bagGeometry({ win: "heart", winType: "zip", div: true })).some((q) => q.key === "divider")).toBe(false);   // ช่องซิปไม่มีแผ่นกั้น
    expect(bagGeometry({ win: "rocket" as never }).win).toBeNull();
  });
});

describe("ช่องโชว์บนชิ้นที่มีอยู่", () => {
  const host = { shape: R(0, 0, 30, 25), allow: 1, foldEdges: [1, 0, 0, 0] };
  it("รูในชิ้น + PVC ใหญ่กว่ารูรอบละ 1.5 + กรอบ · แผ่นกั้นเย็บทุกขอบยกเว้นขอบบน (ขอบบนเปิด)", () => {
    const r = windowPlan(host, { kind: "bear", w: 12, h: 11, cx: 15, cy: 12, structure: "top", frame: 1 })!;
    expect(shapeInside(r.hole, host.shape)).toBe(true);
    expect(shapeBox(r.pvc.shape).w).toBeCloseTo(15, 0);
    expect(r.frame?.holes).toHaveLength(1);
    expect(r.divider?.edgeMeta?.[0]).toEqual({ open: true });
    expect(r.dividerSide).toEqual({ from: 1, count: 3, n: 4 });
    expect(r.warnings).toHaveLength(0);
  });
  it("ช่องซิป: ขอบบนแผ่นหลังติดซิป · PVC ตายตัว: ไม่มีแผ่นกั้น · ชิดขอบ = เตือน · ออกนอกชิ้น = ไม่สร้าง", () => {
    expect(windowPlan(host, { kind: "rect", w: 10, h: 8, cx: 15, cy: 12, structure: "zip" })!.divider?.edgeMeta?.[0]).toEqual({ zip: true });
    expect(windowPlan(host, { kind: "circle", w: 10, h: 10, cx: 15, cy: 12, structure: "pvc" })!.divider).toBeNull();
    expect(windowPlan(host, { kind: "circle", w: 10, h: 10, cx: 5.5, cy: 12, structure: "pvc" })!.warnings).toHaveLength(1);
    expect(windowPlan(host, { kind: "circle", w: 10, h: 10, cx: 2, cy: 12, structure: "pvc" })).toBeNull();
  });
  it("SVG เอง: รูปแรกในไฟล์ย่อลงกรอบ · ขอบบนของชิ้นหาได้", () => {
    const svg = '<svg viewBox="0 0 100 100"><path d="M10 10 L90 10 L50 90 Z"/></svg>';
    const s = windowShape({ kind: "svg", svg, w: 8, h: 6, cx: 15, cy: 12 })!;
    expect(shapeBox(s)).toMatchObject({ w: 8, h: 6 });
    expect(windowShape({ kind: "svg", svg: "ไม่ใช่ svg", w: 8, h: 6, cx: 15, cy: 12 })).toBeNull();
    expect(topEdgeIndex({ k: "path", nodes: [{ x: 0, y: 20 }, { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }] })).toBe(1);
  });
});

describe("อัปเดตจากแม่แบบ (เก็บงานแก้มือ)", () => {
  it("ชิ้นไม่ได้แก้ → อัปเดต · ชิ้นแก้มือ → ไม่ทับ · ชิ้นใหม่ → เพิ่ม · ชิ้นที่หาย → แจ้ง", () => {
    const oldKit = toteKit({ W: 32, H: 28, win: "rect", winType: "window" }, { lining: false, pocket: false }).pieces;
    const newKit = toteKit({ W: 36, H: 28, win: "none" }, { lining: false, pocket: false }).pieces;
    const now = oldKit.map((q, i) => ({ key: q.key, pid: `p${i}`, shape: q.shape, holes: q.holes, allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges, notches: q.notches }));
    const handle = now.find((x) => x.key === "handle")!;
    handle.shape = { ...(handle.shape as { k: "rect"; x: number; y: number; w: number; h: number }), w: 60 };   // แก้หูหิ้วด้วยมือ
    const plan = templateUpdatePlan(now, oldKit, newKit);
    expect(plan.update.map((x) => x.key)).toContain("strip");
    expect(plan.edited.map((x) => x.key)).toEqual(["handle"]);
    expect(plan.gone.map((x) => x.key).sort()).toEqual(["back", "pvc"]);
  });
  it("เทียบรูปไม่สนตำแหน่งบนกระดาน · ย้ายชิ้นใหม่ให้ตรงตำแหน่งเดิม", () => {
    expect(sameGeometry({ shape: R(0, 0, 10, 5) }, { shape: R(40, 7, 10, 5) })).toBe(true);
    expect(sameGeometry({ shape: R(0, 0, 10, 5), allow: 1 }, { shape: R(0, 0, 10, 5), allow: 0.7 })).toBe(false);
    const a = alignTo({ shape: R(0, 0, 12, 5), notches: [[6, 0]] }, R(40, 7, 10, 5));
    expect(shapeBox(a.shape)).toMatchObject({ x: 40, y: 7, w: 12 }); expect(a.notches).toEqual([[46, 7]]);
    expect(pieceEdges(a.shape)).toHaveLength(4);
  });
});

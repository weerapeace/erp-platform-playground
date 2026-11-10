import { describe, expect, it } from "vitest";
import { BAG_DEFAULT, BAG_HANDLE_ATTACH, BAG_POCKET_MARGIN, BAG_POCKET_TOP, BAG_PRESETS, BAG_PVC_MARGIN, BAG_SLOT_OPEN, BAG_ZIP_OPEN, bagAttachRefs, bagGeometry, bagPieces, bagWindowShape, type BagPiece } from "@/lib/bag-templates";
import { cleanShape, flattenShape, pieceGeometry, projectOnOutline, shapeBox, shapeInside, shapePerimeter, type Pt } from "@/lib/pattern-shape";

const close = (a: number, b: number, eps = 0.02) => expect(Math.abs(a - b)).toBeLessThan(eps);
const polyLen = (P: Pt[]) => P.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0);
const byKey = (list: BagPiece[], key: string) => list.find((q) => q.key === key)!;
const geoOf = (q: BagPiece) => pieceGeometry({ shape: q.shape, holes: q.holes, allow: q.allow, allowEdges: q.allowEdges });

describe("เรขาคณิตกระเป๋า (bagGeometry)", () => {
  it("ค่าเริ่มต้น: ความยาวขอบ U = ผลรวมแต่ละช่วง = ความยาวเส้นจุด", () => {
    const G = bagGeometry(BAG_DEFAULT);
    close(G.parts.reduce((s, x) => s + x.len, 0), G.Lg, 1e-9);
    close(polyLen(G.U), G.Lg, 0.03);          // โค้ง 16 ช่วง สั้นกว่าโค้งจริงนิดเดียว
    expect(G.parts.map((x) => x.kind)).toEqual(["side", "corner", "bottom", "corner", "side"]);
    close(G.Wt, 38, 1e-9);
    expect(G.strip).toBe(true);
    expect(G.seams).toHaveLength(1);
    close(G.seams[0].len, G.Lg, 1e-9);
  });
  it("มุมเหลี่ยม: ขอบ U = ข้าง + ก้น + ข้าง", () => {
    const G = bagGeometry({ ...BAG_DEFAULT, r: 0, flare: 0, strip: true });
    close(G.Lg, 28 + 32 + 28, 1e-9);
    expect(G.U).toHaveLength(4);
    expect(G.marks).toEqual([28, 44, 60]);
  });
  it("ทางโค้งสั้นกว่าทางหักมุม: เพิ่มมุมโค้งแล้วชิ้นข้างสั้นลง", () => {
    const sq = bagGeometry({ ...BAG_DEFAULT, r: 0 }), rd = bagGeometry({ ...BAG_DEFAULT, r: 5 });
    expect(rd.Lg).toBeLessThan(sq.Lg);
  });
  it("มุมโค้ง > 0 บังคับข้าง+ก้นชิ้นเดียว · มุมเหลี่ยมแยก 3 ชิ้นได้ (ตะเข็บ A B C)", () => {
    expect(bagGeometry({ ...BAG_DEFAULT, r: 3, strip: false }).strip).toBe(true);
    const G = bagGeometry({ ...BAG_DEFAULT, r: 0, strip: false });
    expect(G.strip).toBe(false);
    expect(G.seams.map((s) => s.key)).toEqual(["A", "B", "C"]);
    close(G.seams[0].len, Math.hypot(3, 28), 1e-9);
  });
  it("ค่าเกินขอบเขตถูกปรับ: มุมโค้งไม่เกินครึ่งก้น · ระยะโคนหูไม่เกินปาก · ค่าเพี้ยน = ค่าเริ่มต้น", () => {
    const G = bagGeometry({ ...BAG_DEFAULT, W: 18, r: 10, g: 30, H: Number.NaN });
    expect(G.p.r).toBeLessThanOrEqual(G.rMax);
    expect(G.rMax).toBeLessThan(10);
    expect(G.p.g).toBeLessThanOrEqual(G.gMax);
    expect(G.p.H).toBe(BAG_DEFAULT.H);
  });
  it("หูสั้นกว่าครึ่งวงกลม = โค้งแบน · หูยาว = ตั้งตรงแล้วโค้ง", () => {
    const long = bagGeometry(BAG_DEFAULT).arch, short = bagGeometry({ ...BAG_DEFAULT, Lh: 20, g: 16 }).arch;
    close(2 * long.v + Math.PI * long.a, 45, 1e-9);
    expect(long.eb).toBe(0);
    expect(short.v).toBe(0);
    expect(short.eb).toBeGreaterThan(0);
  });
});

describe("ชิ้นแพทเทิร์น (bagPieces)", () => {
  it("ค่าเริ่มต้น: ตัวหน้า/หลัง 2 + หู 2 + ข้าง+ก้น 1 · ชิ้นข้างยาว = ขอบ U พอดี · ปลาย 2 ข้างเผื่อเท่าพับปาก", () => {
    const G = bagGeometry(BAG_DEFAULT), list = bagPieces(G);
    expect(list.map((q) => `${q.key}×${q.count}`)).toEqual(["front×2", "handle×2", "strip×1"]);
    const strip = byKey(list, "strip");
    close(strip.finished.w, G.Lg, 2e-3);                    // ขนาดชิ้นปัดทศนิยม 3 ตำแหน่ง
    close(strip.finished.h, 12, 1e-9);
    expect(strip.allowEdges).toEqual([1, 3, 1, 3]);         // บน ขวา ล่าง ซ้าย — ปลายขวา/ซ้ายอยู่ที่ปาก
    close(strip.cut.w, G.Lg + 2 * 3, 2e-3);
    close(strip.cut.h, 12 + 2 * 1, 1e-6);
  });
  it("ตัวหน้า: รูปชิ้น = ขนาดสำเร็จ · ขอบปากเผื่อเท่าพับปาก ขอบอื่นเผื่อเย็บ · รูปทรงผ่านตัวตรวจของระบบ", () => {
    const G = bagGeometry(BAG_DEFAULT), front = byKey(bagPieces(G), "front");
    expect(cleanShape(front.shape)).not.toBeNull();
    expect(front.allowEdges).toEqual([1, 1, 1, 1, 1, 3]);   // ขอบสุดท้าย = ขอบปาก
    const geo = geoOf(front);
    close(geo.finished.h, 28, 0.01);
    close(geo.finished.w, 38, 0.01);
    close(geo.cutBox.h, 28 + 3 + 1, 0.05);                   // บน +3 (พับปาก) · ล่าง +1 (เผื่อเย็บ)
    close(shapeBox(front.shape).x, 0, 0.01);
    close(shapeBox(front.shape).y, 0, 0.01);
    close(shapePerimeter(front.shape) - geo.finished.w, G.Lg, 0.05);   // ขอบ U ของชิ้น = ขอบ U ของกระเป๋า
    close(front.cut.h, geo.cutBox.h, 1e-9);
  });
  it("พับปากเท่ากับเผื่อเย็บ = ไม่ต้องใช้เผื่อรายขอบ · พับปาก 0 = ขอบปากไม่เผื่อ", () => {
    const same = byKey(bagPieces(bagGeometry({ ...BAG_DEFAULT, hem: 1 })), "front");
    expect(same.allowEdges).toBeNull();
    close(geoOf(same).cutBox.h, 30, 0.05);
    const none = byKey(bagPieces(bagGeometry({ ...BAG_DEFAULT, hem: 0 })), "front");
    expect(none.allowEdges![5]).toBe(0);
    close(geoOf(none).cutBox.h, 28 + 1, 0.05);
  });
  it("รอยบากทุกจุดอยู่บนเส้นเย็บของชิ้น", () => {
    for (const preset of BAG_PRESETS) {
      for (const q of bagPieces(bagGeometry({ ...BAG_DEFAULT, ...preset.params }))) {
        const P = flattenShape(q.shape);
        for (const n of q.notches) expect(projectOnOutline(P, n).d).toBeLessThan(0.05);
      }
    }
  });
  it("ก้นเหลี่ยมแยกชิ้น: ข้าง 2 (สูง = ขอบข้าง · ขอบบนเผื่อเท่าพับปาก) + ก้น 1", () => {
    const G = bagGeometry({ ...BAG_DEFAULT, ...BAG_PRESETS[2].params }), list = bagPieces(G);
    expect(list.map((q) => `${q.key}×${q.count}`)).toEqual(["front×2", "side×2", "bottom×1", "handle×2"]);
    close(byKey(list, "side").finished.h, G.Ls, 2e-3);
    close(byKey(list, "side").finished.w, 15, 1e-9);
    expect(byKey(list, "side").allowEdges).toEqual([3, 1, 1, 1]);
    close(byKey(list, "bottom").finished.w, 40, 1e-9);
    expect(byKey(list, "bottom").allowEdges).toBeNull();
  });
  it("ช่องโชว์หัวใจ: ตัวหน้ามีรู 1 รูอยู่ในชิ้น · ตัวหลังไม่มีรู · แผ่น PVC ใหญ่กว่ารูรอบละ 1.5", () => {
    const G = bagGeometry({ ...BAG_DEFAULT, ...BAG_PRESETS[1].params }), list = bagPieces(G);
    expect(list.map((q) => q.key)).toEqual(["front", "back", "pvc", "handle", "strip"]);
    const front = byKey(list, "front"), back = byKey(list, "back"), pvc = byKey(list, "pvc");
    expect(front.holes).toHaveLength(1);
    expect(back.holes).toHaveLength(0);
    expect(shapeInside(front.holes[0], front.shape)).toBe(true);
    const hb = shapeBox(front.holes[0]);
    close(hb.w, G.win!.w, 0.01);
    close(hb.h, G.win!.h, 0.01);
    close(pvc.finished.w, hb.w + 2 * BAG_PVC_MARGIN, 0.01);
    expect(pvc.allow).toBe(0);
    expect(geoOf(front).finishedArea).toBeLessThan(geoOf(back).finishedArea);   // พื้นที่ตัวหน้าหักรูแล้ว
  });
  it("ช่องซิป: ช่องแคบ 1.2 ซม. + ถุงซับในหลังช่อง (ไม่มีแผ่นใส) · ถุงไม่เลยก้นกระเป๋า · ช่องสอด = รอยกรีด 0.4 ซม.", () => {
    const G = bagGeometry({ ...BAG_DEFAULT, win: "heart", winType: "zip", ws: 18, wy: 17 }), list = bagPieces(G);
    expect(G.p.win).toBe("rect");                                  // ช่องซิปเป็นเหลี่ยมมนเสมอ
    expect(list.map((q) => q.key)).toEqual(["front", "back", "pocket", "handle", "strip"]);
    const front = byKey(list, "front"), pocket = byKey(list, "pocket"), hb = shapeBox(front.holes[0]);
    close(hb.w, 18, 0.01); close(hb.h, BAG_ZIP_OPEN, 0.01);
    expect(shapeInside(front.holes[0], front.shape)).toBe(true);
    close(pocket.finished.w, 18 + 2 * BAG_POCKET_MARGIN, 1e-9);
    close(pocket.finished.h, 2 * G.win!.pocket!.depth + BAG_POCKET_TOP, 1e-9);
    expect(G.win!.cy - G.win!.h / 2 - G.win!.pocket!.depth).toBeGreaterThanOrEqual(2 - 1e-9);   // ก้นถุงสูงกว่าตะเข็บก้น
    expect(bagAttachRefs(G).find((a) => a.kind === "behind")?.piece).toBe("pocket");
    const S = bagGeometry({ ...BAG_DEFAULT, win: "rect", winType: "slot" });
    close(S.win!.h, BAG_SLOT_OPEN, 1e-9);
    expect(bagPieces(S).some((q) => q.key === "pvc")).toBe(false);
    expect(bagGeometry({ ...BAG_DEFAULT, win: "none", winType: "zip" }).win).toBeNull();          // ไม่มีช่อง = ไม่สนชนิด
    expect(bagGeometry({ ...BAG_DEFAULT, win: "heart" }).win).toMatchObject({ type: "window", kind: "heart", pocket: null });
  });
  it("ขอบพับ: ขอบปากของตัวหน้า/ชิ้นข้างติดธงพับ · พับปาก 0 = ไม่มีขอบพับ · หู/ก้นไม่มี", () => {
    const list = bagPieces(bagGeometry(BAG_DEFAULT));
    expect(byKey(list, "front").foldEdges).toEqual([0, 0, 0, 0, 0, 1]);
    expect(byKey(list, "strip").foldEdges).toEqual([0, 1, 0, 1]);
    expect(byKey(list, "handle").foldEdges).toBeNull();
    expect(byKey(bagPieces(bagGeometry({ ...BAG_DEFAULT, hem: 1 })), "front").foldEdges).toEqual([0, 0, 0, 0, 0, 1]);   // เผื่อเท่ากันก็ยังเป็นขอบพับ
    expect(byKey(bagPieces(bagGeometry({ ...BAG_DEFAULT, hem: 0 })), "front").foldEdges).toBeNull();
  });
  it("ช่องโชว์ 3 รูป: กรอบตรงตามที่สั่ง", () => {
    for (const kind of ["rect", "heart", "circle"] as const) {
      const b = shapeBox(bagWindowShape(kind, 5, 6, 12, 9));
      close(b.x, 5, 0.01); close(b.y, 6, 0.01); close(b.w, 12, 0.01); close(b.h, 9, 0.01);
    }
  });
  it("หู: ยาว = ส่วนที่โผล่ + โคน 2 ข้าง · กว้าง = 2 เท่าของหู · จุดติดหูอยู่ที่ขอบปากของแผ่น · ชิ้นวางไม่ทับกัน", () => {
    const G = bagGeometry(BAG_DEFAULT), list = bagPieces(G), h = byKey(list, "handle");
    close(h.finished.w, 45 + 2 * BAG_HANDLE_ATTACH, 1e-9);
    close(h.finished.h, 5, 1e-9);
    const at = bagAttachRefs(G)[0];
    expect([at.a![1], at.b![1]]).toEqual([0, 0]);
    close(at.b![0] - at.a![0], 14, 1e-9);
    const boxes = list.map((q) => { const g = geoOf(q); return { x: q.at[0] - (g.finished.x - g.cutBox.x), y: q.at[1] - (g.finished.y - g.cutBox.y), w: q.cut.w, h: q.cut.h }; });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6).toBe(true);
    }
  });
});

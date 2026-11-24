import { describe, expect, it } from "vitest";
import {
  PT_TO_MM, cleanPieces, dimGeometry, equalHeight, fmtDim, isWhiteFill, layoutPage, mergePieces, opsBox, opsToSvgPath,
  piecesFromOperatorList, resetPieceSize, setPieceSize, type BlockPiece,
  GROUP_DEFAULT, applyGrouping, autoGroup, buildPiece, groupsFromPieces, pieceShapes, piecesForSave, type PieceGroup,
} from "@/lib/block-print";

const OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, fill: 22, eoFill: 23, stroke: 20, endPath: 28, showText: 44, setFillRGBColor: 59, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const VIEW = [0, 0, 200, 100];
const sq = (x: number, y: number, s: number) => new Float32Array([0, x, y, 1, x + s, y, 1, x + s, y + s, 1, x, y + s, 4]);
const path = (paint: number, data: Float32Array) => [paint, [data], null];
const list = (items: [number, unknown[]][]) => ({ fnArray: items.map((i) => i[0]), argsArray: items.map((i) => i[1]) });

const piece = (id: string, w: number, h: number, on = true): BlockPiece => ({ id, name: id, d: [0, 0, 0, 1, w, 0, 1, w, h, 1, 0, h, 4], fill: "nonzero", ow: w, oh: h, w, h, ax: 0, ay: 0, on });

describe("อ่านคำสั่งวาดจากไฟล์ .ai", () => {
  it("เส้นที่เติมสี = 1 ชิ้น · แปลง pt เป็น มม. และกลับแกน y", () => {
    const r = piecesFromOperatorList(list([[91, path(22, sq(10, 10, 20))]]), OPS, VIEW);
    expect(r.pieces).toHaveLength(1);
    const p = r.pieces[0];
    expect(p.ow).toBeCloseTo(20 * PT_TO_MM, 2);
    expect(p.ax).toBeCloseTo(10 * PT_TO_MM, 2);
    expect(p.ay).toBeCloseTo((100 - 30) * PT_TO_MM, 2);
    expect(opsBox(p.d)).toMatchObject({ x: 0, y: 0 });
  });
  it("ข้ามเส้นขอบ ตัวหนังสือ พื้นขาว และ clip · นับไว้บอกผู้ใช้", () => {
    const r = piecesFromOperatorList(list([
      [91, path(20, sq(0, 0, 5))],
      [44, []],
      [10, []], [59, ["#ffffff"]], [91, path(22, sq(0, 0, 100))], [11, []],
      [91, path(28, sq(0, 0, 50))],
      [91, path(22, sq(50, 50, 10))],
    ]), OPS, VIEW);
    expect(r.pieces).toHaveLength(1);
    expect(r.skipped).toEqual({ strokes: 1, texts: 1, images: 0, whites: 1, backgrounds: 0 });
  });
  it("คิด transform + form ซ้อน · eoFill = evenodd", () => {
    const r = piecesFromOperatorList(list([
      [10, []], [12, [2, 0, 0, 2, 0, 0]], [74, [[1, 0, 0, 1, 5, 0], null]], [91, path(23, sq(0, 0, 10))], [75, []], [11, []],
    ]), OPS, VIEW);
    expect(r.pieces[0].ow).toBeCloseTo(20 * PT_TO_MM, 2);
    expect(r.pieces[0].ax).toBeCloseTo(10 * PT_TO_MM, 2);
    expect(r.pieces[0].fill).toBe("evenodd");
  });
  it("เรียงชิ้นแถวบนก่อน แล้วซ้ายไปขวา · ตั้งชื่อ ชิ้น 1..n", () => {
    const r = piecesFromOperatorList(list([
      [91, path(22, sq(100, 70, 10))], [91, path(22, sq(10, 70, 10))], [91, path(22, sq(10, 10, 10))],
    ]), OPS, VIEW);
    expect(r.pieces.map((p) => Math.round(p.ax / PT_TO_MM))).toEqual([10, 100, 10]);
    expect(r.pieces.map((p) => p.name)).toEqual(["ชิ้น 1", "ชิ้น 2", "ชิ้น 3"]);
  });
  it("พื้นหลังสีเต็มอาร์ตบอร์ด = ไม่ติ๊กส่งออก และไม่นับลำดับชิ้น", () => {
    const full = new Float32Array([0, 0, 0, 1, 200, 0, 1, 200, 100, 1, 0, 100, 4]);
    const r = piecesFromOperatorList(list([[91, path(22, sq(10, 10, 10))], [91, path(22, full)], [91, path(22, sq(60, 10, 10))]]), OPS, VIEW);
    expect(r.pieces.find((p) => p.name === "พื้นหลัง")?.on).toBe(false);
    expect(r.skipped.backgrounds).toBe(1);
    expect(r.pieces.filter((p) => p.on).map((p) => p.name)).toEqual(["ชิ้น 1", "ชิ้น 2"]);
  });
  it("สีขาวรู้ได้ทั้งแบบ #hex และตัวเลข", () => {
    expect(isWhiteFill(["#FFFFFF"])).toBe(true);
    expect(isWhiteFill(["#000000"])).toBe(false);
    expect(isWhiteFill([1, 1, 1])).toBe(true);
    expect(isWhiteFill([255, 255, 254])).toBe(true);
    expect(isWhiteFill([0.5])).toBe(false);
  });
});

describe("กรอบของเส้น", () => {
  it("คิดโค้งตามรูปจริง ไม่ใช่จุดจับ", () => {
    const b = opsBox([0, 0, 0, 2, 0, 10, 10, 10, 10, 0]);
    expect(b!.h).toBeCloseTo(7.5, 5);
    expect(b!.w).toBeCloseTo(10, 5);
  });
  it("โค้ง 2 จุดแปลงเป็นโค้งปกติ", () => {
    expect(opsToSvgPath([0, 0, 0, 3, 5, 10, 10, 0])).toMatch(/^M0 0C/);
  });
});

describe("ขนาด", () => {
  const g = piece("g", 43.2, 68.2);
  it("ล็อกสัดส่วน", () => {
    const p = setPieceSize(g, "w", 21.6, true);
    expect(p.h).toBeCloseTo(34.1, 3);
    expect(setPieceSize(g, "h", 10, false).w).toBe(43.2);
  });
  it("ค่าแปลก ๆ ไม่เปลี่ยนอะไร · กลับขนาดเดิมได้", () => {
    expect(setPieceSize(g, "w", -1, true)).toBe(g);
    expect(resetPieceSize(setPieceSize(g, "w", 5, true))).toMatchObject({ w: 43.2, h: 68.2 });
  });
  it("ให้ทุกชิ้นที่ติ๊กสูงเท่ากัน (ชิ้นที่ไม่ติ๊กไม่เปลี่ยน)", () => {
    const out = equalHeight([piece("E", 28.2, 43), piece("N", 38.9, 50), piece("x", 10, 10, false)], "E");
    expect(out[1].h).toBe(43);
    expect(out[1].w).toBeCloseTo(38.9 * 43 / 50, 3);
    expect(out[2].h).toBe(10);
  });
  it("รวมชิ้นตามตำแหน่งเดิม", () => {
    const a = { ...piece("a", 10, 10), ax: 0, ay: 0 }, b = { ...piece("b", 10, 10), ax: 20, ay: 5 };
    const out = mergePieces([a, b, piece("c", 1, 1)], ["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", ow: 30, oh: 15, w: 30, h: 15 });
  });
});

describe("ตัวเลขบนเส้นบอกขนาด", () => {
  it("แบบตัวอย่าง 4.32 cm / 4.3 cm", () => {
    expect(fmtDim(43.2, "cm")).toBe("4.32 cm");
    expect(fmtDim(43, "cm")).toBe("4.3 cm");
    expect(fmtDim(43.25, "mm")).toBe("43.3 mm");
  });
  it("ตัวเลขสูงหมุนอยู่ขวา ตัวเลขกว้างอยู่ล่าง", () => {
    const g = dimGeometry({ id: "g", x: 20, y: 20, w: 43.2, h: 68.2 }, "cm");
    expect(g.texts).toEqual([
      expect.objectContaining({ text: "6.82 cm", rotate: 90 }),
      expect.objectContaining({ text: "4.32 cm", rotate: 0 }),
    ]);
    expect(g.lines.filter((l) => l.kind === "dim")).toHaveLength(6);
  });
});

describe("จัดหน้า PDF", () => {
  it("3 ชิ้นแบบตัวอย่าง ลงหน้า A4 เดียว", () => {
    const lay = layoutPage([piece("g", 43.2, 68.2), piece("E", 28.2, 43), piece("N", 38.9, 43)], "A4");
    expect(lay.ok).toBe(true);
    if (lay.ok) {
      expect(lay.items).toHaveLength(3);
      for (const it of lay.items) { expect(it.x).toBeGreaterThan(0); expect(it.x + it.w).toBeLessThan(lay.pageW); }
      // ชิดล่างในแถวเดียวกัน
      expect(lay.items[0].y + lay.items[0].h).toBeCloseTo(lay.items[1].y + lay.items[1].h, 5);
    }
  });
  it("ชิ้นใหญ่เกินกระดาษ = แจ้งเตือน ไม่ย่อเอง", () => {
    const lay = layoutPage([piece("big", 300, 50)], "A4");
    expect(lay.ok).toBe(false);
    if (!lay.ok) expect(lay.tooBig).toEqual(["big"]);
    expect(layoutPage([piece("big", 300, 50)], "A3").ok).toBe(true);
  });
  it("ยาวเกินแนวตั้ง → ใช้แนวนอน", () => {
    const lay = layoutPage([piece("long", 200, 20)], "A4");
    expect(lay.ok && lay.orientation).toBe("landscape");
  });
  it("ไม่ได้ติ๊กอะไร = แจ้งเตือน", () => {
    expect(layoutPage([piece("a", 10, 10, false)], "A4").ok).toBe(false);
  });
});

describe("ตรวจข้อมูลก่อนบันทึก", () => {
  it("รับชิ้นที่ถูกต้อง", () => {
    const r = cleanPieces([piece("a", 10, 10)]);
    expect(r.ok).toBe(true);
  });
  it("ปฏิเสธเส้นเพี้ยน ขนาดติดลบ รหัสซ้ำ", () => {
    expect(cleanPieces([{ ...piece("a", 10, 10), d: [9, 1, 2] }]).ok).toBe(false);
    expect(cleanPieces([{ ...piece("a", 10, 10), w: -1 }]).ok).toBe(false);
    expect(cleanPieces([piece("a", 1, 1), piece("a", 2, 2)]).ok).toBe(false);
    expect(cleanPieces("x").ok).toBe(false);
  });
});

describe("หน้าเลือกชิ้น — จัดกลุ่ม", () => {
  const at = (id: string, ax: number, ay: number, w: number, h: number, fill: "nonzero" | "evenodd" = "nonzero"): BlockPiece => ({ ...piece(id, w, h), ax, ay, fill });
  // ตัว i: ขา + จุดห่าง 0.1 มม. · ตัว = : สองขีดห่าง 2.4 มม. · ใบโคลเวอร์: สามวงทับกัน
  const atoms = [
    at("stem", 10, 23, 3, 15), at("dot", 10, 20.9, 3, 2),
    at("eq1", 30, 26, 11, 2.6), at("eq2", 30, 31, 11, 2.6),
    at("c1", 60, 20, 6, 6), at("c2", 57, 25, 6, 6), at("c3", 63, 25, 6, 6),
    at("dust", 90, 50, 0.1, 0.2), at("rule", 0, 0, 120, 0.3),
  ];
  const ids = (gs: PieceGroup[]) => gs.map((g) => [...g.ids].sort().join("+")).sort();

  it("ทับกัน + ใกล้ไม่เกิน 0.2 มม. = ชิ้นเดียว · เศษ/เส้นกรอบแยกไว้ไม่ติ๊ก", () => {
    const gs = autoGroup(atoms, GROUP_DEFAULT);
    expect(ids(gs)).toEqual(["c1+c2+c3", "dot+stem", "dust", "eq1", "eq2", "rule"]);
    expect(gs.find((g) => g.ids.includes("dust"))).toMatchObject({ on: false, kind: "dust" });
    expect(gs.find((g) => g.ids.includes("rule"))).toMatchObject({ on: false, kind: "frame" });
  });
  it("ปรับระยะรวมได้ · ปิดการรวมได้", () => {
    expect(ids(autoGroup(atoms, { ...GROUP_DEFAULT, gap: 2.5 }))).toContain("eq1+eq2");
    expect(ids(autoGroup(atoms, { overlap: false, gap: null, hideJunk: false })).length).toBe(atoms.length);
  });
  it("กรอบใหญ่ครอบงานทั้งหมดไม่ดูดทุกชิ้นเป็นชิ้นเดียว", () => {
    const gs = autoGroup([at("frame", 0, 0, 100, 100), ...atoms.slice(0, 7)], GROUP_DEFAULT);
    expect(gs.find((g) => g.ids.includes("frame"))!.ids).toEqual(["frame"]);
  });
  it("ไฟล์จริง final 2: แถบพื้น/เส้นคั่นที่ชนลายทั้งแถว ไม่ดูดลายรวมเป็นชิ้นเดียว · ลายห่าง 0.25 มม. ไม่รวมกัน", () => {
    const strap = at("strap", 47.99, 142.69, 114.02, 13), top = at("top", 47.99, 142.69, 113.93, 4), bot = at("bot", 47.99, 151.69, 113.93, 4);
    const row = [at("s1", 48.17, 146.69, 3.88, 5), at("s2", 52.38, 146.69, 3.82, 5), at("s3", 56.5, 146.69, 4.61, 5), at("s4", 61.42, 146.69, 4.61, 5)];
    const flower = [at("core", 100.25, 147.9, 2.58, 2.58), at("pa", 99.76, 147.4, 1.07, 1.08), at("pb", 101.09, 146.69, 0.91, 1.08), at("pc", 99.05, 148.74, 1.08, 0.91)];
    const gs = ids(autoGroup([strap, top, bot, ...row, ...flower], GROUP_DEFAULT));
    expect(gs).toEqual(["bot", "core+pa+pb+pc", "s1", "s2", "s3", "s4", "strap", "top"]);
  });
  it("พื้นหลังไม่ถูกรวม", () => {
    const bg = { ...at("bg", 0, 0, 200, 100), on: false, name: "พื้นหลัง" };
    expect(autoGroup([bg, ...atoms.slice(0, 2)], GROUP_DEFAULT).find((g) => g.ids.includes("bg"))).toMatchObject({ kind: "background", on: false });
  });

  it("รวมแล้วแยกคืนได้ · เส้นรูยังเป็น evenodd", () => {
    const ring = at("ring", 0, 5, 10, 10, "evenodd"), d1 = at("d1", 1, 0, 2, 2), d2 = at("d2", 6, 0, 2, 2);
    const merged = applyGrouping([ring, d1, d2], [{ ids: ["ring", "d1", "d2"], on: true }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ ow: 10, oh: 15, ax: 0, ay: 0, name: "ชิ้น 1" });
    expect(pieceShapes(merged[0]).map((s) => s.fill)).toEqual(["evenodd", "nonzero", "nonzero"]);
    const back = applyGrouping(merged, groupsFromPieces(merged).flatMap((g) => g.ids.map((id) => ({ ids: [id], on: true }))));
    expect(back.map((p) => p.id).sort()).toEqual(["d1", "d2", "ring"]);
    expect(back.find((p) => p.id === "ring")!.fill).toBe("evenodd");
  });
  it("ชิ้นที่ไม่เปลี่ยนกลุ่ม ขนาด/ชื่อที่ตั้งไว้ไม่หาย", () => {
    const a = { ...at("a", 0, 0, 10, 10), w: 40, h: 40, name: "โลโก้" }, b = at("b", 30, 0, 5, 5), c = at("c", 37, 0, 5, 5);
    const out = applyGrouping([a, b, c], [{ ids: ["a"], on: true }, { ids: ["b", "c"], on: true }]);
    expect(out.find((p) => p.id === "a")).toMatchObject({ w: 40, h: 40, name: "โลโก้" });
    const bc = out.find((p) => p.parts)!;
    expect(bc).toMatchObject({ ow: 12, oh: 5, name: "ชิ้น 2" });
    expect(["a", "b", "c"]).not.toContain(bc.id);
  });
  it("บันทึกชิ้นรวมได้ และสร้างเส้นรวมใหม่จาก parts เอง", () => {
    const m = buildPiece([at("x", 0, 0, 2, 2), at("y", 5, 0, 2, 2)], "m1", "ชิ้น 1");
    const r = cleanPieces([{ ...m, d: [0, 0, 0] }]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.pieces[0].parts).toHaveLength(2); expect(r.pieces[0].d.length).toBe(m.d.length); }
  });
});

describe("ส่งชิ้นรวมขึ้นเซิร์ฟเวอร์", () => {
  it("ไม่ส่งเส้นรวม แต่เซิร์ฟเวอร์สร้างคืนได้ครบ", () => {
    const m = buildPiece([{ ...piece("x", 2, 2), ax: 0 }, { ...piece("y", 2, 2), ax: 5 }], "m1", "ชิ้น 1");
    const sent = piecesForSave([m, piece("z", 1, 1)]);
    expect(sent[0].d).toEqual([]);
    expect(sent[1].d.length).toBeGreaterThan(0);
    const r = cleanPieces(JSON.parse(JSON.stringify(sent)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pieces[0].d).toEqual(m.d);
  });
});

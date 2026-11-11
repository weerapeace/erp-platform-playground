import { describe, expect, it } from "vitest";
import { BAG_STYLES, bagKit, kitParams, toteKit, type BagKit, type BagStyle } from "@/lib/bag-kits";
import { assemble, cleanAttaches, type AsmPiece, type Attach } from "@/lib/pattern-assembly";
import { buildSewn } from "@/lib/pattern-sewn";
import { checkSeam, cleanSeams, pieceEdges, type Seam } from "@/lib/pattern-seams";
import { movePiece, shapeBox } from "@/lib/pattern-shape";
import { cleanProjectPieces } from "@/lib/pattern-project";
import { bindRuns, slitList, zipEdgeList } from "@/lib/pattern-trims";

/** ชุดแม่แบบ → ชิ้น/ตะเข็บ/จุดติด แบบที่หน้าจอวางลงกระดาน (รหัสชิ้น = key ที่เปลี่ยน ":" เป็น "_") */
function board(kit: BagKit) {
  const pid = (k: string) => k.replace(":", "_");
  const raw = kit.pieces.map((q) => {
    const b = shapeBox(q.shape), m = movePiece({ shape: q.shape, holes: q.holes, grain: q.grain, notches: q.notches, inner: q.inner ?? null }, q.at[0] - b.x, q.at[1] - b.y);
    return { pid: pid(q.key), name: q.name, count: q.count, allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges, edgeMeta: q.edgeMeta, shape: m.shape, holes: m.holes, notches: m.notches ?? [], grain: m.grain ?? null, at: q.at,
      ...(m.inner?.length ? { inner: m.inner } : {}), ...(q.lining ? { info: { role: "lining" } } : {}), ...(q.linkTo ? { link: { to: pid(q.linkTo) } } : {}) };
  });
  const pieces = cleanProjectPieces(raw);
  const seamsRaw = kit.seams.map((s, i) => ({ id: `s${i}`, a: { ...s.a, pid: pid(s.a.piece) }, b: { ...s.b, pid: pid(s.b.piece) }, ...(s.kind ? { kind: s.kind } : {}) }));
  const seams: Seam[] = cleanSeams(seamsRaw, new Set(pieces.map((p) => p.pid)));
  const attaches: Attach[] = cleanAttaches(kit.attach.map((a, i) => ({ id: `a${i}`, kind: a.kind, pid: pid(a.piece), on: pid(a.on), a: a.a, b: a.b, len: a.len, w: a.w, tail: a.tail, across: a.across })), new Set(pieces.map((p) => p.pid)));
  const asm: AsmPiece[] = pieces.map((p) => ({ pid: p.pid, name: p.name, count: p.count, shape: p.shape, holes: p.holes, ...(p.info?.role === "lining" ? { layer: "lining" as const } : {}), ...(p.inner?.length ? { inner: p.inner } : {}), ...(p.edgeMeta ? { edgeMeta: p.edgeMeta } : {}) }));
  return { raw, pieces, seams, attaches, asm };
}
const kitOf = (style: BagStyle, o = { lining: true, pocket: true }): BagKit => (style === "tote" ? toteKit({}, o) : bagKit(style, {}, o));
const STYLES = BAG_STYLES.map((s) => s.key);
const SET1: BagStyle[] = ["tote", "flat", "pouch", "box", "flap", "round"];
const zRange = (pos: number[]) => { let lo = Infinity, hi = -Infinity; for (let i = 2; i < pos.length; i += 3) { lo = Math.min(lo, pos[i]); hi = Math.max(hi, pos[i]); } return [lo, hi]; };
const yRange = (pos: number[]) => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < pos.length; i += 3) { lo = Math.min(lo, pos[i]); hi = Math.max(hi, pos[i]); } return [lo, hi]; };

describe("ชุดแม่แบบทรงกระเป๋า 6 ทรง (lib/bag-kits)", () => {
  it("มี 12 ทรง (ชุดแรก 6 + ชุดสอง 6) · ค่าตั้งต้นอยู่ในขอบเขต · ค่าเกินขอบเขตถูกปรับ", () => {
    expect(STYLES).toEqual([...SET1, "bucket", "duffel", "backpack", "cosmetic", "drawstring", "wallet"]);
    expect(kitParams("pouch", { r: 99, W: 500 })).toMatchObject({ W: 60, r: 5.5 });      // มุมมนไม่เกินครึ่งด้านสั้น (13 ÷ 2 − 1)
    expect(kitParams("round", { W: 14, H: 30 }).H).toBe(14);                               // ทรงกลม: สูง = กว้าง
  });

  for (const style of STYLES) {
    it(`${style}: ชิ้นและตะเข็บผ่านตัวตรวจของระบบครบ · ขอบคู่ยาวเท่ากันทุกตะเข็บ · ชิ้นไม่ทับกันบนกระดาน`, () => {
      const kit = kitOf(style), B = board(kit);
      expect(B.pieces).toHaveLength(kit.pieces.length);
      expect(B.seams).toHaveLength(kit.seams.length);
      const shapes = new Map(B.pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner }]));
      for (const s of B.seams) expect([s.id, checkSeam(shapes, s).status]).toEqual([s.id, "ok"]);
      expect(new Set(kit.pieces.map((q) => q.key)).size).toBe(kit.pieces.length);
      const boxes = B.pieces.map((p) => shapeBox(p.shape));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], hit = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
        expect([kit.pieces[i].key, kit.pieces[j].key, hit]).toEqual([kit.pieces[i].key, kit.pieces[j].key, false]);
      }
    });

    (SET1.includes(style) ? it : it.skip)(`${style}: มีซับในทุกทรง — ชิ้นซับในของตัวกระเป๋าครบ ขนาดเท่าตัวนอก ผูกรูปกับตัวนอก · ประกอบ 3 มิติได้ทั้งตัวนอกและซับใน`, () => {
      const kit = kitOf(style), B = board(kit);
      const lining = kit.pieces.filter((q) => q.lining && q.key !== "lpocket");
      expect(lining.length).toBeGreaterThan(0);
      for (const q of lining) {
        const src = kit.pieces.find((x) => x.key === q.key.slice(2))!;
        expect([q.key, q.count, JSON.stringify(q.shape)]).toEqual([`L:${src.key}`, src.count, JSON.stringify(src.shape)]);
        expect(q.linkTo).toBe(src.linkTo ?? src.key);                                                   // ผูกกับต้นแบบตัวจริง (ไม่ผูกต่อเป็นทอด)
      }
      expect(kit.pieces.filter((q) => /handle|strap/.test(q.key) && q.lining)).toHaveLength(0);        // หู / สาย ไม่มีซับใน
      const A = assemble(B.asm, B.seams, B.attaches), L = assemble(B.asm, B.seams, [], "lining");
      expect([A.ok, L.ok]).toEqual([true, true]);
      const sc = buildSewn(B.asm, B.seams, B.attaches);
      expect(sc.notes).toEqual([]);                                                                      // ไม่มีชิ้นค้าง / ชิ้นที่ยังวางไม่ได้
      expect(sc.parts.filter((p) => p.kind === "loose")).toHaveLength(0);
    });

    (SET1.includes(style) ? it : it.skip)(`${style}: ไม่เอาซับใน = ได้เฉพาะตัวนอก · ไม่เอาช่องใส่ของ = ไม่มีชิ้นช่องและเส้นใน`, () => {
      const bare = kitOf(style, { lining: false, pocket: true });
      expect(bare.pieces.some((q) => q.lining)).toBe(false);
      const noPocket = kitOf(style, { lining: true, pocket: false });
      expect(noPocket.pieces.some((q) => q.key === "lpocket" || q.inner?.length)).toBe(false);
    });
  }

  it("ช่องใส่ของในซับใน: แผ่นใหญ่พอ = 1 ช่องบนซับในแผ่นหลัง (เส้นใน + ชิ้นปะ + ตะเข็บกับเส้นใน) · ทรงกลมแผ่นเล็ก = ไม่ใส่", () => {
    for (const style of ["tote", "flat", "pouch", "box", "flap"] as BagStyle[]) {
      const kit = kitOf(style), B = board(kit), host = style === "flat" || style === "pouch" || style === "tote" ? "L:front" : "L:back";
      expect([style, kit.pieces.filter((q) => q.key === "lpocket").length, kit.pieces.find((q) => q.key === host)?.inner?.length]).toEqual([style, 1, 1]);
      const sc = buildSewn(B.asm, B.seams, B.attaches);
      expect([style, sc.parts.find((p) => p.pid === "lpocket")?.kind]).toEqual([style, "patch"]);
    }
    expect(kitOf("round").pieces.some((q) => q.key === "lpocket")).toBe(false);
  });

  it("ซิป: ซองซิป / ทรงกล่อง / ทรงกลม ได้ซิป 1 เส้นจากขอบที่ติ๊กไว้ (ยาวเท่าขอบ) · ถุงผ้า / ฝาปิด ไม่มีซิป", () => {
    const zips = (style: BagStyle) => zipEdgeList(board(kitOf(style)).pieces);
    expect(zips("pouch").map((z) => [z.pid, z.len])).toEqual([["front", 20]]);
    expect(zips("box").map((z) => [z.pid, z.len])).toEqual([["zipA", 24]]);
    const round = zips("round"), E = pieceEdges(board(kitOf("round")).pieces.find((p) => p.pid === "front")!.shape);
    expect(round).toHaveLength(1);
    expect(round[0].len).toBeCloseTo(E[0].len + E[1].len, 1);                                // 2/5 ของเส้นรอบวง
    expect(round[0].len).toBeCloseTo((Math.PI * 12 * 2) / 5, 0);
    expect([zips("flat").length, zips("flap").length]).toEqual([0, 0]);
    expect(slitList(board(kitOf("box")).pieces)).toEqual([]);
    expect(bindRuns(board(kitOf("box")).pieces).total).toBe(0);
  });

  it("ภาพ 3 มิติ ทรงกล่อง: แถบซิปบนพับเข้าหากันปิดปาก (อยู่ที่ความสูงปาก · จากแผ่นหน้า/หลังเข้าหากลาง)", () => {
    const B = board(kitOf("box")), sc = buildSewn(B.asm, B.seams, B.attaches), D = sc.asm!.depth, H = sc.asm!.height;
    const a = sc.parts.find((p) => p.pid === "zipA")!, b = sc.parts.find((p) => p.pid === "zipB")!;
    expect([a.kind, b.kind]).toEqual(["flap", "flap"]);
    const [ya0, ya1] = yRange(a.pos), [za0, za1] = zRange(a.pos), [zb0, zb1] = zRange(b.pos);
    expect(ya0).toBeGreaterThan(H - 0.5); expect(ya1).toBeLessThan(H + 0.5);                 // แบนอยู่ที่ปาก ไม่ตั้งขึ้น
    expect(za1).toBeCloseTo(D / 2, 1); expect(za0).toBeCloseTo(0, 1);                         // แถบหน้า: จากแผ่นหน้าถึงกึ่งกลาง
    expect(zb0).toBeCloseTo(-D / 2, 1); expect(zb1).toBeCloseTo(0, 1);                        // แถบหลัง: จากแผ่นหลังถึงกึ่งกลาง
    expect(sc.finishes.map((f) => [f.pid, f.kind])).toEqual([]);                             // ซิปอยู่บนแถบ (ชิ้นพับ) ยังไม่วาดเส้นซิปในภาพ
    expect([a.fold, b.fold, sc.bodyH]).toEqual([true, true, H]);                             // แถบซิป = ชิ้นปิดปาก (ไม่ใช่ชิ้นเสริมเย็บบางช่วง)
  });

  it("ภาพ 3 มิติ ทรงฝาปิด: ฝาเย็บกับปากแผ่นหลัง ข้ามปากแล้วพับลงปิดด้านหน้า · ซับในฝาประกบไม่วาดแยก", () => {
    const B = board(kitOf("flap")), sc = buildSewn(B.asm, B.seams, B.attaches), D = sc.asm!.depth, H = sc.asm!.height;
    const f = sc.parts.find((p) => p.pid === "flap")!;
    const [y0, y1] = yRange(f.pos), [z0, z1] = zRange(f.pos);
    expect(z0).toBeCloseTo(-D / 2, 1);                                                        // เริ่มที่แผ่นหลัง
    expect(z1).toBeGreaterThan(D / 2);                                                        // เลยแผ่นหน้าออกมาด้านนอก
    expect(y1).toBeLessThan(H + 0.5);
    expect(y0).toBeCloseTo(H - 13, 0);                                                        // ทับด้านหน้าลงมา = ส่วนที่เกินความหนา (13 ซม.)
    expect(sc.parts.some((p) => p.pid === "L_flap")).toBe(false);
  });

  it("ภาพ 3 มิติ ทรงกลม: แถบซิปโค้งตามขอบบนของวงกลม เข้าหากันปิดด้านบน", () => {
    const B = board(kitOf("round")), sc = buildSewn(B.asm, B.seams, B.attaches), D = sc.asm!.depth;
    expect(sc.asm!.kind).toBe("wrap");
    const a = sc.parts.find((p) => p.pid === "zipA")!;
    const [z0, z1] = zRange(a.pos), [y0, y1] = yRange(a.pos);
    expect(z1).toBeCloseTo(D / 2, 1); expect(z0).toBeCloseTo(0, 1);
    expect(y1 - y0).toBeGreaterThan(3);                                                       // โค้งตามวงกลม ไม่ใช่แถบแบนระดับเดียว
    expect(y1).toBeLessThan(sc.asm!.height + 0.5);
  });

  it("สายสะพาย (ทรงกล่อง / ฝาปิด) พาดข้างถึงข้าง: โคนอยู่ที่ผิวชิ้นข้างซ้าย/ขวา กึ่งกลางความหนา ต่ำจากปาก 2 ซม.", () => {
    for (const style of ["box", "flap"] as BagStyle[]) {
      const B = board(kitOf(style)), A = assemble(B.asm, B.seams, B.attaches);
      if (!A.ok) throw new Error("ประกอบไม่ได้");
      expect(A.handles).toHaveLength(1);
      const h = A.handles[0];
      expect([style, h.pid, h.side]).toEqual([style, "strap", 0]);
      expect(h.a[0]).toBeCloseTo(-A.width / 2 - 0.15, 1); expect(h.b[0]).toBeCloseTo(A.width / 2 + 0.15, 1);
      expect(h.a[1]).toBeCloseTo(A.height - 2, 1); expect(h.len).toBe(120);
      expect(A.loose).not.toContain("strap");
    }
  });

  it("ปลายแถบซิปเย็บกับปลายชิ้นข้าง (ทรงกล่อง / ทรงกลม): 4 ตะเข็บบางช่วง ครึ่งละชิ้น ยาวเท่ากัน · ภาพ 3 มิติยังปิดปากเหมือนเดิม ไม่มีชิ้นค้าง", () => {
    for (const style of ["box", "round"] as BagStyle[]) {
      const kit = kitOf(style, { lining: false, pocket: false }), B = board(kit);
      const ends = B.seams.filter((s) => s.a.pid === "gusset" && s.a.t0 != null);
      expect([style, ends.length, ends.map((s) => s.b.pid).sort().join()]).toEqual([style, 4, "zipA,zipA,zipB,zipB"]);
      const shapes = new Map(B.pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner }]));
      for (const s of ends) expect(checkSeam(shapes, s).status).toBe("ok");
      const sc = buildSewn(B.asm, B.seams, B.attaches);
      expect([style, sc.notes.length, sc.parts.find((p) => p.pid === "zipA")?.kind]).toEqual([style, 0, "flap"]);
    }
  });

  it("Tote: ชิ้นตัวนอกเหมือนสูตรเดิมทุกชิ้น (ลำดับ ชื่อ รูป ตำแหน่ง) · ซับในวางใต้ชุดตัวนอก · แบบมีช่องโชว์ ซับในไม่เจาะช่องและไม่ผูกรูป", () => {
    const kit = toteKit({}), outer = kit.pieces.filter((q) => !q.lining);
    expect(outer.map((q) => q.key)).toEqual(["front", "handle", "strip"]);
    expect(kit.pieces.filter((q) => q.lining).map((q) => q.key)).toEqual(["L:front", "L:strip", "lpocket"]);
    const low = Math.max(...outer.map((q) => q.at[1] + shapeBox(q.shape).h));
    for (const q of kit.pieces.filter((x) => x.lining)) expect(q.at[1]).toBeGreaterThan(low);
    const win = toteKit({ win: "heart", ws: 12 });
    const lf = win.pieces.find((q) => q.key === "L:front")!;
    expect([lf.holes.length, lf.linkTo]).toEqual([0, undefined]);
    expect(win.pieces.find((q) => q.key === "L:back")!.linkTo).toBe("back");
    expect(win.pieces.some((q) => q.key === "L:pvc")).toBe(false);
    expect(win.params?.win).toBe("heart");
  });
});

describe("แม่แบบชุดสอง: ทรงถัง · ดัฟเฟิล · เป้ · ก้นกล่อง · หูรูด · กระเป๋าสตางค์", () => {
  const xzR = (pos: number[]) => { let r = 0; for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i], pos[i + 2])); return r; };

  it("ทรงถัง: ระบบไม่เห็นโครงหน้า/หลัง → ก้นวางราบ ตัวถังม้วนขึ้นรอบก้นสูงเท่าความสูง · ซับในซ้อนข้างในแบบเดียวกัน · สายสะพายพาดข้ามปากถัง", () => {
    const B = board(kitOf("bucket")), sc = buildSewn(B.asm, B.seams, B.attaches);
    expect(assemble(B.asm, B.seams, B.attaches).ok).toBe(false);
    expect(sc.asm).toBeNull();
    const base = sc.parts.find((p) => p.pid === "base")!, wall = sc.parts.find((p) => p.pid === "wall")!, lw = sc.parts.find((p) => p.pid === "L_wall")!;
    expect([base.kind, wall.kind, lw.kind, lw.layer]).toEqual(["base", "base", "base", "lining"]);
    const [by0, by1] = yRange(base.pos), [wy0, wy1] = yRange(wall.pos);
    expect(by1 - by0).toBeLessThan(0.01);                                                     // ก้นราบ
    expect(wy0).toBeCloseTo(0.05, 1); expect(wy1).toBeCloseTo(24.05, 1);                       // ตัวถังสูงเท่าความสูง
    expect(xzR(wall.pos)).toBeCloseTo(9, 0);                                                   // โค้งรอบก้นรัศมี 9
    expect(xzR(lw.pos)).toBeLessThan(xzR(wall.pos));                                           // ซับในอยู่ข้างใน
    expect(sc.notes).toEqual([]);
    const st = sc.parts.find((p) => p.pid === "strap")!;
    expect(st.kind).toBe("loop");
    expect(yRange(st.pos)[0]).toBeCloseTo(22.05, 1);                                          // โคนสายต่ำจากปากถัง 2 ซม.
    expect(yRange(st.pos)[1]).toBeGreaterThan(24.05);                                          // โค้งขึ้นเหนือปากถัง
    expect([sc.joined, sc.bodyH]).toEqual([5, 24]);
    expect(kitOf("bucket").pieces.some((q) => q.key === "lpocket")).toBe(false);
  });

  it("ดัฟเฟิล: ปลายวงกลม 2 ชิ้นเป็นแผ่นหน้า/หลัง ตัวกระเป๋าม้วนรอบ (ลึกเท่าความยาวตัว) · หูหิ้วพาดข้ามตัว · ซิป 1 เส้นยาวเท่าตัวกระเป๋า", () => {
    const B = board(kitOf("duffel")), A = assemble(B.asm, B.seams, B.attaches), L = assemble(B.asm, B.seams, [], "lining");
    if (!A.ok) throw new Error("ประกอบไม่ได้");
    expect([A.kind, A.bridges, Math.round(A.depth), A.handles.map((h) => h.side), L.ok]).toEqual(["wrap", ["body"], 45, [0], true]);
    const sc = buildSewn(B.asm, B.seams, B.attaches);
    expect(sc.notes).toEqual([]);
    expect(zipEdgeList(B.pieces).map((z) => [z.pid, z.len])).toEqual([["body", 45]]);
  });

  it("เป้: ข้าง+ก้น และแถบซิปบน เป็นชิ้นคั่นกลางครบรอบ · สายบ่าห้อยลงด้านนอกแผ่นหลัง · กระเป๋าหน้าปะบนแผ่นหน้า · ซิปจากช่องเจาะบนแถบซิป", () => {
    const B = board(kitOf("backpack")), A = assemble(B.asm, B.seams, B.attaches);
    if (!A.ok) throw new Error("ประกอบไม่ได้");
    expect([A.kind, [...A.bridges].sort(), A.handles.length]).toEqual(["wrap", ["gusset", "ziptop"], 1]);
    const sc = buildSewn(B.asm, B.seams, B.attaches), kind = (pid: string) => sc.parts.find((p) => p.pid === pid)?.kind;
    expect([kind("strapL"), kind("strapR"), kind("fpocket"), kind("lpocket")]).toEqual(["hang", "hang", "patch", "patch"]);
    expect(sc.notes).toEqual([]);
    const sl = sc.parts.find((p) => p.pid === "strapL")!;
    expect(zRange(sl.pos)[0]).toBeLessThan(-A.depth / 2);                                      // อยู่ด้านนอกของแผ่นหลัง
    expect(slitList(B.pieces).map((x) => x.pid)).toEqual(["ziptop"]);
    expect(assemble(B.asm, B.seams, [], "lining").ok).toBe(true);
  });

  it("ก้นกล่อง / หูรูด: ประกอบเป็นซองแบน (ภาพยังไม่พับมุมก้น) · ก้นกล่องได้ซิปปากยาว กว้าง + หนา · หูรูดไม่มีหูและซิป", () => {
    for (const style of ["cosmetic", "drawstring"] as BagStyle[]) {
      const B = board(kitOf(style)), A = assemble(B.asm, B.seams, B.attaches);
      if (!A.ok) throw new Error("ประกอบไม่ได้");
      expect([style, A.kind, assemble(B.asm, B.seams, [], "lining").ok, buildSewn(B.asm, B.seams, B.attaches).notes.length]).toEqual([style, "pouch", true, 0]);
    }
    expect(zipEdgeList(board(kitOf("cosmetic")).pieces).map((z) => z.len)).toEqual([30]);
    const d = kitOf("drawstring");
    expect([d.attach.length, zipEdgeList(board(d).pieces).length, d.pieces.filter((q) => !q.lining).map((q) => q.key)]).toEqual([0, 0, ["front"]]);
  });

  it("กระเป๋าสตางค์: ตัวนอก + แผ่นใน เย็บ 3 ด้าน (ซองแบน ด้านบนเปิด) · ช่องใส่บัตร 2 ช่องปะบนแผ่นใน · ไม่มีชุดซับในแยก (แผ่นในทำหน้าที่ซับใน)", () => {
    const kit = kitOf("wallet"), B = board(kit), A = assemble(B.asm, B.seams, B.attaches);
    if (!A.ok) throw new Error("ประกอบไม่ได้");
    expect([A.kind, A.front, A.back]).toEqual(["pouch", "outer", "inner"]);
    expect(kit.pieces.some((q) => q.lining)).toBe(false);
    const sc = buildSewn(B.asm, B.seams, B.attaches);
    expect([sc.parts.find((p) => p.pid === "slotL")?.kind, sc.parts.find((p) => p.pid === "slotR")?.kind, sc.notes.length]).toEqual(["patch", "patch", 0]);
    expect(kit.pieces.find((q) => q.key === "inner")!.inner!.map((l) => l.kind)).toEqual(["fold", "sew", "sew"]);
  });
});

describe("ของบนชิ้นที่ตัด 2 ชิ้น ขึ้นในภาพทั้งแผ่นหน้าและแผ่นหลัง", () => {
  it("ซองซิป: ซิปที่ขอบปากขึ้นทั้งสองแผ่น (แผ่นหลังมีธง back) · อะไหล่บนชิ้นก็ขึ้นสองแผ่น", () => {
    const kit = kitOf("pouch", { lining: false, pocket: false });
    kit.pieces[0].inner = [{ id: "h1", kind: "hw", hw: "magnet", pts: [[9, 3], [10.8, 3]] }];
    const B = board(kit), sc = buildSewn(B.asm, B.seams, B.attaches), D = sc.asm!.depth;
    expect(sc.finishes.map((f) => [f.kind, f.back ?? false, Math.sign(f.n[2])])).toEqual([["zip", false, 1], ["zip", true, -1]]);
    expect(sc.finishes[1].pts.every((q) => q[2] < -D / 2)).toBe(true);                       // อยู่ด้านนอกของแผ่นหลัง
    expect(sc.marks.filter((m) => m.kind === "hw").map((m) => [m.hw, m.back ?? false])).toEqual([["magnet", false], ["magnet", true]]);
  });
});

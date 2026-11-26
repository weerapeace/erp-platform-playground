import { describe, expect, it } from "vitest";
import { OP, type BlockPiece } from "@/lib/block-print";
import { fillColorHex } from "@/lib/block-print";
import { buildPes, nearestPec, readPesSummary } from "@/lib/embroidery-pes";
import {
  buildDst, buildPlan, cleanSettings, defaultSettings, dstDecode, dstFileName, dstRecord, flattenOps, meanWidth,
  pickGroups, pieceAt, pieceWarning, readDst, scanSegments, warningGroups,
} from "@/lib/embroidery";

const rect = (id: string, x: number, y: number, w: number, h: number, color?: string): BlockPiece => ({
  id, name: id, fill: "nonzero", on: true, ow: w, oh: h, w, h, ax: x, ay: y,
  d: [OP.M, 0, 0, OP.L, w, 0, OP.L, w, h, OP.L, 0, h, OP.Z], ...(color ? { color } : {}),
});

describe("DST record", () => {
  it("เข้ารหัสแล้วถอดกลับได้ค่าเดิมทุกค่า -121..121", () => {
    for (let dx = -121; dx <= 121; dx += 7) for (let dy = -121; dy <= 121; dy += 11) {
      for (const kind of ["stitch", "jump"] as const) {
        const [a, b, c] = dstRecord(dx, dy, kind);
        expect(dstDecode(a, b, c)).toEqual({ dx, dy, kind });
      }
    }
  });
  it("ค่าที่รู้จากสเปก: +1,+1 stitch = 81 00 03 · end = 00 00 F3", () => {
    expect(dstRecord(1, 1, "stitch")).toEqual([0x81, 0x00, 0x03]);
    expect(dstRecord(0, 0, "end")).toEqual([0x00, 0x00, 0xf3]);
    expect(dstRecord(0, 0, "color")).toEqual([0x00, 0x00, 0xc3]);
  });
  it("เกิน 121 = error", () => { expect(() => dstRecord(122, 0, "stitch")).toThrow(); });
});

describe("เรขาคณิต", () => {
  it("flattenOps สี่เหลี่ยม = 1 วง 4 จุด", () => {
    expect(flattenOps([OP.M, 0, 0, OP.L, 10, 0, OP.L, 10, 5, OP.L, 0, 5, OP.Z])).toEqual([[[0, 0], [10, 0], [10, 5], [0, 5]]]);
  });
  it("meanWidth แท่ง 1×20 ≈ 1", () => {
    expect(meanWidth([[[0, 0], [20, 0], [20, 1], [0, 1]]])).toBeCloseTo(0.95, 1);
  });
  it("scanSegments มีรู (evenodd) → แถวกลางได้ 2 ช่วง", () => {
    const outer: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const hole: [number, number][] = [[3, 3], [7, 3], [7, 7], [3, 7]];
    const segs = scanSegments([outer, hole], "evenodd", 1);
    const mid = segs.filter((s) => Math.abs(s.y - 5) < 0.6);
    expect(mid.length).toBe(2);
    // nonzero: รูหมุนทางเดียวกัน = ไม่เป็นรู
    expect(scanSegments([outer, hole], "nonzero", 1).filter((s) => Math.abs(s.y - 5) < 0.6).length).toBe(1);
  });
  it("fillColorHex อ่านได้หลายแบบ", () => {
    expect(fillColorHex(["#FF0000"])).toBe("#ff0000");
    expect(fillColorHex([0, 0, 1])).toBe("#0000ff");
    expect(fillColorHex([0.5])).toBe("#808080");
    expect(fillColorHex([0, 1, 1, 0])).toBe("#ff0000");
  });
});

describe("แผนการปัก + ไฟล์ DST", () => {
  const pieces = [rect("a", 0, 0, 40, 20, "#185fa5"), rect("b", 5, 25, 30, 3, "#993c1d")];
  const st = defaultSettings(pieces, 40);
  const plan = buildPlan(pieces, st);

  it("2 สี = เปลี่ยนสี 1 ครั้ง · ขนาดตามที่ตั้ง", () => {
    expect(plan.colors.length).toBe(2);
    expect(plan.colorChanges).toBe(1);
    expect(plan.width).toBe(40);
    expect(plan.height).toBe(28);
    expect(plan.stitches).toBeGreaterThan(100);
  });
  it("อัตโนมัติ: แท่งกว้าง 3 มม. = ซิกแซก · สี่เหลี่ยมใหญ่ = ถมเต็ม", () => {
    expect(plan.pieces.find((p) => p.id === "a")?.type).toBe("fill");
    expect(plan.pieces.find((p) => p.id === "b")?.type).toBe("satin");
  });
  it("ฝีทุกฝีอยู่ในกรอบงาน (+ชดเชยผ้าหด) และไม่ยาวเกิน 12.1 มม.", () => {
    let prev = { x: 0, y: 0 };
    for (const c of plan.cmds) {
      if (c.t === "stitch") {
        expect(Math.abs(c.x)).toBeLessThanOrEqual(20 + 0.5);
        expect(Math.abs(c.y)).toBeLessThanOrEqual(14 + 0.5);
        expect(Math.hypot(c.x - prev.x, c.y - prev.y)).toBeLessThanOrEqual(12.11);
      }
      prev = c;
    }
  });
  it("เขียน DST แล้วอ่านกลับ: จำนวนฝี/สี/ตำแหน่งตรงกัน", () => {
    const bytes = buildDst(plan, "JEAN logo");
    expect(bytes.length % 3).toBe(512 % 3);
    const back = readDst(bytes);
    expect(back.label).toBe("JEAN logo");
    expect(back.colors).toBe(1);
    expect(back.stitches).toBe(plan.stitches);
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 512));
    expect(head).toMatch(/ST:\s*\d+\r/);
    expect(head.indexOf("\x1a")).toBeGreaterThan(0);
    // ตำแหน่งฝีสุดท้ายก่อนจบ ตรงกับแผน (คลาด ≤ 0.1 มม. จากการปัด)
    const lastPlan = plan.cmds.filter((c) => c.t === "stitch").pop()!;
    const lastBack = back.cmds.filter((c) => c.t === "stitch").pop()!;
    expect(Math.abs(lastPlan.x - lastBack.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(lastPlan.y - lastBack.y)).toBeLessThanOrEqual(0.1);
  });
  it("ปิดสี = ไม่ปักสีนั้น", () => {
    const s2 = cleanSettings({ ...st, colors: { ...st.colors, "#993c1d": { ...st.colors["#993c1d"], on: false } } }, pieces);
    const p2 = buildPlan(pieces, s2);
    expect(p2.colors.length).toBe(1);
    expect(p2.colorChanges).toBe(0);
  });
  it("cleanSettings ตัดค่าเพี้ยน", () => {
    const s = cleanSettings({ width_mm: 99999, fill_spacing: -1, colors: { "#185fa5": { type: "zzz", angle: 270 } }, piece_types: { a: "run", nope: "fill" } }, pieces);
    expect(s.width_mm).toBe(400);
    expect(s.fill_spacing).toBe(0.2);
    expect(s.colors["#185fa5"].type).toBe("auto");
    expect(s.colors["#185fa5"].angle).toBe(90);
    expect(s.piece_types).toEqual({ a: "run" });
  });
});

describe("คำเตือน", () => {
  it("บาง/เล็ก", () => {
    expect(pieceWarning("fill", 0.5, { w: 10, h: 10 }).level).toBe("danger");
    expect(pieceWarning("satin", 1.2, { w: 10, h: 10 }).level).toBe("warn");
    expect(pieceWarning("run", 0.3, { w: 10, h: 10 }).level).toBe(null);
    expect(pieceWarning("fill", 3, { w: 1, h: 1 }).level).toBe("danger");
  });
  it("ชื่อไฟล์เป็นอังกฤษ", () => { expect(dstFileName("EMB-0001", "โลโก้ JEAN")).toBe("EMB-0001_JEAN.dst"); });
});


describe("รอบ 2: เลือกส่วน · ลดตัดด้าย · PES", () => {
  // ตัวหนังสือเล็ก 8 ตัวเรียงกัน (ห่าง 1 มม.) + โลโก้ใหญ่ 2 ชุด (หน้า/หลัง ห่างกัน 30 มม.)
  const letters = Array.from({ length: 8 }, (_, i) => rect(`t${i}`, i * 3, 0, 2, 4, "#000000"));
  const logoA = rect("A", 0, 20, 40, 15, "#000000");
  const logoB = rect("B", 70, 20, 40, 15, "#000000");

  it("pickGroups แยกโลโก้คนละกลุ่ม และติ๊กกลุ่มใหญ่ให้ก่อน", () => {
    const g = pickGroups([...letters, logoA, logoB], 3);
    const a = g.find((x) => x.ids.includes("A"))!, b = g.find((x) => x.ids.includes("B"))!;
    expect(a.key).not.toBe(b.key);
    expect(a.on).toBe(true);
    // B ขนาดเท่า A + จำนวนชิ้นเท่ากัน = ถือว่าซ้ำ ไม่ติ๊ก
    expect(b.on).toBe(false);
    expect(b.dupOf).toBeDefined();
    const t = g.find((x) => x.ids.includes("t0"))!;
    expect(t.ids.length).toBe(8);
  });
  it("ชิ้นที่ไม่ติ๊ก (on=false) ไม่ถูกปัก และขนาดงานคิดจากชิ้นที่ติ๊ก", () => {
    const ps = [{ ...logoA }, { ...logoB, on: false }];
    const plan = buildPlan(ps, defaultSettings(ps, 40));
    expect(plan.pieces.map((p) => p.id)).toEqual(["A"]);
    expect(plan.width).toBe(40);
    expect(plan.height).toBe(15);
  });
  it("เรียงใกล้สุดก่อน + ระยะตัดด้าย: ตัวหนังสือห่าง 1 มม. ไม่ตัดด้ายระหว่างตัว", () => {
    const st = { ...defaultSettings(letters, 23), underlay: false };
    const plan = buildPlan(letters, st);
    expect(plan.trims).toBeLessThanOrEqual(1);
    const far = buildPlan(letters, { ...st, trim_at: 2 });
    expect(far.trims).toBeLessThanOrEqual(plan.trims + 8);
  });
  it("ฝีรองพื้นเพิ่มฝีเข็ม แต่ไม่ล้นกรอบ", () => {
    const ps = [logoA];
    const off = buildPlan(ps, { ...defaultSettings(ps, 40), underlay: false });
    const on = buildPlan(ps, { ...defaultSettings(ps, 40), underlay: true });
    expect(on.stitches).toBeGreaterThan(off.stitches);
    for (const c of on.cmds) if (c.t === "stitch") { expect(Math.abs(c.x)).toBeLessThanOrEqual(20.5); expect(Math.abs(c.y)).toBeLessThanOrEqual(8); }
  });
  it("pieceAt คลิกโดนชิ้นที่ถูก", () => {
    const ps = [logoA, logoB];
    const plan = buildPlan(ps, defaultSettings(ps, 110));
    const a = plan.pieces.find((p) => p.id === "A")!, b = plan.pieces.find((p) => p.id === "B")!;
    expect(pieceAt(plan, a.box.x + a.box.w / 2, a.box.y + a.box.h / 2)?.id).toBe("A");
    expect(pieceAt(plan, b.box.x + 1, b.box.y + 1)?.id).toBe("B");
    expect(pieceAt(plan, 0, 0)).toBe(null);
  });
  it("warningGroups รวมตัวหนังสือบางที่อยู่ติดกันเป็น 1 แถว + บอกขนาดที่ควรขยาย", () => {
    const thin = Array.from({ length: 6 }, (_, i) => rect(`s${i}`, i * 2, 0, 1, 6, "#000000"));
    const st = defaultSettings(thin, 11);
    const plan = buildPlan(thin, st);
    const g = warningGroups(plan, st.width_mm);
    expect(g.length).toBe(1);
    expect(g[0].ids.length).toBe(6);
    expect(g[0].fixWidthMm).toBeGreaterThan(11);
  });
  it("PES: หัวไฟล์ + PEC อ่านกลับได้ จำนวนสี/เปลี่ยนสี/ฝีตรง", () => {
    const ps = [rect("a", 0, 0, 40, 20, "#185fa5"), rect("b", 5, 25, 30, 3, "#993c1d")];
    const plan = buildPlan(ps, defaultSettings(ps, 40));
    const bytes = buildPes(plan, "EMB-0001 JEAN");
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 8))).toBe("#PES0001");
    const sum = readPesSummary(bytes);
    expect(sum.label).toBe("EMB-0001");
    expect(sum.colors).toBe(2);
    expect(sum.changes).toBe(1);
    expect(sum.end).toBe(true);
    expect(sum.stitches).toBeGreaterThanOrEqual(plan.stitches);
    // ไอคอน: 1 รวม + 1 ต่อสี = 3 × 228 ไบต์ ต่อท้าย
    expect(bytes.length - sum.pecAt).toBeGreaterThan(512 + 3 * 228);
  });
  it("nearestPec: ดำ = 20 Black · แดง = 5 Red", () => {
    expect(nearestPec("#000000")).toBe(20);
    expect(nearestPec("#ed171f")).toBe(5);
  });
});

describe("รอบ 3: ซิกแซกเลี้ยวตามเส้น · ขอบรอบพื้นถม · ไฟล์จากร้าน · ตรวจลาย", async () => {
  const { turningSatin, satinBorder, sizeAdvice, insideShape } = await import("@/lib/embroidery-satin");
  const { readPes } = await import("@/lib/embroidery-pes");
  const { b64ToBytes, bytesToB64, planFromCmds, readShopFile, shopKind } = await import("@/lib/embroidery-shop");
  type P = [number, number];
  /** วงแหวน (วงนอกทวนเข็ม วงในตามเข็ม = รู) */
  const ring = (r0: number, r1: number, n = 72): P[][] => {
    const c = (r: number, dir: 1 | -1) => Array.from({ length: n }, (_, i) => { const t = (dir * i * 2 * Math.PI) / n; return [r * Math.cos(t), r * Math.sin(t)] as P; });
    return [c(r1, 1), c(r0, -1)];
  };

  it("แท่งตรง 2×20 มม.: ฝีสลับฝั่งบน/ล่าง พาดเต็มความกว้าง ไม่ล้นขอบเกินชดเชย", () => {
    const bar: P[][] = [[[0, 0], [20, 0], [20, 2], [0, 2]]];
    const t = turningSatin(bar, "nonzero", { spacing: 0.4, comp: 0.2, underlay: true, meanWidth: meanWidth(bar) })!;
    expect(t).not.toBeNull();
    const pts = t.top.flat();
    expect(pts.length).toBeGreaterThan(60);
    for (const [x, y] of pts) { expect(y).toBeGreaterThanOrEqual(-0.25); expect(y).toBeLessThanOrEqual(2.25); expect(x).toBeGreaterThanOrEqual(-0.5); expect(x).toBeLessThanOrEqual(20.5); }
    // ฝีส่วนใหญ่ข้ามความกว้างเกือบเต็ม (≥ 1.8 มม.)
    const legs = pts.slice(1).map((p, i) => Math.abs(p[1] - pts[i][1]));
    expect(legs.filter((d) => d >= 1.8).length / legs.length).toBeGreaterThan(0.8);
    expect(t.under.length).toBeGreaterThan(0);
  });

  it("วงแหวน (ตัว o): ฝีเลี้ยวตามวง — ทุกฝีตั้งฉากกับวง (ปลายฝีอยู่ใกล้ขอบใน/นอก)", () => {
    const rs = ring(4, 6);
    const t = turningSatin(rs, "nonzero", { spacing: 0.4, comp: 0, underlay: false, meanWidth: meanWidth(rs) })!;
    expect(t).not.toBeNull();
    const radii = t.top.flat().map(([x, y]) => Math.hypot(x, y));
    const nearEdge = radii.filter((r) => Math.abs(r - 4) < 0.35 || Math.abs(r - 6) < 0.35).length;
    expect(nearEdge / radii.length).toBeGreaterThan(0.85);
  });

  it("ชิ้นทรงก้อน (วงกลมทึบ) → ใช้ซิกแซกทิศเดียวแทน (คืน null)", () => {
    const disk = ring(0.001, 3).slice(0, 1);
    expect(turningSatin(disk, "nonzero", { spacing: 0.4, comp: 0, underlay: false, meanWidth: meanWidth(disk) })).toBeNull();
  });

  it("buildPlan: ปิด satin_follow = แบบเดิม · เปิด = ฝีเลี้ยวตามเส้น (ได้ฝีต่างกัน)", () => {
    const L: BlockPiece = { ...rect("L", 0, 0, 20, 20), d: [OP.M, 0, 0, OP.L, 3, 0, OP.L, 3, 17, OP.L, 20, 17, OP.L, 20, 20, OP.L, 0, 20, OP.Z] };
    const on = buildPlan([L], { ...defaultSettings([L], 20) });
    const off = buildPlan([L], { ...defaultSettings([L], 20), satin_follow: false });
    expect(on.pieces[0].type).toBe("satin");
    expect(JSON.stringify(on.cmds)).not.toBe(JSON.stringify(off.cmds));
  });

  it("ขอบซิกแซกรอบพื้นถม: อยู่ในแถบกว้าง bw คร่อมขอบสี่เหลี่ยม", () => {
    const sq: P[][] = [[[0, 0], [20, 0], [20, 20], [0, 20]]];
    expect(insideShape(sq, "nonzero", 10, 10)).toBe(true);
    const e = satinBorder(sq, "nonzero", { width: 1.5, spacing: 0.4, comp: 0.2 });
    expect(e.length).toBe(1);
    for (const [x, y] of e[0]) {
      const dEdge = Math.min(x, y, 20 - x, 20 - y);
      expect(dEdge).toBeGreaterThanOrEqual(-0.3);
      expect(dEdge).toBeLessThanOrEqual(1.6);
    }
    const plan = buildPlan([rect("big", 0, 0, 20, 20)], defaultSettings([rect("big", 0, 0, 20, 20)], 20));
    const noBorder = buildPlan([rect("big", 0, 0, 20, 20)], { ...defaultSettings([rect("big", 0, 0, 20, 20)], 20), border_mm: 0 });
    expect(plan.stitches).toBeGreaterThan(noBorder.stitches);
  });

  it("cleanSettings: ค่าใหม่มีค่าเริ่มต้น + ตัดค่าเพี้ยน", () => {
    const p = [rect("a", 0, 0, 10, 10)];
    const s = cleanSettings({}, p);
    expect(s.satin_follow).toBe(true);
    expect(s.border_mm).toBe(1.2);
    expect(cleanSettings({ border_mm: 99, satin_follow: false }, p)).toMatchObject({ border_mm: 4, satin_follow: false });
  });

  it("ตรวจลาย: เส้นบาง 0.5 มม. ในงานกว้าง 40 มม. → ต้องปักกว้าง ≥ 120 มม.", () => {
    expect(sizeAdvice([0.5, 2, 2, 2, 2, 2, 2, 2, 2, 2], 40)).toEqual({ thinFile: 0.5, minWidthMm: 120 });
    expect(sizeAdvice([], 40)).toBeNull();
  });

  it("ไฟล์จากร้าน .PES: เขียนแล้วอ่านฝีเข็มกลับ ตำแหน่ง/สีตรง", () => {
    const pieces = [rect("a", 0, 0, 10, 4, "#000000"), rect("b", 0, 6, 10, 4, "#ff0000")];
    const plan = buildPlan(pieces, defaultSettings(pieces, 30));
    const bytes = buildPes(plan, "T");
    expect(shopKind(bytes)).toBe("pes");
    const r = readPes(bytes);
    const st = r.cmds.filter((c) => c.t === "stitch").length;
    expect(st).toBeGreaterThanOrEqual(plan.stitches);
    expect(r.colors.length).toBe(2);
    const p2 = planFromCmds(r.cmds, r.colors);
    expect(Math.abs(p2.width - plan.width)).toBeLessThan(1);
    expect(Math.abs(p2.height - plan.height)).toBeLessThan(1);
    expect(p2.colorChanges).toBe(1);
  });

  it("ไฟล์จากร้าน .DST: base64 ไปกลับ + อ่านเป็นแผน", () => {
    const pieces = [rect("a", 0, 0, 10, 4)];
    const plan = buildPlan(pieces, defaultSettings(pieces, 30));
    const bytes = buildDst(plan, "T");
    const back = b64ToBytes(bytesToB64(bytes));
    expect(back).toEqual(bytes);
    const r = readShopFile(back, ["#123456"]);
    expect(r.kind).toBe("dst");
    expect(r.plan.stitches).toBe(readDst(bytes).stitches);
    expect(r.plan.colors[0].color).toBe("#123456");
    expect(() => readShopFile(new Uint8Array(10))).toThrow();
  });
});

describe("รอบ 4: จุดต่อ · ลำดับปัก · ตั้งค่ารายชิ้น · เส้นทิศ", async () => {
  const { turningSatin, dirAt } = await import("@/lib/embroidery-satin");
  const { pieceAngle } = await import("@/lib/embroidery");
  type P = [number, number];
  it("ตัว T: ขาตั้งตัดปลายตรงที่ขอบคานบน (ฝีของขาไม่ขึ้นไปทับคานเกิน ~0.5 มม.)", () => {
    // คานบน y 0..3 กว้าง 20 · ขา x 8.5..11.5 ลงไปถึง y 20
    const T: P[][] = [[[0, 0], [20, 0], [20, 3], [11.5, 3], [11.5, 20], [8.5, 20], [8.5, 3], [0, 3]]];
    const t = turningSatin(T, "nonzero", { spacing: 0.4, comp: 0, underlay: false, meanWidth: meanWidth(T) })!;
    expect(t).not.toBeNull();
    // บล็อกที่เป็นขา = ฝีส่วนใหญ่อยู่ช่วง x 8..12 และ y > 3
    const stem = t.top.find((b) => b.filter(([x, y]) => x > 8 && x < 12 && y > 4).length > b.length * 0.7);
    expect(stem).toBeTruthy();
    expect(Math.min(...stem!.map((p) => p[1]))).toBeGreaterThan(2.4);
  });
  it("dirAt: เส้นเดียว = ทิศของเส้นนั้น · 2 เส้นตั้งฉาก จุดใกล้เส้นไหนได้ทิศเส้นนั้น", () => {
    const d = dirAt([[0, 0, 10, 0]], [5, 5])!;
    expect(Math.abs(d[1])).toBeLessThan(1e-6);
    const near = dirAt([[0, 0, 10, 0], [20, 0, 20, 10]], [19, 5])!;
    expect(Math.abs(near[0])).toBeLessThan(0.3);
  });
  it("มุมถมเต็ม: ตั้งรายชิ้น > เส้นทิศ > ตามรูปทรง > มุมสี", () => {
    const bar: P[][] = [[[0, 0], [40, 0], [40, 5], [0, 5]]];
    const st = defaultSettings([rect("a", 0, 0, 40, 5)], 40);
    expect(pieceAngle(bar, "fill", st, 45, { angle: 10 }, [])).toBe(10);
    expect(pieceAngle(bar, "fill", st, 45, {}, [[0, 0, 0, 5]])).toBeCloseTo(90, 0);
    expect(pieceAngle(bar, "fill", st, 45, {}, [])).toBe(45);   // แนวยาว 0° + 45
    expect(pieceAngle(bar, "fill", { ...st, fill_auto_angle: false }, 30, {}, [])).toBe(30);
  });
  it("ลำดับปักตั้งเอง: ปักตามลำดับ เปลี่ยนสีทุกครั้งที่สีต่างจากชิ้นก่อน", () => {
    const ps = [rect("a", 0, 0, 10, 10, "#000000"), rect("b", 20, 0, 10, 10, "#ff0000"), rect("c", 40, 0, 10, 10, "#000000")];
    const auto = buildPlan(ps, defaultSettings(ps, 50));
    expect(auto.colorChanges).toBe(1);   // ดำ (a,c) → แดง (b)
    const seq = buildPlan(ps, { ...defaultSettings(ps, 50), sequence: ["a", "b", "c"] });
    expect(seq.colorChanges).toBe(2);
    expect(seq.pieces.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("cleanSettings: ตั้งค่ารายชิ้น/ลำดับ ตัดชิ้นที่ไม่มีและค่าเพี้ยน", () => {
    const ps = [rect("a", 0, 0, 10, 10)];
    const s = cleanSettings({ sequence: ["a", "zz", "a"], piece_opts: { a: { angle: 200, spacing: 9, lines: [[0, 0, 5, 5], [1, 1, 1, 1], "x"] }, zz: { angle: 1 } } }, ps);
    expect(s.sequence).toEqual(["a"]);
    expect(s.piece_opts).toEqual({ a: { angle: 20, spacing: 2, lines: [[0, 0, 5, 5]] } });
  });
  it("ความแน่นรายชิ้น: ห่างขึ้น = ฝีน้อยลง", () => {
    const ps = [rect("a", 0, 0, 20, 20)];
    const base = buildPlan(ps, defaultSettings(ps, 20));
    const loose = buildPlan(ps, { ...defaultSettings(ps, 20), piece_opts: { a: { spacing: 1 } } });
    expect(loose.stitches).toBeLessThan(base.stitches);
  });
});

describe("รอบ 4: ตัวช่วยหน้าจอแก้ลาย", async () => {
  const { planFrame, pieceHandles, moveHandle, textPiece, reorderSequence } = await import("@/lib/embroidery-edit");
  it("planFrame: แปลงพิกัดไฟล์ → งาน → ไฟล์ ได้ค่าเดิม · ตรงกับกรอบของ buildPlan", () => {
    const ps = [rect("a", 10, 20, 40, 10), rect("b", 10, 40, 40, 10)];
    const st = defaultSettings(ps, 80);
    const f = planFrame(ps, st);
    const [px, py] = f.toPlan(30, 35);
    expect(px).toBeCloseTo(0, 6); expect(py).toBeCloseTo(0, 6);   // กึ่งกลางงาน
    const [fx, fy] = f.toFile(...f.toPlan(12.5, 47));
    expect(fx).toBeCloseTo(12.5, 6); expect(fy).toBeCloseTo(47, 6);
    expect(f.scale).toBeCloseTo(2, 6);
  });
  it("แก้จุด: ลากมุมขวาล่างของสี่เหลี่ยมออก 5 มม. → ขนาดชิ้นโตตาม (กรอบคิดใหม่)", () => {
    const p = rect("a", 10, 10, 20, 10);
    const hs = pieceHandles(p);
    expect(hs.length).toBe(4);
    const br = hs.find((h) => h.x === 30 && h.y === 20)!;
    const q = moveHandle(p, br, 5, 5);
    expect(q.ow).toBeCloseTo(25, 6); expect(q.oh).toBeCloseTo(15, 6);
    expect(q.ax).toBe(10); expect(q.ay).toBe(10);
    // ลากมุมซ้ายบนเข้าไปข้างใน → ax/ay เลื่อนตาม
    const q2 = moveHandle(p, hs[0], 2, 3);
    expect(q2.ax).toBeCloseTo(10, 6); expect(q2.ow).toBeCloseTo(20, 6);
  });
  it("ตัวหนังสือ: ย่อขยายเส้นให้สูงตามที่ตั้ง วางตำแหน่งที่ขอ", () => {
    const t = { d: [OP.M, 0, 0, OP.L, 20, 0, OP.L, 20, 10, OP.L, 0, 10, OP.Z], w: 20, h: 10 };
    const p = textPiece(t, { id: "t", name: "AB", color: "#ff0000", heightFile: 5, at: [3, 4] });
    expect(p.oh).toBe(5); expect(p.ow).toBe(10); expect(p.ax).toBe(3); expect(p.color).toBe("#ff0000");
  });
  it("ลากเปลี่ยนลำดับปัก: ว่าง = เริ่มจากลำดับปัจจุบัน", () => {
    expect(reorderSequence([], ["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(reorderSequence(["b", "a"], ["a", "b", "c"], 0, 2)).toEqual(["a", "c", "b"]);
  });
});

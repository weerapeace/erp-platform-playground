import { describe, expect, it } from "vitest";
import { OP, type BlockPiece } from "@/lib/block-print";
import { fillColorHex } from "@/lib/block-print";
import {
  buildDst, buildPlan, cleanSettings, defaultSettings, dstDecode, dstFileName, dstRecord, flattenOps, meanWidth,
  pieceWarning, readDst, scanSegments,
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

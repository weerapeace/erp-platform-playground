import { describe, expect, it } from "vitest";
import type { BlockPiece } from "@/lib/block-print";
import {
  alignItems, baseItem, blockPage, cleanLayouts, distributeItems, itemInk, layoutAuditChanges, layoutDims, layoutSvg,
  outsideIds, pieceSvg, repeatItem, resizeItem, type BlockLayout,
} from "@/lib/block-print-layout";

const sq: BlockPiece = { id: "p1", name: "จุด", d: [0, 0, 0, 1, 10, 0, 1, 10, 10, 1, 0, 10, 4], fill: "nonzero", ow: 10, oh: 10, w: 5, h: 5, ax: 0, ay: 0, on: true };
const block = (items = [baseItem("rect", 7, 18, 2.6, 8), baseItem("rect", 11, 18, 2.6, 8), baseItem("rect", 20, 18, 2.6, 8)]): BlockLayout =>
  ({ id: "b1", name: "บล็อก 1", w: 60, h: 40, items });

describe("จัดแนว / กระจาย / ทำซ้ำ", () => {
  it("ชิ้นเดียวจัดกึ่งกลางเทียบบล็อก · หลายชิ้นจัดเทียบกรอบที่เลือก", () => {
    const l = block();
    const one = alignItems(l, [l.items[0].id], "hcenter");
    expect(one[0].x).toBeCloseTo(28.7, 3);
    const many = alignItems(l, l.items.map((i) => i.id), "right");
    expect(many.map((i) => i.x)).toEqual([20, 20, 20]);
  });
  it("กระจายช่องว่างเท่ากัน หัว-ท้ายอยู่ที่เดิม", () => {
    const l = block();
    const out = distributeItems(l, l.items.map((i) => i.id), "h");
    expect(out.map((i) => i.x)).toEqual([7, 13.5, 20]);
  });
  it("ทำซ้ำเป็นแถว ห่างขอบถึงขอบตามที่ตั้ง", () => {
    const l = block([baseItem("rect", 7, 18, 2.6, 8)]);
    const r = repeatItem(l, l.items[0].id, 3, 1.4, "h");
    expect(r.items.map((i) => i.x)).toEqual([7, 11, 15, 19]);
    expect(r.added).toHaveLength(3);
  });
  it("ล็อกสัดส่วนตอนตั้งขนาด · เส้นตรงไม่ล็อก", () => {
    expect(resizeItem(baseItem("rect", 0, 0, 10, 5), "w", 20, true)).toMatchObject({ w: 20, h: 10 });
    expect(resizeItem(baseItem("line", 0, 0, 10, 0), "w", 20, true)).toMatchObject({ w: 20, h: 0 });
  });
  it("เตือนชิ้นที่ล้นขอบบล็อก", () => {
    expect(outsideIds(block([{ ...baseItem("rect", 58, 0, 5, 5), id: "x" }]))).toEqual(["x"]);
  });
});

describe("เส้นที่ส่งออก", () => {
  const byId = new Map([[sq.id, sq]]);
  it("ชิ้นจากไฟล์ย่อ/ขยายตามกรอบในบล็อก", () => {
    const it0 = { ...baseItem("piece", 10, 20, 4, 4), pieceId: "p1" };
    const ink = itemInk(it0, byId);
    expect(ink[0]).toMatchObject({ mode: "fill" });
    expect(ink[0].d.slice(0, 3)).toEqual([0, 10, 20]);
    expect(ink[0].d.slice(3, 9)).toEqual([1, 14, 20, 1, 14, 24]);
  });
  it("ชิ้นต้นฉบับหาย = ไม่วาด · สี่เหลี่ยมไม่มีพื้นมีเส้นขอบ", () => {
    expect(itemInk({ ...baseItem("piece", 0, 0, 4, 4), pieceId: "zz" }, byId)).toEqual([]);
    const r = itemInk({ ...baseItem("rect", 0, 0, 4, 4), fill: false, stroke: 0.3 }, byId);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mode: "stroke", width: 0.3 });
  });
  it("SVG ขนาดจริงเป็น มม. ลายสีดำ", () => {
    const s = pieceSvg(sq);
    expect(s).toContain('width="5mm" height="5mm"');
    expect(s).toContain('viewBox="0 0 5 5"');
    expect(s).toContain('fill="#000000"');
    const b = layoutSvg(block(), byId);
    expect(b).toContain('width="60mm" height="40mm"');
    expect(b).toContain('id="block-outline"');
  });
});

describe("ระยะบอกตำแหน่ง + จัดหน้า PDF", () => {
  it("เส้นไกด์ชมพูที่ขอบซ้าย/ขวาของทุกชิ้น + ตัวเลขระยะจากขอบซ้าย", () => {
    const d = layoutDims(block(), "mm");
    const pos = d.lines.filter((l) => l.kind === "pos").map((l) => l.x1);
    expect(pos).toEqual([7, 9.6, 11, 13.6, 20, 22.6]);
    expect(d.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["7 mm", "9.6 mm", "60 mm", "40 mm", "18 mm", "26 mm"]));
  });
  it("ตัวเลขที่ชิดกันขยับขึ้นชั้นถัดไป", () => {
    const d = layoutDims(block([baseItem("rect", 10, 10, 1, 5)]), "mm");
    const top = d.texts.filter((t) => t.rotate === 90 && t.y < 0);
    expect(top[1].y).toBeLessThan(top[0].y);
  });
  it("บล็อกเล็กลง A4 · ใหญ่เกิน = แจ้งเตือน ไม่ย่อ", () => {
    const ok = blockPage(block(), "A4", "cm");
    expect(ok.ok).toBe(true);
    if (ok.ok) { expect(ok.pageW).toBe(210); expect(ok.ox).toBeGreaterThan(0); }
    expect(blockPage({ ...block(), w: 400, h: 300 }, "A4", "cm").ok).toBe(false);
    const wide = blockPage({ ...block(), w: 230, h: 40 }, "A4", "cm");
    expect(wide.ok && wide.orientation).toBe("landscape");
  });
});

describe("ตรวจข้อมูลก่อนบันทึก + ประวัติ", () => {
  it("รับบล็อกที่ถูกต้อง · ปฏิเสธขนาดเพี้ยน/รหัสซ้ำ/ชนิดแปลก", () => {
    const l = block();
    const r = cleanLayouts(JSON.parse(JSON.stringify([l])));
    expect(r.ok).toBe(true);
    expect(cleanLayouts([{ ...l, w: 0 }]).ok).toBe(false);
    expect(cleanLayouts([l, l]).ok).toBe(false);
    expect(cleanLayouts([{ ...l, items: [{ ...l.items[0], t: "blob" }] }]).ok).toBe(false);
    expect(cleanLayouts("x").ok).toBe(false);
  });
  it("ประวัติจดต่อบล็อก", () => {
    const a = block(), b = { ...a, items: a.items.map((i, k) => (k ? i : { ...i, x: 8 })) };
    expect(layoutAuditChanges([a], [b])[0].new).toContain("ย้าย/แก้ชิ้น");
    expect(layoutAuditChanges([a], [])[0]).toMatchObject({ new: null });
    expect(layoutAuditChanges([a], [a])).toEqual([]);
  });
});

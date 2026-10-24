import { describe, it, expect } from "vitest";
import {
  normalizeShopPattern,
  normalizePatternSlots,
  shopPatternColors,
  shopPatternLineWidth,
  shopPatternLookOf,
  shopPatternPaint,
  shopPatternRatio,
  type ShopPattern,
  type ShopPatternLook,
} from "../website-frames";
import { SECTION_SCHEMAS, matchShowIf } from "../website-schema";
import { normalizeBlocks, newDecor } from "../website-blocks";
import { canvasItemSummary } from "../website-canvas";

/**
 * 🎨 ลายของร้าน (SVG ที่ร้านอัป · เปลี่ยนสีได้) — 2026-10-24
 * กันพลาด: ตัวกรองไม่ปล่อยของแปลก · สี 3 โหมดถูก · ชิ้นเก่าไม่เปลี่ยน · ฟอร์มซ่อนช่องลายในตัวเมื่อเป็นลายของร้าน
 */
const BOW: ShopPattern = {
  name: "โบว์",
  vb: [0, 0, 100, 72],
  parts: [
    { d: "M50 34 C36 12 10 4 8 22 Z", f: "#d4537e" },
    { d: "M50 34 C64 12 90 4 92 22 Z", f: "#d4537e", s: "#72243e", w: 2 },
    { d: "M50 90 L50 20", s: "#eaf3de", w: 3, lc: "round", t: "matrix(2 0 0 2 0 0)" },
  ],
};
const look = (p: Partial<ShopPatternLook>): ShopPatternLook => ({ mode: "orig", fill: "#111111", noFill: false, line: null, width: 2, slots: [], ...p });

describe("🎨 ตัวกรองลายของร้าน", () => {
  it("เก็บเส้นทาง + สีพื้น/สีเส้น/ความหนาเดิม · สีเป็นตัวเล็ก", () => {
    const p = normalizeShopPattern({ ...BOW, parts: [{ d: "M0 0 L10 10 Z", f: "#ABCDEF", s: "#000000", w: 1.5, lj: "round" }] })!;
    expect(p.parts[0]).toEqual({ d: "M0 0 L10 10 Z", f: "#abcdef", s: "#000000", w: 1.5, lj: "round" });
    expect(p.name).toBe("โบว์");
  });
  it("ไม่ปล่อยของแปลก: เส้นทางมีตัวอักษรอื่น · สีไม่ใช่ #rrggbb · ตัวแปลงตำแหน่งแปลก · ชื่อมี < >", () => {
    const p = normalizeShopPattern({
      name: "<script>x</script>",
      vb: [0, 0, 10, 10],
      parts: [
        { d: "M0 0 L1 1\" onload=\"alert(1)", f: "#000000" },
        { d: "M0 0 L1 1", f: "url(javascript:alert(1))" },
        { d: "M0 0 L1 1", f: "#112233", t: "translate(1) url(x)" },
      ],
    })!;
    expect(p.parts).toEqual([{ d: "M0 0 L1 1", f: "#112233" }]);
    expect(p.name).not.toMatch(/[<>]/);
  });
  it("ชิ้นไม่มีสีเลย = ทิ้ง · ไม่เหลือชิ้น / ขนาดผิด / ใหญ่เกิน = null", () => {
    expect(normalizeShopPattern({ vb: [0, 0, 10, 10], parts: [{ d: "M0 0 L1 1" }] })).toBeNull();
    expect(normalizeShopPattern({ vb: [0, 0, 0, 10], parts: [{ d: "M0 0 L1 1", f: "#000000" }] })).toBeNull();
    expect(normalizeShopPattern({ vb: [0, 0, 10, 10], parts: [{ d: "M0 0 " + "L1 1 ".repeat(20000), f: "#000000" }] })).toBeNull();
    expect(normalizeShopPattern("x")).toBeNull();
  });
  it("สีในไฟล์ตามลำดับที่เจอ ไม่ซ้ำ · สัดส่วน · ความหนาเส้นที่ใช้บ่อย (คิดขนาดของชิ้น)", () => {
    expect(shopPatternColors(BOW)).toEqual(["#d4537e", "#72243e", "#eaf3de"]);
    expect(shopPatternRatio(BOW)).toBe(0.72);
    expect(shopPatternLineWidth(BOW)).toBe(6);
  });
  it("ช่องสีแยก: สีธีม / #rrggbb / ว่าง · ค่าแปลก = ว่าง · ตัดท้ายที่ว่าง · ไม่เกิน 8", () => {
    expect(normalizePatternSlots(["brand", "#ABCDEF", "x", "", ""])).toEqual(["brand", "#abcdef"]);
    expect(normalizePatternSlots(Array(12).fill("ink"))).toHaveLength(8);
    expect(normalizePatternSlots("brand")).toEqual([]);
  });
});

describe("🎨 สีของลาย 3 โหมด", () => {
  it("สีเดิมของไฟล์ = ตามไฟล์ทุกชิ้น", () => {
    const p = shopPatternPaint(BOW, look({ mode: "orig" }));
    expect(p.map((x) => [x.fill, x.stroke, x.width])).toEqual([
      ["#d4537e", "none", 0],
      ["#d4537e", "#72243e", 2],
      ["none", "#eaf3de", 3],
    ]);
  });
  it("สีเดียวทั้งลาย: สีพื้น + สีเส้น + หนาเท่ากันทุกชิ้น (ชิ้นที่ย่อ/ขยายในไฟล์ปรับให้หนาเท่ากัน)", () => {
    const p = shopPatternPaint(BOW, look({ mode: "one", fill: "#ff0000", line: "#0000ff", width: 4 }));
    expect(p.map((x) => [x.fill, x.stroke, x.width])).toEqual([
      ["#ff0000", "#0000ff", 4],
      ["#ff0000", "#0000ff", 4],
      ["none", "#0000ff", 2],
    ]);
  });
  it("สีเดียวทั้งลาย ไม่มีเส้น: ชิ้นที่เป็นเส้นล้วนใช้สีพื้น (ไม่หายไป) · ไม่เติมพื้น = เหลือเส้นสีพื้น", () => {
    const a = shopPatternPaint(BOW, look({ mode: "one", fill: "#ff0000" }));
    expect(a[0]).toMatchObject({ fill: "#ff0000", stroke: "none" });
    expect(a[2]).toMatchObject({ fill: "none", stroke: "#ff0000" });
    const b = shopPatternPaint(BOW, look({ mode: "one", fill: "#ff0000", noFill: true }));
    expect(b[0]).toMatchObject({ fill: "none", stroke: "#ff0000" });
  });
  it("แยกตามสีในไฟล์: เปลี่ยนเฉพาะสีที่ตั้ง · ที่เหลือสีเดิม · เส้นขอบเพิ่มเฉพาะชิ้นที่ไม่มีเส้น", () => {
    const p = shopPatternPaint(BOW, look({ mode: "slot", slots: ["#00ff00", null, "#ffff00"], line: "#000000", width: 1 }));
    expect(p.map((x) => [x.fill, x.stroke, x.width])).toEqual([
      ["#00ff00", "#000000", 1],
      ["#00ff00", "#72243e", 2],
      ["none", "#ffff00", 3],
    ]);
  });
  it("ค่าที่เก็บในชิ้น → หน้าตา: สีธีมผ่านตัวแปลง · ความหนาหารด้วยหน่วย · ไม่มีเส้น = null", () => {
    const toCss = (c: string, h: string) => (c === "custom" ? h : `var(--${c})`);
    const l = shopPatternLookOf({ patMode: "one", color: "custom", colorHex: "#123456", lineColor: "brand", strokeWidth: 6, patSlots: ["ink", "#abcdef"] }, toCss, 2);
    expect(l).toEqual({ mode: "one", fill: "#123456", noFill: false, line: "var(--brand)", width: 3, slots: ["var(--ink)", "#abcdef"] });
    expect(shopPatternLookOf({ patMode: "x", lineColor: "none" }, toCss, 1)).toMatchObject({ mode: "orig", line: null, width: 2 });
  });
});

describe("🎨 ลายของร้านในผืนผ้าใบ + ของตกแต่ง Section", () => {
  const sch = SECTION_SCHEMAS.canvas.children!;
  const shown = (it: Record<string, unknown>) => sch.fields.filter((x) => matchShowIf(x, it)).map((x) => x.key);
  const canvas = (items: unknown[]) => (normalizeBlocks([{ id: "c", type: "canvas", items } as never])[0] as unknown as { items: Record<string, unknown>[] }).items;

  it("ชิ้นผืนผ้าใบเก็บลาย + ค่าสี · ชิ้นเดิมได้ค่าเริ่ม (ไม่มีลาย = หน้าตาเดิม)", () => {
    const [a, b] = canvas([
      { kind: "shape", pattern: BOW, patMode: "slot", lineColor: "custom", lineColorHex: "#ABCDEF", patSlots: ["brand", "bad"] },
      { kind: "shape", shape: "heart" },
    ]);
    expect(a).toMatchObject({ patMode: "slot", lineColor: "custom", lineColorHex: "#abcdef", patSlots: ["brand"] });
    expect((a.pattern as ShopPattern).parts).toHaveLength(3);
    expect(b).toMatchObject({ pattern: null, patMode: "orig", lineColor: "none", patSlots: [], shape: "heart" });
  });
  it("ฟอร์มละเอียด: ลายของร้านซ่อนช่องลายในตัว (ลาย/สี/ไล่สี/เส้น) · ลายในตัวเห็นเหมือนเดิม", () => {
    const [a, b] = canvas([{ kind: "shape", pattern: BOW }, { kind: "shape", shape: "heart" }]);
    for (const k of ["shape", "color", "outline", "strokeWidth", "grad"]) expect(shown(a)).not.toContain(k);
    for (const k of ["shape", "color", "outline", "strokeWidth", "grad"]) expect(shown(b)).toContain(k);
  });
  it("ชื่อในต้นไม้ = 🎨 ชื่อไฟล์", () => {
    expect(canvasItemSummary({ kind: "shape", pattern: BOW })).toBe("🎨 โบว์");
    expect(canvasItemSummary({ kind: "shape", shape: "heart" })).not.toContain("🎨");
  });
  it("ของตกแต่ง Section: เก็บลาย · ลายพัง = ไม่มีลาย (โหมดกลับเป็นสีเดิม) · ชิ้นเก่าได้ความหนา 2 ไม่มีเส้นเพิ่ม", () => {
    const sec = (decor: unknown[]) => (normalizeBlocks([{ id: "x", type: "rich-text", style: { decor } } as never])[0] as unknown as { style: { decor: Record<string, unknown>[] } }).style.decor;
    const [a, b, c] = sec([
      { id: "a", kind: "shape", pattern: BOW, patMode: "one", lineColor: "brand", strokeWidth: 1.25 },
      { id: "b", kind: "shape", pattern: { vb: [0, 0, 1, 1], parts: [] }, patMode: "one" },
      { id: "c", kind: "shape", shape: "star" },
    ]);
    expect(a).toMatchObject({ patMode: "one", lineColor: "brand", strokeWidth: 1.3 });
    expect(a.pattern).not.toBeNull();
    expect(b).toMatchObject({ pattern: null, patMode: "orig" });
    expect(c).toMatchObject({ pattern: null, strokeWidth: 2, lineColor: "none", patSlots: [] });
    expect(newDecor("shape").pattern).toBeNull();
  });
});

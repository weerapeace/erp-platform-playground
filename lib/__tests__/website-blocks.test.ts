import { describe, it, expect } from "vitest";
import { normalizeBlocks, validateBlocks, DEFAULT_BLOCK_STYLE, type Block } from "../website-blocks";

/**
 * กันบั๊กที่เคยเกิดจริง 2 ตัว:
 *  1. บล็อกของร้านระบบเดิม (product-grid) ถูกทิ้งตอน normalize → กด "เผยแพร่" ครั้งเดียวหน้าเว็บหาย
 *  2. ตัวตรวจก่อนเผยแพร่อ่าน BLOCK_META[type].label ตรง ๆ → เจอชนิดแปลกแล้วพัง
 */
describe("normalizeBlocks — บล็อกชนิดที่ไม่รู้จัก", () => {
  const legacy = { id: "pg-1", type: "product-grid", title: "สินค้าแนะนำ", limit: 8 };

  it("เก็บบล็อกของร้านระบบเดิมไว้ ไม่ทิ้ง", () => {
    const out = normalizeBlocks([legacy]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("product-grid");
  });

  it("เก็บไว้ครบทุกฟิลด์แบบไม่แตะ (ไม่งั้นข้อมูลเพี้ยน)", () => {
    const out = normalizeBlocks([legacy]) as unknown as Record<string, unknown>[];
    expect(out[0]).toEqual(legacy);
  });

  it("ปนกับบล็อกที่รู้จักแล้วต้องอยู่ครบ เรียงเหมือนเดิม", () => {
    const out = normalizeBlocks([{ id: "h1", type: "hero" }, legacy]);
    expect(out.map((b) => b.type)).toEqual(["hero", "product-grid"]);
  });

  it("ทิ้งเฉพาะของที่ไม่มี type จริง ๆ", () => {
    expect(normalizeBlocks([{ id: "x" }, { type: "" }, null])).toHaveLength(0);
  });
});

describe("normalizeBlocks — รูปลักษณ์ (style)", () => {
  it("บล็อกเก่าที่ยังไม่มี style ได้ค่าเริ่มต้น auto ทั้งชุด (หน้าเว็บต้องไม่เปลี่ยน)", () => {
    const [b] = normalizeBlocks([{ id: "h1", type: "hero" }]);
    expect(b.style).toEqual(DEFAULT_BLOCK_STYLE);
  });

  it("ค่าที่ส่งมามั่ว ๆ ตกกลับเป็น auto", () => {
    const [b] = normalizeBlocks([{ id: "h1", type: "hero", style: { padTop: "ใหญ่มาก", align: 123, bg: "rainbow" } }]);
    expect(b.style.padTop).toBe("auto");
    expect(b.style.align).toBe("auto");
    expect(b.style.bg).toBe("auto");
  });

  it("เก็บค่าที่ถูกต้องไว้", () => {
    const [b] = normalizeBlocks([{ id: "h1", type: "hero", style: { padTop: "lg", width: "full", align: "center" } }]);
    expect(b.style.padTop).toBe("lg");
    expect(b.style.width).toBe("full");
    expect(b.style.align).toBe("center");
  });

  it('เลือก "สีเอง" แต่ไม่ใส่สี = ถือว่าไม่ได้ตั้ง (กันบล็อกกลายเป็นพื้นโปร่ง)', () => {
    const [b] = normalizeBlocks([{ id: "h1", type: "hero", style: { bg: "custom", bgColor: "" } }]);
    expect(b.style.bg).toBe("auto");
  });

  it("รับสีเฉพาะรูปแบบ #rrggbb", () => {
    const ok = normalizeBlocks([{ id: "h1", type: "hero", style: { bg: "custom", bgColor: "#A1B2C3" } }]);
    expect(ok[0].style.bgColor).toBe("#a1b2c3");
    const bad = normalizeBlocks([{ id: "h1", type: "hero", style: { bg: "custom", bgColor: "red; background:url(x)" } }]);
    expect(bad[0].style.bgColor).toBe("");
    expect(bad[0].style.bg).toBe("auto");
  });
});

describe("validateBlocks", () => {
  it("ไม่พังเมื่อเจอบล็อกชนิดที่ไม่รู้จัก", () => {
    const blocks = normalizeBlocks([{ id: "pg-1", type: "product-grid" }, { id: "h1", type: "hero", title: "ก" }]);
    expect(() => validateBlocks(blocks)).not.toThrow();
  });

  it("ยังเตือนเรื่องที่ควรเตือนอยู่ (ไม่ได้ปิดตัวตรวจทิ้ง)", () => {
    const blocks = normalizeBlocks([
      { id: "h1", type: "hero", title: "", visibility: { desktop: false, tablet: false, mobile: false } },
    ]);
    const msgs = validateBlocks(blocks).map((i) => i.message).join(" | ");
    expect(msgs).toContain("ซ่อนทุกอุปกรณ์");
    expect(msgs).toContain("หัวเรื่อง");
  });

  it("บล็อกที่ไม่รู้จักไม่ถูกนับเป็นปัญหา", () => {
    const blocks = normalizeBlocks([{ id: "pg-1", type: "product-grid" }]) as Block[];
    const ids = validateBlocks(blocks).map((i) => i.blockId);
    expect(ids).not.toContain("pg-1");
  });
});

import { describe, it, expect } from "vitest";
import { matchShowIf, SECTION_SCHEMAS, type FieldDef } from "../website-schema";
import { normalizeBlocks, newBlock, validateBlocks, blockTypesFor, safeTarget, type Block } from "../website-blocks";
import { canvasItemPreset, canvasItemSummary, validateCanvas, CANVAS_SHAPE_LABEL } from "../website-canvas";
import { productHref, productSlug, categoryHref, sectionHref } from "../website-links";

/**
 * ผืนผ้าใบอิสระ (canvas) + ของกลางที่เพิ่มมาพร้อมกัน (showIf หลายเงื่อนไข · ช่องลิงก์ปลายทาง · Section ทดลอง)
 */
describe("matchShowIf", () => {
  const fd = (showIf: FieldDef["showIf"]): FieldDef => ({ key: "k", label: "k", type: "text", showIf });
  it("ไม่มีเงื่อนไข = โชว์เสมอ", () => expect(matchShowIf(fd(undefined), {})).toBe(true));
  it("eq ค่าเดียว (แบบเดิม)", () => {
    expect(matchShowIf(fd({ key: "source", eq: "manual" }), { source: "manual" })).toBe(true);
    expect(matchShowIf(fd({ key: "source", eq: "manual" }), { source: "all" })).toBe(false);
  });
  it("eq เป็นรายการ = ค่าใดค่าหนึ่ง", () => {
    expect(matchShowIf(fd({ key: "kind", eq: ["text", "button"] }), { kind: "button" })).toBe(true);
    expect(matchShowIf(fd({ key: "kind", eq: ["text", "button"] }), { kind: "image" })).toBe(false);
  });
  it("หลายเงื่อนไข = ต้องตรงทุกข้อ", () => {
    const f = fd([{ key: "kind", eq: "text" }, { key: "color", eq: "custom" }]);
    expect(matchShowIf(f, { kind: "text", color: "custom" })).toBe(true);
    expect(matchShowIf(f, { kind: "image", color: "custom" })).toBe(false);
  });
});

describe("safeTarget (ช่องกดแล้วไปที่)", () => {
  it("รับลิงก์ในเว็บ/ส่วนในหน้า/ภายนอก/อีเมล/โทร", () => {
    for (const ok of ["/shop", "/shop?cat=bag", "/product/pix01", "#s-hero-1", "https://line.me/x", "mailto:a@b.co", "tel:0812345678"]) expect(safeTarget(ok)).toBe(ok);
  });
  it("ตัด javascript: / ลิงก์แปลก / //โดเมนอื่น ทิ้ง", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "shop"]) expect(safeTarget(bad)).toBe("");
  });
});

describe("website-links", () => {
  it("URL ตรงกับ route ของเว็บร้าน", () => {
    expect(productSlug("PIX10-BELT")).toBe("pix10-belt");
    expect(productHref("PIX01")).toBe("/product/pix01");
    expect(categoryHref("bag")).toBe("/shop?cat=bag");
    expect(sectionHref("canvas-1")).toBe("#s-canvas-1");
  });
});

describe("canvas section", () => {
  it("สร้างใหม่ได้ มีชิ้นข้อความเริ่มต้น 1 ชิ้น", () => {
    const b = newBlock("canvas", 1) as unknown as Record<string, unknown>;
    expect(b.height).toBe(560);
    const items = b.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("text");
    expect(items[0].id).toBeTruthy();
  });

  it("normalize: ตัวเลขถูกจำกัดช่วง · ลิงก์อันตรายถูกตัด · ชนิด/ลายมั่วกลับเป็นค่าเริ่มต้น", () => {
    const [b] = normalizeBlocks([
      {
        id: "c1",
        type: "canvas",
        height: 99999,
        items: [
          { id: "a", kind: "image", x: -99999, y: 50.6, w: 0, h: 300, rotate: 999, href: "javascript:alert(1)", frame: "star" },
          { id: "b", kind: "weird", shape: "skull", href: "/shop" },
        ],
      },
    ]) as unknown as Record<string, unknown>[];
    expect(b.height).toBe(2400);
    const [a, c] = b.items as Record<string, unknown>[];
    expect(a).toMatchObject({ x: -1200, y: 51, w: 4, rotate: 180, href: "", frame: "rect" });
    expect(c).toMatchObject({ kind: "text", shape: "bow", href: "/shop" });
  });

  it("ชิ้นที่กดเพิ่ม (preset) ผ่าน normalize ได้ครบทุกชนิด", () => {
    const items = (["image", "text", "button", "shape"] as const).map((k, i) => ({ id: `p${i}`, ...canvasItemPreset(k, i) }));
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", items }]) as unknown as Record<string, unknown>[];
    expect((b.items as Record<string, unknown>[]).map((x) => x.kind)).toEqual(["image", "text", "button", "shape"]);
  });

  it("สรุปในต้นไม้ไม่มีไอคอนซ้ำ", () => {
    expect(canvasItemSummary({ kind: "shape", shape: "bow" })).toBe("🎀 โบว์");
    expect(CANVAS_SHAPE_LABEL.heart).toBe("หัวใจ");
    expect(canvasItemSummary({ kind: "button", label: "ซื้อเลย", href: "/shop", locked: true })).toBe("🔘 ซื้อเลย → /shop 🔒");
  });

  it("ตรวจก่อนเผยแพร่: รูปไม่มี alt / ปุ่มไม่มีลิงก์ / ชิ้นหลุดผืน", () => {
    const msgs = validateCanvas(
      {
        height: 500,
        items: [
          { kind: "image", imageKey: "a/b.png", alt: "", x: 10, y: 10, w: 100 },
          { kind: "button", label: "ไป", href: "", x: 10, y: 10, w: 100 },
          { kind: "text", text: "หลุด", x: 10, y: 900, w: 100 },
        ],
      },
      "ผืน"
    ).map((m) => m.message);
    expect(msgs.some((m) => m.includes("Alt"))).toBe(true);
    expect(msgs.some((m) => m.includes("กดแล้วไปที่"))).toBe(true);
    expect(msgs.some((m) => m.includes("นอกผืน"))).toBe(true);
  });

  it("มีผืนผ้าใบแล้ว ไม่เตือนว่าไม่มี Hero", () => {
    const blocks = normalizeBlocks([{ id: "c1", type: "canvas", items: [{ id: "t", kind: "text", text: "สวัสดี" }] }]) as unknown as Block[];
    expect(validateBlocks(blocks as never).some((i) => i.message.includes("Hero"))).toBe(false);
  });
});

describe("Section ทดลอง (beta)", () => {
  it("canvas อยู่ในคลังเฉพาะร้านที่เปิด beta_canvas", () => {
    expect(SECTION_SCHEMAS.canvas.meta.beta).toBe("beta_canvas");
    expect(blockTypesFor(new Set()).some((t) => t.type === "canvas")).toBe(false);
    expect(blockTypesFor(new Set(["beta_canvas"])).some((t) => t.type === "canvas")).toBe(true);
    // ชนิดปกติอยู่ครบเสมอ
    expect(blockTypesFor(new Set()).some((t) => t.type === "hero")).toBe(true);
  });
});

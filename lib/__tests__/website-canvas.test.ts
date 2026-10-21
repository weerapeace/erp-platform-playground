import { describe, it, expect } from "vitest";
import { matchShowIf, SECTION_SCHEMAS, type FieldDef } from "../website-schema";
import { normalizeBlocks, newBlock, validateBlocks, blockTypesFor, safeTarget, type Block } from "../website-blocks";
import { canvasItemPreset, canvasItemSummary, validateCanvas, CANVAS_SHAPE_LABEL, CANVAS_FRAME_PRESETS, CANVAS_TEXT_PRESETS, CANVAS_BUTTON_PRESETS, fitImageBox, canvasImageKeys, CANVAS_MAX_HEIGHT, canvasHasScrollFx, canvasScrollGallery, canvasScrollClear } from "../website-canvas";
import { productHref, productSlug, categoryHref, sectionHref, categoryKeyOf } from "../website-links";

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
    expect(categoryHref("bag")).toBe("/c/bag");
    expect(categoryKeyOf("/c/bag")).toBe("bag");
    expect(categoryKeyOf("/shop?cat=bag")).toBe("bag");
    expect(categoryKeyOf("/product/bag")).toBeNull();
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
          { id: "a", kind: "image", x: -99999, y: 50.6, w: 0, h: 300, rotate: 999, href: "javascript:alert(1)", frame: "octopus" },
          { id: "b", kind: "weird", shape: "skull", href: "/shop" },
        ],
      },
    ]) as unknown as Record<string, unknown>[];
    expect(b.height).toBe(CANVAS_MAX_HEIGHT);
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

describe("ป๊อปอัปแก้เต็มจอ — ของที่ใช้ร่วม", () => {
  it("ค่าจากแถบเครื่องมือลอยในพรีวิวผ่านตัวกรองของ schema (ห้ามเปลี่ยน id/ชนิด · ค่ามั่วกลับเป็นค่าที่ปลอดภัย)", async () => {
    const { livePatch } = await import("../../components/website-canvas-tools");
    expect(livePatch({ id: "hack", kind: "button", frame: "ellipse", border: "lace", x: 10.6 })).toEqual({ frame: "ellipse", border: "lace", x: 11 });
    expect(livePatch({ frame: "octopus", href: "javascript:alert(1)", color: "neon", unknownKey: 1 })).toEqual({ frame: "rect", href: "", color: "ink" });
    expect(livePatch({ label: "ซื้อเลย", size: 9999 })).toEqual({ label: "ซื้อเลย", size: 240 });
  });

  it("รูปที่เพิ่มใหม่ไม่มีกรอบ (แต่งทีหลังที่ตัวรูป)", () => {
    expect(canvasItemPreset("image")).toMatchObject({ frame: "rect", border: "none" });
  });

  it("วางรูปตามสัดส่วนจริง", () => {
    expect(fitImageBox(1000, 1000)).toEqual({ w: 360, h: 360 });
    expect(fitImageBox(800, 1600)).toEqual({ w: 240, h: 480 });
    expect(fitImageBox(1600, 400, 160, 160)).toEqual({ w: 160, h: 40 });
    expect(fitImageBox(0, 0)).toEqual({ w: 360, h: 360 });
  });

  it("กรอบ/ข้อความ/ปุ่มสำเร็จรูป ผ่าน normalize ได้ค่าเดิม", () => {
    const items = [
      ...CANVAS_FRAME_PRESETS.map((p, i) => ({ id: `f${i}`, ...canvasItemPreset("image"), ...p.patch })),
      ...CANVAS_TEXT_PRESETS.map((p, i) => ({ id: `t${i}`, ...canvasItemPreset("text"), ...p.patch })),
      ...CANVAS_BUTTON_PRESETS.map((p, i) => ({ id: `b${i}`, ...canvasItemPreset("button"), ...p.patch })),
    ];
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", items }]) as unknown as Record<string, unknown>[];
    const out = b.items as Record<string, unknown>[];
    CANVAS_FRAME_PRESETS.forEach((p, i) => expect(out[i]).toMatchObject(p.patch));
    expect(out.find((x) => x.id === "t1")).toMatchObject({ font: "Parisienne", color: "brand" });
    expect(out.find((x) => x.id === "b1")).toMatchObject({ variant: "outline", href: "/shop" });
  });

  it("เก็บ r2 key ของรูปในผืน (ไว้บันทึกว่าถูกใช้ในคลังไฟล์)", () => {
    const keys = canvasImageKeys([
      { type: "hero", imageKey: "x/hero.png" },
      { type: "canvas", bgImageKey: "x/bg.jpg", items: [{ kind: "image", imageKey: "x/a.png" }, { kind: "shape", imageKey: "x/no.png" }, { kind: "image", imageKey: "x/a.png" }] },
    ]);
    expect(keys.sort()).toEqual(["x/a.png", "x/bg.jpg"]);
  });
});

describe("ครอป / พลิก / จัดวาง", () => {
  it("ค่าครอป-พลิกผ่านตัวกรอง schema (จำกัดช่วง)", async () => {
    const { livePatch } = await import("../../components/website-canvas-tools");
    expect(livePatch({ cropZoom: 999, cropX: -5, cropY: 120, flipH: true, flipV: "yes" })).toEqual({ cropZoom: 400, cropX: 0, cropY: 100, flipH: true, flipV: false });
  });
  it("ชิ้นเก่าที่ไม่มีค่าครอป = ไม่ซูม เห็นกึ่งกลาง ไม่พลิก", () => {
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", items: [{ id: "a", kind: "image", imageKey: "x/a.png" }] }]) as unknown as Record<string, unknown>[];
    expect((b.items as Record<string, unknown>[])[0]).toMatchObject({ cropZoom: 100, cropX: 50, cropY: 50, flipH: false, flipV: false });
  });
  it("จัดชั้นหน้า-หลัง", async () => {
    const { reorderLayer } = await import("../../components/website-canvas-tools");
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(reorderLayer(list, "a", "up").map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(reorderLayer(list, "a", "front").map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(reorderLayer(list, "c", "back").map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(reorderLayer(list, "b", "down").map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});

/**
 * รอบ 4: มือถือแบบจัดเอง · เลือกหลายชิ้น/กลุ่ม · ยืดเต็มจอ · แม่แบบ
 */
describe("canvas รอบ 4", () => {
  it("ชิ้นเก่า = มือถือยังไม่ได้จัด (mw 0) · ไม่ยืดเต็มจอ · ไม่มีกลุ่ม · ผืนเรียงอัตโนมัติ", () => {
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", items: [{ id: "a", kind: "text", text: "hi" }] }]) as unknown as Record<string, unknown>[];
    expect(b).toMatchObject({ mobileMode: "auto", mobileHeight: 800 });
    expect((b.items as Record<string, unknown>[])[0]).toMatchObject({ mx: 0, my: 0, mw: 0, mh: 0, msize: 0, malign: "", bleed: false, group: "" });
  });
  it("ช่องมือถือจำกัดช่วง + โหมดผิดค่ากลับเป็น auto", () => {
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", mobileMode: "hack", mobileHeight: 99999, items: [{ id: "a", kind: "text", mw: 5000, msize: -3, malign: "justify" }] }]) as unknown as Record<string, unknown>[];
    expect(b).toMatchObject({ mobileMode: "auto", mobileHeight: 8000 });
    expect((b.items as Record<string, unknown>[])[0]).toMatchObject({ mw: 800, msize: 0, malign: "" });
  });
  it("พรีวิวส่งตำแหน่งมือถือ/กลุ่ม/ยืดเต็มจอ ผ่านตัวกรองเดียวกัน", async () => {
    const { livePatch } = await import("../../components/website-canvas-tools");
    expect(livePatch({ mx: 20, my: 30, mw: 360, mh: 120, msize: 22, malign: "center", group: "g1", bleed: true })).toEqual({ mx: 20, my: 30, mw: 360, mh: 120, msize: 22, malign: "center", group: "g1", bleed: true });
  });
  it("canvasMobileBox: ยังไม่จัด = ย่อจากคอม 1/3 · จัดแล้ว = ใช้ค่าที่จัด", async () => {
    const { canvasMobileBox } = await import("../website-canvas");
    expect(canvasMobileBox({ x: 300, y: 120, w: 600, h: 90, size: 48, mw: 0 })).toEqual({ mx: 100, my: 40, mw: 200, mh: 30, msize: 16 });
    expect(canvasMobileBox({ x: 300, y: 120, w: 600, h: 90, size: 48, mx: 10, my: 20, mw: 380, mh: 60, msize: 30 })).toEqual({ mx: 10, my: 20, mw: 380, mh: 60, msize: 30 });
  });
  it("canvasMobilePreset: ชิ้นใหม่อยู่กลางผืนมือถือ ขนาดอ่านง่าย", async () => {
    const { canvasMobilePreset, CANVAS_MOBILE_WIDTH } = await import("../website-canvas");
    const t = canvasMobilePreset({ kind: "text", size: 56, w: 560, h: 80 });
    expect(t.mw).toBeLessThanOrEqual(CANVAS_MOBILE_WIDTH);
    expect(t.mx).toBe(Math.round((CANVAS_MOBILE_WIDTH - t.mw) / 2));
    expect(t.msize).toBe(34);
    const img = canvasMobilePreset({ kind: "image", w: 320, h: 420 });
    expect(img.mh).toBe(Math.round((img.mw * 420) / 320));
  });
  it("แม่แบบ: เก็บเฉพาะเนื้อผืน · ใช้แล้วได้ id ใหม่ไม่ซ้ำ + กลุ่มรหัสใหม่ที่ยังจับคู่กันเหมือนเดิม", async () => {
    const { canvasTemplateData, instantiateCanvasTemplate } = await import("../website-canvas");
    const data = canvasTemplateData({ id: "c1", type: "canvas", enabled: true, height: 400, items: [{ id: "a", group: "g1" }, { id: "b", group: "g1" }, { id: "c", group: "" }] });
    expect(Object.keys(data).sort()).toEqual(["height", "items"]);
    const inst = instantiateCanvasTemplate(data);
    const items = inst.items as Record<string, unknown>[];
    expect(new Set(items.map((x) => x.id)).size).toBe(3);
    expect(items.map((x) => x.id)).not.toContain("a");
    expect(items[0].group).toBe(items[1].group);
    expect(items[0].group).not.toBe("g1");
    expect(items[2].group).toBe("");
    expect(inst.height).toBe(400);
  });
  it("แม่แบบตั้งต้นผ่านตัวทำความสะอาด (ไม่มีชิ้นหาย · ชิ้นยืดเต็มจออยู่ครบ)", async () => {
    const { CANVAS_STARTER_TEMPLATES, instantiateCanvasTemplate } = await import("../website-canvas");
    for (const t of CANVAS_STARTER_TEMPLATES) {
      const inst = instantiateCanvasTemplate(t.data);
      const [b] = normalizeBlocks([{ id: "c1", type: "canvas", ...inst }]) as unknown as Record<string, unknown>[];
      expect((b.items as unknown[]).length).toBe((t.data.items as unknown[]).length);
    }
    const promo = CANVAS_STARTER_TEMPLATES.find((t) => t.key === "starter-promo-band")!;
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", ...instantiateCanvasTemplate(promo.data) }]) as unknown as Record<string, unknown>[];
    expect((b.items as Record<string, unknown>[]).filter((x) => x.bleed).length).toBe(2);
  });
  it("ตรวจก่อนเผยแพร่: ชิ้นยืดเต็มจอไม่ถูกเตือนว่านอกผืน · ชิ้นหลุดผืนมือถือถูกเตือน", () => {
    const ok = validateCanvas({ height: 300, items: [{ kind: "shape", bleed: true, x: 5000, y: 10, w: 1200 }] }, "ผืน");
    expect(ok.some((x) => x.message.includes("นอกผืน"))).toBe(false);
    const mob = validateCanvas({ height: 300, mobileMode: "custom", mobileHeight: 500, items: [{ kind: "shape", x: 10, y: 10, w: 100, mx: 900, my: 10, mw: 100 }] }, "ผืน");
    expect(mob.some((x) => x.message.includes("นอกผืนมือถือ"))).toBe(true);
  });
  it("หลายชิ้น: ไปหน้าสุด/หลังสุดพร้อมกัน · ทำสำเนาได้กลุ่มใหม่", async () => {
    const { reorderLayerMany, duplicateItems } = await import("../../components/website-canvas-tools");
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(reorderLayerMany(list, ["a", "c"], "front").map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
    expect(reorderLayerMany(list, ["b", "d"], "back").map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
    const src = [
      { id: "a", x: 0, y: 0, group: "g1" },
      { id: "b", x: 10, y: 10, group: "g1" },
    ];
    const r = duplicateItems(src, ["a", "b"], false, 60);
    expect(r.copies.length).toBe(2);
    const copies = r.list.slice(2);
    expect(copies[0]).toMatchObject({ x: 24, y: 24 });
    expect(copies[0].group).toBe(copies[1].group);
    expect(copies[0].group).not.toBe("g1");
  });
});

/**
 * รอบ 5: เคลื่อนไหว · สีไล่ (ของกลาง) · กรอบใหม่ + กรอบจากรูป
 */
describe("canvas รอบ 5", () => {
  it("ชิ้นเก่า = ไม่เคลื่อนไหว ไม่ไล่สี ไม่มีกรอบจากรูป", () => {
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", items: [{ id: "a", kind: "image", imageKey: "x/a.png" }] }]) as unknown as Record<string, unknown>[];
    expect((b.items as Record<string, unknown>[])[0]).toMatchObject({ anim: "", animDelay: 0, animSpeed: "normal", loop: "", loopSpeed: "normal", grad: "", overlayKey: null, overlayInset: 12 });
  });
  it("ค่าผิดถูกกรองทิ้ง (แบบโผล่/ขยับ/ทรง/สีไล่ ต้องอยู่ในรายการ · หน่วงเวลาจำกัด 0–3 วิ)", async () => {
    const { livePatch } = await import("../../components/website-canvas-tools");
    expect(livePatch({ anim: "explode", loop: "spin", animDelay: 99999, frame: "octopus", grad: "radial", color2: "brandDeep", overlayKey: "javascript:x" })).toEqual({
      anim: "",
      loop: "spin",
      animDelay: 3000,
      frame: "rect",
      grad: "radial",
      color2: "brandDeep",
      overlayKey: null,
    });
    expect(livePatch({ anim: "pop", frame: "heart", overlayKey: "storefront-brand/x/frame.png" })).toEqual({ anim: "pop", frame: "heart", overlayKey: "storefront-brand/x/frame.png" });
  });
  it("โผล่ทีละชิ้น: เรียงบน→ล่าง ซ้าย→ขวา หน่วงไล่ 0.15 วิ · ชิ้นที่มีแบบโผล่อยู่แล้วคงแบบเดิม", async () => {
    const { canvasStagger } = await import("../website-canvas");
    const out = canvasStagger([
      { id: "b", x: 0, y: 300, anim: "" },
      { id: "a", x: 500, y: 100, anim: "pop" },
      { id: "c", x: 100, y: 100, anim: "" },
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(Object.fromEntries(out.map((x) => [x.id, [x.anim, x.animDelay]]))).toEqual({ c: ["fade-up", 0], a: ["pop", 150], b: ["fade-up", 300] });
    const only = canvasStagger([{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 10 }], ["b"]);
    expect(only[0]).not.toHaveProperty("animDelay");
    expect(only[1]).toMatchObject({ anim: "fade-up", animDelay: 0 });
  });
  it("กรอบจากรูปนับเป็น 'ถูกใช้' ในคลังไฟล์", () => {
    expect(canvasImageKeys([{ type: "canvas", items: [{ kind: "image", imageKey: "p/1.png", overlayKey: "f/frame.png" }] }]).sort()).toEqual(["f/frame.png", "p/1.png"]);
  });
  it("ทรงกรอบใหม่ใน schema ครบตามที่เว็บร้านรู้จัก + ทรง mask มีเส้นทาง", async () => {
    const { CANVAS_FRAMES, CANVAS_FRAME_PATHS, CANVAS_FRAME_PRESETS, canvasFrameMask } = await import("../website-canvas");
    expect(CANVAS_FRAMES.map((o) => o.v)).toEqual(["rect", "rounded", "ellipse", "arch", "heart", "star", "hexagon", "cloud", "blob", "scallop", "stamp", "polaroid", "mat", "custom"]);
    for (const k of Object.keys(CANVAS_FRAME_PATHS)) expect(canvasFrameMask(k)).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(canvasFrameMask("rect")).toBeNull();
    expect(CANVAS_FRAME_PRESETS.every((p) => CANVAS_FRAMES.some((o) => o.v === p.patch.frame))).toBe(true);
  });
});

describe("สีไล่ (ของกลาง)", () => {
  it("sanitizeGradient: จุดสีต้องเป็นสีธีมหรือ #hex · ไม่ถึง 2 จุด = null · ทิศผิด = บน→ล่าง", async () => {
    const { sanitizeGradient } = await import("../website-gradient");
    expect(sanitizeGradient({ dir: "radial", stops: ["brand", "#FFAA00", "javascript:x"] })).toEqual({ dir: "radial", stops: ["brand", "#ffaa00"] });
    expect(sanitizeGradient({ dir: "sideways", stops: ["brandSoft", "white", "page", "ink"] })).toEqual({ dir: "down", stops: ["brandSoft", "white", "page"] });
    expect(sanitizeGradient({ stops: ["brand"] })).toBeNull();
  });
  it("พื้นหลัง Section แบบไล่สี: ไม่มีสีไล่ที่ใช้ได้ = กลับเป็นค่าเริ่มต้น · เก็บสีไล่ไว้แม้สลับไปแบบอื่น", async () => {
    const { sanitizeStyle } = await import("../website-blocks");
    expect(sanitizeStyle({ bg: "gradient" }).bg).toBe("auto");
    const s = sanitizeStyle({ bg: "gradient", bgGrad: { dir: "diag", stops: ["page", "brandSoft"] } });
    expect(s).toMatchObject({ bg: "gradient", bgGrad: { dir: "diag", stops: ["page", "brandSoft"] } });
    expect(sanitizeStyle({ bg: "page", bgGrad: { dir: "diag", stops: ["page", "brandSoft"] } })).toMatchObject({ bg: "page", bgGrad: { dir: "diag" } });
  });
  it("Section ทั่วไปได้แบบโผล่ใหม่ (เด้ง/หมุนเข้า/เบลอ) ด้วย", async () => {
    const { sanitizeStyle } = await import("../website-blocks");
    expect(sanitizeStyle({ motion: { entrance: "pop" } }).motion.entrance).toBe("pop");
    expect(sanitizeStyle({ motion: { entrance: "explode" } }).motion.entrance).toBe("none");
  });
});

/**
 * รอบ 6: ตอนเอาเมาส์ชี้ · พิมพ์ทีละตัว
 */
describe("canvas รอบ 6", () => {
  it("ชิ้นเก่า = ไม่มีเอฟเฟกต์ตอนชี้ · ค่าผิดกลับเป็นไม่มี", async () => {
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", items: [{ id: "a", kind: "text", text: "hi" }] }]) as unknown as Record<string, unknown>[];
    expect((b.items as Record<string, unknown>[])[0]).toMatchObject({ hover: "" });
    const { livePatch } = await import("../../components/website-canvas-tools");
    expect(livePatch({ hover: "lift", anim: "type" })).toEqual({ hover: "lift", anim: "type" });
    expect(livePatch({ hover: "explode" })).toEqual({ hover: "" });
  });
  it("พิมพ์ทีละตัวเลือกได้เฉพาะข้อความ · ซูมรูปในกรอบเฉพาะรูป", async () => {
    const { canvasEntrancesFor, canvasHoversFor } = await import("../website-canvas");
    expect(canvasEntrancesFor("text").some((o) => o.v === "type")).toBe(true);
    expect(canvasEntrancesFor("image").some((o) => o.v === "type")).toBe(false);
    expect(canvasHoversFor("image").some((o) => o.v === "zoom")).toBe(true);
    expect(canvasHoversFor("button").some((o) => o.v === "zoom")).toBe(false);
  });
  it("ลูกเล่นโผล่ของ Section ไม่มี 'พิมพ์ทีละตัว' (ใช้ได้เฉพาะชิ้นข้อความบนผืน)", async () => {
    const { sanitizeStyle } = await import("../website-blocks");
    expect(sanitizeStyle({ motion: { entrance: "type" } }).motion.entrance).toBe("none");
  });
});

describe("รูปพื้นหลังผืน: ตำแหน่ง/ซูม", () => {
  it("เต็มผืน: รูปกว้างกว่าจอ → เห็นเต็มสูง ตัดซ้าย-ขวา · ตำแหน่ง 0/50/100 = ชิดซ้าย/กลาง/ชิดขวา", async () => {
    const { canvasBgWindow } = await import("../website-canvas");
    const img = { w: 2000, h: 1000 }; // 2:1
    const box = { w: 1000, h: 1000 }; // 1:1 → เห็นครึ่งความกว้าง
    expect(canvasBgWindow(img, box, { x: 50, y: 50, zoom: 100 })).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(canvasBgWindow(img, box, { x: 0, y: 50, zoom: 100 }).x).toBe(0);
    expect(canvasBgWindow(img, box, { x: 100, y: 50, zoom: 100 }).x).toBe(0.5);
  });

  it("รูปแนวตั้งบนจอกว้าง → ตัดบน-ล่าง · ตำแหน่งบน 0 = เห็นหัวรูป", async () => {
    const { canvasBgWindow } = await import("../website-canvas");
    const w = canvasBgWindow({ w: 1000, h: 1500 }, { w: 1440, h: 560 }, { x: 50, y: 0, zoom: 100 });
    expect(w.w).toBe(1);
    expect(w.y).toBe(0);
    expect(w.h).toBeCloseTo((1000 / 1500) / (1440 / 560), 6);
  });

  it("ซูม 200% = เห็นครึ่งหนึ่งของเดิมทั้งสองแกน รอบจุดเดิม", async () => {
    const { canvasBgWindow } = await import("../website-canvas");
    const w = canvasBgWindow({ w: 1000, h: 1000 }, { w: 1000, h: 1000 }, { x: 50, y: 50, zoom: 200 });
    expect(w).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it("ลากกรอบ → bgX/bgY · แกนที่เห็นครบอยู่แล้วคงค่าเดิม · ลากเลยขอบ = ชิดขอบ", async () => {
    const { canvasBgPosFromWindow } = await import("../website-canvas");
    const win = { w: 0.5, h: 1 };
    expect(canvasBgPosFromWindow(win, 0.25, 0, { x: 10, y: 30 })).toEqual({ x: 50, y: 30 });
    expect(canvasBgPosFromWindow(win, -0.3, 0, { x: 10, y: 30 }).x).toBe(0);
    expect(canvasBgPosFromWindow(win, 0.9, 0, { x: 10, y: 30 }).x).toBe(100);
  });

  it("บันทึกผืน: เก็บ bgFit/bgX/bgY/bgZoom (ค่าเกินช่วงถูกตัด) · ข้อมูลเก่าไม่มีช่อง = เต็มผืน กลางรูป ไม่ซูม", () => {
    const [b] = normalizeBlocks([{ type: "canvas", bgImageKey: "x/bg.jpg", bgFit: "contain", bgX: 130, bgY: 20, bgZoom: 50, items: [] }]) as unknown as Record<string, unknown>[];
    expect(b.bgFit).toBe("contain");
    expect(b.bgX).toBe(100);
    expect(b.bgY).toBe(20);
    expect(b.bgZoom).toBe(100);
    const [old] = normalizeBlocks([{ type: "canvas", bgImageKey: "x/bg.jpg", items: [] }]) as unknown as Record<string, unknown>[];
    expect([old.bgFit, old.bgX, old.bgY, old.bgZoom]).toEqual(["cover", 50, 50, 100]);
  });

  it("แม่แบบผืนจำตำแหน่งรูปพื้นหลังด้วย", async () => {
    const { canvasTemplateData } = await import("../website-canvas");
    const d = canvasTemplateData({ height: 600, bgImageKey: "x/bg.jpg", bgX: 30, bgY: 10, bgZoom: 140, bgFit: "cover", bgMCustom: true, bgMY: 0, items: [] });
    expect([d.bgX, d.bgY, d.bgZoom, d.bgFit, d.bgMCustom, d.bgMY]).toEqual([30, 10, 140, "cover", true, 0]);
  });
});

describe("รูปพื้นหลังผืน: มือถือปรับแยก", () => {
  it("บันทึกผืน: เก็บช่องมือถือ · ข้อมูลเก่า = มือถือใช้ค่าคอม (bgMCustom false)", () => {
    const [b] = normalizeBlocks([{ type: "canvas", bgImageKey: "x/bg.jpg", bgMCustom: true, bgMFit: "contain", bgMX: 10, bgMY: 0, bgMZoom: 999, items: [] }]) as unknown as Record<string, unknown>[];
    expect([b.bgMCustom, b.bgMFit, b.bgMX, b.bgMY, b.bgMZoom]).toEqual([true, "contain", 10, 0, 300]);
    const [old] = normalizeBlocks([{ type: "canvas", items: [] }]) as unknown as Record<string, unknown>[];
    expect(old.bgMCustom).toBe(false);
  });
});

describe("แกลเลอรี / Spotlight / หมวด: ช่องใหม่", () => {
  it("แกลเลอรี: ครอปรายรูปถูกกรองช่วง · บล็อกเก่า = จัตุรัส มุมมน 3 คอลัมน์ ชี้แล้วขยาย", () => {
    const [g] = normalizeBlocks([{ type: "gallery", items: [{ imageKey: "x/a.jpg", crop: { x: 130, y: -4, zoom: 50 }, href: "javascript:alert(1)" }] }]) as unknown as Record<string, unknown>[];
    const it0 = (g.items as Record<string, unknown>[])[0];
    expect(it0.crop).toEqual({ x: 100, y: 0, zoom: 100 });
    expect(String(it0.href)).not.toMatch(/javascript/i);
    expect([g.ratio, g.frame, g.columns, g.hoverZoom, g.fullBleed]).toEqual(["1:1", "rounded", 3, true, false]);
  });
  it("Spotlight: บล็อกเก่า = แบบเดิม (จัดวางกลาง · ตามรูป · โชว์ทุกส่วน)", () => {
    const [s0] = normalizeBlocks([{ type: "spotlight", codes: ["A1"] }]) as unknown as Record<string, unknown>[];
    expect([s0.layout, s0.imageFit, s0.imageSize, s0.showName, s0.showBigText, s0.showNav, s0.bigTextOpacity]).toEqual(["center", "contain", 100, true, true, true, 14]);
  });
  it("หมวดสินค้า: ขนาดรูปถูกกรองช่วง 40–200", () => {
    const [c] = normalizeBlocks([{ type: "categories", imgSize: 500 }]) as unknown as Record<string, unknown>[];
    expect(c.imgSize).toBe(200);
  });
});

describe("ชุดหน้าตารูปของกลาง (imageLookFields)", () => {
  it("รูปคู่ข้อความ: บล็อกเก่า = 4:3 มุมมน ขนาด 100% · ครอป/ขนาดถูกกรองช่วง", () => {
    const [b] = normalizeBlocks([{ type: "image-text", imageKey: "x/a.jpg", imgSize: 10, crop: { x: 20, y: 300, zoom: 150 } }]) as unknown as Record<string, unknown>[];
    expect([b.ratio, b.frame, b.border, b.imgSize]).toEqual(["4:3", "rounded", "none", 40]);
    expect(b.crop).toEqual({ x: 20, y: 100, zoom: 150 });
    const [old] = normalizeBlocks([{ type: "image-text", imageKey: "x/a.jpg" }]) as unknown as Record<string, unknown>[];
    expect([old.ratio, old.frame, old.imgSize]).toEqual(["4:3", "rounded", 100]);
  });
  it("แกลเลอรีกับรูปคู่ข้อความใช้ช่องชุดเดียวกัน (ratio/frame/border/borderColor)", async () => {
    const keys = (t: string) => SECTION_SCHEMAS[t as "gallery"].fields.map((f: FieldDef) => f.key);
    for (const k of ["ratio", "frame", "border", "borderColor"]) {
      expect(keys("gallery")).toContain(k);
      expect(keys("image-text")).toContain(k);
    }
  });
});

describe("🛍 ลุคบุ๊กแบบวางอิสระ: วิดีโอ + สินค้าในรูป (2026-10-21)", () => {
  const norm = (items: Record<string, unknown>[]) =>
    (normalizeBlocks([{ id: "c1", type: "canvas", items }])[0] as unknown as { items: Record<string, unknown>[] }).items;

  it("ชิ้นวิดีโอ: เก็บคลิป/ปก/ทรง/สินค้า · ชนิดเดิมไม่เปลี่ยน", () => {
    const [v, img, txt] = norm([
      { id: "v", kind: "video", videoKey: "storefront-videos/2026-10/a.mp4", posterKey: "a/p.jpg", frame: "rounded", fit: "contain", products: ["ROAR02", "TTM130"], shopIcon: false, w: 300, h: 400 },
      { id: "i", kind: "image", imageKey: "a/b.jpg", products: ["ROAR01"] },
      { id: "t", kind: "text", text: "hi" },
    ]);
    expect(v).toMatchObject({ kind: "video", videoKey: "storefront-videos/2026-10/a.mp4", posterKey: "a/p.jpg", frame: "rounded", fit: "contain", products: ["ROAR02", "TTM130"], shopIcon: false, h: 400 });
    expect(img).toMatchObject({ kind: "image", products: ["ROAR01"], shopIcon: true });
    expect(txt.kind).toBe("text");
  });

  it("สินค้าในรูป ≤ 6 · ช่องโชว์เฉพาะรูป/วิดีโอ", () => {
    const [img] = norm([{ id: "i", kind: "image", products: ["A", "B", "C", "D", "E", "F", "G", "H"] }]);
    expect((img.products as string[]).length).toBeLessThanOrEqual(6);
    const fields = SECTION_SCHEMAS.canvas.children!.fields;
    const fd = (k: string) => fields.find((x) => x.key === k) as FieldDef;
    expect(matchShowIf(fd("products"), { kind: "image" })).toBe(true);
    expect(matchShowIf(fd("products"), { kind: "video" })).toBe(true);
    expect(matchShowIf(fd("products"), { kind: "text" })).toBe(false);
    expect(matchShowIf(fd("videoKey"), { kind: "video" })).toBe(true);
    expect(matchShowIf(fd("videoKey"), { kind: "image" })).toBe(false);
    expect(matchShowIf(fd("frame"), { kind: "video" })).toBe(true);
  });

  it("ค่าเริ่มของชิ้นวิดีโอ · สรุปในต้นไม้ · เตือนเมื่อยังไม่ใส่คลิป · คลิป/ปก นับเป็น 'ถูกใช้'", () => {
    expect(canvasItemPreset("video")).toMatchObject({ kind: "video", w: 480, h: 270, frame: "rect", fit: "cover" });
    expect(canvasItemSummary({ kind: "video", videoKey: "a.mp4", products: ["A", "B"] })).toBe("🎬 วิดีโอ · 🛍 2");
    expect(canvasItemSummary({ kind: "image", imageKey: "a.jpg", alt: "ลุค", products: ["A"] })).toBe("🖼️ ลุค · 🛍 1");
    expect(validateCanvas({ height: 560, items: [{ kind: "video", x: 10, y: 10, w: 100 }] }, "ผืน").map((x) => x.message).join(" ")).toMatch(/ยังไม่ได้ใส่คลิป/);
    expect(canvasImageKeys([{ type: "canvas", items: [{ kind: "video", videoKey: "v.mp4", posterKey: "p.jpg" }] }])).toEqual(["v.mp4", "p.jpg"]);
  });
});

describe("🌀 ขยับตามการเลื่อนจอ + 🔍 กดแล้วขยาย (2026-10-21)", () => {
  const norm = (items: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
    normalizeBlocks([{ id: "c1", type: "canvas", ...extra, items }])[0] as unknown as { height: number; items: Record<string, unknown>[] };

  it("บันทึกแล้วค่าไม่หาย (ความเร็วติดลบได้ · จำกัดช่วง · ค่าแปลกตกเป็นค่าเริ่ม)", () => {
    const [a, b] = norm([
      { id: "a", kind: "image", sfxSpeed: -40, sfxFade: "inout", sfxZoom: "grow", sfxRotate: 15, sfxPin: true, expand: "story", expTitle: "ฤดูร้อน", expText: "เล่าเรื่อง", expCta: "ช้อปลุคนี้" },
      { id: "b", kind: "text", sfxSpeed: 999, sfxFade: "boom", sfxZoom: 3, sfxRotate: -500 },
    ]).items;
    expect(a).toMatchObject({ sfxSpeed: -40, sfxFade: "inout", sfxZoom: "grow", sfxRotate: 15, sfxPin: true, expand: "story", expTitle: "ฤดูร้อน", expText: "เล่าเรื่อง", expCta: "ช้อปลุคนี้" });
    expect(b).toMatchObject({ sfxSpeed: 100, sfxFade: "", sfxZoom: "", sfxRotate: -90, sfxPin: false });
  });

  it("ผืนสูงได้ถึง 6000 · ชิ้นวางลึกได้", () => {
    const blk = norm([{ id: "a", kind: "image", y: 5200 }], { height: 9000 });
    expect(blk.height).toBe(CANVAS_MAX_HEIGHT);
    expect(blk.items[0].y).toBe(5200);
  });

  it("ช่องเรื่องราวโชว์เฉพาะรูป/คลิปที่ตั้ง 'ครึ่งจอ + เรื่องราว'", () => {
    const fd = (k: string) => SECTION_SCHEMAS.canvas.children!.fields.find((x) => x.key === k) as FieldDef;
    expect(matchShowIf(fd("expand"), { kind: "image" })).toBe(true);
    expect(matchShowIf(fd("expand"), { kind: "text" })).toBe(false);
    expect(matchShowIf(fd("expTitle"), { kind: "video", expand: "story" })).toBe(true);
    expect(matchShowIf(fd("expTitle"), { kind: "video", expand: "full" })).toBe(false);
    expect(matchShowIf(fd("sfxSpeed"), { kind: "shape" })).toBe(true);
  });

  it("canvasHasScrollFx + สรุปในต้นไม้มี 🌀/🔍", () => {
    expect(canvasHasScrollFx({ sfxSpeed: 0, sfxFade: "", sfxRotate: 0 })).toBe(false);
    expect(canvasHasScrollFx({ sfxSpeed: -20 })).toBe(true);
    expect(canvasHasScrollFx({ sfxPin: true })).toBe(true);
    expect(canvasItemSummary({ kind: "image", imageKey: "a.jpg", alt: "ลุค", sfxSpeed: 30, expand: "full" })).toBe("🖼️ ลุค 🌀 🔍");
    // ชิ้นที่ไม่มีลูกเล่น = สรุปเหมือนเดิม
    expect(canvasItemSummary({ kind: "image", imageKey: "a.jpg", alt: "ลุค" })).toBe("🖼️ ลุค");
  });

  it("ทำทั้งผืนแบบนิตยสาร: รูปเร็ว-ช้าสลับ + จาง · หัวข้อใหญ่ค้าง · คำบรรยายติดรูปใกล้สุด · ของตกแต่งเร็ว/ช้ามาก", () => {
    const items = [
      { id: "big", kind: "text", size: 96, x: 500, y: 60, w: 600, h: 120 },
      { id: "i1", kind: "image", x: 60, y: 40, w: 300, h: 220 },
      { id: "cap1", kind: "text", size: 14, x: 380, y: 80, w: 200, h: 40 },
      { id: "i2", kind: "image", x: 600, y: 400, w: 340, h: 220 },
      { id: "v3", kind: "video", x: 100, y: 800, w: 300, h: 400 },
      { id: "s1", kind: "shape", x: 1000, y: 900, w: 60, h: 60 },
      { id: "far", kind: "button", x: 560, y: 2000, w: 200, h: 50 },
    ];
    const out = Object.fromEntries(canvasScrollGallery(items).map((it) => [it.id, it as Record<string, unknown>]));
    expect(out.big).toMatchObject({ sfxPin: true, sfxFade: "out" });
    expect(out.i1).toMatchObject({ sfxSpeed: -30, sfxFade: "out" });
    expect(out.i2).toMatchObject({ sfxSpeed: 35, sfxFade: "out" });
    expect(out.v3).toMatchObject({ sfxSpeed: 15, sfxFade: "out" });
    expect(out.cap1).toMatchObject({ sfxSpeed: -30, sfxFade: "out" });
    expect(out.s1.sfxSpeed).toBe(55);
    expect(out.far).toMatchObject({ sfxSpeed: 0, sfxFade: "" });
    // ลำดับชั้นเดิม + ล้างได้
    expect(canvasScrollGallery(items).map((x) => x.id)).toEqual(items.map((x) => x.id));
    expect(canvasScrollClear(canvasScrollGallery(items)).some((x) => canvasHasScrollFx(x))).toBe(false);
  });

  it("เตือน: ขยายเต็มจอแต่ไม่มีหน้าปลายทางในเว็บ · เรื่องราวว่าง", () => {
    const msg = (it: Record<string, unknown>) => validateCanvas({ height: 560, items: [{ kind: "image", imageKey: "a.jpg", alt: "a", x: 10, y: 10, w: 100, ...it }] }, "ผืน").map((x) => x.message).join(" ");
    expect(msg({ expand: "full" })).toMatch(/ต้องตั้ง "กดแล้วไปที่"/);
    expect(msg({ expand: "full", href: "https://x.co" })).toMatch(/ต้องตั้ง "กดแล้วไปที่"/);
    expect(msg({ expand: "full", href: "/shop", newTab: true })).toMatch(/ต้องตั้ง "กดแล้วไปที่"/);
    expect(msg({ expand: "full", href: "/shop" })).not.toMatch(/กดแล้วไปที่/);
    expect(msg({ expand: "story" })).toMatch(/ฝั่งขวาจะว่าง/);
    expect(msg({ expand: "story", expTitle: "หัวข้อ" })).not.toMatch(/ฝั่งขวาจะว่าง/);
  });
});

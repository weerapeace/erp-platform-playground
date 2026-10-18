import { describe, it, expect } from "vitest";
import { SECTION_SCHEMAS, SECTION_TYPES, blankChild, sectionHasHeading, matchShowIf, PRODUCT_TILE_LAYOUTS } from "../website-schema";
import { normalizeBlocks, newBlock, validateBlocks, blockSummary, BLOCK_META, DEFAULT_BLOCK_STYLE, type Block } from "../website-blocks";

/**
 * กันบั๊กของตัวจัดหน้าแบบ Schema-Driven:
 *  - ทุกชนิดใน schema ต้องสร้าง/ทำความสะอาด/สรุป ได้โดยไม่พัง (เพิ่มชนิดใหม่แล้วลืมอะไร = แดงทันที)
 *  - หน้าแรกของร้านที่จัดไว้แล้ว (Louis Montini) ผ่าน normalize แล้ว "ค่าทุกช่องต้องเหมือนเดิม"
 *    (ยอมให้เพิ่มได้แค่ id/enabled ของชิ้นย่อย กับ style.mobile ที่เป็น auto)
 */

/** หน้าแรก Louis Montini ที่เผยแพร่อยู่จริง (ย่อ) — รูปแบบข้อมูลก่อนมีระบบ Block ย่อย */
const LOUIS_HOME = [
  { id: "announcement-1", type: "announcement", enabled: true, visibility: { desktop: true, tablet: true, mobile: true }, style: { padTop: "auto", padBottom: "auto", bg: "auto", bgColor: "", width: "auto", align: "auto" }, messages: ["ส่งฟรีทั่วไทย เมื่อสั่งครบ ฿1,500", "สั่งซื้อผ่านเว็บ จ่ายปลายทางได้"] },
  { id: "hero-2", type: "hero", enabled: true, visibility: { desktop: true, tablet: true, mobile: true }, style: { padTop: "auto", padBottom: "auto", bg: "auto", bgColor: "", width: "auto", align: "auto" }, eyebrow: "Louis Montini · since 1996", title: "กระเป๋าดีไซน์ดี", titleAccent: "ใช้ได้ทุกวัน", subtitle: "เป้ สะพายข้าง คาดอก", primary: { text: "เลือกซื้อกระเป๋า", href: "/shop" }, secondary: { text: "สินค้าแนะนำ", href: "/shop?sort=featured" }, features: [{ title: "หนังวัวแท้", desc: "คัดเกรดทุกชิ้น" }, { title: "ผลิตในไทย", desc: "โรงงานของเราเอง" }], imageKey: "parent_skus/296/2025-10-24-09-00-06/original", imageAlt: "กระเป๋าเป้ Louis Montini", overlay: 60, height: "tall" },
  { id: "faq-5", type: "faq", enabled: true, visibility: { desktop: true, tablet: true, mobile: true }, style: { padTop: "auto", padBottom: "auto", bg: "auto", bgColor: "", width: "auto", align: "auto" }, eyebrow: "คำถามที่พบบ่อย", title: "ก่อนสั่งซื้อ อยากรู้อะไรบ้าง?", subtitle: "ถ้ายังไม่พบคำตอบ ทักหาเราได้ทุกช่องทาง", items: [{ q: "สั่งแล้วได้รับของภายในกี่วัน?", a: "จัดส่งภายใน 1–2 วันทำการ" }, { q: "ชำระเงินได้ทางไหนบ้าง?", a: "COD หรือพร้อมเพย์" }] },
  { id: "cta-6", type: "cta", enabled: true, visibility: { desktop: true, tablet: true, mobile: true }, style: { padTop: "auto", padBottom: "auto", bg: "auto", bgColor: "", width: "auto", align: "auto" }, title: "สนใจสั่งจำนวนมาก?", subtitle: "", primary: { text: "ติดต่อเรา", href: "/contact" }, secondary: { text: "ดูสินค้าทั้งหมด", href: "/shop" } },
];

/** เทียบค่าทุกช่องเดิม โดยข้ามคีย์ที่ระบบใหม่ "เพิ่ม" ได้ (id/enabled ของชิ้นย่อย, style.mobile) */
function stripAdded(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripAdded);
  if (v && typeof v === "object") {
    const o = { ...(v as Record<string, unknown>) };
    // style.mobile เป็นของใหม่ (ไม่ใช่ visibility.mobile ซึ่งเป็น boolean เดิม)
    if ("padTop" in o) {
      delete o.mobile;
      delete o.motion;
      delete o.text; // แผง 🔤 ตัวอักษร (ค่าเริ่ม = ตามเดิมทุกช่อง ตรวจแยกใน describe ของมันเอง)
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, stripAdded(x)]));
  }
  return v;
}
function stripChildMeta(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripChildMeta);
  if (v && typeof v === "object") {
    const o = { ...(v as Record<string, unknown>) };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, stripChildMeta(x)]));
  }
  return v;
}

describe("website-schema — ครบทุกชนิด", () => {
  it("ทุกชนิดมี meta ครบ และอยู่ใน BLOCK_META", () => {
    for (const t of SECTION_TYPES) {
      const sc = SECTION_SCHEMAS[t];
      expect(sc.meta.label, t).toBeTruthy();
      expect(sc.meta.icon, t).toBeTruthy();
      expect(sc.meta.group, t).toBeTruthy();
      expect(BLOCK_META[t as keyof typeof BLOCK_META]).toEqual(sc.meta);
    }
  });

  it("newBlock ทุกชนิด → normalize แล้วได้ค่าเดิม (idempotent) และสรุปได้ไม่พัง", () => {
    for (const t of SECTION_TYPES) {
      const b = newBlock(t as Block["type"], 1);
      const [n] = normalizeBlocks([b]);
      expect(n, t).toEqual(b);
      expect(typeof blockSummary(b as unknown as Record<string, unknown>), t).toBe("string");
      expect(() => validateBlocks([b]), t).not.toThrow();
    }
  });

  it("ค่าเริ่มต้นไม่มีข้อความเฉพาะร้าน IG (ขอใบเสนอราคา/ร้านวัสดุ) — ร้านใหม่ต้องเป็นกลาง", () => {
    const json = JSON.stringify(SECTION_TYPES.map((t) => newBlock(t as Block["type"], 1)));
    expect(json).not.toMatch(/ขอใบเสนอราคา|ร้านวัสดุ|\/quote|OEM/);
  });

  it("ชิ้นย่อยเปล่าจาก schema มีครบทุกช่อง", () => {
    for (const t of SECTION_TYPES) {
      const ch = SECTION_SCHEMAS[t].children;
      if (!ch) continue;
      const item = blankChild(ch);
      for (const fd of ch.fields) expect(item, `${t}.${fd.key}`).toHaveProperty(fd.key);
    }
  });
});

describe("normalizeBlocks — หน้าแรกของร้านที่จัดไว้แล้ว ต้องไม่เพี้ยน", () => {
  const out = normalizeBlocks(LOUIS_HOME);

  it("จำนวนและชนิดครบ เรียงเหมือนเดิม", () => {
    expect(out.map((b) => b.type)).toEqual(LOUIS_HOME.map((b) => b.type));
  });

  it("ค่าทุกช่องเดิมยังอยู่ครบ (เพิ่มได้แค่ id/enabled ของชิ้นย่อย กับ style.mobile)", () => {
    const got = stripAdded(out) as Record<string, unknown>[];
    for (let i = 0; i < LOUIS_HOME.length; i++) {
      const src = LOUIS_HOME[i] as Record<string, unknown>;
      const g = got[i];
      for (const [k, v] of Object.entries(src)) {
        if (Array.isArray(v) && v.length && typeof v[0] === "object") {
          // ชิ้นย่อย: เทียบเฉพาะช่องที่เคยมี
          const gv = g[k] as Record<string, unknown>[];
          expect(gv.length, `${src.id}.${k}`).toBe(v.length);
          v.forEach((item, j) => {
            for (const [ik, iv] of Object.entries(item as Record<string, unknown>)) expect(gv[j][ik], `${src.id}.${k}[${j}].${ik}`).toEqual(iv);
            expect(gv[j].id, "ชิ้นย่อยต้องได้รหัส").toBeTruthy();
            expect(gv[j].enabled).toBe(true);
          });
        } else {
          expect(stripChildMeta(g[k]), `${src.id}.${k}`).toEqual(v);
        }
      }
    }
  });

  it("style.mobile ของบล็อกเก่าเป็น auto ทั้งชุด", () => {
    for (const b of out) expect(b.style.mobile).toEqual(DEFAULT_BLOCK_STYLE.mobile);
  });

  it("รหัสชิ้นย่อยนิ่ง: normalize ซ้ำได้รหัสเดิม (ไม่งั้นตัวจัดหน้าคิดว่ามีการแก้ตลอด)", () => {
    const again = normalizeBlocks(out);
    expect(again).toEqual(out);
  });
});

describe("Block ย่อย + schema ใหม่", () => {
  it("ชิ้นย่อยที่ปิด (enabled=false) ยังถูกเก็บไว้ และเกินจำนวนสูงสุดถูกตัด", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ q: `q${i}`, a: "a", enabled: i % 2 === 0 }));
    const [b] = normalizeBlocks([{ id: "f", type: "faq", items: many }]);
    const items = (b as { items: { enabled?: boolean }[] }).items;
    expect(items).toHaveLength(SECTION_SCHEMAS.faq.children!.max);
    expect(items[1].enabled).toBe(false);
  });

  it("products: เลือกเองแต่ยังไม่เลือกสินค้า = error · รหัสสินค้ามั่วถูกล้าง", () => {
    const [b] = normalizeBlocks([{ id: "p", type: "products", source: "manual", codes: ["BBP10", "bad code!", "BBP10"] }]);
    expect((b as { codes: string[] }).codes).toEqual(["BBP10", "badcode"]);
    const [empty] = normalizeBlocks([{ id: "p", type: "products", source: "manual", codes: [] }]);
    expect(validateBlocks([empty]).some((i) => i.level === "error" && i.message.includes("ยังไม่ได้เลือกสินค้า"))).toBe(true);
    // เลือกทั้งหมวดแต่ไม่ระบุหมวด
    const [cat] = normalizeBlocks([{ id: "p", type: "products", source: "category", category: "" }]);
    expect(validateBlocks([cat]).some((i) => i.message.includes("ยังไม่ได้เลือกหมวด"))).toBe(true);
  });

  it("slideshow: สไลด์ไม่มีรูป = error · overlay เกินช่วงถูกบีบ", () => {
    const [b] = normalizeBlocks([{ id: "s", type: "slideshow", slides: [{ title: "x", overlay: 500 }] }]);
    expect((b as { slides: { overlay: number }[] }).slides[0].overlay).toBe(90);
    expect(validateBlocks([b]).some((i) => i.message.includes("ยังไม่มีรูปในสไลด์"))).toBe(true);
  });

  it("video/map กรองลิงก์ผิดโฮสต์ทิ้ง (เหมือนเดิม)", () => {
    const [v] = normalizeBlocks([{ id: "v", type: "video", url: "https://youtube.com.evil.com/watch?v=1" }]);
    expect((v as { url: string }).url).toBe("");
    const [m] = normalizeBlocks([{ id: "m", type: "map", embedUrl: "https://www.google.com/maps/embed?pb=abc" }]);
    expect((m as { embedUrl: string }).embedUrl).toContain("/maps/embed");
  });
});

describe("ชุดรูปกลางครบทุก Section (หลายคอลัมน์ · รูปภาพ · แบนเนอร์หลัก · สไลด์โชว์)", () => {
  const field = (fields: { key: string }[], key: string) => fields.find((x) => x.key === key) as Record<string, unknown> | undefined;

  it("รูปภาพ: ค่าเริ่ม = ตามรูปจริง + ทรงอัตโนมัติ (หน้าตาเหมือนเดิม ไม่ตัดรูปใคร)", () => {
    const b = newBlock("image", 1) as unknown as Record<string, unknown>;
    expect(b.ratio).toBe("auto");
    expect(b.frame).toBe("auto");
    expect(b.crop).toEqual({ x: 50, y: 50, zoom: 100 });
    // บล็อกเก่า (ไม่มีช่องใหม่) ผ่าน normalize แล้วยังได้ค่าที่หน้าตาเหมือนเดิม
    const [old] = normalizeBlocks([{ id: "i", type: "image", imageKey: "a/b", alt: "", caption: "", width: "full", href: "" }]) as unknown as Record<string, unknown>[];
    expect(old.ratio).toBe("auto");
    expect(old.frame).toBe("auto");
  });

  it("หลายคอลัมน์: 4:3 มุมมน (แบบเดิม) + ส่วนที่เห็นรายคอลัมน์ตามสัดส่วนของ Section", () => {
    const b = newBlock("multicolumn", 1) as unknown as Record<string, unknown>;
    expect(b.ratio).toBe("4:3");
    expect(b.frame).toBe("rounded");
    const crop = field(SECTION_SCHEMAS.multicolumn.children!.fields, "crop");
    expect(crop?.cropImage).toBe("imageKey");
    expect(crop?.cropRatio).toBe("ratio");
  });

  it("แบนเนอร์หลัก + สไลด์: ส่วนที่เห็น/ซูม กรอบตายตัว 16:7", () => {
    expect(field(SECTION_SCHEMAS.hero.fields, "crop")?.cropBox).toBe("16:7");
    expect(field(SECTION_SCHEMAS.slideshow.children!.fields, "crop")?.cropBox).toBe("16:7");
  });
});

describe("ตัวอักษรหัวข้อต่อ Section + มือถือแยก (แผง 🔤 ตัวอักษร)", () => {
  const styleOf = (style: unknown) => (normalizeBlocks([{ id: "t", type: "rich-text", title: "หัวข้อ", style }])[0] as unknown as { style: Record<string, Record<string, unknown>> }).style;

  it("บล็อกเก่าไม่เคยตั้ง = ตามเดิมทุกช่อง (หน้าเว็บไม่เปลี่ยน)", () => {
    const st = styleOf(undefined);
    expect(st.text).toEqual({ font: "auto", size: "auto", weight: "auto", color: "auto", colorHex: "", subColor: "auto", subColorHex: "" });
    expect(st.mobile).toMatchObject({ hSize: "auto", hideEyebrow: false, hideSub: false });
  });

  it("ค่าที่ตั้งถูกเก็บครบ · ค่ามั่ว/ฟอนต์นอกรายการ = ตามเดิม · สีเองไม่มีรหัสสี = ตามเดิม", () => {
    const ok = styleOf({ text: { font: "Charm", size: "xl", weight: "700", color: "custom", colorHex: "#AA3366", subColor: "brand" }, mobile: { hSize: "s", hideEyebrow: true, hideSub: true } });
    expect(ok.text).toMatchObject({ font: "Charm", size: "xl", weight: "700", color: "custom", colorHex: "#aa3366", subColor: "brand" });
    expect(ok.mobile).toMatchObject({ hSize: "s", hideEyebrow: true, hideSub: true });
    const bad = styleOf({ text: { font: "Comic Sans<script>", size: "huge", weight: "950", color: "custom", colorHex: "red", subColor: "nope" }, mobile: { hSize: 3, hideSub: "yes" } });
    expect(bad.text).toMatchObject({ font: "auto", size: "auto", weight: "auto", color: "auto", colorHex: "", subColor: "auto" });
    expect(bad.mobile).toMatchObject({ hSize: "auto", hideSub: false });
  });

  it("แท็บตัวอักษรโชว์เฉพาะ Section ที่มีหัวข้อ (ไม่ซ้อนกับผืนผ้าใบ/โชว์สินค้าเด่นที่ตั้งเองได้แล้ว)", () => {
    expect(sectionHasHeading("rich-text")).toBe(true);
    expect(sectionHasHeading("hero")).toBe(true);
    expect(sectionHasHeading("slideshow")).toBe(true); // หัวข้ออยู่ที่สไลด์
    expect(sectionHasHeading("canvas")).toBe(false);
    expect(sectionHasHeading("spotlight")).toBe(false);
    expect(sectionHasHeading("divider")).toBe(false);
  });
});

describe("แกลเลอรี — ข้อความประกอบรูป (cap*)", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "g", type: "gallery", ...b }])[0] as unknown as Record<string, unknown> & { items: Record<string, unknown>[] };

  it("แกลเลอรีเก่า (ไม่มี cap*) = ใต้รูป ตัวเล็กสีรอง แบบเดิม · ข้อความใต้รูปเดิมยังอยู่", () => {
    const g = norm({ title: "แกลเลอรี", items: [{ imageKey: "a/b.jpg", alt: "รูป", caption: "ข้อความเดิม" }] });
    expect(g).toMatchObject({ capShow: true, capPos: "below", capAlign: "auto", capGap: "sm", capTextSize: "s", capTextColor: "auto", capTitleColor: "auto", capMobile: "all" });
    expect(g.items[0]).toMatchObject({ caption: "ข้อความเดิม", title: "", linkText: "" });
  });

  it("ค่าที่ตั้งถูกเก็บ · ค่ามั่ว = ค่าเริ่ม · คำแปลรายรูป (_en) ไม่หายตอนบันทึก", () => {
    const g = norm({
      capPos: "overlay", capAlign: "center", capTitleFont: "Charm", capTitleSize: "xl", capTitleColor: "custom", capTitleHex: "#AA3366", capShade: 70, capMobile: "title",
      capTextSize: "huge", capLinkStyle: "<b>", capCardBg: "nope",
      items: [{ imageKey: "a/b.jpg", alt: "", title: "ลุคทำงาน", title_en: "Office look", caption: "คำอธิบาย", caption_en: "Desc", linkText: "ดูสินค้า →", linkText_en: "Shop →", href: "/shop" }],
    });
    expect(g).toMatchObject({ capPos: "overlay", capAlign: "center", capTitleFont: "Charm", capTitleSize: "xl", capTitleColor: "custom", capTitleHex: "#aa3366", capShade: 70, capMobile: "title" });
    expect(g).toMatchObject({ capTextSize: "s", capLinkStyle: "text", capCardBg: "surface" });
    expect(g.items[0]).toMatchObject({ title: "ลุคทำงาน", title_en: "Office look", caption_en: "Desc", linkText: "ดูสินค้า →", linkText_en: "Shop →", href: "/shop" });
  });
});

/** 🃏 การ์ดในส่วนนี้ (Section ตารางสินค้า) — ค่าเริ่ม = ตามการ์ดของร้าน · ปิดสวิตช์ = ก๊อปค่าการ์ดของร้านมาเป็นค่าเริ่ม */
describe("products: การ์ดในส่วนนี้", () => {
  const fields = SECTION_SCHEMAS.products.fields;
  const master = fields.find((x) => x.key === "cardUseShop")!;

  it("Section เก่า (ไม่มีช่องการ์ด) = ตามการ์ดของร้าน", () => {
    const [b] = normalizeBlocks([{ id: "p1", type: "products", source: "all" }]) as unknown as Record<string, unknown>[];
    expect(b.cardUseShop).toBe(true);
    expect(b.cardTitleLines).toBe("2");
  });

  it("ค่าที่ตั้งเองรอดการบันทึก", () => {
    const [b] = normalizeBlocks([{ id: "p1", type: "products", source: "all", cardUseShop: false, cardPrice: false, cardSwatches: true, cardTitleLines: "1", cardAlign: "center" }]) as unknown as Record<string, unknown>[];
    expect([b.cardUseShop, b.cardPrice, b.cardSwatches, b.cardTitleLines, b.cardAlign]).toEqual([false, false, true, "1", "center"]);
  });

  it("ก๊อปการ์ดค่าเริ่มของร้าน = ค่าเริ่มของทุกช่อง (ปิดสวิตช์แล้วหน้าตาเท่าเดิม)", () => {
    const shopDefault = { titleLines: 2, showBadge: true, showStock: true, showCompare: true, showSwatches: false, showColorCount: false, priceFrom: false, quickView: "none", showUnit: true, showCategory: true, quickAdd: "hover", align: "left" };
    const copied = master.copyShopCard!(shopDefault, {});
    for (const [k, v] of Object.entries(copied)) expect([k, v]).toEqual([k, fields.find((x) => x.key === k)!.default]);
    expect(Object.keys(copied).sort()).toEqual(fields.filter((x) => x.group === "card" && x.key !== "cardUseShop").map((x) => x.key).sort());
  });

  it("ก๊อปตามที่ร้านตั้งจริง", () => {
    const c = master.copyShopCard!({ titleLines: 1, showBadge: false, autoBadges: { sale: false, new: false, best: false }, quickAdd: "none", quickView: "replace", showSwatches: true, align: "center" }, { layout: "grid" });
    expect([c.cardBadge, c.cardQuickAdd, c.cardQuickView, c.cardSwatches, c.cardTitleLines, c.cardAlign]).toEqual([false, false, true, true, "1", "center"]);
    expect(master.copyShopCard!({ showBadge: false, autoBadges: { sale: true } }, {}).cardBadge).toBe(true);
  });

  it("แบบรูปนำล้วน (ลุคบุ๊ก/โมเสก/สปอตไลต์): ซ่อนสวิตช์ที่ไทล์ไม่มี + ก๊อปตามหน้าตาไทล์", () => {
    const vis = (b: Record<string, unknown>) => fields.filter((x) => x.group === "card" && matchShowIf(x, { cardUseShop: false, ...b })).map((x) => x.key);
    expect(vis({ layout: "lookbook", layoutMobile: "same" })).not.toContain("cardBadge");
    expect(vis({ layout: "lookbook", layoutMobile: "same" })).toContain("cardCompare");
    expect(vis({ layout: "lookbook", layoutMobile: "grid" })).toContain("cardBadge"); // มือถือเป็นการ์ดเต็ม
    expect(vis({ layout: "grid", layoutMobile: "spotlight" })).toContain("cardQuickAdd");
    const c = master.copyShopCard!({ titleLines: 1, showCompare: true, showUnit: true, priceFrom: false, showColorCount: false, align: "center" }, { layout: "mosaic", layoutMobile: "same" });
    expect([c.cardCompare, c.cardUnit, c.cardPriceFrom, c.cardColorCount, c.cardTitleLines, c.cardAlign]).toEqual([false, false, true, true, "2", "left"]);
  });

  it("รูปแบบการโชว์ทุกแบบถูกจัดเป็น การ์ดเต็ม หรือ รูปนำ (เพิ่มแบบใหม่แล้วลืม = แดง)", () => {
    const opts = (fields.find((x) => x.key === "layout")!.options ?? []).map((o) => o.v);
    const full = fields.find((x) => x.key === "cardBadge")!.showIf as { eq: string[] }[];
    expect([...full[1].eq, ...PRODUCT_TILE_LAYOUTS].sort()).toEqual([...opts].sort());
  });
});

describe("ลุคบุ๊ก — ปรับได้เยอะ + หลายสินค้าต่อจุด + สินค้าเพิ่มเติม", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "lb", type: "lookbook", ...b }])[0] as unknown as Record<string, unknown> & { spots: Record<string, unknown>[] };

  it("ลุคบุ๊กเก่า (จุดละ 1 สินค้า ไม่มีช่องใหม่) = ค่าเริ่มแบบเดิมทุกช่อง", () => {
    const b = norm({ imageKey: "a/b.jpg", layout: "pop", dot: "dot", spots: [{ code: ["ROAR01"], pos: { x: 30, y: 40 }, popSide: "auto", note: "" }] });
    expect(b).toMatchObject({ imgFrame: "rounded", sideMode: "card", imgWidth: "58", dotColor: "white", dotSize: "m", dotPulse: "auto", dotLabel: false, listStyle: "grid", listCols: "auto", mobileLayout: "same", more: [], cardBg: "auto", cardAlign: "left", addStyle: "brand", viewStyle: "outline" });
    expect(b.spots[0]).toMatchObject({ code: ["ROAR01"], label: "" });
  });

  it("จุดเลือกได้ถึง 6 สินค้า · สินค้าเพิ่มเติม 12 · ค่ามั่ว = ค่าเริ่ม", () => {
    const b = norm({ more: ["a1", "a2"], dotColor: "neon", sideMode: "list", spots: [{ code: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"], label: "กระเป๋า", label_en: "Bag" }] });
    expect(b.spots[0].code).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(b.spots[0]).toMatchObject({ label: "กระเป๋า", label_en: "Bag" });
    expect(b).toMatchObject({ more: ["a1", "a2"], dotColor: "white", sideMode: "list" });
  });
});

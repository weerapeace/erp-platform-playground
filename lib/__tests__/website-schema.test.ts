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
    expect(st.text).toEqual({ ...DEFAULT_BLOCK_STYLE.text });
    expect(Object.values(st.text).every((v) => v === "auto" || v === "" || v === false)).toBe(true);
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

/** 🖼️ แกลเลอรีแบบแถวรูปลุคบุ๊ก (layout strip) — ชี้แล้วรูปขยาย */
describe("แกลเลอรี — แถวรูปลุคบุ๊ก (strip*)", () => {
  const fields = SECTION_SCHEMAS.gallery.fields;
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "g", type: "gallery", ...b }])[0] as unknown as Record<string, unknown> & { items: Record<string, unknown>[] };
  const shown = (b: Record<string, unknown>) => fields.filter((x) => matchShowIf(x, b)).map((x) => x.key);

  it("แกลเลอรีเก่า = ตารางแบบเดิม · ช่องแถวรูปซ่อน", () => {
    const g = norm({ items: [{ imageKey: "a/b.jpg", alt: "รูป" }] });
    expect(g.layout).toBe("grid");
    const vis = shown(g);
    expect(vis).toEqual(expect.arrayContaining(["columns", "gap", "hoverZoom", "capShow", "capPos"]));
    expect(vis.some((k) => k.startsWith("strip"))).toBe(false);
  });

  it("แถวรูป: ช่องตาราง + ชุด cap* ซ่อน · ช่องแถวรูปโชว์ · ค่าเริ่ม = แบบรูปอ้างอิง", () => {
    const g = norm({ layout: "strip", items: [{ imageKey: "a/b.jpg", alt: "รูป" }] });
    expect(g).toMatchObject({ stripEffect: "soft", stripW: 120, stripZoom: 240, stripCap: "top", stripNum: "paren", stripFont: "mono", stripUpper: true, stripMove: "still", stripMobile: "tap", stripFade: true });
    const vis = shown(g);
    expect(vis).toEqual(expect.arrayContaining(["ratio", "frame", "fullBleed", "stripEffect", "stripW", "stripCap", "stripNum", "stripFont"]));
    for (const k of ["columns", "gap", "hoverZoom", "capShow", "capPos", "capTitleFont"]) expect(vis).not.toContain(k);
    expect(vis).not.toContain("stripAutoSpeed"); // โชว์เมื่อเลือกเลื่อนเอง
    expect(shown({ ...g, stripMove: "auto" })).toContain("stripAutoSpeed");
    // ไม่มีข้อความ = ซ่อนช่องหน้าตาข้อความ
    expect(shown({ ...g, stripCap: "none" })).not.toContain("stripFont");
  });

  it("▶ ขยายเองวน: ค่าเริ่มปิด (หน้าตาเดิม) · ช่องวินาทีโชว์เมื่อเปิด · แบบเลื่อนเองไม่มีช่องนี้", () => {
    const g = norm({ layout: "strip", items: [] });
    expect([g.stripCycle, g.stripCycleSec]).toEqual([false, "3"]);
    expect(shown(g)).toContain("stripCycle");
    expect(shown(g)).not.toContain("stripCycleSec");
    expect(shown({ ...g, stripCycle: true })).toContain("stripCycleSec");
    expect(shown({ ...g, stripMove: "auto", stripCycle: true })).not.toEqual(expect.arrayContaining(["stripCycle"]));
    expect(norm({ layout: "strip", stripCycle: true, stripCycleSec: "99", items: [] }).stripCycleSec).toBe("3");
  });

  it("ค่ามั่ว/เกินช่วง = ค่าเริ่ม/ตัดเข้าช่วง", () => {
    const g = norm({ layout: "strip", stripEffect: "wobble", stripW: 9999, stripZoom: 10, stripMove: "<x>", items: [] });
    expect(g.stripEffect).toBe("soft");
    expect(g.stripMove).toBe("still");
    expect(Number(g.stripW)).toBeLessThanOrEqual(260);
    expect(Number(g.stripZoom)).toBeGreaterThanOrEqual(130);
  });

  it("รูปจากสินค้า: นับเป็นรูป (ไม่ error) และไม่เตือน Alt", () => {
    const v = (items: Record<string, unknown>[]) => validateBlocks(normalizeBlocks([{ id: "g", type: "gallery", layout: "strip", items }]) as Block[]).map((x) => x.message);
    expect(v([{ code: ["ROAR01"] }]).join("|")).not.toMatch(/ยังไม่มีรูป|Alt/);
    expect(v([]).join("|")).toMatch(/ยังไม่มีรูปในแกลเลอรี/);
    expect(norm({ items: [{ code: ["ROAR01", "X2"] }] }).items[0].code).toEqual(["ROAR01"]);
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
    expect(Object.keys(copied).sort()).toEqual(fields.filter((x) => x.group === "card" && x.key !== "cardUseShop" && !x.presets).map((x) => x.key).sort());
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

/** 🎞️ สไลด์โชว์ปรับได้เยอะขึ้น — สไลด์โชว์เดิม (ไม่มีช่องใหม่) ต้องได้ค่าเริ่ม = หน้าตาเดิมทุกอย่าง */
describe("slideshow: รูปทรง / ปุ่มเลื่อน / ตัวบอก / แบบเปลี่ยน / ข้อความ", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "s", type: "slideshow", ...b }])[0] as unknown as Record<string, unknown> & { slides: Record<string, unknown>[] };

  it("สไลด์โชว์เดิม = แบบเดิม", () => {
    const s = norm({ autoplay: true, interval: 5, height: "tall", slides: [{ imageKey: "a/b.jpg", title: "t", align: "center", overlay: 40 }] });
    expect(s).toMatchObject({ shape: "height", height: "tall", shapeMobile: "same", width: "full", transition: "fade", arrows: "always", indicator: "dots", navColor: "light", titleSize: "m", textColor: "light" });
    expect(s.slides[0]).toMatchObject({ textPos: "auto", align: "center", overlay: 40, overlayStyle: "solid", wholeLink: false });
  });

  it("ค่าที่ตั้งถูกเก็บ · ค่ามั่ว = ค่าเริ่ม", () => {
    const s = norm({ shape: "21:9", shapeMobile: "4:5", width: "contained", transition: "peek", arrows: "hover", indicator: "progress", navColor: "dark", titleSize: "xl", textColor: "dark", slides: [{ imageKey: "a/b.jpg", textPos: "bottom-right", overlayStyle: "gradient", wholeLink: true }] });
    expect(s).toMatchObject({ shape: "21:9", shapeMobile: "4:5", width: "contained", transition: "peek", arrows: "hover", indicator: "progress", navColor: "dark", titleSize: "xl", textColor: "dark" });
    expect(s.slides[0]).toMatchObject({ textPos: "bottom-right", overlayStyle: "gradient", wholeLink: true });
    expect(norm({ shape: "7:3", transition: "spin", slides: [{ imageKey: "a/b.jpg", textPos: "nowhere" }] })).toMatchObject({ shape: "height", transition: "fade" });
  });
});

describe("ลุคบุ๊กแบบสไลด์ (หลายลุคในกล่องเดียว + ต่อกล่องเป็นสไลด์)", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "lb", type: "lookbook", ...b }])[0] as unknown as Record<string, unknown> & { spots: Record<string, unknown>[] };

  it("ลุคบุ๊กเก่า = ลุคเดียว ไม่ต่อสไลด์ · จุดอยู่ลุค 1", () => {
    const b = norm({ imageKey: "a/b.jpg", spots: [{ code: ["ROAR01"], pos: { x: 30, y: 40 } }] });
    expect(b).toMatchObject({ mode: "single", joinPrev: false, slideNav: "both", slideEffect: "slide", slideAuto: false, lookNames: [] });
    expect(b.spots[0].look).toBe("1");
  });

  it("หลายลุค: รูปลุค 2–6 + ชื่อลุค (แปล EN ได้) + จุดเลือกลุค · ลุคที่ไม่มีรูป = เตือน", () => {
    const b = norm({ mode: "slides", imageKey: "a/1.jpg", imageKey2: "a/2.jpg", lookNames: ["ลุคทำงาน", "ลุควันหยุด"], lookNames_en: ["Office", "Weekend"], spots: [{ code: ["A"], look: "2" }, { code: ["B"], look: "3" }, { code: ["C"], look: "9" }] });
    expect(b).toMatchObject({ mode: "slides", imageKey2: "a/2.jpg", lookNames: ["ลุคทำงาน", "ลุควันหยุด"], lookNames_en: ["Office", "Weekend"] });
    expect(b.spots.map((x) => x.look)).toEqual(["2", "3", "1"]);
    const msgs = validateBlocks([b as unknown as Block]).map((x) => x.message).join(" ");
    expect(msgs).toMatch(/ลุค 3/);
  });

  it("🧱 หลายลุควางเรียงกัน: คอลัมน์/ช่องว่าง/มือถือ เก็บได้ · ค่ามั่ว = ค่าเริ่ม · ลุคเก่าไม่เปลี่ยน", () => {
    const b = norm({ mode: "grid", imageKey: "a/1.jpg", imageKey2: "a/2.jpg", imageKey3: "a/3.jpg", gridCols: "2", gridGap: "none", gridMobile: "two", spots: [{ code: ["A"], look: "3" }] });
    expect(b).toMatchObject({ mode: "grid", imageKey3: "a/3.jpg", gridCols: "2", gridGap: "none", gridMobile: "two" });
    expect(b.spots[0].look).toBe("3");
    expect(norm({ mode: "grid", imageKey: "a/1.jpg", gridCols: "5", gridGap: "huge", gridMobile: "fly" })).toMatchObject({ gridCols: "3", gridGap: "s", gridMobile: "swipe" });
    expect(norm({ imageKey: "a/b.jpg" })).toMatchObject({ mode: "single", gridCols: "3", gridGap: "s", gridMobile: "swipe" });
    expect(blockSummary(norm({ mode: "grid", imageKey: "a/1.jpg", imageKey2: "a/2.jpg" }))).toMatch(/2 ลุค เรียงกัน/);
    const msgs = validateBlocks([norm({ mode: "grid", imageKey: "a/1.jpg", spots: [{ code: ["A"], look: "2" }] }) as unknown as Block]).map((x) => x.message).join(" ");
    expect(msgs).toMatch(/ลุค 2/);
  });

  it("🧱 เรียงกัน: ซ่อนรูปแบบ/แผงข้างรูป · โชว์ช่องคอลัมน์ + ขนาดการ์ดป๊อป + จุดเลือกลุค", () => {
    const fields = SECTION_SCHEMAS.lookbook.fields;
    const fd = (k: string) => fields.find((x) => x.key === k)!;
    const grid = { mode: "grid", layout: "side" };
    const single = { mode: "single", layout: "side" };
    expect(matchShowIf(fd("layout"), grid)).toBe(false);
    expect(matchShowIf(fd("sideMode"), grid)).toBe(false);
    expect(matchShowIf(fd("imgWidth"), grid)).toBe(false);
    expect(matchShowIf(fd("gridCols"), grid)).toBe(true);
    expect(matchShowIf(fd("cardSize"), grid)).toBe(true);
    expect(matchShowIf(fd("imageKey3"), grid)).toBe(true);
    expect(matchShowIf(fd("layout"), single)).toBe(true);
    expect(matchShowIf(fd("sideMode"), single)).toBe(true);
    expect(matchShowIf(fd("gridCols"), single)).toBe(false);
    expect(matchShowIf(fd("cardSize"), { mode: "single", layout: "pop" })).toBe(true);
    expect(matchShowIf(fd("cardSize"), single)).toBe(false);
  });
});

describe("🚶 รันเวย์ลุค (2026-10-21)", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "rw", type: "runway", ...b }])[0] as unknown as Record<string, unknown> & { looks: Record<string, unknown>[] };

  it("ค่าเริ่ม = แบบรูปอ้างอิง (แถวซ้าย 3 ลุค เบลอนิด แผงขวา) · ค่ามั่ว = ค่าเริ่ม", () => {
    expect(norm({})).toMatchObject({ lookLabel: "LOOK", shopAllText: "Shop the look", depth: "3", queueSide: "left", blur: "soft", height: "tall", panel: "right", showPrice: true, showHeart: true, auto: false });
    expect(norm({ depth: "9", queueSide: "up", blur: "x", panel: "top" })).toMatchObject({ depth: "3", queueSide: "left", blur: "soft", panel: "right" });
    expect(norm({ depth: "2", queueSide: "right", blur: "none", panel: "none", autoSec: 99 })).toMatchObject({ depth: "2", queueSide: "right", blur: "none", panel: "none", autoSec: 20 });
  });

  it("ลุค: รูป + ชื่อ + สินค้า ≤ 6 · สรุป/เตือน", () => {
    const b = norm({ looks: [{ imageKey: "a/1.png", name: "Pink", products: ["A", "B", "C", "D", "E", "F", "G"] }, { imageKey: null, products: [] }] });
    expect(b.looks[0]).toMatchObject({ imageKey: "a/1.png", name: "Pink" });
    expect((b.looks[0].products as string[]).length).toBeLessThanOrEqual(6);
    expect(blockSummary(b)).toMatch(/2 ลุค/);
    const msgs = validateBlocks([b as unknown as Block]).map((x) => x.message).join(" ");
    expect(msgs).toMatch(/1 ลุคยังไม่ได้ใส่รูป/);
    expect(msgs).toMatch(/1 ลุคยังไม่ได้เลือกสินค้า/);
    const one = validateBlocks([norm({ looks: [{ imageKey: "a.png", products: ["A"] }] }) as unknown as Block]).map((x) => x.message).join(" ");
    expect(one).toMatch(/อย่างน้อย 2 ลุค/);
  });

  it("เลื่อนจอแล้วลุคเดิน: ค่าเริ่มปิด · เปิดแล้วซ่อน 'เดินลุคเอง' (แย่งกันเปลี่ยนลุค) · โชว์ระยะเลื่อน", () => {
    expect(norm({})).toMatchObject({ scroll: false, scrollPace: "md" });
    expect(norm({ scroll: true, scrollPace: "zz" })).toMatchObject({ scroll: true, scrollPace: "md" });
    const fd = (k: string) => SECTION_SCHEMAS.runway.fields.find((x) => x.key === k)!;
    const on = { scroll: true, auto: true };
    expect(matchShowIf(fd("scrollPace"), on)).toBe(true);
    expect(matchShowIf(fd("auto"), on)).toBe(false);
    expect(matchShowIf(fd("autoSec"), on)).toBe(false);
    expect(matchShowIf(fd("autoSec"), { scroll: false, auto: true })).toBe(true);
    expect(blockSummary(norm({ scroll: true }))).toMatch(/เลื่อนจอ/);
  });

  it("พื้นหลัง/ขนาดคน/เงา/ตัวหนังสือใหญ่/ซูม: ค่าเริ่ม + ค่าเพี้ยนถูกตัด", () => {
    expect(norm({})).toMatchObject({ bg: "solid", bgColor: "", floorHeight: 24, bgImage: null, bgDim: 30, figSize: 88, figLift: 0, shadow: "soft", zoom: true, bigText: "", bigTextPos: "middle" });
    expect(norm({ bg: "x", bgColor: "red", figSize: 500, figLift: -9, shadow: "?", bigText: "SS26" })).toMatchObject({ bg: "solid", bgColor: "", figSize: 100, figLift: 0, shadow: "soft", bigText: "SS26" });
    expect(norm({ bg: "floor", bgColor: "#F1EFE8", floorColor: "#d3d1c7" })).toMatchObject({ bg: "floor", bgColor: "#f1efe8", floorColor: "#d3d1c7" });
    const fd = (k: string) => SECTION_SCHEMAS.runway.fields.find((x) => x.key === k)!;
    expect(matchShowIf(fd("floorColor"), { bg: "floor" })).toBe(true);
    expect(matchShowIf(fd("bgImage"), { bg: "solid" })).toBe(false);
    const warn = validateBlocks([norm({ bg: "image", looks: [{ imageKey: "a.png", products: ["A"] }, { imageKey: "b.png", products: ["B"] }] }) as unknown as Block]).map((x) => x.message).join(" ");
    expect(warn).toMatch(/ยังไม่ได้ใส่รูป$|พื้นหลังแบบรูปภาพ/);
  });

  it("รายลุค: ขนาด/ยก/สีพื้น + จุดกดบนตัวนางแบบ (สูงสุด 3 จุด · จุดละ ≤ 2 สินค้า)", () => {
    const b = norm({
      looks: [
        { imageKey: "a.png", products: ["A"], size: 400, lift: -99, bgColor: "#FBEAF0", spots: "2", spot1: { x: 30, y: 60 }, spot1Products: ["A", "B", "C"], spot2: { x: 150, y: "x" }, spot2Products: [] },
        { imageKey: "b.png", products: ["B"], spots: "9" },
      ],
    });
    expect(b.looks[0]).toMatchObject({ size: 150, lift: -20, bgColor: "#fbeaf0", spots: "2", spot1: { x: 30, y: 60 }, spot2: { x: 100, y: 50 } });
    expect((b.looks[0].spot1Products as string[]).length).toBe(2);
    expect(b.looks[1]).toMatchObject({ size: 100, lift: 0, bgColor: "", spots: "0" });
    expect(blockSummary(b)).toMatch(/2 ลุค/);
    const kid = SECTION_SCHEMAS.runway.children!;
    expect(kid.summary(b.looks[0])).toMatch(/📍 2/);
    const fd = (k: string) => kid.fields.find((x) => x.key === k)!;
    expect(matchShowIf(fd("spot2"), { spots: "1" })).toBe(false);
    expect(matchShowIf(fd("spot3Products"), { spots: "3" })).toBe(true);
    const msgs = validateBlocks([b as unknown as Block]).map((x) => x.message).join(" ");
    expect(msgs).toMatch(/1 จุดกดยังไม่ได้เลือกสินค้า/);
  });

  it("✂️ ปุ่มตัดพื้น (AI) เปิดเฉพาะรูปลุคของรันเวย์ — ช่องรูปอื่นยังไม่มี", () => {
    expect(SECTION_SCHEMAS.runway.children!.fields.find((x) => x.key === "imageKey")?.removeBg).toBe(true);
    const others = Object.values(SECTION_SCHEMAS).flatMap((sc) => [...sc.fields, ...(sc.children?.fields ?? [])].filter((x) => x.removeBg).map((x) => `${sc.type}.${x.key}`));
    expect(others).toEqual(["runway.imageKey"]);
  });
});

describe("🔁 แกลเลอรี: เปลี่ยนรูปเองทุก x วิ (2026-10-22)", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "g", type: "gallery", ...b }])[0] as unknown as Record<string, unknown> & { items: Record<string, unknown>[] };
  const imgs = (n: number) => Array.from({ length: n }, (_, i) => ({ imageKey: `a/${i}.jpg`, alt: `รูป ${i}` }));
  it("ค่าเริ่ม = ไม่เปลี่ยน (แบบเดิม) · ค่ามั่ว = ไม่เปลี่ยน · วินาที 2–15", () => {
    expect(norm({})).toMatchObject({ rotate: "off", rotateFx: "fade", rotateSec: 3 });
    expect(norm({ rotate: "spin", rotateFx: "x", rotateSec: 99 })).toMatchObject({ rotate: "off", rotateFx: "fade", rotateSec: 15 });
    expect(norm({ rotate: "slide", rotateSec: 1 })).toMatchObject({ rotate: "slide", rotateSec: 2 });
  });
  it("ช่องโชว์ตามแบบ (ท่าเฉพาะทีละช่อง/ทั้งแถว · แถวรูปลุคบุ๊กไม่มี) · สรุปบอกวินาที · เตือนรูปไม่เกินคอลัมน์", () => {
    const fd = (k: string) => SECTION_SCHEMAS.gallery.fields.find((x) => x.key === k)!;
    expect(matchShowIf(fd("rotate"), { layout: "strip" })).toBe(false);
    expect(matchShowIf(fd("rotateFx"), { layout: "grid", rotate: "slide" })).toBe(false);
    expect(matchShowIf(fd("rotateFx"), { layout: "grid", rotate: "one" })).toBe(true);
    expect(matchShowIf(fd("rotateSec"), { layout: "grid", rotate: "off" })).toBe(false);
    expect(blockSummary(norm({ rotate: "slide", rotateSec: 4, items: imgs(6) }))).toMatch(/ทุก 4 วิ/);
    const few = validateBlocks([norm({ rotate: "slide", columns: 3, items: imgs(3) }) as unknown as Block]).map((x) => x.message).join(" ");
    expect(few).toMatch(/ไม่เกินจำนวนคอลัมน์/);
    const ok = validateBlocks([norm({ rotate: "slide", columns: 3, items: imgs(5) }) as unknown as Block]).map((x) => x.message).join(" ");
    expect(ok).not.toMatch(/ไม่เกินจำนวนคอลัมน์/);
  });
});

describe("🎬 แกลเลอรี: รายชิ้นเป็นวิดีโอได้ (2026-10-22)", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "g", type: "gallery", ...b }])[0] as unknown as Record<string, unknown> & { items: Record<string, unknown>[] };
  it("ค่าเริ่ม = รูป (ของเดิมไม่เปลี่ยน) · วิดีโอเก็บคลิป + รูปปก · ค่ามั่ว = รูป", () => {
    const b = norm({ items: [{ imageKey: "a.jpg", alt: "a" }, { media: "video", videoKey: "storefront-hero/2026-10/x.mp4", imageKey: null }, { media: "gif" }] });
    expect(b.items[0]).toMatchObject({ media: "image", videoKey: null, imageKey: "a.jpg" });
    expect(b.items[1]).toMatchObject({ media: "video", videoKey: "storefront-hero/2026-10/x.mp4" });
    expect(b.items[2]).toMatchObject({ media: "image" });
    const kid = SECTION_SCHEMAS.gallery.children!;
    expect(kid.summary(b.items[1])).toMatch(/🎬/);
    expect(kid.summary({ media: "video", videoKey: null })).toMatch(/ยังไม่ใส่คลิป/);
  });
  it("วิดีโออย่างเดียว (ไม่มีรูป) = นับว่ามีของในแกลเลอรี · ช่องวิดีโอโชว์เฉพาะแบบตาราง · ช่องครอปซ่อนเมื่อเป็นวิดีโอ", () => {
    const only = norm({ items: [{ media: "video", videoKey: "v/a.mp4", alt: "clip" }] });
    expect(validateBlocks([only as unknown as Block]).filter((x) => x.level === "error")).toHaveLength(0);
    const fd = (k: string) => SECTION_SCHEMAS.gallery.children!.fields.find((x) => x.key === k)!;
    expect(matchShowIf({ ...fd("media"), showIf: fd("media").showIfParent }, { layout: "strip" })).toBe(false);
    expect(matchShowIf({ ...fd("media"), showIf: fd("media").showIfParent }, { layout: "grid" })).toBe(true);
    expect(matchShowIf(fd("crop"), { media: "video" })).toBe(false);
    expect(matchShowIf(fd("crop"), {})).toBe(true);
  });
});

describe("🗂 ตารางสินค้า › แท็บตามรุ่นสินค้า (Parent SKU)", () => {
  const roar = { id: "p-roar", type: "products", source: "skus", skus: ["ROAR01:sku-0cfd0cfd", "ROAR02:sku-3f45d491"], layout: "tabs" };
  it("Section แท็บเดิม (ไม่มี tabBy) = แท็บตามหมวด หน้าตาเดิม", () => {
    const [n] = normalizeBlocks([{ ...roar, tabCats: ["bags"] }]) as unknown as Record<string, unknown>[];
    expect(n.tabBy).toBe("cat");
    expect(n.tabCats).toEqual(["bags"]);
    expect(n.tabBody).toBe("grid");
    expect(n.tabRest).toBe(false);
    expect(n.tabStyle).toBe("both");
  });
  it("ค่าที่ตั้ง: รุ่นที่เป็นแท็บ (สูงสุด 12) · ค่าแปลก ๆ = ค่าเริ่ม", () => {
    const codes = Array.from({ length: 15 }, (_, i) => `ROAR${String(i + 1).padStart(2, "0")}`);
    const [n] = normalizeBlocks([{ ...roar, tabBy: "parent", tabParents: codes, tabStyle: "huge", tabBody: "carousel", tabRest: true }]) as unknown as Record<string, unknown>[];
    expect(n.tabBy).toBe("parent");
    expect((n.tabParents as string[]).length).toBe(12);
    expect(n.tabStyle).toBe("both");
    expect(n.tabBody).toBe("carousel");
    expect(n.tabRest).toBe(true);
    expect(n.tabRestSep).toBe(true);
  });
  it("ช่องตั้งค่าแท็บรุ่นโชว์เฉพาะตอนเลือกแบ่งตามรุ่น (คอมหรือมือถือเป็นแท็บ)", () => {
    const fields = SECTION_SCHEMAS.products.fields;
    const show = (key: string, b: Record<string, unknown>) => matchShowIf(fields.find((f) => f.key === key)!, b);
    expect(show("tabParents", { layout: "tabs", tabBy: "parent" })).toBe(true);
    expect(show("tabParents", { layout: "tabs", tabBy: "cat" })).toBe(false);
    expect(show("tabCats", { layout: "grid", layoutMobile: "tabs", tabBy: "cat" })).toBe(true);
    expect(show("tabRestSep", { layout: "tabs", tabBy: "parent", tabRest: false })).toBe(false);
    expect(show("tabBody", { layout: "carousel", layoutMobile: "same" })).toBe(false);
  });
});

describe("🗂 แท็บรุ่น รอบ 2 — รูปบนแท็บ · แถบแท็บ · การ์ดต่อแถวมือถือ", () => {
  const roar = { id: "p-roar2", type: "products", source: "skus", skus: ["ROAR01:sku-0cfd0cfd"], layout: "tabs", tabBy: "parent" };
  it("ค่าเริ่ม = หน้าตาเดิม (วงกลม · ขนาดอัตโนมัติ · แถบเลื่อน · ทุกแท็บ · มือถืออัตโนมัติ)", () => {
    const [n] = normalizeBlocks([roar]) as unknown as Record<string, unknown>[];
    expect([n.tabThumbShape, n.tabThumbSize, n.tabThumbSizeM, n.tabNav, n.tabMax, n.tabColsM]).toEqual(["circle", 0, 0, "scroll", 0, "auto"]);
    expect(n.tabThumbs).toEqual([]);
  });
  it("ตั้งค่าได้ + ค่าเกินถูกตัด", () => {
    const [n] = normalizeBlocks([{ ...roar, tabThumbs: ["ROAR01:sku-ac866485", "ROAR02:sku-3f45d491"], tabThumbShape: "rounded", tabThumbSize: 500, tabThumbSizeM: 40, tabNav: "arrows", tabMax: 4, tabColsM: "2" }]) as unknown as Record<string, unknown>[];
    expect(n.tabThumbs).toEqual(["ROAR01:sku-ac866485", "ROAR02:sku-3f45d491"]);
    expect([n.tabThumbShape, n.tabThumbSize, n.tabThumbSizeM, n.tabNav, n.tabMax, n.tabColsM]).toEqual(["rounded", 120, 40, "arrows", 4, "2"]);
  });
  it("ช่องรูปโชว์เฉพาะแท็บที่มีรูป · ช่องต่อท้ายเต็มแถว (ไม่ถูกบีบ)", () => {
    const fields = SECTION_SCHEMAS.products.fields;
    const fd = (key: string) => fields.find((f) => f.key === key)!;
    expect(matchShowIf(fd("tabThumbs"), { layout: "tabs", tabBy: "parent", tabStyle: "img" })).toBe(true);
    expect(matchShowIf(fd("tabThumbs"), { layout: "tabs", tabBy: "parent", tabStyle: "txt" })).toBe(false);
    expect(matchShowIf(fd("tabNav"), { layout: "tabs", tabBy: "cat" })).toBe(true);
    expect(fd("tabRest").wide).toBe(true);
  });
});

describe("🗂 แท็บรุ่น รอบ 3 — รูปบนแท็บรายรุ่น (อัปโหลด/คลัง) ตั้งที่แถว", () => {
  it("tabImages เก็บ { รหัสรุ่น: r2 key } · ค่าแปลก ๆ ถูกตัดทิ้ง · tabThumbs เดิมยังอยู่", () => {
    const [n] = normalizeBlocks([
      { id: "p-roar3", type: "products", layout: "tabs", tabBy: "parent", tabParents: ["ROAR01", "ROAR02"], tabThumbs: ["ROAR01:sku-0cfd0cfd"], tabImages: { ROAR02: "assets/abc/tab.jpg", ROAR01: "javascript:alert(1)", "": "assets/x.jpg" } },
    ]) as unknown as Record<string, unknown>[];
    expect(n.tabImages).toEqual({ ROAR02: "assets/abc/tab.jpg" });
    expect(n.tabThumbs).toEqual(["ROAR01:sku-0cfd0cfd"]);
  });
  it("ช่องรุ่นที่เป็นแท็บตั้งรูปที่แถว (rowImages) · ช่องรูปแยกซ่อนไว้", () => {
    const fields = SECTION_SCHEMAS.products.fields;
    const fd = (key: string) => fields.find((f) => f.key === key)!;
    expect(fd("tabParents").rowImages).toEqual({ images: "tabImages", skus: "tabThumbs" });
    expect(fd("tabImages").hidden).toBe(true);
    expect(fd("tabThumbs").hidden).toBe(true);
  });
});

describe("🃏 ชุดหน้าตาการ์ดสำเร็จรูป A/B (ทั้งร้าน + ราย Section)", () => {
  it("ชุดของ Section ตั้งเฉพาะช่องที่มีจริง และทุกค่าเป็นตัวเลือกที่ใช้ได้", () => {
    const fields = SECTION_SCHEMAS.products.fields;
    const look = fields.find((x) => x.key === "cardLook")!;
    for (const [key, patch] of Object.entries(look.presets!)) {
      for (const [k, v] of Object.entries(patch)) {
        const fd = fields.find((x) => x.key === k);
        expect([key, k, !!fd]).toEqual([key, k, true]);
        if (fd!.type === "select") expect([key, k, fd!.options!.some((o) => o.v === v)]).toEqual([key, k, true]);
        if (fd!.type === "toggle") expect(typeof v).toBe("boolean");
      }
      expect(patch.cardUseShop).toBe(false);
    }
    expect(look.presets!.editorial.cardInfo).toBe("split");
    expect([look.presets!.gallery.cardSwatchPos, look.presets!.gallery.cardSwatchShape]).toEqual(["name", "square"]);
  });
  it("ค่าเริ่ม = การ์ดเดิม (ราคาใต้ชื่อ · ราคาหนา · จุดสีกลมใต้ราคา)", () => {
    const [n] = normalizeBlocks([{ id: "p-card", type: "products" }]) as unknown as Record<string, unknown>[];
    expect([n.cardInfo, n.cardPriceWeight, n.cardSwatchPos, n.cardSwatchShape, n.cardNameUpper, n.cardLook]).toEqual(["stack", "600", "below", "circle", false, ""]);
  });
});

describe("🔤 ตัวอักษรต่อ Section — ตัวเล็กเหนือหัวข้อ · เนื้อหา · ปุ่ม", () => {
  it("ข้อมูลเดิม (มีแค่หัวข้อ) → ช่องใหม่ = ตามเดิมทุกช่อง", () => {
    const [n] = normalizeBlocks([{ id: "t1", type: "cta", style: { text: { font: "Kanit", upper: true } } }]);
    const tx = n.style.text;
    expect([tx.font, tx.upper]).toEqual(["Kanit", true]);
    expect([tx.eyeFont, tx.eyeSize, tx.eyeSpacing, tx.eyeCase, tx.bodyFont, tx.bodyColor, tx.bodySpacing, tx.bodyUpper, tx.btnFont, tx.btnCase, tx.btnSpacing]).toEqual(["auto", "auto", "auto", "auto", "auto", "auto", "auto", false, "auto", "auto", "auto"]);
  });
  it("ตั้งค่าได้ · ค่าแปลก = ตามเดิม · สีเองไม่มีรหัสสี = ตามเดิม", () => {
    const [n] = normalizeBlocks([
      { id: "t2", type: "cta", style: { text: { eyeFont: "Kanit", eyeSize: "l", eyeCase: "normal", bodyFont: "Comic Sans", bodyColor: "custom", bodyColorHex: "", bodyUpper: true, btnCase: "upper", btnSpacing: "wider" } } },
      { id: "t3", type: "cta", style: { text: { bodyColor: "custom", bodyColorHex: "#AA3355" } } },
    ]);
    const tx = n.style.text;
    expect([tx.eyeFont, tx.eyeSize, tx.eyeCase, tx.bodyFont, tx.bodyColor, tx.bodyUpper, tx.btnCase, tx.btnSpacing]).toEqual(["Kanit", "l", "normal", "auto", "auto", true, "upper", "wider"]);
    expect([normalizeBlocks([{ id: "t3", type: "cta", style: { text: { bodyColor: "custom", bodyColorHex: "#AA3355" } } }])[0].style.text.bodyColorHex]).toEqual(["#aa3355"]);
  });
});

describe("🎨 พื้นหลังเพิ่ม — ลวดลาย · ขอบบน/ล่าง · กล่องเนื้อหา", () => {
  it("ไม่เคยตั้ง = ไม่มีช่อง (หน้าตาเดิม)", () => {
    const [n] = normalizeBlocks([{ id: "b1", type: "cta" }]);
    expect([n.style.pattern, n.style.edgeTop, n.style.edgeBottom, n.style.box]).toEqual([undefined, undefined, undefined, undefined]);
  });
  it("ตั้งค่าได้ · ค่าเกิน/แปลกถูกตัด · สีเองไม่มีรหัส = ตามเดิม", () => {
    const [n] = normalizeBlocks([
      {
        id: "b2",
        type: "cta",
        style: {
          pattern: { kind: "dots", color: "brand", opacity: 99, size: "xl" },
          edgeTop: { shape: "wave", height: 5, flip: true, color: "custom", colorHex: "" },
          edgeBottom: { shape: "blob", height: 80, color: "custom", colorHex: "#FFEEDD" },
          box: { on: true, color: "white", opacity: 10, radius: "xl", gap: "l", shadow: true, border: "yes" },
        },
      },
    ]);
    expect(n.style.pattern).toEqual({ kind: "dots", color: "brand", colorHex: "", opacity: 60, size: "m" });
    expect(n.style.edgeTop).toEqual({ shape: "wave", height: 16, flip: true, color: "auto", colorHex: "" });
    expect(n.style.edgeBottom).toEqual({ shape: "none", height: 80, flip: false, color: "custom", colorHex: "#ffeedd" });
    expect(n.style.box).toEqual({ on: true, color: "white", colorHex: "", opacity: 40, radius: "xl", gap: "l", shadow: true, border: false });
  });
});

describe("✨ ของตกแต่งของ Section — ลาย/รูป/ข้อความ วางอิสระ", () => {
  it("ไม่เคยตั้ง / ว่าง = ไม่มีช่อง (หน้าตาเดิม)", () => {
    const [a, b] = normalizeBlocks([{ id: "d0", type: "cta" }, { id: "d00", type: "cta", style: { decor: [] } }]);
    expect([a.style.decor, b.style.decor]).toEqual([undefined, undefined]);
  });
  it("ค่าเกินถูกตัด · ตำแหน่งทศนิยม 1 ตำแหน่ง · ลาย/ฟอนต์แปลก = ค่าเริ่ม", () => {
    const [n] = normalizeBlocks([
      {
        id: "d1",
        type: "cta",
        style: {
          decor: [
            { id: "s1", kind: "shape", shape: "unicorn", x: 12.345, y: 999, w: 500, rotate: 400, opacity: 0, layer: "middle", anim: "explode", color: "custom", colorHex: "" },
            { id: "t1", kind: "text", text: "  Sale!  ", font: "Comic Sans", size: 2, color: "custom", colorHex: "#AA3355", hideMobile: true, flip: true },
          ],
        },
      },
    ]);
    const [s, t] = n.style.decor!;
    expect([s.shape, s.x, s.y, s.w, s.rotate, s.opacity, s.layer, s.anim, s.color]).toEqual(["sparkle", 12.3, 120, 100, 180, 5, "back", "none", "auto"]);
    expect([t.text, t.font, t.size, t.color, t.colorHex, t.hideMobile, t.flip, t.w]).toEqual(["Sale!", "display", 10, "custom", "#aa3355", true, true, 0]);
  });
  it("รูปไม่มีไฟล์ / ข้อความว่าง = ทิ้ง · สูงสุด 12 ชิ้น · id ซ้ำถูกแยก", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: "x", kind: "shape", shape: "heart", x: i }));
    const [n] = normalizeBlocks([
      { id: "d2", type: "cta", style: { decor: [{ kind: "image", key: "" }, { kind: "image", key: "bad key!" }, { kind: "text", text: "   " }, ...many] } },
    ]);
    const d = n.style.decor!;
    expect(d.length).toBe(12);
    expect(new Set(d.map((x) => x.id)).size).toBe(12);
    expect(d[0].ratio).toBe(0.9);
  });
  it("รูปจากคลังเก็บ key + สัดส่วน · newDecor ได้ค่าเริ่มตามชนิด", async () => {
    const { newDecor } = await import("../website-blocks");
    const [n] = normalizeBlocks([{ id: "d3", type: "cta", style: { decor: [{ id: "i1", kind: "image", key: "assets/bow.png", ratio: 0.5, w: 20 }] } }]);
    expect([n.style.decor![0].key, n.style.decor![0].ratio, n.style.decor![0].w]).toEqual(["assets/bow.png", 0.5, 20]);
    const sh = newDecor("shape", { shape: "line" });
    const tx = newDecor("text");
    expect([sh.ratio, sh.kind, tx.text, tx.font]).toEqual([0.04, "shape", "New!", "Parisienne"]);
  });
});

describe("📂 หมวดสินค้า — ชื่อเองรายหมวด + ฟอนต์/ขนาด/สีชื่อหมวด", () => {
  it("ไม่ตั้ง = ชื่อเดิม · ฟอนต์หัวข้อธีม 100% สีเดิม (หน้าตาเดิม)", () => {
    const [n] = normalizeBlocks([{ id: "c1", type: "categories" }]) as unknown as Record<string, unknown>[];
    expect([n.catName, n.nameFont, n.nameSize, n.nameColor, n.nameColorHex]).toEqual([{}, "display", 100, "auto", ""]);
  });
  it("ชื่อว่าง/รหัสแปลกถูกทิ้ง · ยาวสุด 60 ตัว · ฟอนต์แปลก = ค่าเริ่ม", () => {
    const [n] = normalizeBlocks([
      { id: "c2", type: "categories", catName: { wallets: "Wallet & Purse", charms: "   ", "": "x", "bad key!": "y", bags: "A".repeat(80) }, nameFont: "Comic Sans", nameSize: 999, nameColor: "brand" },
    ]) as unknown as Record<string, unknown>[];
    const names = n.catName as Record<string, string>;
    expect(names.wallets).toBe("Wallet & Purse");
    expect(names.charms).toBeUndefined();
    expect(names.bags.length).toBe(60);
    expect([n.nameFont, n.nameSize, n.nameColor]).toEqual(["display", 250, "brand"]);
  });
});

describe("🎞️ การ์ดบนฉาก — แท็บ + ฉากผูกช่วงสินค้า + การ์ดกระจก", () => {
  const norm = (b: Record<string, unknown>) => normalizeBlocks([{ id: "sc", type: "scene", ...b }])[0] as unknown as Record<string, unknown> & { scenes: Record<string, unknown>[] };
  const msgs = (b: Record<string, unknown>) => validateBlocks([norm(b) as unknown as Block]).map((x) => x.message).join(" | ");

  it("ค่าเริ่ม = 2 แท็บ (มาใหม่/ขายดี) · การ์ดกระจกฝ้า · รูปอัตโนมัติ", () => {
    const b = norm({});
    expect(b).toMatchObject({ tabs: "2", tab1Label: "มาใหม่", tab1Source: "new", tab2Label: "ขายดี", tab2Source: "best", tab3Source: "pick", card: "frost", cardTint: "light", imgMode: "auto", showHeart: true, height: "tall" });
    expect(b.scenes).toEqual([]);
  });

  it("ฉาก: ค่ามั่ว = ค่าเริ่ม · ชิ้นที่เกินช่วงถูกบีบ · เกิน 12 ฉากถูกตัด", () => {
    const b = norm({ card: "neon", cardOpacity: 500, scenes: Array.from({ length: 14 }, (_, i) => ({ kind: i ? "video" : "weird", from: i ? 99 : 0, tab: "9", imageKey: "a/s.jpg" })) });
    expect(b.card).toBe("frost");
    expect(b.cardOpacity).toBe(90);
    expect(b.scenes.length).toBe(12);
    expect(b.scenes[0]).toMatchObject({ kind: "image", from: 1, tab: "1" });
    expect(b.scenes[1]).toMatchObject({ kind: "video", from: 24, videoKey: null });
  });

  it("เตือน: ไม่มีฉาก · ฉากไม่มีรูป/คลิป · เลือกเองแต่ไม่เลือกสินค้า · แท็บไม่มีฉาก", () => {
    expect(msgs({})).toContain("ยังไม่มีฉากพื้นหลัง");
    const m = msgs({ tabs: "2", tab2Source: "pick", scenes: [{ tab: "1", from: 1, kind: "video" }] });
    expect(m).toContain("1 ฉากยังไม่ได้ใส่รูป/คลิป");
    expect(m).toContain("แท็บ 2 ตั้ง \"เลือกเอง\"");
    expect(m).toContain("แท็บ 2 ยังไม่มีฉาก");
    expect(msgs({ tabs: "1", scenes: [{ from: 1, imageKey: "a/s.jpg" }] })).not.toMatch(/ฉาก/);
  });

  it("ช่องโชว์ตามเงื่อนไข: แท็บ 3 ซ่อนเมื่อมี 2 แท็บ · ช่องเลือกสินค้าเฉพาะ \"เลือกเอง\" · คลิปเฉพาะฉากวิดีโอ", () => {
    const sch = SECTION_SCHEMAS.scene;
    const fd = (k: string) => sch.fields.find((x) => x.key === k)!;
    const v = norm({ tabs: "2", tab1Source: "pick" }) as Record<string, unknown>;
    expect(matchShowIf(fd("tab3Label"), v)).toBe(false);
    expect(matchShowIf(fd("tab2Label"), v)).toBe(true);
    expect(matchShowIf(fd("tab1Products"), v)).toBe(true);
    expect(matchShowIf(fd("tab1Count"), v)).toBe(false);
    expect(matchShowIf(fd("tab2Count"), v)).toBe(true);
    const vk = sch.children!.fields.find((x) => x.key === "videoKey")!;
    expect(matchShowIf(vk, { kind: "image" })).toBe(false);
    expect(matchShowIf(vk, { kind: "video" })).toBe(true);
  });
});

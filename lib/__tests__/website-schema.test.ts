import { describe, it, expect } from "vitest";
import { SECTION_SCHEMAS, SECTION_TYPES, blankChild } from "../website-schema";
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
    if ("padTop" in o) delete o.mobile;
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

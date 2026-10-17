import { describe, it, expect } from "vitest";
import {
  confirmPatch,
  coverageOf,
  pickList,
  pickText,
  sanitizeI18nMeta,
  textFingerprint,
  translationPatch,
  translationStatus,
} from "../content-i18n";
import { applySlotTranslations, collectTextSlots, isTranslatable, slotValueFrom } from "../website-i18n";
import { normalizeBlocks, newBlock } from "../website-blocks";
import { SECTION_SCHEMAS } from "../website-schema";
import { normalizeFieldMap, resolveProduct, type ParentRow } from "../website-field-map";

describe("สินค้า: ชื่อ/คำอธิบายภาษาอังกฤษสำหรับหน้า /en", () => {
  const parent = (o: Partial<ParentRow>): ParentRow =>
    ({ id: "p1", code: "LM01", name_th: "กระเป๋า Louis Montini (Rise)", name_en: "", sku_name: null, name_platform: null, introduction: "แนะนำ", description: "ยาว", platform_description: null, english_description: "", sale_price: 1000, final_price: null, fake_price: null, cover_image_r2_key: null, category_id: null, ...o }) as ParentRow;

  it("ไม่มี name_en = ว่าง (เว็บใช้ชื่อไทยแทน)", () => {
    const r = resolveProduct(normalizeFieldMap(null), parent({}), [], null, null);
    expect(r.name_en).toBe("");
    expect(r.description_en).toBe("");
  });

  it("ชื่ออังกฤษผ่านกฎชื่อเดียวกับไทย (ตัดคำนำหน้า + วงเล็บ)", () => {
    const map = normalizeFieldMap({ name: { source: "name_th", stripPrefix: "Louis Montini", removeParens: true } });
    const r = resolveProduct(map, parent({ name_en: "Louis Montini Leather Bag (Rise)" }), [], null, null);
    expect(r.name_en).toBe("Leather Bag");
  });

  it("คำอธิบาย: english_description ก่อน · ไม่มีใช้ introduction_en", () => {
    const map = normalizeFieldMap(null);
    expect(resolveProduct(map, parent({ english_description: "Long EN", introduction_en: "Intro EN" }), [], null, null).description_en).toBe("Long EN");
    expect(resolveProduct(map, parent({ introduction_en: "Intro EN" }), [], null, null).description_en).toBe("Intro EN");
  });
});

/**
 * 🌐 2 ภาษา (ไทย/อังกฤษ) — กฎกลาง `<key>_en` + `_i18n`
 * กันบั๊กสำคัญ: คำแปลถูกทิ้งตอนบันทึก (normalizeBlocks เก็บเฉพาะช่องใน schema)
 */
describe("content-i18n — กฎกลาง", () => {
  it("อังกฤษว่าง = ใช้ไทยแทน (ลูกค้าไม่เจอช่องว่าง)", () => {
    const o = { title: "สวัสดี", title_en: "  " };
    expect(pickText(o, "title", "en")).toBe("สวัสดี");
    expect(pickText({ ...o, title_en: "Hello" }, "title", "en")).toBe("Hello");
    expect(pickText({ ...o, title_en: "Hello" }, "title", "th")).toBe("สวัสดี");
  });

  it("รายการ: บรรทัดที่ยังไม่แปลใช้ไทยแทนทีละบรรทัด", () => {
    expect(pickList({ m: ["ก", "ข", "ค"], m_en: ["A", ""] }, "m", "en")).toEqual(["A", "ข", "ค"]);
  });

  it("สถานะ: ยังไม่มี → AI แปล → ตรวจแล้ว → ไทยเปลี่ยน", () => {
    let o: Record<string, unknown> = { title: "กระเป๋าหนัง" };
    expect(translationStatus(o.title, o.title_en, null)).toBe("empty");
    o = { ...o, ...translationPatch(o, "title", o.title, "Leather bag", true) };
    const meta = () => (o._i18n as Record<string, { h: string; ai?: boolean }>).title;
    expect(translationStatus(o.title, o.title_en, meta())).toBe("ai");
    o = { ...o, ...confirmPatch(o, "title", o.title) };
    expect(translationStatus(o.title, o.title_en, meta())).toBe("ok");
    o = { ...o, title: "กระเป๋าหนังแท้" };
    expect(translationStatus(o.title, o.title_en, meta())).toBe("stale");
  });

  it("อังกฤษที่กรอกตอนไทยยังว่าง แล้วค่อยเติมไทย = ใช้ได้ (ไม่ใช่ ไทยเปลี่ยน) · แปลมาแล้วไทยเปลี่ยนจริง = ไทยเปลี่ยน", () => {
    // เขียนอังกฤษก่อน (ไทยว่าง) → เติมไทยทีหลัง
    let o: Record<string, unknown> = { blurb: "" };
    o = { ...o, ...translationPatch(o, "blurb", o.blurb, "Explore our wallets", false) };
    o = { ...o, blurb: "ค้นพบกระเป๋าสตางค์" };
    const m = () => (o._i18n as Record<string, { h: string; ai?: boolean }>).blurb;
    expect(translationStatus(o.blurb, o.blurb_en, m())).toBe("ok");
    // AI แปลตอนไทยว่าง (ไม่น่าเกิด) → ยังเป็น รอตรวจ ไม่ใช่ ไทยเปลี่ยน
    expect(translationStatus("ค้นพบ", "Explore", { h: textFingerprint(""), ai: true })).toBe("ai");
    // แปลจากไทยฉบับหนึ่ง แล้วไทยถูกแก้ = ไทยเปลี่ยน เหมือนเดิม
    expect(translationStatus("ไทยใหม่", "Old", { h: textFingerprint("ไทยเก่า") })).toBe("stale");
  });

  it("ล้างคำแปลจนว่าง = สถานะของช่องนั้นหายไปด้วย", () => {
    const o = { title: "ก", title_en: "A", _i18n: { title: { h: textFingerprint("ก"), ai: true } } };
    const p = translationPatch(o, "title", "ก", "", false);
    expect(p._i18n).toEqual({});
  });

  it("_i18n: เก็บเฉพาะช่องที่รู้จัก + รูปแบบถูก", () => {
    const raw = { title: { h: "0123abcd", ai: true }, evil: { h: "0123abcd" }, bad: { h: "<script>" } };
    expect(sanitizeI18nMeta(raw, ["title", "bad"])).toEqual({ title: { h: "0123abcd", ai: true } });
    expect(sanitizeI18nMeta("x", ["title"])).toBeNull();
  });

  it("นับความครบ ข้ามช่องที่ไทยว่าง", () => {
    expect(
      coverageOf([
        { th: "ก", status: "ok" },
        { th: "ข", status: "ai" },
        { th: "ค", status: "stale" },
        { th: "", status: "empty" },
      ]),
    ).toEqual({ total: 3, ready: 2, missing: 1, aiPending: 1 });
  });
});

describe("website-i18n — Section ของหน้าเว็บ", () => {
  it("ช่องที่ไม่ใช่ภาษา (รหัสกลุ่ม/ชื่อบัญชี IG/บันทึกช่วยจำ) ไม่ต้องแปล", () => {
    const ig = SECTION_SCHEMAS.instagram.fields.find((f) => f.key === "handle")!;
    expect(isTranslatable(ig)).toBe(false);
    const title = SECTION_SCHEMAS.hero.fields.find((f) => f.key === "title")!;
    expect(isTranslatable(title)).toBe(true);
  });

  it("normalizeBlocks เก็บคำแปลไว้ (เดิมถูกทิ้งตอนบันทึก) ทั้ง Section และชิ้นย่อย", () => {
    const hero = { ...newBlock("hero", 1), title: "กระเป๋า", title_en: "Bags", primary: { text: "ดูสินค้า", href: "/shop" }, primary_en: "Shop now" };
    const faq = newBlock("faq", 2) as unknown as Record<string, unknown>;
    const items = faq.items as Record<string, unknown>[];
    items[0] = { ...items[0], q: "ส่งกี่วัน", q_en: "How long is shipping?", _i18n: { q: { h: textFingerprint("ส่งกี่วัน"), ai: true }, junk: { h: "00000000" } } };
    const out = normalizeBlocks([hero, faq]) as unknown as Record<string, unknown>[];
    expect(out[0].title_en).toBe("Bags");
    expect(out[0].primary_en).toBe("Shop now");
    const it0 = (out[1].items as Record<string, unknown>[])[0];
    expect(it0.q_en).toBe("How long is shipping?");
    expect(it0._i18n).toEqual({ q: { h: textFingerprint("ส่งกี่วัน"), ai: true } });
  });

  it("ร้านที่ยังไม่ใช้ 2 ภาษา: ข้อมูลหน้าตาเหมือนเดิม (ไม่เติมช่อง _en ว่าง)", () => {
    const out = normalizeBlocks([newBlock("hero", 1)]) as unknown as Record<string, unknown>[];
    expect(Object.keys(out[0]).some((k) => k.endsWith("_en") || k === "_i18n")).toBe(false);
  });

  it("รวบรวมช่องที่ยังขาด แล้วใส่คำแปลทีเดียวทั้งหน้า", () => {
    const hero = { ...newBlock("hero", 1), eyebrow: "ใหม่", title: "กระเป๋า", subtitle: "", primary: { text: "ดูสินค้า", href: "/shop" }, secondary: { text: "", href: "" } };
    const ann = { ...newBlock("announcement", 2), messages: ["ส่งฟรี", "", "ลด 10%"] };
    const blocks = [hero, ann];
    const slots = collectTextSlots(blocks);
    // ไทยว่าง (subtitle/ปุ่มรอง/ข้อความว่าง) = ไม่นับ
    expect(slots.every((s) => s.status === "empty")).toBe(true);
    const list = slots.find((s) => s.fd.key === "messages")!;
    expect(slotValueFrom(list, ["Free shipping", "x", "10% off"])).toEqual(["Free shipping", "", "10% off"]);

    const next = applySlotTranslations(
      blocks,
      slots.map((slot) => ({ slot, en: Array.isArray(slot.th) ? slotValueFrom(slot, ["Free shipping", "", "10% off"]) : `EN:${slot.th}` })),
    ) as unknown as Record<string, unknown>[];
    expect(next[0].title_en).toBe("EN:กระเป๋า");
    expect(next[0].primary_en).toBe("EN:ดูสินค้า");
    expect(next[1].messages_en).toEqual(["Free shipping", "", "10% off"]);
    expect(collectTextSlots(next).every((s) => s.status === "ai")).toBe(true);
    // ของเดิมไม่ถูกแก้
    expect((hero as Record<string, unknown>).title_en).toBeUndefined();
  });

  it("เลือกเฉพาะ Section / ชิ้นย่อย", () => {
    const faq = newBlock("faq", 1) as unknown as Record<string, unknown>;
    const items = (faq.items as Record<string, unknown>[]).map((it, i) => ({ ...it, q: `คำถาม ${i + 1}`, a: "คำตอบ" }));
    const blocks = [{ ...faq, items }, { ...newBlock("hero", 2), title: "หัว" }];
    const childId = String((items[0] as Record<string, unknown>).id);
    const onlyChild = collectTextSlots(blocks, { blockId: String(faq.id), childId });
    expect(onlyChild.every((s) => s.childId === childId)).toBe(true);
    expect(onlyChild.map((s) => s.fd.key).sort()).toEqual(["a", "q"]);
    expect(collectTextSlots(blocks, { blockId: String(faq.id) }).some((s) => s.blockId !== faq.id)).toBe(false);
  });
});

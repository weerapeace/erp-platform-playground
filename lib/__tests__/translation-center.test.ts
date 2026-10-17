import { describe, it, expect } from "vitest";
import { blocksAdapter, onlyTranslationsDiffer, pathsAdapter, productPatch, productsAdapter, stripTranslations, type CenterProduct } from "../translation-center";
import { newBlock } from "../website-blocks";

/**
 * 🌐 ศูนย์แปลภาษา (ก้อน 5) — ตัวเชื่อมทุกแหล่งให้อยู่ในตารางเดียว + กติกาเผยแพร่/ร่าง
 */
describe("blocksAdapter — Section ของหน้า", () => {
  const hero = { ...newBlock("hero", 1), title: "กระเป๋า", primary: { text: "ดูสินค้า", href: "/shop" } };
  const ann = { ...newBlock("announcement", 2), messages: ["ส่งฟรี", "ลด 10%"] };
  const a = blocksAdapter("layout");

  it("แถว: ข้อความ/ปุ่ม/รายการ · ไม่มีคำแปล = ยังไม่มี EN", () => {
    const rows = a.rows([hero, ann]);
    expect(rows.find((r) => r.th === "กระเป๋า")?.status).toBe("empty");
    expect(rows.find((r) => r.th === "ดูสินค้า")).toBeTruthy();
    const list = rows.find((r) => r.list)!;
    expect(list.th).toBe("ส่งฟรี\nลด 10%");
  });

  it("ใส่คำแปล (รายการ = บรรทัดละรายการ) แล้วตรวจแล้ว", () => {
    const rows = a.rows([hero, ann]);
    const list = rows.find((r) => r.list)!;
    let v = a.setEn([hero, ann], list.id, "Free shipping\n10% off", true);
    expect((v[1] as Record<string, unknown>).messages_en).toEqual(["Free shipping", "10% off"]);
    expect(a.rows(v).find((r) => r.id === list.id)?.status).toBe("ai");
    v = a.confirm(v, list.id);
    expect(a.rows(v).find((r) => r.id === list.id)?.status).toBe("ok");
  });
});

describe("pathsAdapter — ข้อมูลซ้อนลึก", () => {
  it("ข้อมูลร้าน: ใส่/ตรวจคำแปลที่ช่องระดับบน", () => {
    const a = pathsAdapter<Record<string, unknown>>("info", ["site_tagline", "footer_note"]);
    const info = { site_tagline: "กระเป๋าดี", footer_note: "", shipping_flat: 50 };
    const rows = a.rows(info);
    expect(rows.map((r) => r.th)).toEqual(["กระเป๋าดี"]);
    const v = a.setEn(info, rows[0].id, "Good bags", true);
    expect(v.site_tagline_en).toBe("Good bags");
    expect(a.rows(a.confirm(v, rows[0].id))[0].status).toBe("ok");
  });
});

describe("productsAdapter — ชื่อ/คำอธิบายสินค้า", () => {
  const p: CenterProduct = { id: "p1", code: "LM01", webName: "", imageKey: null, name: { th: "กระเป๋าเป้", en: "" }, desc: { th: "ผ้าไนล่อน", en: "", enField: "english_description" } };
  it("แถวชื่อ + คำอธิบาย · แพตช์ส่งเฉพาะช่องที่เปลี่ยน", () => {
    const a = productsAdapter();
    const rows = a.rows([p]);
    expect(rows.map((r) => r.id)).toEqual(["p1|name", "p1|desc"]);
    const v = a.setEn([p], "p1|desc", "Nylon fabric", true);
    expect(productPatch(p, v[0])).toEqual({ english_description: "Nylon fabric" });
    expect(productPatch(p, p)).toBeNull();
  });
  it("ชื่อที่เป็นอังกฤษอยู่แล้ว = ไม่ต้องแปล", () => {
    expect(productsAdapter().rows([{ ...p, name: { th: "Classic Bag", en: "" }, desc: null }])).toEqual([]);
  });
});

describe("เผยแพร่ได้เลย หรือเก็บเป็นร่าง", () => {
  const pub = [{ id: "h", type: "hero", title: "ก" }];
  it("ต่างกันแค่คำแปล = เผยแพร่ได้", () => {
    expect(onlyTranslationsDiffer(pub, [{ id: "h", type: "hero", title: "ก", title_en: "A", _i18n: { title: { h: "x" } } }])).toBe(true);
  });
  it("มีงานอื่นค้างในร่าง = ต้องเก็บเป็นร่าง", () => {
    expect(onlyTranslationsDiffer(pub, [{ id: "h", type: "hero", title: "ข", title_en: "B" }])).toBe(false);
  });
  it("ตัดคำแปลออกทุกชั้น", () => {
    expect(stripTranslations({ a: 1, a_en: "x", _i18n: {}, kids: [{ b: "ก", b_en: "B" }] })).toEqual({ a: 1, kids: [{ b: "ก" }] });
  });
});

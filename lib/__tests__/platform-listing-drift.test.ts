import { describe, expect, it } from "vitest";
import {
  compareAll, compareDescImages, compareDescription, compareImages, compareTitle, compareVariantImages, variantTable, compareOptions, comparePrice, descImages, descLines, driftBadgeText, driftIssues, lineDiff, listSig, looksHtml, normText, plainText,
  type ShopValues, type SystemValues,
} from "@/lib/platform-listing-drift";

const sys = (o: Partial<SystemValues> = {}): SystemValues => ({
  description: "<p>กระเป๋าหนังแท้</p><ul><li>ใส่ของได้เยอะ</li></ul>",
  imageRefs: ["r2:a", "r2:b", "r2:c"],
  variants: [
    { code: "LY22-BK", values: ["ดำ"], price: 1190 },
    { code: "LY22-CR", values: ["ครีม"], price: 1190 },
  ],
  ...o,
});
const shop = (o: Partial<ShopValues> = {}): ShopValues => ({
  description: "กระเป๋าหนังแท้\nใส่ของได้เยอะ",
  imageCount: 3,
  imageSig: "x1",
  variants: [
    { code: "LY22-BK", label: "สี: ดำ", price: 1190 },
    { code: "ly22-cr ", label: "สี: ครีม", price: 1190 },
  ],
  ...o,
});

describe("ข้อความ", () => {
  it("ตัดแท็ก/ช่องว่าง/อักขระ HTML ก่อนเทียบ", () => {
    expect(normText("<p>A&nbsp;B</p>\n<br/>C")).toBe(normText("A B C"));
    expect(plainText("<p>หนึ่ง</p><p>สอง</p>")).toBe("หนึ่ง\nสอง");
  });
  it("ลายเซ็นรายการ คงที่ + ลำดับมีผล", () => {
    expect(listSig(["a", "b"])).toBe(listSig(["a", "b"]));
    expect(listSig(["a", "b"])).not.toBe(listSig(["b", "a"]));
  });
});

describe("รูป", () => {
  it("ยังไม่เคยส่งจากระบบ + จำนวนเท่ากัน = บอกไม่ได้ (ไม่นับเป็นปัญหา)", () => {
    expect(compareImages(sys(), shop(), null).state).toBe("unknown");
  });
  it("ยังไม่เคยส่ง + จำนวนไม่เท่า = ไม่ตรง", () => {
    const r = compareImages(sys(), shop({ imageCount: 6 }), null);
    expect(r.state).toBe("diff");
    expect(r.summary).toContain("บนร้าน 6");
  });
  it("เคยส่งแล้ว: ชุดเดิมทั้ง 2 ฝั่ง = ตรง · ระบบเปลี่ยนรูป = ไม่ตรง · ร้านเปลี่ยนรูป = ไม่ตรง", () => {
    const s = sys(); const sig = listSig(s.imageRefs);
    expect(compareImages(s, shop(), { images_sys: sig, images_shop: "x1" }).state).toBe("same");
    expect(compareImages(sys({ imageRefs: ["r2:z"] }), shop(), { images_sys: sig, images_shop: "x1" }).summary).toContain("ระบบเปลี่ยน");
    expect(compareImages(s, shop({ imageSig: "x2" }), { images_sys: sig, images_shop: "x1" }).summary).toContain("บนร้านถูกเปลี่ยน");
  });
});

describe("รายละเอียด", () => {
  it("HTML กับข้อความล้วนที่เนื้อเดียวกัน = ตรง", () => {
    expect(compareDescription(sys(), shop()).state).toBe("same");
  });
  it("เนื้อความต่าง = ไม่ตรง", () => {
    expect(compareDescription(sys(), shop({ description: "ของเก่า" })).state).toBe("diff");
  });
  it("ระบบไม่มีรายละเอียด = บอกไม่ได้", () => {
    expect(compareDescription(sys({ description: "" }), shop()).state).toBe("unknown");
  });
});

describe("ชื่อตัวเลือก", () => {
  it("รหัสตรงกัน (ไม่สนตัวพิมพ์/ช่องว่าง) + ชื่อสีอยู่ในชื่อตัวเลือก = ตรง", () => {
    expect(compareOptions(sys(), shop()).state).toBe("same");
  });
  it("ชื่อสีไม่ตรง = รายตัว", () => {
    const r = compareOptions(sys(), shop({ variants: [{ code: "LY22-BK", label: "สี: Black", price: 1190 }, { code: "LY22-CR", label: "สี: ครีม", price: 1190 }] }));
    expect(r.state).toBe("diff");
    expect(r.rows).toEqual([{ label: "LY22-BK", before: "สี: Black", after: "ดำ" }]);
  });
  it("ร้านให้ค่าตัวเลือกแยก (TikTok/LINE) = เทียบตรงตัว", () => {
    const r = compareOptions(sys(), shop({ variants: [{ code: "LY22-BK", label: "x", values: ["ดำด้าน"], price: 1 }, { code: "LY22-CR", label: "x", values: ["ครีม"], price: 1 }] }));
    expect(r.rows?.[0]).toMatchObject({ label: "LY22-BK", before: "ดำด้าน", after: "ดำ" });
  });
  it("ไม่มีตัวเลือกนี้บนร้าน = ไม่นับว่าชื่อไม่ตรง แต่บอกไว้ในหมายเหตุ", () => {
    const r = compareOptions(sys(), shop({ variants: [{ code: "LY22-BK", label: "สี: ดำ", price: 1190 }] }));
    expect(r.state).toBe("same");
    expect(r.note).toContain("ไม่มีบนร้าน 1");
  });
  it("ชื่อในระบบที่ต่อรหัสไว้ เช่น \"ดำ (01)\" เทียบแค่ \"ดำ\"", () => {
    const s = sys({ variants: [{ code: "B-01", values: ["ดำ (01)"], price: 1 }, { code: "B-02", values: ["กรมท่า (02)"], price: 1 }] });
    const r = compareOptions(s, shop({ variants: [{ code: "B-01", label: "สี: ดำ", price: 1 }, { code: "B-02", label: "Variation: สีกรมท่า | B-02", price: 1 }] }));
    expect(r.state).toBe("same");
  });
});

describe("ราคา", () => {
  it("ราคาตรงทุกตัว = ตรง", () => {
    expect(comparePrice(sys(), shop()).state).toBe("same");
  });
  it("ต่างตัวเดียว = สรุปก่อน→หลัง", () => {
    const r = comparePrice(sys(), shop({ variants: [{ code: "LY22-BK", label: "", price: 1290 }, { code: "LY22-CR", label: "", price: 1190 }] }));
    expect(r.state).toBe("diff");
    expect(r.rows).toHaveLength(1);
    expect(r.summary).toContain("1,290");
  });
  it("ราคาที่ลูกค้าจ่าย (LINE) เทียบเมื่อทั้ง 2 ฝั่งมี", () => {
    const s = sys({ variants: [{ code: "A", values: [], price: 1890, pay: 890 }] });
    expect(comparePrice(s, shop({ variants: [{ code: "A", label: "", price: 1890, pay: 990 }] })).state).toBe("diff");
    expect(comparePrice(s, shop({ variants: [{ code: "A", label: "", price: 1890, pay: 890 }] })).state).toBe("same");
  });
  it("เตือนก่อนส่ง: ร้านตั้งราคาเต็มไว้ทำโปร → ลูกค้าจ่ายแพงขึ้น + ขีดฆ่าหาย", () => {
    const s = sys({ variants: [{ code: "A", values: [], price: 850, pay: 850 }] });
    const r = comparePrice(s, shop({ variants: [{ code: "A", label: "", price: 1700, pay: 750 }] }));
    expect(r.note).toContain("ลูกค้าจะจ่ายแพงขึ้น");
    expect(r.note).toContain("ขีดฆ่า");
    expect(r.note).toContain("เกิน 30%");
  });
  it("สินค้าไม่มีตัวเลือกบนร้าน (รหัสว่าง) ใช้ตัวเดียวของระบบ", () => {
    const s = sys({ variants: [{ code: "A", values: [], price: 500 }] });
    expect(comparePrice(s, shop({ variants: [{ code: null, label: "", price: 450 }] })).state).toBe("diff");
  });
});

describe("รวม", () => {
  it("เรื่องที่ไม่ตรง + ข้อความป้าย", () => {
    const items = compareAll(sys(), shop({ imageCount: 1, description: "อื่น" }), null);
    expect(driftIssues(items)).toEqual(["images", "description"]);
    expect(driftBadgeText(["images", "options"])).toBe("ไม่ตรงระบบ: รูป · ชื่อตัวเลือก");
    expect(driftBadgeText([])).toBe("ตรงกับระบบ");
  });
});

describe("หน้าเทียบ: รูป + รายละเอียดเต็ม", () => {
  it("รูป: ส่งลิงก์ทั้ง 2 ฝั่ง (รูปในระบบ r2: → ลิงก์รูปย่อ)", () => {
    const r = compareImages(sys(), shop({ imageUrls: ["https://x/1.jpg"] }), null);
    expect(r.media?.before).toEqual(["https://x/1.jpg"]);
    expect(r.media?.after[0]).toBe("/api/r2-image?key=a&w=400");
  });
  it("รายละเอียด: ส่งข้อความเต็มทั้ง 2 ฝั่ง", () => {
    expect(compareDescription(sys(), shop()).text?.after).toContain("<p>");
  });
  it("เทียบทีละบรรทัด: บรรทัดที่หาย/เพิ่ม ไม่สนช่องว่าง", () => {
    const d = lineDiff(["หัวข้อ", "ขนาด 30 cm", "ประกัน 1 ปี"], ["หัวข้อ ", "ขนาด 31 cm", "ประกัน 1 ปี", "ส่งฟรี"]);
    expect(d.left.map((l) => l.changed)).toEqual([false, true, false]);
    expect(d.right.map((l) => l.changed)).toEqual([false, true, false, true]);
    expect(d.changes).toBe(3);
  });
  it("แบ่งบรรทัดจาก HTML + หารูปในรายละเอียด", () => {
    expect(descLines("<p>หนึ่ง</p><ul><li>สอง</li></ul>")).toEqual(["หนึ่ง", "• สอง"]);
    expect(descImages('<p>x</p><img class="a" src="https://cdn/a.jpg">')).toEqual(["https://cdn/a.jpg"]);
    expect(looksHtml("ข้อความล้วน")).toBe(false);
    expect(looksHtml("<p>x</p>")).toBe(true);
  });
});

describe("หัวข้อย่อย", () => {
  it("<li> แสดงเป็น • และ \"- ข้อ\" กับ \"• ข้อ\" นับเป็นบรรทัดเดียวกัน", () => {
    expect(descLines("<ul><li>วัสดุ: PU</li></ul>")).toEqual(["• วัสดุ: PU"]);
    const d = lineDiff(["- วัสดุ: PU", "- ช่องหลัก 1 ช่อง"], descLines("<ul><li>วัสดุ: PU</li><li>ช่องหลัก 1 ช่อง</li></ul>"));
    expect(d.changes).toBe(0);
  });
});

describe("ชื่อสินค้า", () => {
  it("ชื่อต่าง = ไม่ตรง · ต่างแค่ช่องว่างซ้ำ = ตรง · ร้านไม่ส่งชื่อ = บอกไม่ได้", () => {
    expect(compareTitle(sys({ title: "กระเป๋า พร้อมพวงกุญแจ LY22" }), shop({ title: "กระเป๋า LY22" })).state).toBe("diff");
    expect(compareTitle(sys({ title: "กระเป๋า  LY22" }), shop({ title: "กระเป๋า LY22" })).state).toBe("same");
    expect(compareTitle(sys({ title: "กระเป๋า LY22" }), shop({})).state).toBe("unknown");
  });
});

describe("เว้นบรรทัด + รูปในรายละเอียด + ตัวเลือก (เจ้าของเลือก 1-4)", () => {
  it("descLines เก็บบรรทัดว่างตามจริง (ว่างติดกันเหลือ 1) · บรรทัดว่างไม่นับว่าต่าง", () => {
    expect(descLines("หัว\n\n\n\nย่อหน้า 2")).toEqual(["หัว", "", "ย่อหน้า 2"]);
    expect(descLines("<p>หนึ่ง</p><p><br></p><p>สอง</p>")).toEqual(["หนึ่ง", "", "สอง"]);
    expect(lineDiff(["ก", "", "ข"], ["ก", "ข"]).changes).toBe(0);
  });
  it("รูปในรายละเอียด: ระบบมี 2 รูป ร้านไม่มี = ไม่ตรง · ทั้งคู่ไม่มี = ตรง · ส่งแล้วจำชุดไว้", () => {
    const s = sys({ descImageRefs: ["r2:d1", "r2:d2"] });
    const r = compareDescImages(s, shop(), null);
    expect(r.state).toBe("diff");
    expect(r.media?.after[0]).toBe("/api/r2-image?key=d1&w=400");
    expect(compareDescImages(sys(), shop(), null).state).toBe("same");
    const shopWith = shop({ descImageUrls: ["https://cdn/x.jpg", "https://cdn/y.jpg"] });
    expect(compareDescImages(s, shopWith, null).state).toBe("unknown");
    expect(compareDescImages(s, shopWith, { desc_images_sys: listSig(["r2:d1", "r2:d2"]), desc_images_shop: listSig(["https://cdn/x.jpg", "https://cdn/y.jpg"]) }).state).toBe("same");
  });
  it("รูปตัวเลือก: ร้านไม่มีรูปทั้งที่ระบบมี = ไม่ตรง · มีทั้งคู่ยังไม่เคยส่ง = บอกไม่ได้", () => {
    const s = sys({ variants: [{ code: "A", values: ["ดำ"], price: 1, image: "r2:a" }] });
    expect(compareVariantImages(s, shop({ variants: [{ code: "A", label: "", price: 1, image: null }] }), null).state).toBe("diff");
    expect(compareVariantImages(s, shop({ variants: [{ code: "A", label: "", price: 1, image: "https://x" }] }), null).state).toBe("unknown");
  });
  it("ตารางตัวเลือก: รูป/ชื่อ/ราคา 2 ฝั่ง + ธงชื่อไม่ตรง/ราคาไม่ตรง/ไม่มีรูป", () => {
    const s = sys({ variants: [{ code: "A", values: ["ดำ (01)"], price: 890, image: "r2:a" }] });
    const t = variantTable(s, shop({ variants: [{ code: "A", label: "สี: Black", price: 990, image: null }] }));
    expect(t[0]).toMatchObject({ code: "A", nameDiff: true, priceDiff: true, imageMissing: true });
    expect(t[0].sys.image).toBe("/api/r2-image?key=a&w=200");
  });
});

// ───────── ข้อมูลจำเพาะ (โหมดเช็กกับระบบในลิ้นชัก · 2026-11-23) ─────────
import { compareAttrs, attrValSig } from "@/lib/platform-listing-drift";
import { shopeeRowsWithSysPrices } from "@/lib/shopee-listing-edit";

describe("ข้อมูลจำเพาะ (attrs)", () => {
  const shopBase = { description: "", imageCount: 0, imageSig: "", variants: [] } as ShopValues;
  it("เทียบเฉพาะช่องที่ระบบมีค่า · id ก่อนชื่อ · ไม่สนลำดับ", () => {
    const s = sys({ attrs: { "1": [{ id: "555", name: "หนัง PU" }], "2": [{ name: "ไทย" }] }, attrNames: { "1": "วัสดุ", "2": "ประเทศ" } });
    const same = compareAttrs(s, { ...shopBase, attrs: { "1": [{ id: "555" }], "2": [{ name: " ไทย " }], "9": [{ name: "อื่น" }] } });
    expect(same.state).toBe("same");
    const diff = compareAttrs(s, { ...shopBase, attrs: { "1": [{ id: "556", name: "หนังแท้" }] } });
    expect(diff.state).toBe("diff");
    expect(diff.rows).toEqual([{ label: "วัสดุ", before: "หนังแท้", after: "หนัง PU" }, { label: "ประเทศ", before: "(ว่าง)", after: "ไทย" }]);
    expect(compareAttrs(sys(), { ...shopBase, attrs: {} }).state).toBe("unknown");
    expect(attrValSig([{ name: "B" }, { id: "2" }])).toBe(attrValSig([{ id: "2" }, { name: "b" }]));
  });
  it("compareAll มีเรื่องข้อมูลจำเพาะเฉพาะร้านที่ระบบส่งค่ามา", () => {
    expect(compareAll(sys(), { ...shopBase }, null).some((i) => i.key === "attrs")).toBe(false);
    expect(compareAll(sys({ attrs: { "1": [{ name: "x" }] } }), { ...shopBase, attrs: {} }, null).some((i) => i.key === "attrs")).toBe(true);
  });
  it("ราคาระบบ → แถวราคาในฟอร์ม Shopee (จับด้วยรหัส SKU)", () => {
    const view = { hasModel: true, itemSku: null, models: [{ modelId: "m1", sku: "LY22-BK" }, { modelId: "m2", sku: "ly22-cr" }] } as never;
    const rows = [{ modelId: "m1", label: "ดำ", price: 990, promo: false }, { modelId: "m2", label: "ครีม", price: 990, promo: false }];
    expect(shopeeRowsWithSysPrices(view, rows, [{ code: "LY22-BK", price: 1190.4 }, { code: "LY22-CR", price: null }]).map((r) => r.price)).toEqual([1190, 990]);
  });
});

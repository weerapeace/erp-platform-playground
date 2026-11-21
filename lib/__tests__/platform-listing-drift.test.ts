import { describe, expect, it } from "vitest";
import {
  compareAll, compareDescription, compareImages, compareOptions, comparePrice, driftBadgeText, driftIssues, listSig, normText, plainText,
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

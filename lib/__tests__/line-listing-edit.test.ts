import { describe, expect, it } from "vitest";
import { applyLineEditToRaw, lineEditStateFromRaw, listingHistoryText, planLineEdit } from "@/lib/line-listing-edit";

// ข้อมูลจริงย่อจาก LINE (Louis Montini WHB08 #319762282)
const raw = {
  id: 319762282, name: "Louis Montini กระเป๋าถือ WHB08", brand: "Louis Montini", description: "<p>Cherreen collection</p>",
  category: { id: 61, nameTh: "กระเป๋า>กระเป๋าสะพาย", nameEn: "Bags>Crossbody Bag" }, isDisplay: true, instantDiscount: 1050,
  variants: [
    { id: 25000001, sku: "WHB08-01", price: 2690, discountedPrice: 1640, availableNumber: 21, options: [{ name: "สี", value: "สีดำ" }] },
    { id: 25000002, sku: "WHB08-02", price: 2690, discountedPrice: 1640, availableNumber: 6, options: [{ name: "สี", value: "สีน้ำเงิน" }] },
  ],
};

describe("ข้อมูลบนร้าน → ฟอร์ม", () => {
  it("อ่านชื่อ/แบรนด์/หมวด/รายละเอียด/ราคาเต็ม+ราคาจ่าย", () => {
    const s = lineEditStateFromRaw(raw)!;
    expect(s).toMatchObject({ name: "Louis Montini กระเป๋าถือ WHB08", brand: "Louis Montini", categoryId: 61, categoryName: "กระเป๋า>กระเป๋าสะพาย" });
    expect(s.variants[0]).toEqual({ id: "25000001", label: "สี: สีดำ", sku: "WHB08-01", price: 2690, pay: 1640, weight: null, barcode: null, imageUrl: null });
    expect(s.images).toEqual([]);
  });
  it("ยังไม่ได้ดึงจาก LINE = null · ไม่มีส่วนลด = จ่ายเท่าราคาเต็ม", () => {
    expect(lineEditStateFromRaw(null)).toBeNull();
    expect(lineEditStateFromRaw({ variants: [{ id: 1, price: 150 }] })!.variants[0]).toMatchObject({ price: 150, pay: 150, label: "ตัวเลือก 1" });
  });
});

describe("planLineEdit — ส่งเฉพาะที่เปลี่ยน + ตรวจค่า", () => {
  const before = lineEditStateFromRaw(raw)!;
  it("ไม่แก้อะไร = ไม่ส่ง", () => {
    expect(planLineEdit(before, before)).toEqual({ fields: {}, prices: null, variantDetails: null, changes: [], errors: [], warnings: [] });
  });
  it("แก้ชื่อ + หมวด → ส่งแค่ 2 ช่อง พร้อมก่อน→หลัง", () => {
    const p = planLineEdit(before, { ...before, name: " ชื่อใหม่ ", categoryId: 62, categoryName: "กระเป๋า>กระเป๋าถือ" });
    expect(p.fields).toEqual({ name: "ชื่อใหม่", categoryId: 62 });
    expect(p.prices).toBeNull();
    expect(p.changes.map((c) => c.label)).toEqual(["ชื่อ", "หมวด"]);
    expect(p.changes[1]).toMatchObject({ before: "กระเป๋า>กระเป๋าสะพาย", after: "กระเป๋า>กระเป๋าถือ" });
  });
  it("แก้ราคาตัวเดียว → ส่งทุกตัวเลือก · ส่วนลด = เต็ม − จ่าย", () => {
    const p = planLineEdit(before, { ...before, variants: [{ ...before.variants[0], price: 1590, pay: 1590 }, before.variants[1]] });
    expect(p.errors).toEqual([]);
    expect(p.prices).toEqual([
      { variantId: "25000001", price: 1590, instantDiscount: 0 },
      { variantId: "25000002", price: 2690, instantDiscount: 1050 },
    ]);
    expect(p.changes).toHaveLength(1);
  });
  it("ค่าผิด: ชื่อว่าง · จ่ายเกินราคาเต็ม · ราคา 0 · รายละเอียดว่าง", () => {
    const p = planLineEdit(before, {
      ...before, name: "  ", description: "<p> </p>",
      variants: [{ ...before.variants[0], pay: 3000 }, { ...before.variants[1], price: 0 }],
    });
    expect(p.errors).toEqual([
      "ชื่อสินค้าห้ามว่าง", "รายละเอียดสินค้าห้ามว่าง",
      "สี: สีดำ: ราคาที่ลูกค้าจ่ายต้องไม่เกินราคาเต็ม", "สี: สีน้ำเงิน: ราคาเต็มต้องมากกว่า 0",
    ]);
  });
  it("รูปในรายละเอียดหาย = เตือน (ไม่บล็อก)", () => {
    const b = { ...before, description: "<p>a</p><img src=\"x\"><img src=\"y\">" };
    const p = planLineEdit(b, { ...b, description: "<p>a ใหม่</p><img src=\"x\">" });
    expect(p.errors).toEqual([]);
    expect(p.warnings).toEqual(["รูปในรายละเอียดลดลง 2 → 1 รูป — ตรวจว่าตั้งใจลบไหม"]);
  });
  it("ราคาเดิมบางตัวใช้ไม่ได้ (0) แต่แก้ตัวอื่น → ไม่ส่ง ให้กรอกให้ครบ", () => {
    const b = { ...before, variants: [before.variants[0], { ...before.variants[1], price: 0, pay: 0 }] };
    const p = planLineEdit(b, { ...b, variants: [{ ...b.variants[0], pay: 1500 }, b.variants[1]] });
    expect(p.errors).toEqual(["บางตัวเลือกไม่มีราคาที่ใช้ได้ — กรอกราคาให้ครบทุกตัวเลือกก่อนส่ง"]);
  });
});

describe("applyLineEditToRaw — แก้สำเนาในระบบหลังส่งสำเร็จ", () => {
  it("ชื่อ/หมวด/ราคา ตามที่ส่ง · ส่วนลดร่วม = ค่าเดียวกันทุกตัว ไม่งั้น 0", () => {
    const l = applyLineEditToRaw(raw, {
      fields: { name: "ชื่อใหม่", categoryId: 62 }, categoryName: "กระเป๋า>กระเป๋าถือ",
      prices: [{ variantId: "25000001", price: 1590, instantDiscount: 0 }, { variantId: "25000002", price: 2690, instantDiscount: 1050 }],
    });
    expect(l).toMatchObject({ name: "ชื่อใหม่", brand: "Louis Montini", category: { id: 62, nameTh: "กระเป๋า>กระเป๋าถือ", nameEn: "Bags>Crossbody Bag" }, instantDiscount: 0 });
    expect((l.variants as { price: number; discountedPrice: number; availableNumber: number }[])[0]).toMatchObject({ price: 1590, discountedPrice: 1590, availableNumber: 21 });
    expect(raw.name).toBe("Louis Montini กระเป๋าถือ WHB08");   // ไม่แก้ของเดิม
  });
});

describe("ประวัติ → ข้อความ", () => {
  it("แก้บน LINE / เปิดปิด / จับคู่ / ข้าม", () => {
    expect(listingHistoryText({ source: "line_listing_edit", changes: [{ label: "ชื่อ" }, { label: "ราคา สีดำ" }, { label: "ราคา สีแดง" }] })).toBe("แก้บน LINE: ชื่อ · ราคา 2 ตัวเลือก");
    expect(listingHistoryText({ source: "line_listing_display", status: "hide" })).toBe("ปิดขายบน LINE");
    expect(listingHistoryText({ source: "line_listing_variants", action: "delete", option: "ไซส์", value: "S", affected: ["a", "b"], ok: true })).toBe("ลบไซส์ “S” บน LINE (2 ตัวเลือก)");
    expect(listingHistoryText({ source: "line_listing_variants", action: "add", option: "สี", value: "แดง", added: ["x"], ok: false, error: "HTTP 400" })).toBe("เพิ่มสี “แดง” บน LINE (1 ตัวเลือก) — ไม่สำเร็จ: HTTP 400");
    expect(listingHistoryText({ manual_match: "x", to: "x", matched_code: "WHB08" })).toBe("จับคู่กับ WHB08");
    expect(listingHistoryText({ match_ignored: { from: false, to: true }, reason: "สินค้าซ้ำบนร้าน" })).toBe("ตั้งไม่ต้องจับคู่ · สินค้าซ้ำบนร้าน");
  });
});

describe("เฟส 2 — รูปสินค้า + รายละเอียดตัวเลือก", () => {
  const raw2 = {
    ...raw, imageUrls: ["https://line/a.jpg", "https://line/b.jpg", "https://line/c.jpg"],
    variants: raw.variants.map((v, i) => ({ ...v, weight: 0.5, barcode: i === 0 ? "885000001" : "", imageUrl: `https://line/v${i}.jpg` })),
  };
  const b = lineEditStateFromRaw(raw2)!;
  it("อ่านรูป/น้ำหนัก/บาร์โค้ด/รูปตัวเลือกจากร้าน", () => {
    expect(b.images).toEqual(["https://line/a.jpg", "https://line/b.jpg", "https://line/c.jpg"]);
    expect(b.variants[0]).toMatchObject({ weight: 0.5, barcode: "885000001", imageUrl: "https://line/v0.jpg" });
    expect(b.variants[1].barcode).toBeNull();
  });
  it("เรียงใหม่ + เปลี่ยนปก + เพิ่มรูปจากระบบ → ส่งทั้งชุดตามลำดับ", () => {
    const p = planLineEdit(b, { ...b, images: ["https://line/c.jpg", "https://line/a.jpg", "r2:product/x.jpg"] });
    expect(p.fields.imageUrls).toEqual(["https://line/c.jpg", "https://line/a.jpg", "r2:product/x.jpg"]);
    expect(p.changes[0]).toEqual({ label: "รูปสินค้า", before: "3 รูป", after: "3 รูป (เพิ่ม 1 · ลบ 1 · เปลี่ยนปก)" });
  });
  it("รูป 0 หรือเกิน 7 = ส่งไม่ได้", () => {
    expect(planLineEdit(b, { ...b, images: [] }).errors).toEqual(["ต้องมีรูปสินค้าอย่างน้อย 1 รูป"]);
    expect(planLineEdit(b, { ...b, images: Array.from({ length: 8 }, (_, i) => `https://line/${i}.jpg`) }).errors).toEqual(["LINE รับรูปได้ไม่เกิน 7 รูป"]);
  });
  it("น้ำหนัก/บาร์โค้ด ส่งเฉพาะตัวและช่องที่เปลี่ยน", () => {
    const p = planLineEdit(b, { ...b, variants: [{ ...b.variants[0], weight: 0.6 }, { ...b.variants[1], barcode: "885000002" }] });
    expect(p.variantDetails).toEqual([{ id: "25000001", weight: 0.6 }, { id: "25000002", barcode: "885000002" }]);
    expect(p.prices).toBeNull();
    expect(p.changes.map((c) => c.label)).toEqual(["ตัวเลือก สี: สีดำ", "ตัวเลือก สี: สีน้ำเงิน"]);
  });
  it("น้ำหนักนอกช่วง / SKU ว่าง / ล้างรูป = ส่งไม่ได้ · เปลี่ยน SKU = เตือน", () => {
    const bad = planLineEdit(b, { ...b, variants: [{ ...b.variants[0], weight: 0, sku: "" }, { ...b.variants[1], imageUrl: null }] });
    expect(bad.errors).toEqual(["สี: สีดำ: น้ำหนักต้องอยู่ระหว่าง 0.01–999.99 กก.", "สี: สีดำ: SKU ห้ามว่าง", "สี: สีน้ำเงิน: ล้างรูปตัวเลือกไม่ได้ — เลือกรูปใหม่แทน"]);
    const sku = planLineEdit(b, { ...b, variants: [{ ...b.variants[0], sku: "WHB08-01X" }, b.variants[1]] });
    expect(sku.errors).toEqual([]);
    expect(sku.warnings[0]).toContain("เปลี่ยน SKU บนร้าน");
  });
  it("แก้สำเนาในระบบ: รูป + รายละเอียดตัวเลือก", () => {
    const l = applyLineEditToRaw(raw2, { fields: { imageUrls: ["https://x/1.jpg"] }, variantDetails: [{ id: "25000001", weight: 0.6, imageUrl: "https://x/v.jpg" }] });
    expect(l.imageUrls).toEqual(["https://x/1.jpg"]);
    expect((l.variants as Record<string, unknown>[])[0]).toMatchObject({ weight: 0.6, imageUrl: "https://x/v.jpg", sku: "WHB08-01", price: 2690 });
  });
  it("ประวัติ: รายละเอียดตัวเลือก", () => {
    expect(listingHistoryText({ source: "line_listing_edit", changes: [{ label: "รูปสินค้า" }, { label: "ตัวเลือก สีดำ" }] })).toBe("แก้บน LINE: รูปสินค้า · รายละเอียด 1 ตัวเลือก");
  });
});

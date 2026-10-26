import { describe, expect, it } from "vitest";
import {
  prepareDraft, platformPrice, normalizePriceRule, duplicateVariantLabels, oddSkuCodes, variantLabel, sellableVariants,
  type ListingVariantLite, type ListingParentLite,
} from "@/lib/platform-listing-builder";
import { requiredChecks } from "@/lib/platform-required-fields";

const v = (code: string, color: string | null, price: number | null, extra: Partial<ListingVariantLite> = {}): ListingVariantLite => ({
  code, color, option_value: null, sale_price: price, fake_price: null, has_price: false, has_image: true, is_active: true, sale_ok: true, ...extra,
});
// ข้อมูลจริงย่อจาก ERP (IG International)
const PI338: ListingParentLite = { name_th: "เครื่องมือเจาะหนัง PI338", name_platform: "IG International เครื่องมือเจาะหนังทรงเฉียง PI338", description: "รายละเอียด", brand_name: "IG International", weight_kg: 0.5, box_width: 20, box_length: 14, box_height: 6 };
const EG10: ListingParentLite = { ...PI338, name_platform: "IG International อะไหล่ตาไก่ EG10", weight_kg: 0, box_width: null, box_length: null, box_height: null };
const LAZ_CAT = "12115 · อุปกรณ์ช่างและอุปกรณ์ปรับปรุงบ้าน > เครื่องมือช่าง";
const imgs = (n: number) => Array.from({ length: n }, (_, i) => `k${i + 1}`);

describe("กฎราคา", () => {
  it("บวก % ปัดขึ้นเป็นบาทเต็ม", () => {
    expect(platformPrice(75, { mode: "pct", pct: 5 })).toBe(79);
    expect(platformPrice(9, { mode: "pct", pct: 10 })).toBe(10);
    expect(platformPrice(75, { mode: "same", pct: 0 })).toBe(75);
  });
  it("ค่าผิด → เท่ากับ ERP · จำกัด 0–100%", () => {
    expect(normalizePriceRule(null)).toEqual({ mode: "same", pct: 0 });
    expect(normalizePriceRule({ mode: "pct", pct: 0 })).toEqual({ mode: "same", pct: 0 });
    expect(normalizePriceRule({ mode: "pct", pct: 250 })).toEqual({ mode: "pct", pct: 100 });
  });
});

describe("ตัวเลือก", () => {
  it("ชื่อซ้ำ (IG-EQ-016: ขาว เดี่ยว/โหล)", () => {
    const vs = [v("IG-EQ016-01", "ขาว", 9), v("IG-EQ016-01/12", "ขาว", 89), v("IG-EQ016-02", "ดำ", 9)];
    expect(duplicateVariantLabels(vs)).toEqual(["ขาว"]);
  });
  it("2 มิติไม่ซ้ำ (PI338: จำนวนรู × ขนาด)", () => {
    const vs = [v("PI2.7-2", "2 รู", 75, { option_value: "2.7 mm." }), v("PI3-2", "2 รู", 75, { option_value: "3 mm." })];
    expect(duplicateVariantLabels(vs)).toEqual([]);
    expect(variantLabel(vs[0])).toBe("2 รู · 2.7 mm.");
  });
  it("รหัสมีเครื่องหมายพิเศษ", () => {
    expect(oddSkuCodes([v("G3*39*22/39MM#AT", "แอนติก", 18), v("PI3.38-10", "10 รู", 95)])).toEqual(["G3*39*22/39MM#AT"]);
  });
  it("ไม่นับตัวที่ปิดใช้งาน/ไม่เปิดขาย", () => {
    expect(sellableVariants([v("A", "x", 1), v("B", "y", 1, { is_active: false }), v("C", "z", 1, { sale_ok: false })]).map((x) => x.code)).toEqual(["A"]);
  });
});

describe("prepareDraft — Lazada", () => {
  it("สินค้าพร้อม: เติมทุกช่อง ใช้รูปไม่เกิน 8 พร้อมลง", () => {
    const r = prepareDraft({ platformCode: "lazada", parent: PI338, variants: [v("PI2.7-2", "2 รู", 75, { option_value: "2.7 mm." })], imageKeys: imgs(13), platformCategory: LAZ_CAT, rule: { mode: "pct", pct: 5 }, now: "2026-10-26T00:00:00Z" });
    expect(r.ready).toBe(true);
    expect(r.fields.image_keys).toHaveLength(8);
    expect(r.fields.title).toBe("IG International เครื่องมือเจาะหนังทรงเฉียง PI338");
    expect(r.fields.category_path).toBe(LAZ_CAT);
    expect(r.fields.extra).toMatchObject({ brand: "IG International", price_rule: { mode: "pct", pct: 5 } });
    expect(r.priceRange).toEqual({ min: 79, max: 79 });
    expect(r.filled).toEqual(["ชื่อ", "รายละเอียด", "หมวด", "รูป"]);
  });
  it("ขาดน้ำหนัก/กล่อง/หมวด → ยังไม่พร้อม บอกเหตุผล", () => {
    const r = prepareDraft({ platformCode: "lazada", parent: EG10, variants: [v("EL01/10MM#G", "ทองเงา", 20)], imageKeys: imgs(4), platformCategory: "" });
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(["หมวด Lazada", "น้ำหนักพัสดุ", "ขนาดกล่องพัสดุ"]);
    const odd = r.checks.find((c) => c.label.startsWith("รหัส SKU"))!;
    expect(odd).toMatchObject({ ok: false, required: false });
  });
  it("ตัวเลือกซ้ำ → ลงไม่ได้", () => {
    const r = prepareDraft({ platformCode: "lazada", parent: PI338, variants: [v("A-01", "ขาว", 9), v("A-01/12", "ขาว", 89)], imageKeys: imgs(3), platformCategory: LAZ_CAT });
    expect(r.blockers).toEqual(["ชื่อตัวเลือกไม่ซ้ำกัน"]);
  });
  it("มีร่างเดิม: เติมเฉพาะช่องว่าง · สั่งทับได้", () => {
    const existing = { title: "ชื่อที่แก้เอง", description: "", category_path: null, image_keys: ["mine"], status: "draft", extra: { brand: "แบรนด์เอง", note: "x" } };
    const keep = prepareDraft({ platformCode: "lazada", parent: PI338, variants: [v("P", "a", 10)], imageKeys: imgs(3), platformCategory: LAZ_CAT, existing });
    expect(keep.fields).toMatchObject({ title: "ชื่อที่แก้เอง", description: "รายละเอียด", category_path: LAZ_CAT, image_keys: ["mine"] });
    expect(keep.fields.extra).toMatchObject({ brand: "แบรนด์เอง", note: "x" });
    expect(keep.filled).toEqual(["รายละเอียด", "หมวด"]);
    const over = prepareDraft({ platformCode: "lazada", parent: PI338, variants: [v("P", "a", 10)], imageKeys: imgs(3), platformCategory: LAZ_CAT, existing, overwrite: true });
    expect(over.fields).toMatchObject({ title: "IG International เครื่องมือเจาะหนังทรงเฉียง PI338", image_keys: ["k1", "k2", "k3"] });
  });
  it("ไม่มีราคาเลย → ลงไม่ได้ · มีแค่ราคาเต็มก็ถือว่ามีราคา", () => {
    expect(prepareDraft({ platformCode: "lazada", parent: PI338, variants: [v("P", "a", null)], imageKeys: imgs(1), platformCategory: LAZ_CAT }).blockers).toEqual(["ทุกตัวเลือกมีราคา"]);
    expect(prepareDraft({ platformCode: "lazada", parent: PI338, variants: [v("P", "a", null, { fake_price: 50 })], imageKeys: imgs(1), platformCategory: LAZ_CAT }).ready).toBe(true);
  });
});

describe("กฎของ LINE ไม่เปลี่ยน", () => {
  it("LINE ยังเช็ก 7 ข้อเดิม และราคาใช้ has_price (ราคาเต็ม)", () => {
    const base = { title: "a", description: "b", category: "60 · x", imagesToSend: 1, variantCount: 1, allHavePrice: true, allHaveImage: true };
    expect(requiredChecks("line_shopping", base).map((c) => c.label)).toEqual(["ชื่อสินค้า", "หมวดหมู่ปลายทาง", "รูปสินค้า ≥ 1 (ภาพปก)", "มีตัวเลือก/SKU ≥ 1", "ทุก SKU มีราคา", "รายละเอียดสินค้า", "ทุก SKU มีรูป"]);
    const r = prepareDraft({ platformCode: "line_shopping", parent: PI338, variants: [v("P", "a", 10)], imageKeys: imgs(1), platformCategory: "60 · x" });
    expect(r.blockers).toEqual(["ทุก SKU มีราคา"]);
    expect(r.fields.image_keys).toHaveLength(1);
  });
});

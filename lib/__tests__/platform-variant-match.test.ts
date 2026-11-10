import { describe, expect, it } from "vitest";
import { shopVariantsOf, variantLookupCodes, matchVariantSku, matchShopVariants, expectedLinePrice, linePriceDiff, type SkuLite } from "@/lib/platform-variant-match";

// ข้อมูลจริงย่อจาก LINE (Louis Montini FFB16) + Lazada (lib/lazada → raw.skus)
const lineRaw = { line: { variants: [
  { id: 25442533, sku: "FFB16-01", price: 289, discountedPrice: 159, availableNumber: 8, imageUrl: "https://x/1", options: [{ name: "สี", value: "ดำ (01)" }] },
  { id: 25442534, sku: "MGN402-03M", price: 690, discountedPrice: 690, availableNumber: 0, options: [{ name: "สี", value: "น้ำตาล" }, { name: "ไซซ์", value: "M" }] },
  { id: 25442535, sku: "ZZZ-99", price: 100, availableNumber: 2 },
  { id: 25442536, price: 100 },
] } };
const sku = (code: string, parent: string | null, name?: string): [string, SkuLite] => [code, { code, parent_sku_id: parent, name: name ?? null }];
const byCode = new Map<string, SkuLite>([sku("FFB16-01", "P-FFB16", "ดำ"), sku("MGN402-03", "P-MGN402", "น้ำตาล")]);

describe("อ่านตัวเลือกจากร้าน", () => {
  it("LINE: ชื่อตัวเลือกจาก options · ราคาลดเฉพาะที่ต่ำกว่าราคาหลัก", () => {
    const vs = shopVariantsOf("line_shopping", lineRaw);
    expect(vs).toHaveLength(4);
    expect(vs[0]).toMatchObject({ key: "25442533", sku: "FFB16-01", label: "สี: ดำ (01)", price: 289, sale_price: 159, stock: 8, image: "https://x/1" });
    expect(vs[1]).toMatchObject({ label: "สี: น้ำตาล · ไซซ์: M", sale_price: null, stock: 0 });
    expect(vs[2].label).toBe("ZZZ-99");
    expect(vs[3]).toMatchObject({ sku: null, label: "ตัวเลือก 4" });
  });
  it("LINE ที่ยังไม่ได้ดึงกลับ (ไม่มี raw.line) = ไม่มีตัวเลือก", () => {
    expect(shopVariantsOf("line_shopping", {})).toEqual([]);
    expect(shopVariantsOf("line_shopping", null)).toEqual([]);
  });
  it("Lazada: seller_sku + available", () => {
    const vs = shopVariantsOf("lazada", { lazada: { skus: [{ seller_sku: "PIN-6-GD", sku_id: "111", price: 25, special_price: 19, available: 38 }] } });
    expect(vs[0]).toMatchObject({ key: "111", sku: "PIN-6-GD", price: 25, sale_price: 19, stock: 38, image: null });
    expect(vs[0].label).toBe("PIN-6-GD");
  });
  it("Lazada: มีชื่อตัวเลือก (label จาก saleProp) → ใช้ชื่อแทนรหัส", () => {
    const vs = shopVariantsOf("lazada", { lazada: { skus: [{ seller_sku: "PIN-6-GD", sku_id: "111", label: "สี: Gold" }] } });
    expect(vs[0]).toMatchObject({ sku: "PIN-6-GD", label: "สี: Gold" });
  });
  it("Shopee (ไฟล์ export) = ไม่มีข้อมูลตัวเลือก", () => {
    expect(shopVariantsOf("shopee", { basic_info: { name: "x" } })).toEqual([]);
  });
});

describe("จับกับ SKU ในระบบ (ลำดับเดียวกับตอนส่งราคา)", () => {
  it("รหัสที่ต้องค้น = รหัสเอง + รหัสสี", () => {
    expect(variantLookupCodes(["MGN402-03M", "FFB16-01", null, "FFB16-01"])).toEqual(["MGN402-03M", "MGN402-03", "FFB16-01"]);
  });
  it("ตรงเป๊ะ → ใช้รหัสสี → ไม่เจอ → ไม่มีรหัส", () => {
    expect(matchVariantSku("FFB16-01", byCode).kind).toBe("exact");
    expect(matchVariantSku("MGN402-03M", byCode)).toMatchObject({ kind: "base", erp: { code: "MGN402-03" } });
    expect(matchVariantSku("ZZZ-99", byCode).kind).toBe("none");
    expect(matchVariantSku(null, byCode).kind).toBe("nosku");
  });
  it("ตัวพิมพ์ต้องตรง (เหมือนตอนส่งราคาจริง)", () => {
    expect(matchVariantSku("ffb16-01", byCode).kind).toBe("none");
  });
  it("นับสรุป + เตือน SKU ที่อยู่คนละรุ่นกับที่จับคู่ไว้", () => {
    const { rows, counts } = matchShopVariants(shopVariantsOf("line_shopping", lineRaw), byCode, "P-FFB16", (id) => id.replace("P-", ""));
    expect(counts).toEqual({ total: 4, exact: 1, base: 1, none: 1, nosku: 1, other_parent: 1, price_diff: 0, full_diff: 0 });
    expect(rows[0]).toMatchObject({ kind: "exact", erp_code: "FFB16-01", erp_name: "ดำ", other_parent: false });
    expect(rows[1]).toMatchObject({ kind: "base", erp_code: "MGN402-03", erp_parent_code: "MGN402", other_parent: true });
  });
  it("ยังไม่จับคู่รุ่น → ไม่เช็กคนละรุ่น", () => {
    expect(matchShopVariants(shopVariantsOf("line_shopping", lineRaw), byCode, null, () => null).counts.other_parent).toBe(0);
  });
});

describe("ราคาที่ระบบจะส่งขึ้น LINE (กฎเดียวกับปุ่มส่งราคา)", () => {
  const fake = new Map([["FFB16-01", 289], ["MGN402-03", 690]]);
  const sale = new Map([["FFB16-01", 159], ["MGN402-03", 490], ["GIFT03-01", 30]]);
  it("รหัสตัวเอง → รหัสสี → ไม่มีราคาเต็มใช้ราคาขาย · ไม่รู้ = null", () => {
    expect(expectedLinePrice("FFB16-01", fake, sale)).toEqual({ price: 289, discount: 130 });
    expect(expectedLinePrice("MGN402-03M", fake, sale)).toEqual({ price: 690, discount: 200 });
    expect(expectedLinePrice("GIFT03-01", fake, sale)).toEqual({ price: 30, discount: 0 });
    expect(expectedLinePrice("ZZZ-99", fake, sale)).toBeNull();
    expect(expectedLinePrice(null, fake, sale)).toBeNull();
  });
  it("ราคาจ่ายไม่ตรง = pay · จ่ายตรงแต่ราคาเต็มไม่ตรง = full (ข้อมูลจริง LM)", () => {
    expect(linePriceDiff({ price: 289, sale_price: 159 }, { price: 289, discount: 130 })).toBeNull();
    expect(linePriceDiff({ price: 2100, sale_price: 1390 }, { price: 1190, discount: 0 })).toBe("pay");   // TML10
    expect(linePriceDiff({ price: 1499, sale_price: 850 }, { price: 850, discount: 0 })).toBe("full");    // MGN386 ในระบบไม่มีราคาเต็ม
    expect(linePriceDiff({ price: 30, sale_price: 1 }, { price: 30, discount: 0 })).toBe("pay");
    expect(linePriceDiff({ price: 289, sale_price: 159 }, null)).toBeNull();
  });
  it("นับตัวเลือกที่ราคาไม่ตรงในตารางตัวเลือก", () => {
    const { rows, counts } = matchShopVariants(shopVariantsOf("line_shopping", lineRaw), byCode, "P-FFB16", () => null, (s) => expectedLinePrice(s, fake, sale));
    expect(rows[0]).toMatchObject({ erp_price: 289, erp_pay: 159, price_diff: null });
    expect(rows[1]).toMatchObject({ erp_price: 690, erp_pay: 490, price_diff: "pay" });   // บนร้าน 690 ไม่ลด แต่ระบบลดเหลือ 490
    expect(rows[0].price_diff).toBeNull();
    expect(counts.price_diff).toBe(1);
  });
});

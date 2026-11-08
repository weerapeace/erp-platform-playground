import { describe, expect, it } from "vitest";
import { shopVariantsOf, variantLookupCodes, matchVariantSku, matchShopVariants, type SkuLite } from "@/lib/platform-variant-match";

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
    expect(counts).toEqual({ total: 4, exact: 1, base: 1, none: 1, nosku: 1, other_parent: 1 });
    expect(rows[0]).toMatchObject({ kind: "exact", erp_code: "FFB16-01", erp_name: "ดำ", other_parent: false });
    expect(rows[1]).toMatchObject({ kind: "base", erp_code: "MGN402-03", erp_parent_code: "MGN402", other_parent: true });
  });
  it("ยังไม่จับคู่รุ่น → ไม่เช็กคนละรุ่น", () => {
    expect(matchShopVariants(shopVariantsOf("line_shopping", lineRaw), byCode, null, () => null).counts.other_parent).toBe(0);
  });
});

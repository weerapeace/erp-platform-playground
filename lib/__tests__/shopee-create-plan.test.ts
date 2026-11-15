import { describe, expect, test } from "vitest";
import {
  planShopeeCreate, shopeeAttrFieldsOf, shopeeAttrPayload, shopeeAttrStateOf, shopeeBrandMatches, shopeeCategoryIdOf, shopeeCreateImageRefs,
  shopeeCreateLimitsOf, shopeePickCategory, shopeeTemplateOf, shopeeUniqueCategories, SHOPEE_CREATE_STOCK,
  type ShopeeCategoryPick, type ShopeeCreateParent, type ShopeeCreateSku, type ShopeeTemplate,
} from "@/lib/shopee-create-plan";

const PARENT: ShopeeCreateParent = {
  id: "p1", code: "BCG09", name_th: "กระเป๋าคาดอก หนังวัวแท้ Louis Montini", name_platform: null,
  description: "กระเป๋าหนังวัวแท้ 100% กันน้ำ ขนาดกำลังดี", platform_description: null, weight_g: 350,
  box: null, brand_name: "Louis Montini",
};
const sku = (code: string, patch: Partial<ShopeeCreateSku> = {}): ShopeeCreateSku => ({
  id: `s-${code}`, code, color_th: null, color: null, list_price: 990, fake_price: 1590, cover_image_r2_key: `img/${code}.jpg`, attribute_values: null, is_active: true, sale_ok: true, ...patch,
});
const CAT: ShopeeCategoryPick = { id: "100095", label: "100095 · กระเป๋าผู้หญิง > กระเป๋าสะพายข้าง", kind: "central", src: "หมวดกลาง → หมวด Shopee" };
const TEMPLATE: ShopeeTemplate = {
  itemId: "467297004", categoryId: "100095", brand: { id: 1125513, name: "Louis Montini(หลุยส์ มอนตินี่)" },
  logistics: [{ logistic_id: 70016, name: "Standard Delivery", enabled: true }, { logistic_id: 70020, name: "Bulky", enabled: false }],
  daysToShip: 2, attrs: { "100134": [{ id: "1165", name: "หนังวัว" }], "100999": [{ name: "ไทย" }] },
};
const FIELDS = [
  { id: "100134", name: "วัสดุ", required: true, multiple: false, customizable: false, numeric: false, options: [{ id: "1165", name: "หนังวัว" }] },
  { id: "100999", name: "ประเทศผู้ผลิต", required: false, multiple: false, customizable: true, numeric: false, options: [] },
];
const plan = (patch: Partial<Parameters<typeof planShopeeCreate>[0]> = {}) => planShopeeCreate({
  parent: PARENT, skus: [sku("BCG09-01", { color_th: "ดำ" }), sku("BCG09-02", { color_th: "น้ำตาล" })], draft: null,
  category: CAT, candidates: [CAT], galleryKeys: ["gal/1.jpg"], attrFields: FIELDS, limits: null, template: TEMPLATE, onShop: null, ...patch,
});

describe("Shopee ลงสินค้าใหม่ — ตัวช่วยย่อย", () => {
  test("หมวด: แยกรหัส · เลือกตัวแรกที่มีรหัส · ตัดซ้ำ", () => {
    expect(shopeeCategoryIdOf("100095 · กระเป๋า")).toBe("100095");
    expect(shopeeCategoryIdOf("100094")).toBe("100094");
    expect(shopeeCategoryIdOf("")).toBeNull();
    const a: ShopeeCategoryPick = { id: "", label: "", kind: "draft", src: "" };
    const b: ShopeeCategoryPick = { id: "1", label: "1 · x", kind: "recommend", src: "r" };
    expect(shopeePickCategory([a, b])).toBe(b);
    expect(shopeeUniqueCategories([b, { ...b, kind: "same_type" }, a]).map((c) => c.kind)).toEqual(["recommend"]);
  });
  test("ช่วงตามหมวด (get_item_limit) อ่านชั้น/ตัวเลือก/วันส่ง/กล่องบังคับ", () => {
    const L = shopeeCreateLimitsOf({ response: {
      item_name_length_limit: { min_limit: 20, max_limit: 120 }, item_image_count_limit: { min_limit: 1, max_limit: 9 },
      tier_variation_name_length_limit: { min_limit: 1, max_limit: 14 }, tier_variation_option_length_limit: { min_limit: 1, max_limit: 20 },
      dts_limit: { non_pre_order_days_to_ship: 3 }, dimension_limit: { dimension_mandatory: false }, weight_limit: { weight_mandatory: true },
    } })!;
    expect(L).toMatchObject({ nameMin: 20, nameMax: 120, imagesMax: 9, tierNameMax: 14, tierOptionMax: 20, dtsNonPreOrder: 3, dimensionMandatory: false, weightMandatory: true });
    expect(shopeeCreateLimitsOf(null)).toBeNull();
    expect(shopeeCreateLimitsOf({ response: {} })).toBeNull();
  });
  test("ช่องคุณลักษณะ: ชื่อไทยก่อน · ชนิดช่อง → เลือก/พิมพ์เอง/หลายค่า/ตัวเลข", () => {
    const f = shopeeAttrFieldsOf([
      { attribute_id: 1, mandatory: true, name: "Material", multi_lang: [{ language: "th", value: "วัสดุ" }], attribute_info: { input_type: 1 }, attribute_value_list: [{ value_id: 11, name: "Leather", multi_lang: [{ language: "th", value: "หนัง" }] }] },
      { attribute_id: 2, mandatory: false, name: "Weight", attribute_info: { input_type: 3, input_validation_type: 3 }, attribute_value_list: [] },
      { attribute_id: 3, mandatory: false, name: "Style", attribute_info: { input_type: 5 }, attribute_value_list: [{ value_id: 31, name: "Casual" }] },
    ]);
    expect(f[0]).toEqual({ id: "1", name: "วัสดุ", required: true, multiple: false, customizable: false, numeric: false, options: [{ id: "11", name: "หนัง" }] });
    expect(f[1]).toMatchObject({ id: "2", customizable: true, numeric: true, options: [] });
    expect(f[2]).toMatchObject({ multiple: true, customizable: true });
  });
  test("ค่าที่กรอก → attribute_list (ในรายการ = value_id · พิมพ์เอง = 0 + ชื่อ)", () => {
    expect(shopeeAttrPayload({ "1": [{ id: "11", name: "หนัง" }], "2": [{ name: "0.5" }], "3": [], x: [{ id: "1" }] })).toEqual([
      { attribute_id: 1, attribute_value_list: [{ value_id: 11 }] },
      { attribute_id: 2, attribute_value_list: [{ value_id: 0, original_value_name: "0.5" }] },
    ]);
    expect(shopeeAttrStateOf({ a: [{ id: "1" }, { foo: 1 }], b: "x" })).toEqual({ a: [{ id: "1" }] });
  });
  test("สินค้าแบบ: แบรนด์ / ขนส่ง / วันส่ง / ค่าคุณลักษณะ จาก get_item_base_info", () => {
    const t = shopeeTemplateOf({
      item_id: 467297004, category_id: 100569, brand: { brand_id: 1125513, original_brand_name: "Louis Montini(หลุยส์ มอนตินี่)" },
      logistic_info: [{ logistic_id: 70016, logistic_name: "Standard", enabled: true, is_free: false }, { logistic_id: 0, enabled: true }],
      pre_order: { is_pre_order: false, days_to_ship: 2 },
      attribute_list: [{ attribute_id: 100134, attribute_value_list: [{ value_id: 1165, original_value_name: "หนังวัว" }] }, { attribute_id: 7, attribute_value_list: [{ value_id: 0, original_value_name: "ไทย" }] }],
    })!;
    expect(t).toMatchObject({ itemId: "467297004", categoryId: "100569", brand: { id: 1125513 }, daysToShip: 2 });
    expect(t.logistics).toEqual([{ logistic_id: 70016, name: "Standard", enabled: true }]);
    expect(t.attrs).toEqual({ "100134": [{ id: "1165", name: "หนังวัว" }], "7": [{ name: "ไทย" }] });
  });
  test("แบรนด์ในระบบ ↔ แบรนด์บน Shopee (ตัดวงเล็บ/ช่องว่าง)", () => {
    expect(shopeeBrandMatches("Louis Montini", "Louis Montini(หลุยส์ มอนตินี่)")).toBe(true);
    expect(shopeeBrandMatches("Pixie Dustie", "Louis Montini(หลุยส์ มอนตินี่)")).toBe(false);
    expect(shopeeBrandMatches(null, "NoBrand")).toBe(false);
  });
});

describe("Shopee ลงสินค้าใหม่ — แผน", () => {
  test("ครบ: ปิดขาย + สต๊อก 0 · 2 สี = 1 ชั้นพร้อมรูปตัวเลือก · ราคาตั้ง = ราคาเต็ม", () => {
    const { preview: pv, payload } = plan();
    expect(pv.missing).toEqual([]);
    expect(pv.dims).toEqual([{ key: "color", label: "สี", name: "สี", values: ["ดำ", "น้ำตาล"] }]);
    expect(pv.variants.map((v) => v.price)).toEqual([1590, 1590]);
    expect(payload.add_item).toMatchObject({
      item_name: PARENT.name_th, item_status: "UNLIST", seller_stock: [{ stock: SHOPEE_CREATE_STOCK }], category_id: 100095, weight: 0.35,
      brand: { brand_id: 1125513 }, logistic_info: [{ logistic_id: 70016, enabled: true }], item_sku: "BCG09", pre_order: { is_pre_order: false, days_to_ship: 2 },
      attribute_list: [{ attribute_id: 100134, attribute_value_list: [{ value_id: 1165 }] }],
    });
    const tier = payload.tier as { standardise_tier_variation: { variation_option_list: { image_ref?: string }[] }[]; model: { tier_index: number[]; model_sku: string; original_price: number; seller_stock: { stock: number }[] }[] };
    expect(tier.standardise_tier_variation[0].variation_option_list.map((o) => o.image_ref)).toEqual(["r2:img/BCG09-01.jpg", "r2:img/BCG09-02.jpg"]);
    expect(tier.model).toEqual([
      { tier_index: [0], original_price: 1590, model_sku: "BCG09-01", seller_stock: [{ stock: 0 }] },
      { tier_index: [1], original_price: 1590, model_sku: "BCG09-02", seller_stock: [{ stock: 0 }] },
    ]);
    expect(pv.attrs.fromTemplate).toBe("467297004");
    expect(shopeeCreateImageRefs(payload)).toEqual(["r2:img/BCG09-01.jpg", "r2:img/BCG09-02.jpg", "r2:gal/1.jpg"]);
  });
  test("SKU เดียว = ไม่มีชั้น · item_sku = รหัส SKU · ราคา = ของ SKU", () => {
    const { preview: pv, payload } = plan({ skus: [sku("BCG10", { fake_price: null, list_price: 1290 })] });
    expect(pv.dims).toEqual([]);
    expect(payload.tier).toBeNull();
    expect(payload.add_item).toMatchObject({ original_price: 1290, item_sku: "BCG10" });
  });
  test("ขาด: น้ำหนัก · หมวด · ราคาไม่เต็มบาท · ช่องบังคับ · ไม่มีสินค้าแบบ (ไม่รู้ขนส่ง)", () => {
    const { preview: pv } = plan({ parent: { ...PARENT, weight_g: null }, category: null, template: null, skus: [sku("A1", { fake_price: 99.5 })] });
    const m = pv.missing.join(" | ");
    expect(m).toContain("น้ำหนักพัสดุ");
    expect(m).toContain("หมวด Shopee");
    expect(m).toContain("จำนวนเต็มบาท");
    expect(m).toContain("ขนส่ง");
    expect(pv.brand).toMatchObject({ id: 0, name: "NoBrand" });
  });
  test("ช่องบังคับ: หมวดไม่ตรงสินค้าแบบ = ไม่เติมให้ → ขาด · ร่างกรอกไว้ = ใช้ของร่าง", () => {
    const other = plan({ category: { ...CAT, id: "100094", label: "100094 · กระเป๋าถือ" } });
    expect(other.preview.attrs.fromTemplate).toBeNull();
    expect(other.preview.missing.join(" ")).toContain("ช่องบังคับของหมวดยังว่าง 1 ช่อง (วัสดุ)");
    const withDraft = plan({ draft: { title: null, description: null, category_path: null, image_keys: null, platform_product_id: null, extra: { shopee_attrs: { "100134": [{ id: "1165" }] } } } });
    expect(withDraft.preview.attrs.fromTemplate).toBeNull();
    expect(withDraft.preview.missing).toEqual([]);
  });
  test("หมวดที่ระบบเดา = เตือนให้ตรวจ · ชื่อตามช่วงของร้าน · ตัวเลือกยาวเกิน = ขาด", () => {
    const L = shopeeCreateLimitsOf({ response: { item_name_length_limit: { min_limit: 50, max_limit: 120 }, tier_variation_option_length_limit: { max_limit: 3 } } });
    const { preview: pv } = plan({ category: { ...CAT, kind: "recommend", src: "Shopee แนะนำจากชื่อสินค้า" }, limits: L });
    expect(pv.warnings.join(" ")).toContain("ระบบเดาให้");
    expect(pv.missing.join(" ")).toContain("ชื่อสั้นไป");
    expect(pv.missing.join(" ")).toContain("ยาวเกิน 3 ตัวอักษร");
  });
  test("กันซ้ำ: มีบนร้านแล้ว = เตือน · แบรนด์ไม่ตรงสินค้าแบบ = ไม่มีแบรนด์", () => {
    const { preview: pv } = plan({ onShop: "999", parent: { ...PARENT, brand_name: "Pixie Dustie" } });
    expect(pv.on_shop).toBe("999");
    expect(pv.brand.id).toBe(0);
  });
});

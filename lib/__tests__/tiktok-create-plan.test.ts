import { describe, expect, test } from "vitest";
import { planTiktokCreate, ttsAttrDefsOf, ttsCategoryIdOf, ttsCreateDescriptionHtml, ttsCreateImageRefs, ttsCreateResolveImages, type TtsCreateSku } from "@/lib/tiktok-create-plan";

const sku = (code: string, over: Partial<TtsCreateSku> = {}): TtsCreateSku => ({
  id: `id-${code}`, code, color_th: null, color: null, list_price: 690, fake_price: 1390, cover_image_r2_key: `img/${code}.jpg`,
  attribute_values: null, is_active: true, sale_ok: true, ...over,
});
const parent = {
  id: "p1", code: "BCG10", name_th: "กระเป๋าคาดอก Belt bag ผ้าไนล่อน กันน้ำ ใช้ได้ทั้งชายหญิง", name_platform: null,
  description: "กระเป๋าคาดอก\nผ้าไนล่อนกันน้ำ", platform_description: null, weight_g: 350, box: { l: 25.2, w: 15, h: 5 },
};
const base = { parent, draft: null, mappedCategory: "903560 · กระเป๋าและกระเป๋าเดินทาง > กระเป๋าผู้ชาย > กระเป๋าคาดเอว", galleryKeys: ["g/1.jpg"], attrDefs: [], brand: { id: "b1", name: "Louis Montini" }, onShop: null, warehouseId: "7198734530407614213" as string | null };

describe("สร้างฉบับร่างบน TikTok", () => {
  test("ข้อมูลครบ → ไม่มีข้อขาด · payload เป็นฉบับร่าง ไม่มีสต๊อก", () => {
    const { preview, payload } = planTiktokCreate({ ...base, skus: [sku("BCG10-01", { color_th: "น้ำเงิน" }), sku("BCG10-02", { color_th: "ชมพู" })] });
    expect(preview.missing).toEqual([]);
    expect(payload).toMatchObject({ save_mode: "AS_DRAFT", category_id: "903560", category_version: "v2", brand_id: "b1", package_weight: { value: "0.35", unit: "KILOGRAM" } });
    expect(payload.package_dimensions).toEqual({ length: "26", width: "15", height: "5", unit: "CENTIMETER" });
    const skus = payload.skus as Record<string, unknown>[];
    expect(skus[0]).toEqual({ seller_sku: "BCG10-01", price: { amount: "1390.00", currency: "THB" }, inventory: [{ warehouse_id: "7198734530407614213", quantity: 1 }], sales_attributes: [{ name: "สี", value_name: "น้ำเงิน" }] });
    expect(preview.stock).toEqual({ qty: 1, warehouseId: "7198734530407614213" });
    expect(preview.warnings.join(" ")).toContain("แก้เป็นจำนวนจริง");
    expect(preview.warnings.join(" ")).toContain("โปรโมชัน");   // ราคาเต็ม ≠ ราคาขาย
  });
  test("SKU เดียว = ไม่มีชั้นตัวเลือก · ไม่มีราคาเต็ม = ใช้ราคาขาย", () => {
    const { preview, payload } = planTiktokCreate({ ...base, skus: [sku("KR64-01", { fake_price: null, list_price: 159 })] });
    expect(preview.dims).toEqual([]);
    expect((payload.skus as Record<string, unknown>[])[0]).toEqual({ seller_sku: "KR64-01", price: { amount: "159.00", currency: "THB" }, inventory: [{ warehouse_id: "7198734530407614213", quantity: 1 }] });
  });
  test("ตัวสี (master) ไม่ลง · ตัวขายใช้ราคา/รูปของตัวสีถ้าไม่มี", () => {
    const { preview } = planTiktokCreate({ ...base, skus: [sku("MGN402-03", { color_th: "น้ำตาล", fake_price: 1690 }), sku("MGN402-03M", { color_th: "น้ำตาล", fake_price: null, list_price: null, cover_image_r2_key: null, attribute_values: { variant_option: { name: "ไซซ์", value: "M" } } }), sku("MGN402-03L", { color_th: "น้ำตาล", fake_price: null, list_price: null, cover_image_r2_key: null, attribute_values: { variant_option: { name: "ไซซ์", value: "L" } } })] });
    expect(preview.variants.map((v) => v.code)).toEqual(["MGN402-03M", "MGN402-03L"]);   // ตามลำดับที่ส่งมา (route เรียงตามรหัสแล้ว)
    expect(preview.variants[1]).toMatchObject({ price: 1690, image_ref: "r2:img/MGN402-03.jpg", attrs: { สี: "น้ำตาล", ไซซ์: "L" } });
  });
  test("ข้อขาด: ชื่อสั้น · ไม่มีหมวด · ไม่มีน้ำหนัก · ราคานอกช่วง · ตัวเลือกซ้ำ · รหัสมีช่องว่าง", () => {
    const { preview } = planTiktokCreate({
      ...base, mappedCategory: null,
      parent: { ...parent, name_th: "กระเป๋า", weight_g: null },
      skus: [sku("A 1", { color_th: "ดำ", fake_price: 20, list_price: null }), sku("A2", { color_th: "ดำ" })],
    });
    const m = preview.missing.join(" | ");
    expect(m).toContain("ชื่อสั้นไป");
    expect(m).toContain("หมวด TikTok");
    expect(m).toContain("น้ำหนักพัสดุ");
    expect(m).toContain("30–260,000");
    expect(m).toContain("ตัวเลือกซ้ำ");
    expect(m).toContain("ช่องว่าง");
  });
  test("ร่างที่แก้ไว้มาก่อน: ชื่อ/หมวด/รูป/น้ำหนัก", () => {
    const { preview, payload } = planTiktokCreate({
      ...base, skus: [sku("X1")],
      draft: { title: "ชื่อใหม่สำหรับ TikTok ยาวพอให้ผ่านกติกาของร้าน", description: null, category_path: "601445 · กระเป๋าถือ", image_keys: null, extra: { tiktok_images: ["r2:a.jpg", "r2:b.jpg"], tiktok_weight: 0.5 }, platform_product_id: null },
    });
    expect(preview.name.src).toBe("แก้ไว้สำหรับ TikTok");
    expect(payload.category_id).toBe("601445");
    expect(ttsCreateImageRefs(payload)).toEqual(["r2:a.jpg", "r2:b.jpg"]);
    expect((payload.package_weight as Record<string, string>).value).toBe("0.5");
    expect(ttsCreateResolveImages(payload, new Map([["r2:a.jpg", "tos/1"], ["r2:b.jpg", "tos/2"]])).main_images).toEqual([{ uri: "tos/1" }, { uri: "tos/2" }]);
  });
  test("ไม่มีแบรนด์บน TikTok = ไม่ใส่ brand_id · มีบนร้านแล้ว = เตือน", () => {
    const { preview, payload } = planTiktokCreate({ ...base, brand: null, brandNote: "ไม่พบแบรนด์", skus: [sku("X1")], onShop: "1729" });
    expect(payload.brand_id).toBeUndefined();
    expect(preview.brand.src).toBe("ไม่พบแบรนด์");
    expect(preview.on_shop).toBe("1729");
  });
  test("ช่องบังคับของหมวด = เตือน (ฉบับร่างยังไม่บังคับ)", () => {
    const defs = ttsAttrDefsOf([{ id: "1", name: "วัสดุ", type: "PRODUCT_PROPERTY", is_requried: true }, { id: "2", name: "สี", type: "SALES_PROPERTY", is_requried: true }, { id: "3", name: "รุ่น", type: "PRODUCT_PROPERTY", is_requried: false }]);
    const { preview } = planTiktokCreate({ ...base, attrDefs: defs, skus: [sku("X1")] });
    expect(preview.attrs).toEqual({ required: ["วัสดุ"], loaded: true });
    expect(preview.missing).toEqual([]);
    expect(preview.warnings.join(" ")).toContain("Seller Center");
  });
  test("รายละเอียด: ข้อความ → ย่อหน้า · ตัดรูปที่ไม่ใช่ของ TikTok", () => {
    const r = ttsCreateDescriptionHtml(`<p>a</p><img src="https://erp.x/api/r2-image?key=1"><img src="https://p16-oec-sg.ibyteimg.com/x.jpg" width="800" height="600">`);
    expect(r.cut).toBe(1);
    expect(r.html).toContain("ibyteimg");
    expect(r.html).not.toContain("r2-image");
    expect(ttsCategoryIdOf("903560 · x")).toBe("903560");
    expect(ttsCategoryIdOf("")).toBeNull();
  });
  test("ไม่รู้คลังของร้าน = ขาด (TikTok บังคับสต๊อกแม้เป็นร่าง — เจอจริง 2026-11-13)", () => {
    const { preview } = planTiktokCreate({ ...base, warehouseId: null, skus: [sku("X1")] });
    expect(preview.missing.join(" ")).toContain("คลังสินค้า");
    expect(planTiktokCreate({ ...base, warehouseId: undefined, skus: [sku("X1")] }).preview.missing.join(" ")).not.toContain("คลังสินค้า");
  });
});

import { describe, expect, it } from "vitest";
import { planLazadaCreate, lazCreateImageRefs, lazCreateResolveImages, lazDescriptionHtml, lazCategoryIdOf, isLazadaImage, type LazCreateSku, type LazCreateParent } from "@/lib/lazada-create-plan";
import type { LazadaAttrDef } from "@/lib/lazada-listing-edit";

const parent = (over: Partial<LazCreateParent> = {}): LazCreateParent => ({
  id: "p1", code: "IG-PROP001", name_th: "พร็อพถาดกระจก", name_platform: "IG International พร็อพถาดกระจก IG-PROP001",
  description: "วัสดุ: เรซิน\n- ลายฉลุ", platform_description: null, weight_g: 400, box: { l: 40, w: 25, h: 5 }, ...over,
});
const sku = (code: string, color: string, sale: number | null, fake: number | null = null, over: Partial<LazCreateSku> = {}): LazCreateSku => ({
  id: `s-${code}`, code, color_th: color, color: null, list_price: sale, fake_price: fake, cover_image_r2_key: `img/${code}.jpg`, attribute_values: null, is_active: true, sale_ok: true, ...over,
});
const def = (over: Partial<LazadaAttrDef>): LazadaAttrDef => ({ name: "x", label: "x", required: false, input_type: "text", is_sale_prop: false, attribute_type: "normal", is_key_prop: false, options: [], choices: [], ...over });
const defs: LazadaAttrDef[] = [
  def({ name: "color_family", label: "Color Family", is_sale_prop: true, attribute_type: "sku", input_type: "multiEnumInput" }),
  def({ name: "size", label: "Size", is_sale_prop: true, attribute_type: "sku" }),
  def({ name: "material", label: "วัสดุ", required: true, input_type: "singleSelect", choices: [{ name: "เรซิน", en: "Resin" }] }),
  def({ name: "brand", label: "Brand", required: true }),
];
const base = { draft: null, mappedCategory: "10100451 · พร็อพ", galleryKeys: [], attrDefs: defs, onShop: null };

describe("planLazadaCreate — IG-PROP001", () => {
  const skus = [sku("IG-PROP001-01", "สีทอง", 199, 299), sku("IG-PROP001-02", "สีชมพู", 199), sku("IG-PROP001-04", "สีทอง (47×22.5×2)", 229, 329)];
  it("สีเป็น color_family ของหมวด · มีรูปทุกตัว = รูปต่อตัวเลือก · ราคาเต็ม+ลด · สต๊อก 0", () => {
    const { preview: p, payload } = planLazadaCreate({ ...base, parent: parent(), skus, draft: { title: null, description: null, category_path: null, image_keys: null, extra: { lazada_attrs: { material: "เรซิน" } }, platform_product_id: null } });
    expect(p.dims).toHaveLength(1);
    expect(p.dims[0]).toMatchObject({ key: "color", lazName: "color_family", customize: false, hasImage: true });
    expect(p.variants.map((v) => [v.code, v.price, v.special])).toEqual([["IG-PROP001-01", 299, 199], ["IG-PROP001-02", 199, null], ["IG-PROP001-04", 329, 229]]);
    expect(p.missing).toEqual([]);
    const prod = (payload.Request as { Product: Record<string, any> }).Product;
    expect(prod.PrimaryCategory).toBe("10100451");
    expect(prod.variation.variation1).toEqual({ name: "color_family", hasImage: true, customize: false, options: { option: ["สีทอง", "สีชมพู", "สีทอง (47×22.5×2)"] } });
    expect(prod.Skus.Sku[0]).toMatchObject({ SellerSku: "IG-PROP001-01", quantity: "0", price: "299", special_price: "199", package_weight: "0.4", package_length: "40", saleProp: { color_family: "สีทอง" } });
    expect(prod.Skus.Sku[1].special_price).toBeUndefined();
    expect(prod.Attributes).toMatchObject({ name: "IG International พร็อพถาดกระจก IG-PROP001", brand: "No Brand", material: "Resin" });
    expect(prod.Images.Image[0]).toBe("r2:img/IG-PROP001-01.jpg");
  });
  it("ขาดน้ำหนัก/กล่อง/ช่องบังคับ/หมวด = บอกเป็นข้อ", () => {
    const { preview: p } = planLazadaCreate({ ...base, mappedCategory: null, parent: parent({ weight_g: 0, box: null }), skus });
    expect(p.missing).toEqual(expect.arrayContaining(["หมวด Lazada", "น้ำหนักพัสดุ", "ขนาดกล่องพัสดุ"]));
    expect(p.missing.some((m) => m.startsWith("ข้อมูลเฉพาะของหมวด 1 ช่อง (วัสดุ)"))).toBe(true);
  });
});

describe("ชั้นตัวเลือก", () => {
  it("SKU เดียว = ไม่มีชั้น ไม่มี saleProp", () => {
    const { preview: p, payload } = planLazadaCreate({ ...base, parent: parent(), skus: [sku("A-01", "ดำ", 100)] });
    expect(p.dims).toEqual([]);
    const prod = (payload.Request as { Product: Record<string, any> }).Product;
    expect(prod.variation).toBeUndefined(); expect(prod.Skus.Sku[0].saleProp).toBeUndefined();
  });
  it("หมวดไม่มีช่องสี = ชั้นกำหนดเอง ชื่อ 'สี' · ไม่มีสี/ตัวเลือก = ใช้รหัส", () => {
    const noStd = [def({ name: "material", label: "วัสดุ" })];
    const a = planLazadaCreate({ ...base, attrDefs: noStd, parent: parent(), skus: [sku("A-01", "ดำ", 100), sku("A-02", "ขาว", 100)] }).preview;
    expect(a.dims[0]).toMatchObject({ lazName: "สี", customize: true });
    const b = planLazadaCreate({ ...base, attrDefs: noStd, parent: parent(), skus: [sku("B-01", "", 100), sku("B-02", "", 100)] }).preview;
    expect(b.dims[0]).toMatchObject({ key: "code", lazName: "แบบ", values: ["B-01", "B-02"] });
  });
  it("ตัวเลือกที่ 2 ชื่อไซส์ → ช่อง size ของหมวด · ชั้นที่ 2 ไม่มีรูป", () => {
    const vo = (v: string) => ({ variant_option: { name: "ไซส์", value: v } });
    const { preview: p } = planLazadaCreate({ ...base, parent: parent(), skus: [sku("C-01S", "ดำ", 100, null, { attribute_values: vo("S") }), sku("C-01M", "ดำ", 100, null, { attribute_values: vo("M") })] });
    expect(p.dims.map((x) => [x.lazName, x.customize])).toEqual([["color_family", false], ["size", false]]);
    expect(p.variants[1].saleProp).toEqual({ color_family: "ดำ", size: "M" });
  });
  it("ค่าซ้ำกัน / ค่ายาวเกิน 20 ตัวอักษร = ขาด", () => {
    const dup = planLazadaCreate({ ...base, parent: parent(), skus: [sku("D-01", "ดำ", 100), sku("D-02", "ดำ", 100)] }).preview;
    expect(dup.missing.some((m) => m.startsWith("ตัวเลือกซ้ำกัน"))).toBe(true);
    const long = planLazadaCreate({ ...base, parent: parent(), skus: [sku("E-01", "สีน้ำตาลเข้มแบบด้านพิเศษสุด", 100), sku("E-02", "ดำ", 100)] }).preview;
    expect(long.missing.some((m) => m.includes("เกิน 20 ตัวอักษร"))).toBe(true);
  });
  it("ตั้งชั้นเองในร่าง (extra.lazada_variation) ทับค่าที่ระบบเลือก", () => {
    const { preview: p } = planLazadaCreate({ ...base, parent: parent(), skus: [sku("F-01", "ดำ", 100), sku("F-02", "ขาว", 100)], draft: { title: null, description: null, category_path: null, image_keys: null, extra: { lazada_variation: { color: { name: "ลาย", customize: true } } }, platform_product_id: null } });
    expect(p.dims[0]).toMatchObject({ lazName: "ลาย", customize: true, src: "ตั้งไว้สำหรับ Lazada" });
  });
  it("ตัวสี/ตัวขาย: ส่งเฉพาะตัวขาย · ราคาสืบทอดจากตัวสี · ปิด/ไม่ขาย ไม่ส่ง", () => {
    const { preview: p } = planLazadaCreate({ ...base, parent: parent(), skus: [sku("WK42-01", "ดำ", 430, 690), sku("WK42-01D", "ดำ", null, null, { cover_image_r2_key: null }), sku("WK42-01N", "ดำ", null), sku("WK42-02D", "ขาว", 100, null, { sale_ok: false })] });
    expect(p.variants.map((v) => [v.code, v.price, v.special])).toEqual([["WK42-01D", 690, 430], ["WK42-01N", 690, 430]]);
  });
});

describe("ของช่วย", () => {
  it("รูปที่ต้องฝาก = ที่ยังไม่ใช่ลิงก์ Lazada · แทนลิงก์ทุกจุด", () => {
    const payload = { Request: { Product: { Images: { Image: ["r2:a", "https://th-live-01.slatic.net/p/x.jpg", "https://obs.line-scdn.net/y"] }, Skus: { Sku: [{ Images: { Image: ["r2:a"] } }, { SellerSku: "z" }] } } } };
    expect(lazCreateImageRefs(payload)).toEqual(["r2:a", "https://obs.line-scdn.net/y"]);
    const fixed = lazCreateResolveImages(payload, new Map([["r2:a", "https://th-live-01.slatic.net/p/a.jpg"], ["https://obs.line-scdn.net/y", "https://th-live-01.slatic.net/p/y.jpg"]])) as any;
    expect(fixed.Request.Product.Images.Image).toEqual(["https://th-live-01.slatic.net/p/a.jpg", "https://th-live-01.slatic.net/p/x.jpg", "https://th-live-01.slatic.net/p/y.jpg"]);
    expect(fixed.Request.Product.Skus.Sku[0].Images.Image).toEqual(["https://th-live-01.slatic.net/p/a.jpg"]);
    expect((payload.Request.Product.Images.Image as string[])[0]).toBe("r2:a");   // ของเดิมไม่ถูกแก้
  });
  it("รายละเอียด: ข้อความ → ย่อหน้า · ตัดรูปนอก Lazada", () => {
    expect(lazDescriptionHtml("บรรทัด 1\nบรรทัด 2")).toContain("<p>บรรทัด 1</p>");
    expect(lazDescriptionHtml('<p>a<img src="https://x.com/1.jpg"><img src="https://th-live-01.slatic.net/p/2.jpg"></p>')).toBe('<p>a<img src="https://th-live-01.slatic.net/p/2.jpg"></p>');
  });
  it("lazCategoryIdOf / isLazadaImage", () => {
    expect(lazCategoryIdOf("10100451 · พร็อพ")).toBe("10100451"); expect(lazCategoryIdOf("")).toBeNull();
    expect(isLazadaImage("https://th-live-01.slatic.net/p/x.jpg")).toBe(true); expect(isLazadaImage("r2:a")).toBe(false);
  });
});

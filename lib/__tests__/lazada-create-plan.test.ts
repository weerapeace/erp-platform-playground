import { describe, expect, it } from "vitest";
import { planLazadaCreate, pickListingDescription, lazCreateImageRefs, lazCreateResolveImages, lazDescriptionHtml, lazCategoryIdOf, isLazadaImage, type LazCreateSku, type LazCreateParent } from "@/lib/lazada-create-plan";
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

describe("รูปตัวเลือก — ส่งรูปทั้งหมดของ SKU (≤ 8)", () => {
  const draftWith = (extra: Record<string, unknown>) => ({ title: null, description: null, category_path: null, image_keys: null, extra, platform_product_id: null });
  const skuImgs = (pv: { variants: { code: string; image_refs: string[] }[] }) => Object.fromEntries(pv.variants.map((v) => [v.code, v.image_refs]));
  it("ปกก่อน แล้วรูปแกลเลอรีของ SKU ตามลำดับ (ไม่ซ้ำ) · payload ส่งครบทุกรูป", () => {
    const { preview: p, payload } = planLazadaCreate({ ...base, parent: parent(), skus: [
      sku("B-01", "แดง", 100, null, { gallery_keys: ["img/B-01.jpg", "g/B-01-2.jpg", "g/B-01-3.jpg"] }),
      sku("B-02", "ฟ้า", 100, null, { gallery_keys: ["g/B-02-2.jpg"] }),
    ] });
    expect(skuImgs(p)).toEqual({ "B-01": ["r2:img/B-01.jpg", "r2:g/B-01-2.jpg", "r2:g/B-01-3.jpg"], "B-02": ["r2:img/B-02.jpg", "r2:g/B-02-2.jpg"] });
    expect(p.variants[0]).toMatchObject({ image_ref: "r2:img/B-01.jpg", images_custom: false, group: "แดง" });
    const prod = (payload.Request as { Product: Record<string, any> }).Product;
    expect(prod.Skus.Sku[0].Images).toEqual({ Image: ["r2:img/B-01.jpg", "r2:g/B-01-2.jpg", "r2:g/B-01-3.jpg"] });
    expect(lazCreateImageRefs(payload)).toEqual(expect.arrayContaining(["r2:g/B-01-3.jpg", "r2:g/B-02-2.jpg"]));
  });
  it("เกิน 8 รูป = ส่ง 8 รูปแรก + เตือน · image_pool เก็บครบให้เลือก", () => {
    const many = Array.from({ length: 11 }, (_, i) => `g/M-${i}.jpg`);
    const { preview: p } = planLazadaCreate({ ...base, parent: parent(), skus: [sku("M-01", "แดง", 100, null, { gallery_keys: many }), sku("M-02", "ฟ้า", 100)] });
    expect(p.variants[0].image_refs).toHaveLength(8);
    expect(p.variants[0].image_pool).toHaveLength(12);
    expect(p.warnings.some((w) => w.includes("เกิน 8 รูป"))).toBe(true);
  });
  it("สีเดียวกันหลายไซซ์ = รูปชุดเดียวกัน (รวมรูปตัวสี + ของแต่ละไซซ์)", () => {
    const vo = (v: string) => ({ variant_option: { name: "ไซส์", value: v } });
    const { preview: p } = planLazadaCreate({ ...base, parent: parent(), skus: [
      sku("C-01", "ดำ", 100, null, { gallery_keys: ["g/C-01-a.jpg"] }),
      sku("C-01S", "ดำ", null, null, { cover_image_r2_key: null, attribute_values: vo("S"), gallery_keys: ["g/C-01S.jpg"] }),
      sku("C-01M", "ดำ", null, null, { cover_image_r2_key: null, attribute_values: vo("M") }),
    ] });
    expect(p.variants.map((v) => v.code)).toEqual(["C-01S", "C-01M"]);
    expect(p.variants[0].image_refs).toEqual(["r2:img/C-01.jpg", "r2:g/C-01S.jpg", "r2:g/C-01-a.jpg"]);
    expect(p.variants[1].image_refs).toEqual(p.variants[0].image_refs);
    expect(p.dims[0].hasImage).toBe(true);
  });
  it("เลือกเองในร่าง (extra.lazada_sku_images) ใช้ทั้งกลุ่ม · ตัวอื่นยังอัตโนมัติ", () => {
    const { preview: p } = planLazadaCreate({ ...base, parent: parent(), draft: draftWith({ lazada_sku_images: { "B-01": ["r2:g/B-01-3.jpg", "r2:img/B-01.jpg", "", "r2:g/B-01-3.jpg"] } }), skus: [
      sku("B-01", "แดง", 100, null, { gallery_keys: ["g/B-01-2.jpg", "g/B-01-3.jpg"] }),
      sku("B-02", "ฟ้า", 100),
    ] });
    expect(p.variants[0]).toMatchObject({ image_refs: ["r2:g/B-01-3.jpg", "r2:img/B-01.jpg"], images_custom: true });
    expect(p.variants[1]).toMatchObject({ image_refs: ["r2:img/B-02.jpg"], images_custom: false });
  });
  it("ชั้นแรกเป็นไซซ์ = ไม่ส่งรูปตัวเลือก (Lazada ไม่รับ)", () => {
    const { preview: p, payload } = planLazadaCreate({ ...base, parent: parent(), draft: draftWith({ lazada_variation: { color: { name: "size", customize: false } } }), skus: [sku("S-01", "S", 100, null, { gallery_keys: ["g/S-01.jpg"] }), sku("S-02", "M", 100)] });
    expect(p.dims[0].hasImage).toBe(false);
    expect((payload.Request as { Product: Record<string, any> }).Product.Skus.Sku[0].Images).toBeUndefined();
  });
});

describe("รอบ LY22 — เหมือน Shopee", () => {
  const draftWith = (extra: Record<string, unknown>) => ({ title: null, description: null, category_path: null, image_keys: null, extra, platform_product_id: null });
  it("ชื่อสี = Color Platform [TH] · แก้ราคา/ชื่อสีในร่าง (ราคาลดยังเป็นราคาขายถ้าต่ำกว่า)", () => {
    const skus = [sku("L-01", "ดำ", 490, 590, { color_platform_th: "ดำ (01)" }), sku("L-02", "ขาว", 490, 590, { color_platform_th: "ขาว (02)" })];
    const a = planLazadaCreate({ ...base, parent: parent(), skus }).preview;
    expect(a.dims[0].values).toEqual(["ดำ (01)", "ขาว (02)"]);
    expect(a.colorChoices).toEqual(["ดำ (01)", "ดำ", "ขาว (02)", "ขาว"]);
    const { preview: b, payload } = planLazadaCreate({ ...base, parent: parent(), skus, draft: draftWith({ lazada_prices: { "s-L-02": 650 }, lazada_option_names: { "s-L-01": "ดำด้าน" } }) });
    expect(b.dims[0].values).toEqual(["ดำด้าน", "ขาว (02)"]);
    expect(b.variants[1]).toMatchObject({ price: 650, special: 490, price_base: 590, price_custom: true });
    expect(b.variants[0]).toMatchObject({ color_custom: true, color_base: "ดำ (01)", price_custom: false });
    const prod = (payload.Request as { Product: Record<string, any> }).Product;
    expect(prod.Skus.Sku[1]).toMatchObject({ price: "650", special_price: "490", saleProp: { color_family: "ขาว (02)" } });
  });
  it("ช่องของหมวด: ร่าง → ค่าเริ่มต้นของร้าน/สินค้า → ที่เดาไว้ · ไม่มีรับประกัน = No Warranty", () => {
    const d2: LazadaAttrDef[] = [
      ...defs,
      def({ name: "condition", label: "Condition", input_type: "singleSelect", choices: [{ name: "New", en: "New" }, { name: "Used", en: "Used" }] }),
      def({ name: "warranty_type", label: "Warranty Type", input_type: "singleSelect", choices: [{ name: "Warranty by Seller", en: "Warranty by Seller" }, { name: "No Warranty", en: "No Warranty" }] }),
      def({ name: "warranty", label: "Warranty Period", input_type: "singleSelect", choices: [{ name: "1 Month", en: "1 Month" }, { name: "No Warranty", en: "No Warranty" }] }),
      def({ name: "style", label: "Style", input_type: "singleSelect", choices: [{ name: "Korean", en: "Korean" }] }),
    ];
    const guess = { at: "2026-11-20T10:00:00Z", ai: true, values: { style: "Korean", material: "Resin", condition: "Used" } };
    const { preview: p, payload } = planLazadaCreate({ ...base, attrDefs: d2, parent: parent({ warranty: "ไม่มีรับประกัน" }), skus: [sku("A-01", "ดำ", 100)], draft: draftWith({ lazada_attr_guess: guess }) });
    expect(p.attrs.values).toMatchObject({ condition: "New", warranty_type: "No Warranty", warranty: "No Warranty", style: "Korean", material: "Resin" });
    expect(p.attrs.sources).toMatchObject({ condition: "default", warranty_type: "default", warranty: "product", style: "ai", material: "ai" });
    expect(p.attrs.guess).toEqual({ at: "2026-11-20T10:00:00Z", ai: true });
    expect(p.attrs.missingRequired).toEqual([]);   // วัสดุ (บังคับ) ได้จากที่ AI เดา · Brand ไม่ใช่ช่องที่แก้ได้
    const withWarr = planLazadaCreate({ ...base, attrDefs: d2, parent: parent({ warranty: "1 เดือน" }), skus: [sku("A-01", "ดำ", 100)], draft: draftWith({ lazada_attrs: { material: "เรซิน" } }) }).preview;
    expect(withWarr.attrs.values).toMatchObject({ warranty_type: "Warranty by Seller", warranty: "1 Month", material: "เรซิน" });
    expect(withWarr.attrs.sources.material).toBe("draft");
    expect((payload.Request as { Product: Record<string, any> }).Product.Attributes).toMatchObject({ condition: "New", style: "Korean" });
  });
  it("รูปในรายละเอียด: อัตโนมัติ = รูปสินค้าทั้งหมดต่อท้าย · เลือกเอง/ไม่ใส่ · ฝากรูปแล้วแทนลิงก์ในรายละเอียด", () => {
    const skus = [sku("D-01", "ดำ", 100), sku("D-02", "ขาว", 100)];
    const { preview: p, payload } = planLazadaCreate({ ...base, parent: parent(), skus, galleryKeys: ["g/1.jpg"] });
    expect(p.descImages).toMatchObject({ refs: ["r2:g/1.jpg", "r2:img/D-01.jpg", "r2:img/D-02.jpg"], custom: false }); // ลำดับเดียวกับหน้า Parent SKU: รูปของสินค้า (แกลเลอรี) ก่อน แล้วปกตัวสี (เจ้าของบอก 2026-11-21 · lib/listing-defaults)
    const desc = (payload.Request as { Product: Record<string, any> }).Product.Attributes.description as string;
    expect(desc).toContain('<img src="r2:g/1.jpg" />');
    expect(p.description.value).not.toContain("<img");
    expect(lazCreateImageRefs(payload)).toEqual(expect.arrayContaining(["r2:g/1.jpg"]));
    const fixed = lazCreateResolveImages(payload, new Map([["r2:g/1.jpg", "https://th-live-01.slatic.net/p/g1.jpg"]])) as any;
    expect(fixed.Request.Product.Attributes.description).toContain('<img src="https://th-live-01.slatic.net/p/g1.jpg" />');
    const none = planLazadaCreate({ ...base, parent: parent(), skus, galleryKeys: ["g/1.jpg"], draft: draftWith({ lazada_desc_images: [] }) });
    expect(none.preview.descImages).toMatchObject({ refs: [], custom: true });
    expect((none.payload.Request as { Product: Record<string, any> }).Product.Attributes.description).not.toContain("<img");
    const picked = planLazadaCreate({ ...base, parent: parent(), skus, draft: draftWith({ lazada_desc_images: ["r2:g/9.jpg"] }) }).preview;
    expect(picked.descImages.refs).toEqual(["r2:g/9.jpg"]);
  });
});

describe("ชื่อจากร่างที่เป็นสำเนาชื่อเก่า (เจอ 2026-11-21 LY22)", () => {
  it("ร่างเก็บชื่อเก่า (อยู่ในประวัติ) = ใช้ชื่อล่าสุด · ร่างที่แก้เอง = ใช้ร่าง", () => {
    const pr = parent({ name_platform: null, name_th: "กระเป๋า พร้อมพวงกุญแจ LY22", name_history: ["กระเป๋าถือผู้หญิง LY22"] });
    const old = planLazadaCreate({ ...base, parent: pr, skus: [sku("A-01", "ดำ", 100)], draft: { title: "กระเป๋าถือผู้หญิง  LY22", description: null, category_path: null, image_keys: null, extra: {}, platform_product_id: null } }).preview;
    expect(old.name.value).toBe("กระเป๋า พร้อมพวงกุญแจ LY22");
    const own = planLazadaCreate({ ...base, parent: pr, skus: [sku("A-01", "ดำ", 100)], draft: { title: "ตั้งชื่อเองสำหรับ Lazada", description: null, category_path: null, image_keys: null, extra: {}, platform_product_id: null } }).preview;
    expect(own.name).toEqual({ value: "ตั้งชื่อเองสำหรับ Lazada", src: "แก้ไว้สำหรับ Lazada" });
  });
});

describe("รายละเอียดจาก Parent SKU (เจ้าของบอก 2026-11-20)", () => {
  const draftWith = (extra: Record<string, unknown>, description: string | null = null) => ({ title: null, description, category_path: null, image_keys: null, extra, platform_product_id: null });
  it("Platform Description สด มาก่อนคอลัมน์เก่า · ร่างที่เป็นสำเนาคอลัมน์เก่า = ไม่นับ · ร่างที่แก้เอง = ใช้", () => {
    const pr = parent({ platform_description: "ข้อความเก่า Larkspur", platform_description_live: "Fleur De Juillet ใหม่\n- วัสดุ: PU" });
    expect(pickListingDescription("ข้อความเก่า  Larkspur", pr, "Lazada")).toEqual({ text: "Fleur De Juillet ใหม่\n- วัสดุ: PU", src: "Platform Description ของ Parent SKU" });
    expect(pickListingDescription("พิมพ์เองสำหรับร้าน", pr, "Lazada")).toEqual({ text: "พิมพ์เองสำหรับร้าน", src: "แก้ไว้สำหรับ Lazada" });
    expect(pickListingDescription("", parent({ platform_description: "เก่า", platform_description_live: null }), "Shopee").src).toBe("รายละเอียดสำหรับแพลตฟอร์ม (ค่าที่เก็บไว้)");
    const { preview: p } = planLazadaCreate({ ...base, parent: pr, skus: [sku("A-01", "ดำ", 100)], draft: draftWith({}, "ข้อความเก่า Larkspur") });
    expect(p.description.value).toContain("Fleur De Juillet ใหม่");
    expect(p.description.src).toBe("Platform Description ของ Parent SKU");
  });
  it("รูปในรายละเอียดอัตโนมัติ = รูป Description ของ Parent SKU (ไม่มี = รูปสินค้า)", () => {
    const { preview: p } = planLazadaCreate({ ...base, parent: parent({ desc_image_keys: ["library/1.jpeg", "library/2.jpeg"] }), skus: [sku("A-01", "ดำ", 100)], galleryKeys: ["g/1.jpg"] });
    expect(p.descImages).toMatchObject({ refs: ["r2:library/1.jpeg", "r2:library/2.jpeg"], custom: false, src: "รูป Description ของ Parent SKU (2 รูป)" });
    const none = planLazadaCreate({ ...base, parent: parent(), skus: [sku("A-01", "ดำ", 100)], galleryKeys: ["g/1.jpg"] }).preview;
    expect(none.descImages.src).toBe("รูปสินค้าทั้งหมด (สินค้านี้ยังไม่มีรูป Description)");
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

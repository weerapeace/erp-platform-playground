import { describe, it, expect } from "vitest";
import { baseColor, buildSizeGrid, cleanVariantOff, sortSizeLabels, colorAllOff } from "../website-size-options";
import { normalizeFieldMap, resolveProduct, skuUnitPrice, type ChildSku, type ParentRow } from "../website-field-map";
import { pickSku } from "../website-orders";

/**
 * 📐 ตัวเลือกชุดที่ 2 (ไซส์) — กันบั๊กที่ลูกค้าจะได้ของผิดตัว:
 *  - ไซส์เรียง S < M < L (เดิมเรียงตามรหัส = L, M, S)
 *  - สีของ SKU ไซส์ที่พิมพ์ "/L" ติดท้าย (ข้อมูลจริง MGN191/193) ต้องนับเป็นสีเดียวกัน ไม่งั้นจุดสีงอก
 *  - คู่ สี×ไซส์ ที่ไม่มี/ปิดไว้ → เว็บรู้ (colors) + ออเดอร์ไม่รับ (ไม่ตกไปใช้ SKU ตัวหลักเงียบ ๆ)
 */
const vo = (value: string, name = "ไซส์") => ({ variant_option: { code: value, name, value } });
const kid = (id: string, code: string, color: string, size?: string): ChildSku => ({
  id,
  code,
  color,
  list_price: 750,
  cover_image_r2_key: size ? null : `img/${code}.jpg`,
  attribute_values: size ? vo(size) : {},
});

// ดำ: S M L · น้ำตาล: S M (ไม่มี L) · เทา: ไม่มีไซส์เลย · ชื่อสีของ SKU ไซส์บางตัวมี "/L" ติดท้าย
const ID = (n: number) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;
const kids: ChildSku[] = [
  kid(ID(1), "B-01", "ดำ"),
  kid(ID(2), "B-01L", "ดำ/L", "L"),
  kid(ID(3), "B-01M", "ดำ", "M"),
  kid(ID(4), "B-01S", "ดำ / S", "S"),
  kid(ID(5), "B-02", "น้ำตาล"),
  kid(ID(6), "B-02M", "น้ำตาล", "M"),
  kid(ID(7), "B-02S", "น้ำตาล", "S"),
  kid(ID(8), "B-03", "เทา"),
];

describe("website-size-options", () => {
  it("เรียงไซส์: S < M < L < XL · ตัวเลขน้อยไปมาก · ที่เหลือคงลำดับเดิม", () => {
    expect(sortSizeLabels(["L", "M", "S", "XL"])).toEqual(["S", "M", "L", "XL"]);
    expect(sortSizeLabels(["3.85 mm.", "2.7 mm.", "3 mm."])).toEqual(["2.7 mm.", "3 mm.", "3.85 mm."]);
    expect(sortSizeLabels(["ฟอยล์ทอง", "พิมพ์จม", "ฟอยล์เงิน"])).toEqual(["ฟอยล์ทอง", "พิมพ์จม", "ฟอยล์เงิน"]);
    expect(sortSizeLabels(["xxl", "Free Size", "s"])).toEqual(["s", "xxl", "Free Size"]);
  });

  it('baseColor ตัด "/L" ท้ายเฉพาะเมื่อตรงกับไซส์ของ SKU นั้น', () => {
    expect(baseColor(kids[1])).toBe("ดำ");
    expect(baseColor(kids[3])).toBe("ดำ");
    expect(baseColor(kid(ID(9), "X", "Black/Smooth Leather/L", "L"))).toBe("Black/Smooth Leather");
    // ไม่มีไซส์ = ชื่อเดิม (สีผสม "ดำ/น้ำตาล" ต้องไม่โดนตัด)
    expect(baseColor(kid(ID(9), "X", "ดำ/น้ำตาล"))).toBe("ดำ/น้ำตาล");
  });

  it("ตาราง สี×ไซส์: สีที่ไม่มีไซส์ = free · คู่ที่ไม่มี = ไม่มีช่อง · ปิดได้รายคู่", () => {
    const g = buildSizeGrid(kids, new Set([ID(6)]))!;
    expect(g.name).toBe("ไซส์");
    expect(g.sizes).toEqual(["S", "M", "L"]);
    expect(g.colors.map((c) => c.label)).toEqual(["ดำ", "น้ำตาล", "เทา"]);
    expect(Object.keys(g.colors[0].cells).sort()).toEqual(["L", "M", "S"]);
    expect(g.colors[1].cells.L).toBeUndefined();
    expect(g.colors[1].cells.M.off).toBe(true);
    expect(g.colors[2].free).toBe(true);
    expect(colorAllOff(g.colors[1])).toBe(false);
    expect(buildSizeGrid([kid(ID(1), "A", "ดำ")])).toBeNull();
  });

  it("cleanVariantOff รับเฉพาะ uuid ไม่ซ้ำ", () => {
    expect(cleanVariantOff([ID(1), ID(1).toUpperCase(), "x", 5, null])).toEqual([ID(1)]);
    expect(cleanVariantOff("abc")).toEqual([]);
  });
});

describe("resolveProduct + ไซส์", () => {
  const map = normalizeFieldMap({ options: { source: "sku_color", label: "สี" }, options2: { source: "variant_option", label: "ตัวเลือกที่ 2" } });
  const parent = { id: "p", code: "B", name_th: "เข็มขัด" } as ParentRow;

  it("ไซส์เรียงถูก + บอกว่าสีไหนมีไซส์ไหน + สีที่ไม่มีไซส์ = free · ชื่อชุดจาก SKU ชนะ", () => {
    const r = resolveProduct(map, parent, kids, null, null);
    expect(r.options?.items.map((i) => i.label)).toEqual(["ดำ", "น้ำตาล", "เทา"]);
    const black = r.options!.items[0].id;
    const brown = r.options!.items[1].id;
    const grey = r.options!.items[2].id;
    expect(r.options2?.label).toBe("ไซส์");
    expect(r.options2?.items.map((i) => [i.label, i.colors])).toEqual([
      ["S", [black, brown]],
      ["M", [black, brown]],
      ["L", [black]],
    ]);
    expect(r.options2?.free).toEqual([grey]);
  });

  it("ปิดไซส์ครบทุกคู่ของสี = สีนั้นไม่ขึ้นเว็บ · ไซส์ที่ปิดทุกสี = ไม่โชว์", () => {
    const r = resolveProduct(map, parent, kids, { web_variant_off: [ID(6), ID(7), ID(2)] }, null);
    expect(r.options?.items.map((i) => i.label)).toEqual(["ดำ", "เทา"]);
    expect(r.options2?.items.map((i) => i.label)).toEqual(["S", "M"]);
  });

  it("ร้านไม่ได้เปิดตัวเลือกชุดที่ 2 = แบบเดิม (ไม่มี options2)", () => {
    const off = normalizeFieldMap({ options: { source: "sku_color", label: "สี" } });
    expect(resolveProduct(off, parent, kids, null, null).options2).toBeNull();
  });
});

describe("pickSku + ไซส์ (ออเดอร์)", () => {
  const opt = (id: string) => `sku-${id.slice(0, 8)}`;
  const opt2 = (id: string) => `opt2-${id.slice(0, 8)}`;
  const strict = { requireOption2: true, label2: "ไซส์" };

  it("สี + ไซส์ที่มีจริง → ได้ SKU ไซส์นั้น", () => {
    expect(pickSku(kids, opt(ID(1)), opt2(ID(3)), strict)).toMatchObject({ sku: { code: "B-01M" }, variantLabel: "ดำ / M" });
    // รหัสไซส์อ้าง SKU สีอื่นที่ไซส์เดียวกัน → ยังได้ตัวของสีที่เลือก
    expect(pickSku(kids, opt(ID(5)), opt2(ID(4)), strict)).toMatchObject({ sku: { code: "B-02S" }, variantLabel: "น้ำตาล / S" });
  });

  it("ไม่เลือกไซส์ / คู่ที่ไม่มี / คู่ที่ปิด → error (ไม่ตกไปใช้ SKU ตัวหลัก)", () => {
    expect(pickSku(kids, opt(ID(1)), undefined, strict)).toMatchObject({ sku: null, error: "กรุณาเลือกไซส์" });
    expect(pickSku(kids, opt(ID(5)), opt2(ID(2)), strict)).toMatchObject({ sku: null, error: "ไซส์ L ไม่มีในสี น้ำตาล" });
    expect(pickSku(kids, opt(ID(5)), opt2(ID(6)), { ...strict, off: new Set([ID(6)]) })).toMatchObject({ sku: null });
  });

  it("สีที่ไม่มีไซส์ → ขายตัวหลักได้เลย", () => {
    expect(pickSku(kids, opt(ID(8)), undefined, strict)).toMatchObject({ sku: { code: "B-03" }, variantLabel: "เทา" });
  });
});

/**
 * 💰 ราคาตาม SKU ที่ลูกค้าเลือก — หน้าเว็บ (variantPrices) กับออเดอร์ (skuUnitPrice + pickSku) ต้องได้ราคาเดียวกัน
 * แบบข้อมูลจริง: PI338 (IG) จำนวนรู × ขนาดรู ราคา 65–95 · PIX01 (Pixiedustie) สีเดียวกันมี 2 SKU 490/550
 */
describe("ราคาต่อ SKU", () => {
  const map = normalizeFieldMap({ price: { source: "sku_max" }, options: { source: "sku_color", label: "จำนวนรู" }, options2: { source: "variant_option" } });
  const parent = { id: "p", code: "PI338", name_th: "เครื่องเจาะ", fake_price: 0 } as ParentRow;
  const pk = (n: number, code: string, holes: string, size: string, price: number): ChildSku => ({
    id: ID(n), code, color: holes, list_price: price, cover_image_r2_key: null, attribute_values: vo(size, "ขนาดรู"),
  });
  const pi = [pk(1, "PI2.7-2", "2 รู", "2.7 mm.", 75), pk(2, "PI3-2", "2 รู", "3 mm.", 75), pk(3, "PI2.7-10", "10 รู", "2.7 mm.", 65), pk(4, "PI3-10", "10 รู", "3 mm.", 95)];

  it("PI338: ราคาโชว์ = ต่ำสุด (เริ่มต้น) · ราคาต่อคู่ตรงกับ SKU · ออเดอร์คิดราคาเดียวกัน", () => {
    const r = resolveProduct(map, parent, pi, null, null);
    expect(r.price).toBe(65);
    expect(r.priceVaries).toBe(true);
    const two = r.options!.items.find((i) => i.label === "2 รู")!.id;
    const ten = r.options!.items.find((i) => i.label === "10 รู")!.id;
    const s27 = r.options2!.items.find((i) => i.label === "2.7 mm.")!.id;
    const s3 = r.options2!.items.find((i) => i.label === "3 mm.")!.id;
    expect(r.variantPrices).toEqual({ [`${two}|${s27}`]: { price: 75 }, [`${two}|${s3}`]: { price: 75 }, [`${ten}|${s27}`]: { price: 65 }, [`${ten}|${s3}`]: { price: 95 } });
    // ออเดอร์: 10 รู + 3 mm. → PI3-10 ราคา 95 (เดิมคิดราคารุ่นทุกตัว)
    const picked = pickSku(pi, ten, s3, { requireOption2: true });
    expect(picked.sku?.code).toBe("PI3-10");
    expect(skuUnitPrice(map, null, picked.sku, r.price)).toBe(95);
    expect(skuUnitPrice(map, null, pickSku(pi, ten, s27, { requireOption2: true }).sku, r.price)).toBe(65);
  });

  it("PIX01: สีเดียวกัน 2 SKU (490/550) → เว็บและออเดอร์ใช้ SKU ที่ตัวเลือกอ้าง = 490 ทุกสี (ไม่ใช่ราคาสูงสุด 550)", () => {
    const m1 = normalizeFieldMap({ price: { source: "sku_max" }, options: { source: "sku_color" } });
    const kidsPix: ChildSku[] = [
      { id: ID(11), code: "PIX01-01", color: "ดำ", list_price: 490, cover_image_r2_key: null },
      { id: ID(12), code: "PIX01-01/1", color: "ดำ", list_price: 550, cover_image_r2_key: null },
      { id: ID(13), code: "PIX01-02", color: "ขาว", list_price: 490, cover_image_r2_key: null },
    ];
    const r = resolveProduct(m1, parent, [kidsPix[1], kidsPix[0], kidsPix[2]], null, null);
    expect(r.price).toBe(490);
    expect(r.priceVaries).toBe(false);
    expect(r.variantPrices).toBeUndefined();
    // DB คืน SKU 550 มาก่อน → ออเดอร์ต้องยังได้ PIX01-01 (ตัวที่รหัสตัวเลือกอ้าง)
    const black = r.options!.items[0].id;
    const sku = pickSku([kidsPix[1], kidsPix[0], kidsPix[2]], black).sku;
    expect(sku?.code).toBe("PIX01-01");
    expect(skuUnitPrice(m1, null, sku, r.price)).toBe(490);
  });

  it("กรอกราคาเว็บทับ / ตัวเลือกกรอกเอง = ราคาเดียวทั้งรุ่น (ไม่คิดตาม SKU)", () => {
    const r = resolveProduct(map, parent, pi, { web_price: 80 }, null);
    expect(r.price).toBe(80);
    expect(r.variantPrices).toBeUndefined();
    expect(skuUnitPrice(map, { web_price: 80 }, pi[3], r.price)).toBe(80);
    const custom = { web_options: { label: "แบบ", items: [{ id: "a", label: "A" }] } };
    expect(skuUnitPrice(map, custom, pi[3], 70)).toBe(70);
  });

  it("ราคาขีดฆ่าต่อ SKU: fake_price ของ SKU ที่สูงกว่าราคาขาย", () => {
    const k = [{ ...pi[0], fake_price: 100 }, pi[1], pi[2], pi[3]];
    const r = resolveProduct(map, parent, k, null, null);
    const first = Object.entries(r.variantPrices!).find(([, v]) => v.compare)!;
    expect(first[1]).toEqual({ price: 75, compare: 100 });
  });
});

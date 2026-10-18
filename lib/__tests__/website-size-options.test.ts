import { describe, it, expect } from "vitest";
import { baseColor, buildSizeGrid, cleanVariantOff, sortSizeLabels, colorAllOff } from "../website-size-options";
import { normalizeFieldMap, resolveProduct, type ChildSku, type ParentRow } from "../website-field-map";
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

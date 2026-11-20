import { describe, expect, test } from "vitest";
import { applyAttrDefaults, attrDefaultVals, attrRulesOf, attrRuleValue, attrRuleValues, defaultAttrRules, DEFAULT_ATTR_RULES, isNoWarranty, listingAttrDefaultsKey, matchAttrRule, warrantyEn } from "@/lib/listing-attr-defaults";

const P = { warranty: "ไม่มีรับประกัน", size: { l: 20, w: 9, h: 16.5 }, weightKg: 0.45 };

describe("ค่าเริ่มต้นช่องคุณลักษณะต่อร้าน (ของกลาง)", () => {
  test("จับชื่อช่อง: ไม่สนวงเล็บ/ช่องว่าง · ลงท้าย * = ขึ้นต้นด้วย · ขนาด ไม่ไปโดน ขนาดกระเป๋า", () => {
    expect(matchAttrRule("ประเทศผู้ผลิต", DEFAULT_ATTR_RULES)?.value).toBe("ไทย");
    expect(matchAttrRule("ประเทศต้นกำเนิด", DEFAULT_ATTR_RULES)?.value).toBe("ไทย");
    expect(matchAttrRule("ขนาด (ยาว x กว้าง x สูง)", DEFAULT_ATTR_RULES)?.source).toBe("size");
    expect(matchAttrRule("ขนาดกระเป๋า", DEFAULT_ATTR_RULES)).toBeNull();
    expect(matchAttrRule("ระยะเวลารับประกัน", DEFAULT_ATTR_RULES)?.source).toBe("warranty");
    expect(matchAttrRule("วัสดุ", DEFAULT_ATTR_RULES)).toBeNull();
  });
  test("ค่าจากกติกา: ตายตัว / รับประกัน / ขนาด / น้ำหนัก · ไม่มีข้อมูล = null", () => {
    expect(attrRuleValue({ field: "x", source: "fixed", value: "ไทย" }, P)).toBe("ไทย");
    expect(attrRuleValue({ field: "x", source: "warranty" }, P)).toBe("ไม่มีรับประกัน");
    expect(attrRuleValue({ field: "x", source: "size" }, P)).toBe("20 x 9 x 16.5 ซม.");
    expect(attrRuleValue({ field: "x", source: "weight" }, P)).toBe("0.5 กก.");
    expect(attrRuleValue({ field: "x", source: "size" }, { ...P, size: { l: 20, w: null, h: 1 } })).toBeNull();
    expect(attrRuleValue({ field: "x", source: "warranty" }, { ...P, warranty: null })).toBeNull();
  });
  test("ใส่ลงช่อง: ตรงตัวเลือก / ใกล้เคียงตัวเดียว / พิมพ์เองเฉพาะช่องที่ให้ / เลือกอย่างเดียวแต่ไม่ตรง = ไม่ใส่", () => {
    const sel = { multiple: false, customizable: false, numeric: false, options: [{ id: "1", name: "ใหม่" }, { id: "2", name: "มือสอง" }] };
    expect(attrDefaultVals(sel, "ใหม่")).toEqual([{ id: "1", name: "ใหม่" }]);
    expect(attrDefaultVals(sel, "สภาพดี")).toBeNull();
    const warr = { multiple: false, customizable: false, numeric: false, options: [{ id: "9", name: "ประกันจากผู้ผลิต" }, { id: "8", name: "ไม่มีการรับประกัน" }] };
    expect(attrDefaultVals(warr, "ประกันจากผู้ผลิต")).toEqual([{ id: "9", name: "ประกันจากผู้ผลิต" }]);
    const free = { multiple: false, customizable: true, numeric: false, options: [] };
    expect(attrDefaultVals(free, "20 x 9 x 16.5 ซม.")).toEqual([{ name: "20 x 9 x 16.5 ซม." }]);
    const num = { multiple: false, customizable: true, numeric: true, options: [] };
    expect(attrDefaultVals(num, "0.5 กก.")).toEqual([{ name: "0.5" }]);
  });
  test("ค่าที่บันทึก: กันค่าแปลก · ไม่เคยตั้ง = null · key ต่อร้าน×แบรนด์", () => {
    expect(attrRulesOf(null)).toBeNull();
    expect(attrRulesOf({ rules: [{ field: "สภาพ", source: "fixed", value: "ใหม่" }, { field: "", source: "fixed" }, { field: "x", source: "bad" }, { field: "y", source: "fixed", value: "" }, { field: "ขนาด", source: "size", value: "ignored" }] }))
      .toEqual([{ field: "สภาพ", source: "fixed", value: "ใหม่" }, { field: "ขนาด", source: "size" }]);
    expect(attrRulesOf({ rules: [] })).toEqual([]);
    expect(listingAttrDefaultsKey("shopee", "b1")).toBe("listing_attr_defaults_shopee_b1");
  });
  test("ระยะประกันเป็นอังกฤษ + ไม่มีรับประกัน", () => {
    expect(warrantyEn("1 เดือน")).toBe("1 month");
    expect(warrantyEn("2 ปี")).toBe("2 years");
    expect(warrantyEn("ไม่มีรับประกัน")).toBe("No warranty");
    expect(warrantyEn("ตลอดชีพ")).toBe("Lifetime");
    expect(isNoWarranty("ไม่มีการรับประกัน")).toBe(true);
    expect(isNoWarranty("1 ปี")).toBe(false);
  });
  test("ไม่มีรับประกัน → ช่องประเภทการประกัน = ไม่มีประกัน (ทั้งไทยและอังกฤษ) · มีประกัน = ค่าที่ตั้ง", () => {
    const none = { ...P, warranty: "ไม่มีรับประกัน" };
    const thType = { multiple: false, customizable: false, numeric: false, options: [{ id: "1", name: "ประกันจากผู้ผลิต" }, { id: "2", name: "ไม่มีการรับประกัน" }] };
    expect(attrDefaultVals(thType, attrRuleValues(DEFAULT_ATTR_RULES[2], none))).toEqual([{ id: "2", name: "ไม่มีการรับประกัน" }]);
    expect(attrDefaultVals(thType, attrRuleValues(DEFAULT_ATTR_RULES[2], { ...P, warranty: "1 ปี" }))).toEqual([{ id: "1", name: "ประกันจากผู้ผลิต" }]);
    const laz = defaultAttrRules("lazada");
    const enType = { multiple: false, customizable: false, numeric: false, options: [{ id: "Warranty by Seller", name: "Warranty by Seller" }, { id: "No Warranty", name: "No Warranty" }] };
    expect(attrDefaultVals(enType, attrRuleValues(laz[1], none))).toEqual([{ id: "No Warranty", name: "No Warranty" }]);
  });
  test("Lazada: ระยะประกันไทย → ตัวเลือกอังกฤษ · นโยบายจากแม่แบบใส่ระยะให้ · จับชื่อจาก alt", () => {
    const laz = defaultAttrRules("lazada");
    const period = { multiple: false, customizable: false, numeric: false, options: [{ id: "a", name: "1 Month", alt: "1 Month" }, { id: "b", name: "2 Years" }, { id: "c", name: "No Warranty" }] };
    expect(attrDefaultVals(period, attrRuleValues(laz[2], { ...P, warranty: "1 เดือน" }))).toEqual([{ id: "a", name: "1 Month" }]);
    expect(attrDefaultVals(period, attrRuleValues(laz[2], { ...P, warranty: "2 ปี" }))).toEqual([{ id: "b", name: "2 Years" }]);
    expect(attrDefaultVals(period, attrRuleValues(laz[2], { ...P, warranty: "ไม่มีรับประกัน" }))).toEqual([{ id: "c", name: "No Warranty" }]);
    expect(attrRuleValue(laz[3], { ...P, warranty: "1 ปี" })).toContain("Warranty: 1 year.");
    const cond = { multiple: false, customizable: false, numeric: false, options: [{ id: "New", name: "ใหม่", alt: "New" }, { id: "Used", name: "มือสอง", alt: "Used" }] };
    expect(attrDefaultVals(cond, attrRuleValues(laz[0], P))).toEqual([{ id: "New", name: "ใหม่" }]);
  });
  test("applyAttrDefaults: เติมเฉพาะช่องว่าง + บอกที่มา", () => {
    const fields = [
      { id: "c", name: "Condition", multiple: false, customizable: false, numeric: false, options: [{ id: "New", name: "New" }] },
      { id: "w", name: "Warranty Period", multiple: false, customizable: true, numeric: false, options: [] },
      { id: "m", name: "Material", multiple: false, customizable: true, numeric: false, options: [] },
    ];
    const r = applyAttrDefaults(fields, { c: [{ id: "Used", name: "Used" }] }, defaultAttrRules("lazada"), P);
    expect(r.values).toEqual({ w: [{ name: "ไม่มีรับประกัน" }] });
    expect(r.sources).toEqual({ w: "product" });
  });
});

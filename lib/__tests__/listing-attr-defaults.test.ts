import { describe, expect, test } from "vitest";
import { attrDefaultVals, attrRulesOf, attrRuleValue, DEFAULT_ATTR_RULES, listingAttrDefaultsKey, matchAttrRule } from "@/lib/listing-attr-defaults";

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
});

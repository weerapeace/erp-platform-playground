import { describe, expect, test } from "vitest";
import { lazAttrFieldOf, lazAttrStateOf, lazAttrTextOf, lazAttrValuesOf } from "@/lib/lazada-attr-fields";
import type { LazadaAttrDef } from "@/lib/lazada-listing-edit";

const def = (over: Partial<LazadaAttrDef>): LazadaAttrDef => ({ name: "x", label: "x", required: false, input_type: "text", is_sale_prop: false, attribute_type: "normal", is_key_prop: false, options: [], choices: [], ...over });
const occasion = def({ name: "occasion", label: "Occasion", input_type: "multiSelect", choices: [{ name: "ลำลอง", en: "Casual" }, { name: "Dating", en: "Dating" }] });
const material = def({ name: "material", label: "Material", required: true, input_type: "enumInput", choices: [{ name: "PU Leather", en: "PU Leather" }] });

describe("ตัวแปลงช่อง Lazada ↔ รูปแบบกลาง", () => {
  test("ช่อง → รูปแบบกลาง: เลือกหลายค่า · ชื่อไทยมี alt อังกฤษ · ช่องพิมพ์เองได้", () => {
    expect(lazAttrFieldOf(occasion)).toMatchObject({ id: "occasion", name: "Occasion", multiple: true, customizable: false, options: [{ id: "Casual", name: "ลำลอง", alt: "Casual" }, { id: "Dating", name: "Dating" }] });
    expect(lazAttrFieldOf(material)).toMatchObject({ required: true, multiple: false, customizable: true });
  });
  test("ไป/กลับ: ค่าในร่าง (ข้อความ) ↔ รูปแบบกลาง", () => {
    const st = lazAttrStateOf([occasion, material], { occasion: "Casual,ลำลอง,Dating", material: "ผ้าแคนวาส" });
    expect(st.occasion).toEqual([{ id: "Casual", name: "ลำลอง" }, { id: "Dating", name: "Dating" }]);
    expect(st.material).toEqual([{ name: "ผ้าแคนวาส" }]);
    expect(lazAttrValuesOf([occasion, material], st)).toEqual({ occasion: "Casual,Dating", material: "ผ้าแคนวาส" });
    expect(lazAttrTextOf(material, [{ id: "PU Leather", name: "PU Leather" }, { name: "x" }])).toBe("PU Leather");
  });
});

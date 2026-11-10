import { describe, expect, it } from "vitest";
import { lineOptionStructure, planAddOptionValue, planDeleteOptionValue, variantsWithValue } from "@/lib/line-variant-structure";

// ข้อมูลจริงย่อจาก LINE (สินค้า 2 ชั้น: สี × ไซส์ · สินค้า 1 ชั้น: สี)
const two = {
  variantOptions: [{ name: "สี", values: ["น้ำตาล (01)", "ดำ (02)"] }, { name: "ไซส์", values: ["S", "M", "L"] }],
  variants: [
    { id: 1, sku: "MGN402-01S", options: [{ name: "สี", value: "น้ำตาล (01)" }, { name: "ไซส์", value: "S" }] },
    { id: 2, sku: "MGN402-01M", options: [{ name: "สี", value: "น้ำตาล (01)" }, { name: "ไซส์", value: "M" }] },
    { id: 3, sku: "MGN402-02S", options: [{ name: "สี", value: "ดำ (02)" }, { name: "ไซส์", value: "S" }] },
  ],
};
const one = { variantOptions: [{ name: "สี", values: ["สีดำ"] }], variants: [{ id: 9, sku: "WHB08-01", options: [{ name: "สี", value: "สีดำ" }] }] };

describe("โครงตัวเลือก", () => {
  it("อ่านชั้น + ค่าของแต่ละตัวเลือก", () => {
    const st = lineOptionStructure(two)!;
    expect(st.options).toEqual([{ name: "สี", values: ["น้ำตาล (01)", "ดำ (02)"] }, { name: "ไซส์", values: ["S", "M", "L"] }]);
    expect(st.variants[2]).toEqual({ id: "3", sku: "MGN402-02S", values: ["ดำ (02)", "S"] });
    expect(variantsWithValue(st, 1, "s").map((v) => v.id)).toEqual(["1", "3"]);
    expect(lineOptionStructure({})).toBeNull();
  });
});

describe("ลบค่าตัวเลือก — ลบทุกตัวที่มีค่านี้ · กันลบจนไม่เหลือ", () => {
  const st = lineOptionStructure(two)!;
  it("ลบไซส์ S = กระทบ 2 ตัวเลือก", () => {
    const p = planDeleteOptionValue(st, 1, "S");
    expect(p.error).toBeNull();
    expect(p.affected.map((v) => v.sku)).toEqual(["MGN402-01S", "MGN402-02S"]);
  });
  it("ค่าเดียวของชั้น / ลบจนไม่เหลือ / ไม่พบ = ไม่ได้", () => {
    expect(planDeleteOptionValue(lineOptionStructure(one)!, 0, "สีดำ").error).toContain("เป็นค่าเดียวของสี");
    const st2 = lineOptionStructure({ ...two, variants: two.variants.filter((v) => v.id !== 3) })!;   // เหลือแต่น้ำตาล
    expect(planDeleteOptionValue(st2, 0, "น้ำตาล (01)").error).toBe("ลบไม่ได้ — จะไม่เหลือตัวเลือกให้ขายเลย");
    expect(planDeleteOptionValue(st, 0, "แดง").error).toBe("ไม่พบ “แดง” ในสี");
  });
});

describe("เพิ่มค่าตัวเลือก — payload แบบเดียวกับตอนสร้างสินค้า", () => {
  it("สินค้า 1 ชั้น: เพิ่มสี 1 ตัว · index ต่อท้าย · สต๊อก 0", () => {
    const st = lineOptionStructure(one)!;
    const p = planAddOptionValue(st, 0, " สีน้ำตาล ", [{ otherValue: null, price: 2690, weight: 0.5, sku: "WHB08-11", barcode: "" }]);
    expect(p.errors).toEqual([]);
    expect(p.payload).toEqual({
      variantOptions: { option1: { name: "สี", data: [{ value: "สีดำ" }, { value: "สีน้ำตาล" }] } },
      variants: [{ onHandNumber: 0, price: 2690, weight: 0.5, sku: "WHB08-11", options: [1] }],
    });
  });
  it("สินค้า 2 ชั้น: เพิ่มสีใหม่ = 1 ตัวต่อไซส์ · options [สีใหม่, ไซส์]", () => {
    const st = lineOptionStructure(two)!;
    const rows = ["S", "M", "L"].map((z) => ({ otherValue: z, price: 1490, weight: 0.3, sku: `MGN402-03${z}`, barcode: null }));
    const p = planAddOptionValue(st, 0, "แดง (03)", rows);
    expect(p.errors).toEqual([]);
    expect(p.payload!.variantOptions.option2).toEqual({ name: "ไซส์", data: [{ value: "S" }, { value: "M" }, { value: "L" }] });
    expect(p.payload!.variants.map((v) => v.options)).toEqual([[2, 0], [2, 1], [2, 2]]);
  });
  it("เพิ่มไซส์ใหม่ = 1 ตัวต่อสี · options [สี, ไซส์ใหม่]", () => {
    const st = lineOptionStructure(two)!;
    const rows = ["น้ำตาล (01)", "ดำ (02)"].map((c, i) => ({ otherValue: c, price: 1490, weight: 0.3, sku: `X-${i}`, barcode: null }));
    expect(planAddOptionValue(st, 1, "XL", rows).payload!.variants.map((v) => v.options)).toEqual([[0, 3], [1, 3]]);
  });
  it("ค่าผิด: ค่าซ้ำ · แถวไม่ครบ · ราคา 0 · น้ำหนักเกิน · SKU ซ้ำของเดิม/ซ้ำกันเอง", () => {
    const st = lineOptionStructure(two)!;
    expect(planAddOptionValue(st, 1, "m", []).errors).toEqual(["“m” มีอยู่แล้วในไซส์", "ต้องกรอกให้ครบทุกสี (2 แถว)"]);
    const p = planAddOptionValue(st, 1, "XL", [
      { otherValue: "น้ำตาล (01)", price: 0, weight: 1000, sku: "MGN402-01S", barcode: null },
      { otherValue: "ดำ (02)", price: 10, weight: 0.3, sku: "", barcode: null },
    ]);
    expect(p.errors).toEqual([
      "สี น้ำตาล (01): ราคาต้องมากกว่า 0", "สี น้ำตาล (01): น้ำหนักต้องอยู่ระหว่าง 0.01–999.99 กก.", "สี น้ำตาล (01): SKU “MGN402-01S” มีอยู่แล้วในสินค้านี้",
      "สี ดำ (02): กรอก SKU",
    ]);
    expect(p.payload).toBeNull();
  });
});

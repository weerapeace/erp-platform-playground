import { describe, expect, it } from "vitest";
import { commonNamePrefix, groupByModel, majorityGroup, modelKeyOf } from "@/lib/so-order-view";

describe("so-order-view — จัดกลุ่มตามรุ่น", () => {
  it("รหัสรุ่น = ส่วนหน้า SKU ก่อน -", () => {
    expect(modelKeyOf("CTL006-02")).toBe("CTL006");
    expect(modelKeyOf("CTL008S-01-1")).toBe("CTL008S");
    expect(modelKeyOf("CTL055-B-02")).toBe("CTL055");
    expect(modelKeyOf(null)).toBe("");
  });
  it("ชื่อรุ่น = ส่วนที่เหมือนกัน ตัดที่ช่องว่าง", () => {
    expect(commonNamePrefix(["Good Goods กระเป๋า Tote Raffia สีน้ำตาล", "Good Goods กระเป๋า Tote Raffia สีครีม"])).toBe("Good Goods กระเป๋า Tote Raffia");
    expect(commonNamePrefix(["พวงกุญแจช้าง M", "พวงกุญแจช้าง S"])).toBe("พวงกุญแจช้าง");
    expect(commonNamePrefix(["กระเป๋าใบเดียว"])).toBe("กระเป๋าใบเดียว");
    expect(commonNamePrefix(["abc", "xyz"])).toBe("abc");
  });
  it("รวมจำนวน/ยอดต่อรุ่น · ไม่มีรหัสไปท้าย", () => {
    const L = [
      { sku: "CTL075-02", product_name: "พวงกุญแจช้าง M", qty: 500, p: 60 },
      { sku: null, product_name: "ค่าบล็อก", qty: 1, p: 500 },
      { sku: "CTL075-03", product_name: "พวงกุญแจช้าง S", qty: 100, p: 60 },
      { sku: "CTL106-03", product_name: "ผ้าขาวม้า ใบจิ๋ว", qty: 1500, p: 20 },
    ];
    const g = groupByModel(L, (l) => l.qty * l.p);
    expect(g.map((x) => x.key)).toEqual(["CTL075", "CTL106", ""]);
    expect(g[0]).toMatchObject({ label: "พวงกุญแจช้าง", qty: 600, total: 36000 });
    expect(g[2].label).toBe("ไม่มีรหัสสินค้า");
  });
  it("ชุดหลัก = ชุดที่รายการส่วนใหญ่อยู่", () => {
    const a = { id: "a", name: "Good Goods ตุลาคม 69" }, b = { id: "b", name: "อื่น" };
    expect(majorityGroup([a, a, null, b, a])).toEqual({ group: a, count: 3 });
    expect(majorityGroup([null, undefined])).toBeNull();
  });
});

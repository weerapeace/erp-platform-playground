import { describe, it, expect } from "vitest";
import {
  groupByCustomer, mergeProducts, productThumb, qtyByUnit, sortProducts, sumAmt, defaultSortDir, type SoldProduct,
} from "@/lib/sold-products";

const p = (customer: string, sku: string, name: string, unit: string | null, qty: number, amt: number): SoldProduct =>
  ({ customer, customer_code: null, sku, name, unit, qty, amt, image: null });

const LIST = [
  p("A", "CTL008", "กระเป๋า Tote สีฟ้า", "Units", 240, 144000),
  p("A", "CTL022", "ริบบิ้น 2.5 cm", "หลา", 1200, 12000),
  p("B", "CTL008", "กระเป๋า Tote สีฟ้า", "Units", 10, 6000),
  p("B", "CTL008", "กระเป๋า Tote สีฟ้า", "ชิ้น", 5, 3000),      // รหัสเดียวกันแต่หน่วยต่าง
  p("C", "52198", "JACOB เข็มขัด", "Units", 178, 61410),
];

describe("lib/sold-products", () => {
  it("รวมทุกลูกค้า: รหัส+หน่วยเดียวกันรวมเป็นแถวเดียว · หน่วยต่างกันแยกแถว", () => {
    const m = mergeProducts(LIST);
    expect(m).toHaveLength(4);
    const units = m.filter(x => x.sku === "CTL008" && x.unit === "Units")[0];
    expect(units.qty).toBe(250);
    expect(units.amt).toBe(150000);
    expect(m.find(x => x.sku === "CTL008" && x.unit === "ชิ้น")?.qty).toBe(5);
    expect(LIST[0].qty).toBe(240);                               // ไม่แก้ข้อมูลต้นทาง
  });

  it("จำนวนรวมแยกหน่วย เรียงหน่วยที่มากสุดก่อน", () => {
    expect(qtyByUnit(LIST)).toEqual([
      { unit: "หลา", qty: 1200 }, { unit: "Units", qty: 428 }, { unit: "ชิ้น", qty: 5 },
    ]);
  });

  it("แยกตามลูกค้า: ลูกค้ายอดมากสุดขึ้นก่อน", () => {
    const g = groupByCustomer(LIST);
    expect(g.map(x => x.customer)).toEqual(["A", "C", "B"]);
    expect(g[0].amt).toBe(156000);
    expect(sumAmt(LIST)).toBe(226410);
  });

  it("เรียงตามยอดเงิน / จำนวน / ชื่อ / รหัส", () => {
    expect(sortProducts(LIST, "amt", "desc")[0].amt).toBe(144000);
    expect(sortProducts(LIST, "qty", "desc")[0].qty).toBe(1200);
    expect(sortProducts(LIST, "qty", "asc")[0].qty).toBe(5);
    expect(sortProducts(LIST, "name", "asc")[0].name).toBe("กระเป๋า Tote สีฟ้า");   // เรียงแบบไทย: ไทยก่อนอังกฤษ
    expect(sortProducts(LIST, "name", "desc")[0].name).toBe("JACOB เข็มขัด");
    expect(sortProducts(LIST, "sku", "asc")[0].sku).toBe("52198");
    // ค่าเท่ากัน → ยอดเงินมากก่อน (ลำดับนิ่ง)
    const same = sortProducts(LIST.filter(x => x.sku === "CTL008"), "sku", "asc");
    expect(same.map(x => x.amt)).toEqual([144000, 6000, 3000]);
  });

  it("ทิศเริ่มต้น: ตัวเลข มาก→น้อย · ตัวหนังสือ ก→ฮ", () => {
    expect(defaultSortDir("amt")).toBe("desc");
    expect(defaultSortDir("qty")).toBe("desc");
    expect(defaultSortDir("name")).toBe("asc");
    expect(defaultSortDir("sku")).toBe("asc");
  });

  it("รูปย่อ: ต่อ ?w= ให้ถูก · ไม่มีรูป = null", () => {
    expect(productThumb("/api/r2-image?key=a.jpg", 80)).toBe("/api/r2-image?key=a.jpg&w=80");
    expect(productThumb("/x.jpg", 80)).toBe("/x.jpg?w=80");
    expect(productThumb(null, 80)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  calcSupplierLine, sumSupplierLines, splitAmount, emptySupplierLine,
  DEFAULT_FREIGHT, DEFAULT_FX, type SupplierLine,
} from "../supplier-quote";

// เคสตัวอย่างที่ใช้คุยกับเจ้าของ: กระดาษไขจีน ¥3.50 · กล่อง 21×30×4 ซม. · สั่ง 1,000 ชิ้น · ส่งเรือ · เสนอ 35 ฿
const base = (over: Partial<SupplierLine> = {}): SupplierLine => ({
  ...emptySupplierLine(null),
  item_name: "กระดาษไขจีน", price: 3.5, currency: "CNY", qty: 1000, offer_price: 35,
  box_w_cm: 21, box_l_cm: 30, box_h_cm: 4, ship_mode: "ship",
  ...over,
});

describe("supplier-quote (ตีราคาสินค้าสั่งจากร้าน)", () => {
  it("แปลงหยวนเป็นบาทด้วยเรตกลาง", () => {
    const c = calcSupplierLine(base(), DEFAULT_FX, DEFAULT_FREIGHT);
    expect(c.priceBaht).toBeCloseTo(18.2, 6);       // 3.5 × 5.2
  });

  it("ราคาเป็นบาทอยู่แล้ว = ไม่คูณเรต", () => {
    const c = calcSupplierLine(base({ price: 45, currency: "THB" }), DEFAULT_FX, DEFAULT_FREIGHT);
    expect(c.priceBaht).toBe(45);
  });

  it("ราคาต่อแพ็ค → หารเป็นราคาต่อชิ้น", () => {
    const c = calcSupplierLine(base({ price: 120, currency: "THB", price_unit: "pack", pack_qty: 10 }), DEFAULT_FX, DEFAULT_FREIGHT);
    expect(c.pricePerPcSrc).toBe(12);
    expect(c.priceBaht).toBe(12);
  });

  it("คิดค่าส่งจากปริมาตรกล่อง (ส่งเรือ 3,500 ฿/คิว)", () => {
    const c = calcSupplierLine(base(), DEFAULT_FX, DEFAULT_FREIGHT);
    expect(c.cubeCm3).toBe(2520);                    // 21×30×4
    expect(c.cbmPerPc).toBeCloseTo(0.00252, 8);      // ÷ 1,000,000
    expect(c.cbmTotal).toBeCloseTo(2.52, 6);         // × 1,000 ชิ้น
    expect(c.freightTotal).toBeCloseTo(8820, 6);     // × 3,500
    expect(c.freightPerPc).toBeCloseTo(8.82, 6);     // ÷ 1,000
  });

  it("ส่งรถใช้เรตรถ (7,000) และตั้งเรตเองทับได้", () => {
    expect(calcSupplierLine(base({ ship_mode: "truck" }), DEFAULT_FX, DEFAULT_FREIGHT).rate).toBe(7000);
    expect(calcSupplierLine(base({ ship_rate: 4200 }), DEFAULT_FX, DEFAULT_FREIGHT).rate).toBe(4200);
  });

  it("ต้นทุนถึงมือ = ราคา + ค่าส่ง · กำไร = ราคาเสนอ − ต้นทุน", () => {
    const c = calcSupplierLine(base(), DEFAULT_FX, DEFAULT_FREIGHT);
    expect(c.costPerPc).toBeCloseTo(27.02, 6);       // 18.20 + 8.82
    expect(c.saleTotal).toBe(35000);                 // 1,000 × 35
    expect(c.profitPerPc).toBeCloseTo(7.98, 6);
    expect(c.profitTotal).toBeCloseTo(7980, 6);
  });

  it("ไม่ใส่จำนวน = ไม่หารค่าส่ง (ไม่ระเบิดเป็น Infinity)", () => {
    const c = calcSupplierLine(base({ qty: null }), DEFAULT_FX, DEFAULT_FREIGHT);
    expect(Number.isFinite(c.freightPerPc)).toBe(true);
    expect(c.freightPerPc).toBe(0);
  });

  it("แบ่งกำไร: % คิดจากฐาน · จำนวนเงินคงที่ · ติ๊กออก = ไม่นับ", () => {
    expect(splitAmount([{ name: "A", type: "pct", value: 10 }], 7980)).toBeCloseTo(798, 6);
    expect(splitAmount([{ name: "B", type: "amt", value: 500 }], 7980)).toBe(500);
    expect(splitAmount([{ name: "C", type: "pct", value: 10, on: false }], 7980)).toBe(0);
  });

  it("แบ่งรายบรรทัดหักออกจากกำไรก่อน แล้วค่อยแบ่งทั้งใบ", () => {
    const line = base({ split_json: [{ name: "หาสินค้า", type: "pct", value: 10, on: true }] });
    const c = calcSupplierLine(line, DEFAULT_FX, DEFAULT_FREIGHT);
    expect(c.splitTotal).toBeCloseTo(798, 6);
    expect(c.profitNet).toBeCloseTo(7182, 6);

    const t = sumSupplierLines([line], DEFAULT_FX, DEFAULT_FREIGHT);
    expect(t.profit).toBeCloseTo(7980, 6);
    expect(t.splitLine).toBeCloseTo(798, 6);
    expect(t.profitAfterLine).toBeCloseTo(7182, 6);   // ฐานของการแบ่งทั้งใบ
  });

  it("รวมยอดหลายบรรทัด", () => {
    const t = sumSupplierLines([base(), base({ price: 12.8, qty: 300, offer_price: 149, box_w_cm: 16, box_l_cm: 16, box_h_cm: 9, ship_mode: "truck" })], DEFAULT_FX, DEFAULT_FREIGHT);
    expect(t.lines).toBe(2);
    expect(t.qty).toBe(1300);
    expect(t.sale).toBeCloseTo(35000 + 44700, 6);
    expect(t.cbm).toBeGreaterThan(0);
    expect(t.freight).toBeGreaterThan(0);
  });
});

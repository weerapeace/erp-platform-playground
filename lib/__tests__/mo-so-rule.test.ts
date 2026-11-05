import { describe, expect, it } from "vitest";
import { soLineProgress, soLineQtyState, soLineQtyText, soLinkError, soNeedOf } from "../mo-so-rule";

const gg = { brand_id: "b1", brand_name: "Good Goods", is_customer_job: true };
const lm = { brand_id: "b2", brand_name: "Louis Montini", is_customer_job: false };

describe("soNeedOf", () => {
  it("แบรนด์ลูกค้า = ต้องผูก · แบรนด์เรา = ไม่บังคับ · ไม่มีแบรนด์ = ให้ใส่ก่อน", () => {
    expect(soNeedOf(gg)).toBe("required");
    expect(soNeedOf(lm)).toBe("optional");
    expect(soNeedOf(null)).toBe("unknown_brand");
  });
});

describe("soLinkError", () => {
  it("แบรนด์ลูกค้าไม่เลือกใบ → เตือนพร้อมชื่อแบรนด์", () => {
    expect(soLinkError("required", null, "Good Goods")).toMatch(/Good Goods.*ต้องเลือกใบสั่งขาย/);
    expect(soLinkError("required", { so_order_id: "x" })).toBeNull();
  });
  it("แบรนด์เราไม่ผูกก็ผ่าน", () => {
    expect(soLinkError("optional", null)).toBeNull();
  });
  it("ยังไม่มีแบรนด์ → ให้ใส่แบรนด์ก่อน แม้เลือกใบแล้ว", () => {
    expect(soLinkError("unknown_brand", { so_order_id: "x" })).toMatch(/ใส่แบรนด์ก่อน/);
  });
  it("สร้างใหม่ต้องมีลูกค้า + บริษัท · ราคาว่างได้ ติดลบไม่ได้", () => {
    expect(soLinkError("required", { new_so: { company_code: "ISG" } })).toMatch(/ลูกค้า/);
    expect(soLinkError("required", { new_so: { customer_id: "c" } })).toMatch(/บริษัท/);
    expect(soLinkError("required", { new_so: { customer_id: "c", company_code: "ISG" } })).toBeNull();
    expect(soLinkError("required", { new_so: { customer_id: "c", company_code: "ISG", unit_price: -1 } })).toMatch(/ติดลบ/);
  });
});

describe("soLineProgress", () => {
  const lines = [
    { id: "L1", sku: "CTL075-03", qty: 500, mo_id: "M1" },
    { id: "L2", sku: "CTL080-01", qty: 200, mo_id: null },
  ];
  it("ใบที่รายการอ้างตรง + ใบที่แตกออกมา (รหัสเดียวกัน) นับรวมรายการเดียวกัน", () => {
    const r = soLineProgress(lines, [
      { id: "M1", mo_no: "MO-1", product_sku: "CTL075-03", qty: 300, status: "confirmed", shipped: 100 },
      { id: "M2", mo_no: "MO-2", product_sku: "CTL075-03", qty: 200, status: "draft" },
    ]);
    expect(r.byLine.L1.opened).toBe(500);
    expect(r.byLine.L1.shipped).toBe(100);
    expect(r.byLine.L1.mos.map((m) => m.mo_no)).toEqual(["MO-1", "MO-2"]);
    expect(soLineQtyState(r.byLine.L1)).toBe("ok");
    expect(soLineQtyState(r.byLine.L2)).toBe("none");
  });
  it("ใบที่ไม่ตรงรายการไหน = orphans", () => {
    const r = soLineProgress(lines, [{ id: "M9", mo_no: "MO-9", product_sku: "ZZZ", qty: 5, status: null }]);
    expect(r.orphans.map((m) => m.mo_no)).toEqual(["MO-9"]);
  });
  it("ข้อความ ขาด/เกิน", () => {
    expect(soLineQtyText({ ordered: 500, opened: 300, shipped: 0, mos: [] })).toBe("เปิดผลิต 300/500 · ขาด 200");
    expect(soLineQtyText({ ordered: 500, opened: 600, shipped: 0, mos: [] })).toBe("เปิดผลิต 600/500 · เกิน 100");
    expect(soLineQtyText({ ordered: 500, opened: 0, shipped: 0, mos: [] })).toBe("ยังไม่เปิดผลิต");
  });
});

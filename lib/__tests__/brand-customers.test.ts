import { describe, it, expect } from "vitest";
import {
  addCustomerId, brandCustomerColumns, brandCustomerIds, cleanCustomerIds, orderCustomers, BRAND_CUSTOMER_MAX,
} from "@/lib/brand-customers";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

describe("cleanCustomerIds", () => {
  it("เอาเฉพาะ uuid ตัดซ้ำ คงลำดับ", () => {
    expect(cleanCustomerIds([B, "x", A, B, null, ` ${C} `])).toEqual([B, A, C]);
  });
  it("ไม่ใช่ array = ว่าง", () => {
    expect(cleanCustomerIds(null)).toEqual([]);
    expect(cleanCustomerIds(A)).toEqual([]);
  });
  it("ไม่เกินจำนวนสูงสุด", () => {
    const many = Array.from({ length: BRAND_CUSTOMER_MAX + 5 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    expect(cleanCustomerIds(many)).toHaveLength(BRAND_CUSTOMER_MAX);
  });
});

describe("brandCustomerIds", () => {
  it("รายการใหม่มาก่อน", () => {
    expect(brandCustomerIds({ default_customer_ids: [B, A], default_customer_id: C })).toEqual([B, A]);
  });
  it("แถวเก่ามีแค่ช่องเดียว", () => {
    expect(brandCustomerIds({ default_customer_ids: [], default_customer_id: A })).toEqual([A]);
    expect(brandCustomerIds({ default_customer_id: null })).toEqual([]);
    expect(brandCustomerIds(null)).toEqual([]);
  });
});

describe("เพิ่ม / เขียนลงตาราง", () => {
  it("เพิ่มท้ายรายการ ซ้ำไม่เพิ่ม", () => {
    expect(addCustomerId([A], B)).toEqual([A, B]);
    expect(addCustomerId([A, B], A)).toEqual([A, B]);
  });
  it("2 ช่องตรงกันเสมอ (รายแรก = ช่องเดิม)", () => {
    expect(brandCustomerColumns([B, A])).toEqual({ default_customer_ids: [B, A], default_customer_id: B });
    expect(brandCustomerColumns([])).toEqual({ default_customer_ids: [], default_customer_id: null });
  });
});

describe("แสดงผล", () => {
  const byId = new Map([[A, { id: A, code: "C1", name: "สาขา 1" }], [B, { id: B, code: "C2", name: "สาขา 2" }], [C, { id: C, code: "C3", name: "สาขา 3" }]]);
  it("เรียงตามรายการ ข้ามตัวที่หาไม่เจอ", () => {
    expect(orderCustomers([C, "gone", A], byId).map((c) => c.name)).toEqual(["สาขา 3", "สาขา 1"]);
  });
});

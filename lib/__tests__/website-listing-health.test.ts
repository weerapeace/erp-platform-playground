import { describe, it, expect } from "vitest";
import { listingIssues } from "../website-listing-health";

/** ⚠️ ต้องแก้ — กฎกลางของสินค้าบนเว็บ (ป้ายเหลือง + ตัวกรอง "ต้องแก้" + แท็บต้องแก้ในลิ้นชัก) */
const ok = { price: 990, imageCount: 3, categories: ["bag"], colors: [{ label: "ดำ", swatch: "#000", hasImage: true }] };

describe("listingIssues", () => {
  it("ครบ = ไม่มีอะไรต้องแก้", () => {
    expect(listingIssues(ok)).toEqual([]);
  });
  it("📐 ร้านเปิดเช็คขนาดแต่ยังไม่วัดช่องใส่ของ = ต้องแก้ · ไม่ได้เปิด = ไม่เตือน", () => {
    expect(listingIssues({ ...ok, compartmentsMissing: true }).map((i) => i.key)).toEqual(["no_compartments"]);
    expect(listingIssues({ ...ok, compartmentsMissing: false })).toEqual([]);
  });
  it("ไม่มีราคา/รูป/หมวด", () => {
    expect(listingIssues({ ...ok, price: 0, imageCount: 0, categories: [] }).map((i) => i.key)).toEqual(["no_price", "no_image", "no_category"]);
  });
});

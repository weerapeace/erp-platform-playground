import { describe, it, expect } from "vitest";
import { colorWebImages, listingIssues } from "../website-listing-health";

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

describe("🖼 รูปเว็บรายสี", () => {
  const c = (label: string, img: "web" | "sku" | "none") => ({ label, swatch: "#000", hasImage: img !== "none", img, skuId: `id-${label}` });
  it("ลงรูปเว็บบางสี → สีที่ยังใช้รูปปก SKU = ต้องแก้ + ชี้ SKU สีแรกที่ขาด", () => {
    const iss = listingIssues({ ...ok, colors: [c("กรมท่า", "web"), c("แทน", "sku"), c("น้ำตาล", "sku")] });
    const x = iss.find((i) => i.key === "color_no_web_image");
    expect(x?.label).toBe("รูปเว็บ 1/3 สี");
    expect(x?.names).toEqual(["แทน", "น้ำตาล"]);
    expect(x?.skuId).toBe("id-แทน");
  });
  it("ทุกสีใช้รูปปก SKU (ไม่เคยลงรูปเว็บ) = ไม่เตือน แต่ allSku = true", () => {
    const colors = [c("ดำ", "sku"), c("ขาว", "sku")];
    expect(listingIssues({ ...ok, colors }).map((i) => i.key)).toEqual([]);
    expect(colorWebImages(colors)).toMatchObject({ webN: 0, total: 2, allSku: true, missing: [] });
  });
  it("สีที่ไม่มีรูปเลย = ป้าย สีที่ยังไม่มีรูป (ไม่ซ้ำกับป้ายรูปเว็บ)", () => {
    const iss = listingIssues({ ...ok, colors: [c("ดำ", "web"), c("ขาว", "none")] });
    expect(iss.map((i) => i.key)).toEqual(["color_no_image"]);
    expect(iss[0].skuId).toBe("id-ขาว");
  });
  it("ตัวเลือกกรอกทับเอง (ไม่มี img) = ไม่นับ", () => {
    expect(colorWebImages([{ label: "A", swatch: null, hasImage: true }])).toMatchObject({ total: 0, allSku: false });
  });
});

import { describe, it, expect } from "vitest";
import { requiredChecks, isReadyForPlatform, requiredSpec, type ReqCtx } from "@/lib/platform-required-fields";

const full: ReqCtx = { title: "สินค้า", description: "รายละเอียด", category: "หมวด A", imagesToSend: 2, variantCount: 3, allHavePrice: true, allHaveImage: true };

describe("platform-required-fields (LINE)", () => {
  it("ครบทุกอย่าง → พร้อมส่ง", () => {
    expect(isReadyForPlatform("line_shopping", full)).toBe(true);
  });
  it("ไม่มีหมวดหมู่ (บังคับ) → ยังไม่พร้อม", () => {
    expect(isReadyForPlatform("line_shopping", { ...full, category: "" })).toBe(false);
  });
  it("ไม่มีราคาทุก SKU (บังคับ) → ยังไม่พร้อม", () => {
    expect(isReadyForPlatform("line_shopping", { ...full, allHavePrice: false })).toBe(false);
  });
  it("ไม่มีรายละเอียด (แนะนำ ไม่บังคับ) → ยังพร้อมส่งได้", () => {
    expect(isReadyForPlatform("line_shopping", { ...full, description: "" })).toBe(true);
    const desc = requiredChecks("line_shopping", { ...full, description: "" }).find((c) => c.label.includes("รายละเอียด"));
    expect(desc?.required).toBe(false);
    expect(desc?.ok).toBe(false);
  });
  it("LINE ใช้ spec ของตัวเอง (ไม่ใช่ generic)", () => {
    expect(requiredSpec("line_shopping").label).toBe("LINE SHOPPING");
  });
});

describe("platform-required-fields (Shopee)", () => {
  const sp: ReqCtx = { ...full, category: "100032 · เครื่องประดับ > เข็มขัด", weightKg: 0.09 };
  it("ครบ → พร้อม · ตัวเลือกบางตัวไม่มีรูป = ยังลงได้ (Shopee ไม่บังคับ)", () => {
    expect(requiredSpec("shopee").label).toBe("Shopee");
    expect(isReadyForPlatform("shopee", sp)).toBe(true);
    expect(isReadyForPlatform("shopee", { ...sp, allHaveImage: false })).toBe(true);
  });
  it("บังคับ: หมวดต้องมีรหัส · น้ำหนัก · รายละเอียด · รูป ≤ 9", () => {
    expect(isReadyForPlatform("shopee", { ...sp, category: "" })).toBe(false);
    expect(isReadyForPlatform("shopee", { ...sp, category: "เข็มขัด" })).toBe(false);
    expect(isReadyForPlatform("shopee", { ...sp, weightKg: null })).toBe(false);
    expect(isReadyForPlatform("shopee", { ...sp, imagesToSend: 10 })).toBe(false);
  });
});

describe("แพลตฟอร์มที่ยังไม่นิยาม → ชุดทั่วไป", () => {
  it("fallback generic", () => {
    expect(requiredSpec("some_new_platform").label).toBe("ทั่วไป");
    // generic บังคับรายละเอียดด้วย → ไม่มีรายละเอียด = ไม่พร้อม
    expect(isReadyForPlatform("shopee", { ...full, description: "" })).toBe(false);
  });
});

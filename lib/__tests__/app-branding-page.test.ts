import { describe, expect, it } from "vitest";
import { brandIconUrl, cleanPageLabel, isBrandKey, pageBrandKey, pagePathOfBrandKey, PAGE_LABEL_MAX } from "@/lib/app-branding";

// ไอคอน/ชื่อของ "แอปหน้าเดียว" ใช้ระบบไอคอนแอปกลาง ด้วย key "page:<path>" (เจ้าของ 2026-11-06)
describe("app-branding · แอปหน้าเดียว", () => {
  it("key ของหน้า ไป-กลับได้ตรงกัน", () => {
    const k = pageBrandKey("/master/work-board");
    expect(k).toBe("page:/master/work-board");
    expect(pagePathOfBrandKey(k)).toBe("/master/work-board");
  });
  it("key แปลก/หน้าระบบ = ไม่รับ", () => {
    expect(pagePathOfBrandKey("page:/app/production")).toBeNull();   // หน้าแอปเดิมทำเป็นแอปหน้าเดียวไม่ได้
    expect(pagePathOfBrandKey("page:/master/../admin")).toBeNull();
    expect(pagePathOfBrandKey("page:/master/work-board/")).toBeNull(); // ต้องเป็นรูปที่ทำความสะอาดแล้วเท่านั้น
    expect(pagePathOfBrandKey("notify")).toBeNull();
    expect(pagePathOfBrandKey(123)).toBeNull();
  });
  it("isBrandKey รับทั้งแอปและหน้า", () => {
    expect(isBrandKey("notify")).toBe(true);
    expect(isBrandKey("production")).toBe(true);
    expect(isBrandKey("page:/master/work-board")).toBe(true);
    expect(isBrandKey("page:")).toBe(false);
    expect(isBrandKey("Bad Key")).toBe(false);
  });
  it("ที่อยู่รูป: หน้า = /api/page-icon · แอป = /api/app-icon · d=1 = ไอคอนตั้งต้น", () => {
    expect(brandIconUrl("page:/master/work-board", 192, "17")).toBe("/api/page-icon/master/work-board?s=192&v=17");
    expect(brandIconUrl("page:/master/work-board", 256, null, true)).toBe("/api/page-icon/master/work-board?s=256&d=1");
    expect(brandIconUrl("notify", 256, null, true)).toBe("/api/app-icon/notify?s=256&d=1");
  });
  it("ชื่อบนหน้าจอ: ตัดช่องว่างเกิน · ว่าง = null · ยาวเกินตัด", () => {
    expect(cleanPageLabel("  จ่ายงาน   iPad ")).toBe("จ่ายงาน iPad");
    expect(cleanPageLabel("   ")).toBeNull();
    expect(cleanPageLabel(null)).toBeNull();
    expect(cleanPageLabel("ก".repeat(50))?.length).toBe(PAGE_LABEL_MAX);
  });
});

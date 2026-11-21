import { describe, expect, it } from "vitest";
import { isEditedListingTitle, pickListingTitle } from "@/lib/listing-title";

const p = { name_platform: null, name_th: "Louis Montini กระเป๋าถือ พร้อมพวงกุญแจ LY22", name_history: ["Louis Montini กระเป๋าถือ LY22"] };

describe("ตัวเลือกชื่อกลาง", () => {
  it("ร่างที่เก็บชื่อเวอร์ชันเก่า = สำเนา → ใช้ชื่อล่าสุด (LY22)", () => {
    expect(isEditedListingTitle("Louis Montini กระเป๋าถือ LY22", p)).toBe(false);
    expect(pickListingTitle("Louis Montini กระเป๋าถือ LY22", p, "Lazada")).toEqual({ text: p.name_th, src: "ชื่อสินค้า" });
  });
  it("ร่างที่คนแก้เอง = ใช้ร่าง", () => {
    expect(pickListingTitle("ชื่อพิเศษสำหรับ Lazada", p, "Lazada")).toEqual({ text: "ชื่อพิเศษสำหรับ Lazada", src: "แก้ไว้สำหรับ Lazada" });
  });
  it("ไม่มีร่าง: ชื่อสำหรับแพลตฟอร์มก่อนชื่อสินค้า", () => {
    expect(pickListingTitle("", { ...p, name_platform: "ชื่อแพลตฟอร์ม" }, "Shopee").text).toBe("ชื่อแพลตฟอร์ม");
    expect(pickListingTitle(null, p, "Shopee").text).toBe(p.name_th);
  });
});

/**
 * เทสต์ตัวเลือกรายละเอียดที่จะส่งร้าน (lib/listing-description) — ใช้ร่วม Shopee · Lazada · LINE · TikTok
 */
import { describe, it, expect } from "vitest";
import { isEditedListingDescription, pickListingDescription } from "../listing-description";

describe("pickListingDescription", () => {
  it("ร่างที่ตรงกับค่าเก่าของคอลัมน์ (ประวัติเวอร์ชัน) = สำเนาเก่า ไม่นับว่าแก้เอง (บั๊ก 2026-11-21: LY22 · BSD14/BSD15/JEAN08)", () => {
    const p = { platform_description: "ข้อความใหม่ LY22", description: "รายละเอียด", platform_description_history: ["ข้อความเก่า  LY21 ปน", "เก่ากว่า"] };
    expect(isEditedListingDescription("ข้อความเก่า LY21 ปน", p)).toBe(false);
    expect(pickListingDescription("ข้อความเก่า LY21 ปน", p, "LINE")).toEqual({ text: "ข้อความใหม่ LY22", src: "Platform Description ของ Parent SKU" });
  });
  it("ร่างที่ตรงกับ \"รายละเอียดสินค้า\" เวอร์ชันเก่า = สำเนา (เจอ 2026-11-22 BSAC008)", () => {
    const p = { platform_description: "Platform Description ยาว 1,499 ตัวอักษร", description: "รายละเอียดใหม่", description_history: ["รายละเอียดเก่า 2 บรรทัด\nบรรทัดที่ 2"] };
    expect(isEditedListingDescription("รายละเอียดเก่า 2 บรรทัด\nบรรทัดที่ 2", p)).toBe(false);
    expect(pickListingDescription("รายละเอียดเก่า 2 บรรทัด\nบรรทัดที่ 2", p, "Lazada").text).toBe("Platform Description ยาว 1,499 ตัวอักษร");
  });
  it("ร่างที่คนแก้เอง (ไม่ตรงสำเนาไหน) = ใช้ร่าง", () => {
    const p = { platform_description: "ใหม่", description: null, platform_description_history: ["เก่า"] };
    expect(pickListingDescription("พิมพ์เองสำหรับร้าน", p, "TikTok")).toEqual({ text: "พิมพ์เองสำหรับร้าน", src: "แก้ไว้สำหรับ TikTok" });
  });
  it("ไม่ได้โหลดค่าสด (LINE/TikTok) = คอลัมน์คือ Platform Description · โหลดแล้วพลาด (null) = ค่าที่เก็บไว้", () => {
    expect(pickListingDescription("", { platform_description: "ใหม่", description: null }, "LINE").src).toBe("Platform Description ของ Parent SKU");
    expect(pickListingDescription("", { platform_description: "เก่า", description: null, platform_description_live: null }, "Shopee").src).toBe("รายละเอียดสำหรับแพลตฟอร์ม (ค่าที่เก็บไว้)");
    expect(pickListingDescription("", { platform_description: null, description: null }, "LINE")).toEqual({ text: "", src: "ยังไม่มีรายละเอียด" });
  });
  it("ค่าสดขึ้นต้นด้วยช่องว่าง (Lazada กลายเป็น &nbsp;) → ตัดหัว-ท้าย คงการขึ้นบรรทัดข้างใน", () => {
    const live = ["  ", "", "Fleur", "บรรทัด 2  "].join("\n");
    expect(pickListingDescription("", { platform_description: "x", description: null, platform_description_live: live }, "Lazada").text).toBe(["Fleur", "บรรทัด 2"].join("\n"));
  });
});

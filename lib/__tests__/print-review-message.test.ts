import { describe, it, expect } from "vitest";
import { printReviewMessage } from "@/lib/customer-messages";

const shop = { name: "Pixiedustie", siteUrl: "https://pixiedustie.com", contactLine: "@pixie", contactPhone: "021234567" };
const o = { orderNo: "PX-001", customerName: "มะลิ", designCode: "AB12CD", note: "รูปไม่ชัด" };

describe("ข้อความแจ้งผลตรวจลายรีด", () => {
  it("ขอรูปใหม่: บอกเหตุผล + ปุ่มส่งรูปใหม่ไปหน้าตามออเดอร์ (ไม่มีเบอร์ในลิงก์)", () => {
    const m = printReviewMessage("reupload", o, shop, "th");
    expect(m.lines.join(" ")).toContain("ขอรูปใหม่เพราะ รูปไม่ชัด");
    expect(m.link).toEqual({ text: "ส่งรูปใหม่", href: "https://pixiedustie.com/track?no=PX-001" });
    expect(m.text).toContain("ติดต่อร้าน: LINE @pixie · โทร 021234567");
  });
  it("ปฏิเสธ (อังกฤษ): บอกเรื่องคืนเงิน", () => {
    const m = printReviewMessage("rejected", o, shop, "en");
    expect(m.title).toBe("We can't print this design");
    expect(m.text).toContain("refunding");
    expect(m.link?.href).toBe("https://pixiedustie.com/en/track?no=PX-001");
  });
  it("ร้านยังไม่มีโดเมน = ไม่มีลิงก์", () => {
    expect(printReviewMessage("reupload", o, { ...shop, siteUrl: null }, "th").link).toBeNull();
  });
});

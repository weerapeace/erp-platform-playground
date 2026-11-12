import { describe, expect, it } from "vitest";
import { cleanIdeaImageKeys, cleanIdeaLinks, cleanIdeaName, cleanIdeaPoints, ideaDetailHtml, linkHost, MAX_IDEA_POINTS } from "@/lib/design-ideas";

describe("design ideas — ทำความสะอาดข้อมูล", () => {
  it("ชื่อ: ตัดช่องว่างซ้ำ · ยาวสุด 200", () => {
    expect(cleanIdeaName("  กระเป๋า   คาดอก ")).toBe("กระเป๋า คาดอก");
    expect(cleanIdeaName("ก".repeat(250))).toHaveLength(200);
    expect(cleanIdeaName(null)).toBe("");
  });

  it("ข้อ ๆ: ทิ้งข้อว่าง · จำกัดจำนวน", () => {
    expect(cleanIdeaPoints(["  ผ้าร่ม ", "", "   ", "ซิป 1 ช่อง"])).toEqual(["ผ้าร่ม", "ซิป 1 ช่อง"]);
    expect(cleanIdeaPoints("ไม่ใช่ array")).toEqual([]);
    expect(cleanIdeaPoints(Array.from({ length: 40 }, (_, i) => `ข้อ ${i}`))).toHaveLength(MAX_IDEA_POINTS);
  });

  it("ลิงก์: รับเฉพาะ http/https · ไม่ซ้ำ", () => {
    expect(cleanIdeaLinks(["https://www.pinterest.com/pin/1", "javascript:alert(1)", "https://www.pinterest.com/pin/1", { url: "http://shopee.co.th/x", label: "ร้าน" }]))
      .toEqual([{ url: "https://www.pinterest.com/pin/1" }, { url: "http://shopee.co.th/x", label: "ร้าน" }]);
  });

  it("รูป: รับเฉพาะ key ปลอดภัย · ไม่ซ้ำ", () => {
    expect(cleanIdeaImageKeys(["design-ideas/2026/a.jpg", "../etc/passwd", "/abs.jpg", "design-ideas/2026/a.jpg", 5, "line/x y.png"]))
      .toEqual(["design-ideas/2026/a.jpg"]);
  });

  it("รายละเอียดใบงานตอนเริ่มงานจริง: ข้อ ๆ + Reference · escape HTML", () => {
    expect(ideaDetailHtml(["ผ้า <ร่ม>"], [{ url: "https://a.com/?x=1&y=2" }]))
      .toBe('<ul><li><p>ผ้า &lt;ร่ม&gt;</p></li></ul><p><strong>Reference</strong></p><ul><li><p><a href="https://a.com/?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">https://a.com/?x=1&amp;y=2</a></p></li></ul>');
    expect(ideaDetailHtml([], [])).toBe("");
  });

  it("ชื่อเว็บของลิงก์", () => {
    expect(linkHost("https://www.tiktok.com/@a/video/1")).toBe("tiktok.com");
    expect(linkHost("ไม่ใช่ลิงก์")).toBe("ไม่ใช่ลิงก์");
  });
});

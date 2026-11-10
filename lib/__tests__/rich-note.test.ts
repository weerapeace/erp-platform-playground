import { describe, it, expect } from "vitest";
import { isHtmlNote, noteToHtml, noteToText, isEmptyNote } from "@/lib/rich-note";

describe("rich-note", () => {
  it("isHtmlNote: แยก HTML จากกล่องพิมพ์ กับข้อความธรรมดา", () => {
    expect(isHtmlNote("<p>สวัสดี</p>")).toBe(true);
    expect(isHtmlNote("  <ul><li>a</li></ul>")).toBe(true);
    expect(isHtmlNote("เทรนด์: <ใหม่>")).toBe(false);
    expect(isHtmlNote(null)).toBe(false);
  });

  it("noteToHtml: ข้อความธรรมดา → ย่อหน้า + bullet + กันแท็กแปลกปลอม", () => {
    expect(noteToHtml("")).toBe("");
    expect(noteToHtml("เทรนด์: ใหม่\nTikTok: ถ่าย 15 วิ")).toBe("<p>เทรนด์: ใหม่</p><p>TikTok: ถ่าย 15 วิ</p>");
    expect(noteToHtml("หัวข้อ\n- ข้อ 1\n- ข้อ 2")).toBe("<p>หัวข้อ</p><ul><li><p>ข้อ 1</p></li><li><p>ข้อ 2</p></li></ul>");
    expect(noteToHtml("a <script>")).toBe("<p>a &lt;script&gt;</p>");
    expect(noteToHtml("<p><strong>x</strong></p>")).toBe("<p><strong>x</strong></p>");
  });

  it("noteToHtml แบบรายละเอียด LINE: เก็บบรรทัดว่าง + ย่อหน้าเยื้อง + ขีดเป็นข้อความ", () => {
    const opts = { keepBlankLines: true, keepIndent: true, bullets: false };
    expect(noteToHtml("  ย่อหน้าแรก\n\nรายละเอียดสินค้า\n- หนังแท้\n- ซิปคู่\n\n", opts))
      .toBe("<p>&nbsp;&nbsp;ย่อหน้าแรก</p><p><br></p><p>รายละเอียดสินค้า</p><p>- หนังแท้</p><p>- ซิปคู่</p>");
    expect(noteToHtml("\n\na\n\n\nb\n", opts)).toBe("<p>a</p><p><br></p><p><br></p><p>b</p>");
    expect(noteToHtml("\tเยื้องแท็บ", opts)).toBe("<p>&nbsp;&nbsp;&nbsp;&nbsp;เยื้องแท็บ</p>");
    expect(noteToHtml("<p>มี HTML แล้ว</p>", opts)).toBe("<p>มี HTML แล้ว</p>");
  });

  it("noteToText: HTML → ข้อความล้วน (bullet เป็น - )", () => {
    expect(noteToText("<p><strong>วิดีโอ</strong> 3 สี</p><ul><li><p>ซูมหัว</p></li><li><p>ราคา &amp; โปร</p></li></ul>"))
      .toBe("วิดีโอ 3 สี\n- ซูมหัว\n- ราคา & โปร");
    expect(noteToText("ข้อความเดิม\nบรรทัดสอง")).toBe("ข้อความเดิม\nบรรทัดสอง");
  });

  it("isEmptyNote: กล่องที่ลบหมดถือว่าว่าง", () => {
    expect(isEmptyNote("<p></p>")).toBe(true);
    expect(isEmptyNote("")).toBe(true);
    expect(isEmptyNote("<p>a</p>")).toBe(false);
  });
});

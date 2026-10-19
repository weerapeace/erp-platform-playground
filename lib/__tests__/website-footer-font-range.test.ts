import { describe, it, expect } from "vitest";
import { normalizeFooter, FOOTER_GAP_MAX, DEFAULT_FOOTER } from "../website-theme";

/** 🦶 ท้ายเว็บ: ฟอนต์หัวคอลัมน์/ข้อความ + ระยะพิมพ์เองได้ถึง FOOTER_GAP_MAX (เว็บร้าน site-config ใช้ค่าเดียวกัน) */
describe("footer: ฟอนต์ + ระยะไม่จำกัด", () => {
  it("ค่าเดิม (ไม่มีช่องใหม่) = ตามธีม", () => {
    const f = normalizeFooter({});
    expect([f.headingFont, f.textFont]).toEqual(["", ""]);
    expect(DEFAULT_FOOTER.headingFont).toBe("");
  });
  it("ฟอนต์ที่มีในรายการเก็บได้ · ชื่อแปลก = ตามธีม", () => {
    const f = normalizeFooter({ headingFont: "Playfair Display", textFont: "Comic Sans" });
    expect([f.headingFont, f.textFont]).toEqual(["Playfair Display", ""]);
  });
  it("ระยะเกินแถบเลื่อนเดิมเก็บได้ · เกินเพดาน = ตัดที่ FOOTER_GAP_MAX · -1 อัตโนมัติยังใช้ได้", () => {
    const f = normalizeFooter({ colGap: 300, rowGap: 500, linkGap: 80, stackGap: 200, padTop: 400, padBottom: 5000, bottomGap: 250, headGap: -1 });
    expect([f.colGap, f.rowGap, f.linkGap, f.stackGap, f.padTop, f.padBottom, f.bottomGap, f.headGap]).toEqual([300, 500, 80, 200, 400, FOOTER_GAP_MAX, 250, -1]);
  });
});

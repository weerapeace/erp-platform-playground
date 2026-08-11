import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/template";

describe("renderTemplate — token", () => {
  it("แทนค่าธรรมดา + escape HTML", () => {
    expect(renderTemplate("สวัสดี {{name}}", { name: "โลก" })).toBe("สวัสดี โลก");
    expect(renderTemplate("{{x}}", { x: "<b>hi</b>" })).toBe("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("{{{raw}}} ไม่ escape (ใช้กับ HTML ที่ระบบสร้างเอง)", () => {
    expect(renderTemplate("{{{x}}}", { x: "<b>hi</b>" })).toBe("<b>hi</b>");
  });

  it("token ที่ไม่มีค่า → ว่าง", () => {
    expect(renderTemplate("[{{missing}}]", {})).toBe("[]");
  });
});

describe("renderTemplate — section {{#…}}", () => {
  it("วน array และเห็นค่าของ item + ค่าระดับบนสุด", () => {
    const out = renderTemplate("{{#items}}[{{n}}/{{total}}]{{/items}}", { total: 2, items: [{ n: 1 }, { n: 2 }] });
    expect(out).toBe("[1/2][2/2]");
  });

  it("array ว่าง → ไม่แสดงอะไร", () => {
    expect(renderTemplate("A{{#items}}x{{/items}}B", { items: [] })).toBe("AB");
  });

  it("scalar truthy → แสดงเนื้อใน, falsy → ไม่แสดง", () => {
    expect(renderTemplate("{{#ok}}yes{{/ok}}", { ok: true })).toBe("yes");
    expect(renderTemplate("{{#ok}}yes{{/ok}}", { ok: false })).toBe("");
  });
});

describe("renderTemplate — inverted section {{^…}}", () => {
  // เคสจริง: รายงานรายเดือน ใช้คู่ {{#has_rows}}ตาราง{{/has_rows}}{{^has_rows}}— ไม่มีรายการ —{{/has_rows}}
  it("แสดงเนื้อในเฉพาะตอนไม่มีข้อมูล", () => {
    const tpl = "{{#has}}ตาราง{{/has}}{{^has}}— ไม่มีรายการ —{{/has}}";
    expect(renderTemplate(tpl, { has: true })).toBe("ตาราง");
    expect(renderTemplate(tpl, { has: false })).toBe("— ไม่มีรายการ —");
  });

  it("array ว่างถือว่า 'ไม่มี'", () => {
    const tpl = "{{#rows}}x{{/rows}}{{^rows}}ว่าง{{/rows}}";
    expect(renderTemplate(tpl, { rows: [] })).toBe("ว่าง");
    expect(renderTemplate(tpl, { rows: [1] })).toBe("x");
  });

  it("ไม่หลงเหลือ {{^…}} ดิบในผลลัพธ์ (บั๊กเดิม: ข้อความ {{^has}} โผล่บนใบพิมพ์)", () => {
    const out = renderTemplate("{{#has}}A{{/has}}{{^has}}B{{/has}}", { has: true });
    expect(out).not.toContain("{{");
  });
});

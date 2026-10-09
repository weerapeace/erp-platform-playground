import { describe, it, expect } from "vitest";
import { sanitizeCustomHtml, scopeCss } from "../website-html";

/** กันโค้ดอันตรายจาก Section "Custom HTML" หลุดขึ้นเว็บจริง */
describe("sanitizeCustomHtml", () => {
  it("ถอด <script> ทั้งก้อน และ on* attributes", () => {
    const out = sanitizeCustomHtml(`<div onclick="alert(1)">สวัสดี<script>alert(1)</script></div>`);
    expect(out).toBe("<div>สวัสดี</div>");
  });

  it("ถอด iframe/object/form แต่เก็บ div/p/img/a/style", () => {
    const out = sanitizeCustomHtml(
      `<section class="x"><iframe src="https://evil"></iframe><p style="color:red">ข้อความ</p><img src="https://a/b.jpg" alt="รูป"><a href="/shop">ร้าน</a><form><input></form><style>.x{color:red}</style></section>`
    );
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("<form");
    expect(out).toContain('<p style="color:red">ข้อความ</p>');
    expect(out).toContain('<img src="https://a/b.jpg" alt="รูป">');
    expect(out).toContain('<a href="/shop">ร้าน</a>');
    expect(out).toContain("<style>.x{color:red}</style>");
  });

  it("ลิงก์ javascript: และ data: ที่ไม่ใช่รูป ถูกถอด · target=_blank ได้ rel อัตโนมัติ", () => {
    const out = sanitizeCustomHtml(`<a href="javascript:alert(1)">x</a><a href="https://ok" target="_blank">y</a><img src="data:text/html;base64,AAA">`);
    expect(out).toContain("<a>x</a>");
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("<img>");
  });

  it("CSS อันตราย (@import / expression / javascript:) ถูกตัดทิ้ง", () => {
    const out = sanitizeCustomHtml(`<style>@import url(https://x);\n.a{color:red}\n.b{background:url(javascript:1)}</style><p style="width:expression(1)">x</p>`);
    expect(out).toContain(".a{color:red}");
    expect(out).not.toContain("@import");
    expect(out).not.toContain("javascript");
    expect(out).toContain("<p>x</p>");
  });

  it("ว่าง/ยาวเกิน จัดการได้", () => {
    expect(sanitizeCustomHtml("")).toBe("");
    expect(sanitizeCustomHtml("<p>" + "ก".repeat(100), 50).length).toBeLessThanOrEqual(60);
  });
});

describe("scopeCss", () => {
  it("เติม scope หน้าทุก selector · body/html กลายเป็นกล่องเอง · keyframes คงเดิม · media ไล่เข้าไปข้างใน", () => {
    const css = `body{margin:0} .a, h1{color:red} @keyframes spin{from{opacity:0}to{opacity:1}} @media (max-width:600px){.a{display:none}}`;
    const out = scopeCss(css, "s1");
    expect(out).toContain('[data-ch="s1"]{margin:0}');
    expect(out).toContain('[data-ch="s1"] .a, [data-ch="s1"] h1{color:red}');
    expect(out).toContain("@keyframes spin{from{opacity:0}to{opacity:1}}");
    expect(out).toContain('@media (max-width:600px){[data-ch="s1"] .a{display:none}}');
  });
});

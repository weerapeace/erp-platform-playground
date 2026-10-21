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

  it("🔒 แท็กซ้อนหลอก (ตัดแท็กปลอมแล้วกลายเป็นแท็กอันตราย) ไม่หลุด — audit 2026-10-21", () => {
    for (const payload of [
      `<<x>img src=x onerror=alert(1)>`,
      `<scr<script>x</script>ipt>alert(1)</scr<script>x</script>ipt>`,
      `<<p>script>alert(1)<</p>/script>`,
      `<a href="/x">ok</a><<b>img onerror=alert(1) src=/a.png>`,
      `<!-<!---->-><img src=/a.png onerror=alert(1)>`,
      `<style onload=alert(1)>.a{}`,
    ]) {
      const out = sanitizeCustomHtml(payload);
      expect(out, payload).not.toMatch(/<script/i);
      expect(out, payload).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    }
  });

  it("🔒 CSS ปิดแท็ก style หลอก (</sty</stylele>) ไม่หลุดออกจาก <style>", () => {
    const out = sanitizeCustomHtml(`<style>.a{color:red}</sty</stylele><img src=/a.png onerror=alert(1)></style>`);
    expect(out).not.toMatch(/onerror/i);
  });

  it("ล้างซ้ำได้ผลเดิม (เนื้อหาปกติไม่เพี้ยน) · rel ไม่งอกซ้ำ", () => {
    const html = `<section class="hero"><h1 style="color:#c08b9c">ร้าน</h1><a href="https://x.com" target="_blank" rel="nofollow">ลิงก์</a><img src="/a.png" alt="รูป" /><br/><video controls src="https://v.mp4"></video><svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg><style>.hero h1{font-size:2rem}</style></section>`;
    const once = sanitizeCustomHtml(html);
    expect(sanitizeCustomHtml(once)).toBe(once);
    expect(once.match(/rel=/g)?.length).toBe(1);
    expect(once).toContain('rel="noopener noreferrer"');
    expect(once).toContain('<h1 style="color:#c08b9c">ร้าน</h1>');
    expect(once).not.toContain("&lt;");
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

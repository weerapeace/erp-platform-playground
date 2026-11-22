import { describe, expect, it } from "vitest";
import { cleanStyle, isFlowAlign, isHexColor, plainToRich, richToPlain, sanitizeRich, wrapRich } from "@/lib/flowchart-rich";

describe("ตัวกรองข้อความจัดรูปแบบ (กันโค้ดแอบแฝง)", () => {
  it("เก็บแท็ก/สไตล์ที่อนุญาต · ทิ้ง event / ลิงก์ / รูป / script ทั้งเนื้อหา", () => {
    expect(sanitizeRich(`<b onclick="x()">หนา</b><i>เอียง</i>`)).toBe("<b>หนา</b><i>เอียง</i>");
    expect(sanitizeRich(`<script>alert(1)</script>ok`)).toBe("ok");
    expect(sanitizeRich(`<img src=x onerror=alert(1)>a`)).toBe("a");
    expect(sanitizeRich(`<a href="javascript:x">ลิงก์</a>`)).toBe("ลิงก์");
    expect(sanitizeRich(`<style>*{}</style><svg><script>x</script></svg>t`)).toBe("t");
    expect(sanitizeRich(`<scr<script>ipt>alert(1)</script>`)).toBe("ipt&gt;alert(1)");   // เหลือเป็นตัวหนังสือธรรมดา ไม่ใช่แท็ก
    expect(sanitizeRich(`<img src=x onerror=alert(1)`)).toBe("&lt;img src=x onerror=alert(1)");
    expect(sanitizeRich(`<!-- c --><span style="color:red;background:url(x)">x</span>`)).toBe("x");
  });
  it("สไตล์: สี hex/rgb · ขนาด 8-72px · หนา/เอียง/ขีด · จัดชิด — อย่างอื่นทิ้ง", () => {
    expect(cleanStyle("color: rgb(255, 0, 10); font-size: 18px; position:fixed; text-align:center")).toBe("color:rgb(255, 0, 10);font-size:18px;text-align:center");
    expect(cleanStyle("color:#FF0000;font-size:200px;font-weight:bold;text-decoration:underline line-through")).toBe("color:#ff0000;font-weight:bold;text-decoration:underline line-through");
    expect(cleanStyle("color:expression(alert(1))")).toBe("");
  });
  it("ปิดแท็กให้ครบ · แท็กปิดเกิน = ทิ้ง", () => {
    expect(sanitizeRich("<b><i>x")).toBe("<b><i>x</i></b>");
    expect(sanitizeRich("x</b><br>y")).toBe("x<br>y");
  });
});

describe("แปลงข้อความ", () => {
  it("HTML → ข้อความล้วน (ย่อหน้า = บรรทัด · รายการ = •)", () => {
    expect(richToPlain("<div><b>หัวข้อ</b></div><div>บรรทัด &amp; 2</div>")).toBe("หัวข้อ\nบรรทัด & 2");
    expect(richToPlain("<ul><li>a</li><li>b</li></ul>")).toBe("• a\n• b");
  });
  it("ข้อความล้วน → HTML ตั้งต้น หน้าตาเหมือนเดิม และแปลงกลับได้ข้อความเดิม", () => {
    const h = plainToRich("หัวข้อ\nรายละเอียด <1>", "#64748b");
    expect(h).toBe(`<div><b style="font-size:13px">หัวข้อ</b></div><div style="font-size:11px;color:#64748b">รายละเอียด &lt;1&gt;</div>`);
    expect(richToPlain(h)).toBe("หัวข้อ\nรายละเอียด <1>");
  });
  it("จัดทั้งกล่อง: ห่อสไตล์ · สี/ขนาดใหม่ล้างค่าข้างในก่อน", () => {
    expect(wrapRich("<b>x</b>", { bold: true, underline: true })).toBe(`<span style="font-weight:bold;text-decoration:underline"><b>x</b></span>`);
    expect(wrapRich(`<span style="color:#111111;font-size:11px">x</span>`, { color: "#ff0000" })).toBe(`<span style="color:#ff0000"><span style="font-size:11px">x</span></span>`);
    expect(wrapRich("x", {})).toBe("x");
    // ลากสีรัว ๆ = ไม่ซ้อนชั้นเพิ่ม
    let h = "x"; for (const c of ["#111111", "#222222", "#333333"]) h = wrapRich(h, { color: c });
    expect(h).toBe(`<span style="color:#333333">x</span>`);
  });
  it("ตรวจค่า", () => {
    expect(isFlowAlign("right")).toBe(true);
    expect(isFlowAlign("top")).toBe(false);
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("red")).toBe(false);
  });
});

describe("แถบจัดข้อความ: ไฮไลต์ + ลิงก์ (2026-11-22)", () => {
  it("ไฮไลต์ = background-color เก็บได้ · ค่าแปลกทิ้ง", () => {
    expect(sanitizeRich('<span style="background-color: #fef08a">x</span>')).toBe('<span style="background-color:#fef08a">x</span>');
    expect(sanitizeRich('<span style="background-color: url(x)">x</span>')).toBe("x");
  });
  it("ลิงก์: เว็บ/หน้าในระบบเท่านั้น · เปิดแท็บใหม่ · javascript: ทิ้งแต่เก็บข้อความ", () => {
    expect(sanitizeRich('<a href="https://a.com/x?y=1&z=2" onclick="evil()">ไป</a>')).toBe('<a href="https://a.com/x?y=1&amp;z=2" target="_blank" rel="noopener noreferrer">ไป</a>');
    expect(sanitizeRich('<a href="/tasks">งาน</a>')).toContain('href="/tasks"');
    expect(sanitizeRich('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRich('<a href="https://a.com" style="color:red">y</a>')).not.toContain("color");
  });
});

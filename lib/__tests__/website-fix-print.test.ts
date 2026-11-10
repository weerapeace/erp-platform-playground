import { describe, expect, it } from "vitest";
import { buildWebFixPrint, webFixCounts, webFixDefaults, webFixDetail, webFixGroupOf, type WebFixRow } from "../website-fix-print";

const ROWS: WebFixRow[] = [
  {
    id: "p1", code: "LEABL002", name: "สร้อยข้อมือหนังวัวแท้", image_url: "/api/r2-image?key=a.jpg&w=96", category: null, published: false,
    issues: [
      { key: "no_category", label: "ยังไม่อยู่หมวดไหน" },
      { key: "swatch_missing", label: "สียังไม่ผูกทะเบียนสี 1", detail: "กะปิ (07)" },
      { key: "color_no_web_image", label: "ยังไม่มีรูปบนเว็บเลย", detail: "ยังไม่มีรูปบนเว็บ: ดำ (01), แทน (02)" },
    ],
  },
  {
    id: "p2", code: "MGN191", name: "เข็มขัดหนัง Rasual", image_url: null, category: "เข็มขัด", published: true,
    issues: [
      { key: "no_price", label: "ยังไม่มีราคา" },
      { key: "color_no_web_image", label: "รูปเว็บ 3/11 สี", detail: "ยังไม่มีรูปบนเว็บ: เทา, ครีม" },
    ],
  },
  { id: "p3", code: "MGN364", name: "เข็มขัดหนังวัว", image_url: null, category: "เข็มขัด", published: true, issues: [] },
];
const base = { rows: ROWS, printedAt: "10/11/2569", origin: "https://erp.test", shop: "Louis Montini", scope: "ตัวกรอง ต้องแก้" };

describe("กลุ่มเรื่อง + รายละเอียด", () => {
  it("รูปบนเว็บแยก ไม่มีเลย / บางสี เหมือนชิปตัวกรอง", () => {
    expect(webFixGroupOf(ROWS[0].issues[2])).toBe("web_none");
    expect(webFixGroupOf(ROWS[1].issues[1])).toBe("web_part");
    expect(webFixDetail(ROWS[0].issues[2], ROWS[0])).toBe("ดำ (01), แทน (02)");
    expect(webFixDetail(ROWS[1].issues[1], ROWS[1])).toBe("รูปเว็บ 3/11 สี · ขาด เทา, ครีม");
    expect(webFixDetail({ key: "no_category", label: "ยังไม่อยู่หมวดไหน" }, { category: "กำไล" })).toBe("หมวด ERP: กำไล");
  });
  it("นับรุ่นต่อเรื่อง", () => {
    const c = webFixCounts(ROWS);
    expect(c.get("web_none")).toBe(1);
    expect(c.get("web_part")).toBe(1);
    expect(c.get("no_price")).toBe(1);
  });
});

describe("buildWebFixPrint", () => {
  it("แบบ B (ค่าเริ่ม): หัวข้อละเรื่อง ขึ้นหน้าใหม่ต่อเรื่อง · รุ่นที่ไม่มีเรื่องไม่พิมพ์", () => {
    const r = buildWebFixPrint({ ...base, settings: webFixDefaults() });
    expect(r.models).toBe(2);
    expect(r.html).toContain("ยังไม่มีรูปบนเว็บเลย — 1 รุ่น");
    expect(r.html).toContain("ยังไม่มีราคา — 1 รุ่น");
    expect(r.html).toContain("grp-break");
    expect(r.html).toContain("รายละเอียด");
    expect(r.html).not.toContain("MGN364");
    expect(r.groupCounts.length).toBe(5);
  });
  it("แบบ A: 1 แถวต่อรุ่น + ช่องติ๊กย่อยทุกเรื่อง", () => {
    const r = buildWebFixPrint({ ...base, settings: { ...webFixDefaults(), groupBy: "", pageBreakPerGroup: false } });
    expect(r.groupCounts).toEqual([2]);
    expect((r.html.match(/class="fx-bx"/g) ?? []).length).toBe(5);
    expect(r.html).toContain("สียังไม่ผูกทะเบียนสี<span class=\"sub\"> — กะปิ (07)");
  });
  it("เลือกเฉพาะบางเรื่อง = รุ่นที่ไม่เหลือเรื่องนั้นหายไป", () => {
    const r = buildWebFixPrint({ ...base, settings: webFixDefaults(), include: new Set(["no_price"]) });
    expect(r.models).toBe(1);
    expect(r.html).toContain("MGN191");
    expect(r.html).not.toContain("LEABL002");
  });
  it("รูปที่เป็นลิงก์ในระบบ เติมโดเมนให้ · ข้อความถูก escape", () => {
    const r = buildWebFixPrint({ ...base, rows: [{ ...ROWS[0], name: "<b>x</b>" }], settings: webFixDefaults() });
    expect(r.html).toContain("https://erp.test/api/r2-image?key=a.jpg");
    expect(r.html).not.toContain("<b>x</b>");
  });
  it("ไม่มีอะไรต้องแก้ = ข้อความว่าง", () => {
    const r = buildWebFixPrint({ ...base, settings: webFixDefaults(), include: new Set() });
    expect(r.models).toBe(0);
    expect(r.html).toContain("ไม่มีรายการที่ต้องแก้");
  });
});

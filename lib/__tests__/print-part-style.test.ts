import { describe, it, expect } from "vitest";
import { normalizePrintPartStyles, printPartCss, printPartFontLinks, stripPerCardStyles, dropPerCardBeyond, copyablePartStyle, QUOTE_CARD_PARTS } from "@/lib/print-part-style";
import { buildQuotationHtml } from "@/lib/quotation-print";
import { writeFileSync } from "node:fs";

describe("ปรับหน้าตาทีละกล่องในเอกสารพิมพ์", () => {
  it("ทิ้งค่าที่ไม่ถูกต้อง · เฉพาะการ์ดเก็บแค่ซ่อน", () => {
    const v = normalizePrintPartStyles({
      name: { sizePx: 999, color: "red", font: "Comic", bold: true, align: "middle" },
      "price#1": { hide: true, sizePx: 20 },
      "Bad Key": { hide: true },
      img: { imgMm: 5, fit: "cover" },
      empty: {},
    });
    expect(v).toEqual({ name: { sizePx: 60, bold: true }, "price#1": { hide: true }, img: { imgMm: 15, fit: "cover" } });
  });

  it("แปลงเป็น CSS — ไม่ตั้ง = ว่าง", () => {
    expect(printPartCss({}, QUOTE_CARD_PARTS)).toBe("");
    const css = printPartCss({ price: { sizePx: 30, align: "center", color: "#a32d2d" }, "name#2": { hide: true }, sku: { hide: true } }, QUOTE_CARD_PARTS);
    expect(css).toContain('.page [data-pp="price"] b { font-size: 30px !important; }');
    expect(css).toContain("justify-content: center !important");
    expect(css).toContain("color: #a32d2d !important");
    expect(css).toContain('.page [data-ci="2"] [data-pp="name"]');
    expect(css).toContain('.page [data-pp="sku"] { display: none !important; }');
  });

  it("คีย์ที่ไม่มีในทะเบียนไม่ออก CSS", () => {
    expect(printPartCss({ nope: { hide: true } }, QUOTE_CARD_PARTS)).toBe("");
  });

  it("โหลดเฉพาะฟอนต์ที่เลือก", () => {
    expect(printPartFontLinks({})).toBe("");
    expect(printPartFontLinks({ a: { font: "Noto Sans Thai" }, b: { font: "Noto Sans Thai" } })).toContain("family=Noto+Sans+Thai:wght@400;700");
  });

  it("ค่าเริ่มต้นไม่พาค่าเฉพาะการ์ด · การ์ดหายไปแล้วค่าเฉพาะการ์ดถูกทิ้ง · คัดลอกไม่พาซ่อน", () => {
    const v = { name: { bold: true }, "name#0": { hide: true }, "name#5": { hide: true } };
    expect(stripPerCardStyles(v)).toEqual({ name: { bold: true } });
    expect(dropPerCardBeyond(v, 3)).toEqual({ name: { bold: true }, "name#0": { hide: true } });
    expect(copyablePartStyle({ hide: true, sizePx: 12 })).toEqual({ sizePx: 12 });
  });
});


describe("ใบเสนอราคาแบบการ์ด — ติดป้ายกล่อง + ใช้สไตล์", () => {
  const quote = {
    quote_number: "QT-TEST-0001", customer_name: "ลูกค้าทดสอบ", quote_date: "2026-11-18", grand_total: 1700, subtotal: 1700, vat_rate: 7, total_vat: 0, note: "หมายเหตุทดสอบ",
    lines: [
      { product_name: "กระเป๋า แบรนด์ใหม่", note: "ใบเล็ก", qty: 1, unit_price: 650 },
      { product_name: "กระเป๋า แบรนด์ใหม่", note: "ใบใหญ่", qty: 1, unit_price: 1050 },
    ],
  };
  it("ทุกกล่องมี data-pp · การ์ดมี data-ci · สไตล์ลงท้าย <style>", () => {
    const html = buildQuotationHtml(quote, "", { lineStyle: "cards", partStyles: { price: { sizePx: 40, color: "#a32d2d" }, "note#1": { hide: true }, title: { font: "Kanit" } } });
    for (const k of ["company", "address", "title", "meta", "customer", "card", "no", "img", "name", "note", "price", "foot", "cardnote", "grand", "sign"]) expect(html).toContain(`data-pp="${k}"`);
    expect(html).toContain('data-ci="1"');
    expect(html).toContain('.page [data-pp="price"] b { font-size: 40px !important; }');
    expect(html).toContain('.page [data-ci="1"] [data-pp="note"]');
    expect(html).toContain("family=Kanit");
    if (process.env.PP_DUMP) writeFileSync(process.env.PP_DUMP, html);
  });
  it("แบบตารางไม่ใส่สไตล์ทีละกล่อง", () => {
    const html = buildQuotationHtml(quote, "", { lineStyle: "table", partStyles: { title: { hide: true } } });
    expect(html).not.toContain('[data-pp="title"] { display: none');
  });
});

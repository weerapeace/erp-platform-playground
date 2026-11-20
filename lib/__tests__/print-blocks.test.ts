import { describe, it, expect } from "vitest";
import { normalizeCardFields, normalizePageBlocks, normalizeCardOrder, cardFieldValue, printBlockPartDefs } from "@/lib/print-blocks";
import { normalizeReportLayout } from "@/lib/report-layout";
import { buildQuotationHtml } from "@/lib/quotation-print";

describe("จัดหน้าเอง — ช่องในการ์ด + กล่องบนหน้า", () => {
  it("ทิ้งค่าที่ไม่ถูกต้อง", () => {
    expect(normalizeCardFields([{ id: "ab12", kind: "sku", key: "materials", label: "วัสดุ" }, { id: "zz99", kind: "sku", key: "standard_price", label: "ทุน" }, { id: "x", kind: "text", text: "a" }, { id: "tt11", kind: "text", text: "  " }]))
      .toEqual([{ id: "ab12", kind: "sku", key: "materials", label: "วัสดุ" }]);
    expect(normalizePageBlocks([{ id: "bb11", slot: "top", kind: "text", text: "สวัสดี" }, { id: "bb22", slot: "nowhere", kind: "text", text: "x" }, { id: "bb33", slot: "end", kind: "image", imageKey: "../../etc" }]))
      .toEqual([{ id: "bb11", slot: "top", kind: "text", text: "สวัสดี" }]);
  });
  it("ลำดับ: ช่องพื้นฐานครบเสมอ · ช่องใหม่แทรกก่อนราคา · ช่องที่ลบแล้วหาย", () => {
    const fields = normalizeCardFields([{ id: "ab12", kind: "sku", key: "materials", label: "วัสดุ" }]);
    expect(normalizeCardOrder([], fields)).toEqual(["base:sku", "base:name", "base:note", "f:ab12", "base:price", "base:foot"]);
    expect(normalizeCardOrder(["base:price", "f:gone", "base:name"], [])).toEqual(["base:price", "base:name", "base:sku", "base:note", "base:foot"]);
  });
  it("ค่าว่าง = ไม่วาด · ตัวเลขจัดรูป", () => {
    const f = { id: "ab12", kind: "sku" as const, key: "materials", label: "วัสดุ" };
    expect(cardFieldValue(f, {}, { materials: "  " }, 0)).toBeNull();
    expect(cardFieldValue(f, {}, { materials: "PU" }, 0)).toBe("PU");
    expect(cardFieldValue({ id: "m", kind: "sku", key: "moq", label: "" }, {}, { moq: 1000 }, 0)).toBe("1,000");
    expect(cardFieldValue({ id: "d1", kind: "line", key: "discount", label: "" }, { discount_amount: 0 }, null, 0)).toBeNull();
  });
  it("ไม่เคยจัด = เก็บลำดับว่าง (ใบเดิมหน้าตาเหมือนเดิม)", () => {
    expect(normalizeReportLayout({}).cardOrder).toEqual([]);
    expect(normalizeReportLayout({ cardFields: [{ id: "ab12", kind: "text", text: "ผลิต 30 วัน", label: "" }] as never }).cardOrder).toContain("f:ab12");
  });
  it("วาดลงใบ: แถวจาก SKU · ข้อความ · กล่องบนหน้า · จุดเพิ่มกล่อง (ซ่อนตอนพิมพ์)", () => {
    const quote = { quote_number: "QT-1", quote_date: "2026-11-20", grand_total: 0, lines: [
      { product_name: "A", qty: 1, unit_price: 100, sku_fields: { materials: "PU หนา" } },
      { product_name: "B", qty: 1, unit_price: 200, sku_fields: { materials: "" } },
    ] };
    const html = buildQuotationHtml(quote, "", {
      lineStyle: "cards",
      cardFields: [{ id: "ab12", kind: "sku", key: "materials", label: "วัสดุ" }, { id: "tt11", kind: "text", text: "ผลิต $& 30 วัน", label: "" }],
      pageBlocks: [{ id: "bb11", slot: "top", kind: "text", text: "เรียน $1 คุณเต้ง" }, { id: "bb22", slot: "after", kind: "divider" }],
    } as never);
    expect(html.match(/data-pp="f-ab12"/g)?.length).toBe(1);   // การ์ด B ไม่มีวัสดุ → ไม่มีแถว
    expect(html).toContain("PU หนา");
    expect(html).toContain("ผลิต $&amp; 30 วัน");
    expect(html).toContain("เรียน $1 คุณเต้ง");
    expect(html).toContain('data-pp="b-bb22"');
    expect(html).toContain('class="pp-slot" data-slot="top"');
    expect(html).toContain(".pp-slot { display: none; }");
    expect(printBlockPartDefs([{ id: "ab12", kind: "sku", key: "materials", label: "วัสดุ" }], []).map((d) => d.key)).toEqual(["f-ab12"]);
  });
});

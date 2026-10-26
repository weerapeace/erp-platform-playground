import { describe, expect, it } from "vitest";
import { coerceCell, erpWriteValue, parseClipboardGrid, sameCell } from "./grid-edit";
import { WEB_GRID_FIELDS, sanitizeGridPatch, webGridPatch, webGridValidate, type WebGridRow } from "./website-listing-fields";

describe("parseClipboardGrid", () => {
  it("แถว/คอลัมน์จาก Excel", () => {
    expect(parseClipboardGrid("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseClipboardGrid("x")).toEqual([["x"]]);
    expect(parseClipboardGrid("a\r\nb")).toEqual([["a"], ["b"]]);
  });
  it("ช่องในเครื่องหมายคำพูดมีขึ้นบรรทัด", () => {
    expect(parseClipboardGrid('"บรรทัด1\nบรรทัด2"\tz\n')).toEqual([["บรรทัด1\nบรรทัด2", "z"]]);
    expect(parseClipboardGrid('"มี ""คำพูด"""')).toEqual([['มี "คำพูด"']]);
  });
});

describe("coerceCell", () => {
  const stock = [{ value: "in", label: "พร้อมส่ง" }, { value: "out", label: "สินค้าหมด" }];
  it("ตามชนิด", () => {
    expect(coerceCell("bool", "ใช่")).toBe(true);
    expect(coerceCell("bool", "ปิด")).toBe(false);
    expect(coerceCell("bool", "อาจจะ")).toBeUndefined();
    expect(coerceCell("money", "฿1,190")).toBe("1190");
    expect(coerceCell("money", "abc")).toBeUndefined();
    expect(coerceCell("stock", "สินค้าหมด", stock)).toBe("out");
    expect(coerceCell("stock", "อะไร", stock)).toBeUndefined();
    expect(coerceCell("date", "25/10/2569")).toBe("2026-10-25");
    expect(coerceCell("categories", "พร้อมส่ง, out", stock)).toEqual(["in", "out"]);
    expect(coerceCell("relation", "x")).toBeUndefined();
    expect(coerceCell("text", " คงช่องว่าง ")).toBe(" คงช่องว่าง ");
  });
});

describe("sameCell / erpWriteValue", () => {
  it("ว่างเท่ากัน", () => {
    expect(sameCell(null, "")).toBe(true);
    expect(sameCell(["a"], ["a"])).toBe(true);
    expect(sameCell("1", 1)).toBe(true);
    expect(sameCell("1", "2")).toBe(false);
  });
  it("แปลงค่าส่ง ERP", () => {
    expect(erpWriteValue("money", "1,190")).toEqual({ value: 1190 });
    expect(erpWriteValue("number", "")).toEqual({ value: null });
    expect(erpWriteValue("number", "x")).toEqual({ error: "ต้องเป็นตัวเลข" });
    expect(erpWriteValue("bool", true)).toEqual({ value: true });
    expect(erpWriteValue("text", "")).toEqual({ value: null });
    expect(erpWriteValue("relation", "abc")).toEqual({ value: "abc" });
  });
});

describe("web grid registry", () => {
  const row: WebGridRow = {
    parent_sku_id: "p",
    is_published: true,
    featured: null,
    web_name: null,
    web_price: "890.00",
    web_description: null,
    web_unit: null,
    web_categories: null,
    web_badge: null,
    web_stock_status: null,
    web_swatch: null,
    web_size_guide: null,
    web_seo: { title: "เดิม", description: "คำอธิบายเดิม" },
    web_related: ["A1"],
  };
  const read = (k: string) => WEB_GRID_FIELDS.find((f) => f.key === k)!.read(row);
  it("อ่านค่า", () => {
    expect(read("published")).toBe(true);
    expect(read("webPrice")).toBe("890");
    expect(read("webStockStatus")).toBe("in");
    expect(read("seo.title")).toBe("เดิม");
    expect(read("webRelated")).toBe("A1");
  });
  it("สร้าง patch · SEO รวมกับของเดิม", () => {
    const p = webGridPatch(row, { webPrice: "1,290", "seo.title_en": "New", featured: true, webRelated: "a1, B2", webName: "" });
    expect(p).toMatchObject({ webPrice: 1290, featured: true, webRelated: ["a1", "B2"], webName: "" });
    expect(p.webSeo).toEqual({ title: "เดิม", description: "คำอธิบายเดิม", title_en: "New", description_en: "" });
    expect(webGridPatch(row, { webPrice: "" }).webPrice).toBeNull();
  });
  it("ตรวจค่า + กรองช่อง", () => {
    expect(webGridValidate("webPrice", "-5")).toBe("ราคาต้องเป็นตัวเลขมากกว่า 0 (หรือเว้นว่าง)");
    expect(webGridValidate("webPrice", "")).toBeNull();
    expect(webGridValidate("webStockStatus", "x")).toBe("เลือกสถานะสต๊อก");
    expect(sanitizeGridPatch({ webPrice: 1, webImages: ["x"] } as never)).toEqual({ webPrice: 1 });
  });
});

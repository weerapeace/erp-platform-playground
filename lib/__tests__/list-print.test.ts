import { describe, expect, it } from "vitest";
import {
  applyListPrintPreset, cleanListPrintSettings, defaultListPrintSettings, estimateListPages, isCustomColumn, listPrintCss,
  newCustomColumn, renderListTable, resolveListColumns, type ListPrintColumn,
} from "@/lib/list-print";

const AVAIL: ListPrintColumn[] = [
  { key: "img", label: "รูป" }, { key: "sku", label: "SKU", mono: true }, { key: "name", label: "ชื่อสินค้า" },
  { key: "qty", label: "จำนวน", align: "right" },
];
const D = defaultListPrintSettings(AVAIL);

describe("list print settings", () => {
  it("defaults turn every available column on in order", () => {
    expect(D.columns.map((c) => c.key)).toEqual(["img", "sku", "name", "qty"]);
    expect(D.columns.every((c) => c.on)).toBe(true);
  });

  it("clean keeps valid values, clamps numbers, drops unknown columns and appends new ones", () => {
    const s = cleanListPrintSettings({
      paper: "A3", orientation: "landscape", fontPx: 99, image: "huge", density: "airy", zebra: true,
      columns: [{ key: "name", on: true, label: " ชื่อ " }, { key: "hack<", on: true }, { key: "x_note", on: true }, { key: "sku", on: false }, { key: "name", on: false }],
      title: "x".repeat(200), companyId: null, pageNumbers: false,
    }, AVAIL, D);
    expect(s.paper).toBe("A4");
    expect(s.orientation).toBe("landscape");
    expect(s.fontPx).toBe(14);
    expect(s.image).toBe("m");
    expect(s.density).toBe("airy");
    expect(s.columns).toEqual([
      { key: "name", on: true, label: "ชื่อ" }, { key: "x_note", on: true }, { key: "sku", on: false },
      { key: "img", on: true }, { key: "qty", on: true },
    ]);
    expect(s.title.length).toBe(80);
    expect(s.pageNumbers).toBe(false);
    expect(cleanListPrintSettings(null, AVAIL, D)).toEqual(D);
  });

  it("resolves the printed columns: order, renamed labels, extras, image off", () => {
    const s = { ...D, columns: [{ key: "qty", on: true, label: "เหลือ" }, { key: "img", on: true }, { key: "x_check", on: true }, { key: "sku", on: false }, { key: "name", on: true }] };
    expect(resolveListColumns(s, AVAIL).map((c) => `${c.key}:${c.label}`)).toEqual(["qty:เหลือ", "img:รูป", "x_check:ตรวจแล้ว", "name:ชื่อสินค้า"]);
    expect(resolveListColumns({ ...s, image: "none" }, AVAIL).map((c) => c.key)).toEqual(["qty", "x_check", "name"]);
  });

  it("custom named columns: keep name/type/width, drop ones without a name, print as blank cells", () => {
    const c = newCustomColumn("  วันที่รับ ");
    expect(isCustomColumn(c.key)).toBe(true);
    expect(c).toMatchObject({ on: true, label: "วันที่รับ", blank: "line", widthMm: 25 });
    const s = cleanListPrintSettings({
      ...D,
      columns: [{ key: "name", on: true }, { ...c, widthMm: 999 }, { key: "c_box1", on: true, label: "ผ่าน QC", blank: "box" }, { key: "c_noname", on: true, label: " " }, { key: "c_BAD!", on: true, label: "x" }],
    }, AVAIL, D);
    expect(s.columns.slice(0, 3)).toEqual([{ key: "name", on: true }, { ...c, widthMm: 150 }, { key: "c_box1", on: true, label: "ผ่าน QC", blank: "box" }]);
    expect(s.columns.some((x) => x.key === "c_noname")).toBe(false);
    const cols = resolveListColumns(s, AVAIL);
    expect(cols.slice(0, 3).map((x) => [x.key, x.label, x.blank, x.widthMm, x.align])).toEqual([
      ["name", "ชื่อสินค้า", undefined, undefined, undefined],
      [c.key, "วันที่รับ", "line", 150, undefined],
      ["c_box1", "ผ่าน QC", "box", 25, "center"],
    ]);
    const html = renderListTable(cols.slice(0, 3), [{ name: "ก" }]);
    expect(html).toContain(`<th class="xb" data-col="${c.key}">วันที่รับ</th>`);
    expect(html).toContain(`<col data-col="${c.key}" style="width:150mm" />`);
    expect(html).toContain(`<td class="c xb"><span class="chk"></span></td>`);
  });

  it("any column can get a dragged width (clamped); image width follows image size", () => {
    const s1 = cleanListPrintSettings({ ...D, columns: [{ key: "sku", on: true, widthMm: 33.4 }, { key: "name", on: true, widthMm: 2 }, { key: "img", on: true, widthMm: 50 }, { key: "qty", on: true, widthMm: "x" }] }, AVAIL, D);
    expect(s1.columns.map((c) => c.widthMm)).toEqual([33, 6, 50, undefined]);
    const cols = resolveListColumns(s1, AVAIL);
    expect(cols.map((c) => [c.key, c.widthMm])).toEqual([["sku", 33], ["name", 6], ["img", undefined], ["qty", undefined]]);
    expect(renderListTable(cols, [])).toContain('<col data-col="sku" style="width:33mm" />');
  });

  it("a quick write-in column can switch to a tick box and change width", () => {
    const s = { ...D, columns: [{ key: "x_note", on: true, blank: "box" as const, widthMm: 14 }] };
    expect(resolveListColumns(s, AVAIL)[0]).toMatchObject({ key: "x_note", label: "หมายเหตุ", blank: "box", widthMm: 14, align: "center" });
  });

  it("presets put their columns first and switch the rest off", () => {
    const p = applyListPrintPreset(D, { id: "p", name: "ย่อ", settings: { image: "none", columns: [{ key: "name", on: true }, { key: "x_note", on: true }] } }, AVAIL);
    expect(p.image).toBe("none");
    expect(p.columns).toEqual([{ key: "name", on: true }, { key: "x_note", on: true }, { key: "img", on: false }, { key: "sku", on: false }, { key: "qty", on: false }]);
  });

  it("renders a table with blank write-in cells and a total row", () => {
    const cols = resolveListColumns({ ...D, columns: [{ key: "sku", on: true }, { key: "name", on: true }, { key: "qty", on: true }, { key: "x_check", on: true }] }, AVAIL);
    const html = renderListTable(cols, [{ sku: "A-1", name: "กระเป๋า", qty: "5" }], { label: "รวม 1 รายการ", cells: { qty: "5" } });
    expect(html).toContain('<td class="mono">A-1</td>');
    expect(html).toContain('<td class="c xb"><span class="chk"></span></td>');
    expect(html).toContain('<td colspan="2">รวม 1 รายการ</td><td class="r">5</td><td class="c xb"></td>');
    expect(renderListTable([], [])).toContain("ยังไม่ได้เลือกคอลัมน์");
  });

  it("css follows settings (page numbers, zebra, image size)", () => {
    const css = listPrintCss({ ...D, zebra: true, image: "l", pageNumbers: true });
    expect(css).toContain("counter(pages)");
    expect(css).toContain("nth-child(even)");
    expect(css).toContain(".thumb { width: 20mm; height: 20mm; }");
    expect(listPrintCss({ ...D, pageNumbers: false })).not.toContain("counter(page)");
  });

  it("estimates fewer pages for a compact sheet without images", () => {
    const big = estimateListPages([330], { ...D, image: "l" });
    const small = estimateListPages([330], { ...D, image: "none", density: "compact", fontPx: 10 });
    expect(big).toBeGreaterThan(small);
    expect(estimateListPages([10, 10, 10], { ...D, pageBreakPerGroup: true, groupBy: "brand" })).toBe(3);
  });
});

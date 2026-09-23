import { describe, expect, it } from "vitest";
import { sortQuoteLines } from "@/lib/quotation-print";

// เคสจริง QT-202609-0007: 4 บรรทัดไม่มีตัวเลือก + 4 บรรทัด "ใบเล็ก" ราคาขั้นบันไดตามจำนวน
const lines = [
  { sku: "B", product_name: "กระเป๋า", qty: 500, unit_price: 350, note: null },
  { sku: "A", product_name: "กระเป๋า", qty: 1000, unit_price: 320, note: null },
  { sku: "C", product_name: "กระเป๋า", qty: 200, unit_price: 380, note: null },
  { sku: "A10", product_name: "กระเป๋า", qty: 100, unit_price: 400, note: null },
  { sku: "A2", product_name: "กระเป๋า", qty: 500, unit_price: 280, note: "ใบเล็ก" },
  { sku: "A1", product_name: "กระเป๋า", qty: 1000, unit_price: 250, note: "ใบเล็ก" },
  { sku: "", product_name: "กระเป๋า", qty: 200, unit_price: 310, note: "ใบเล็ก" },
  { sku: "", product_name: "กระเป๋า", qty: 100, unit_price: 330, note: "ใบเล็ก" },
];
const qtys = (l: typeof lines) => l.map(x => x.qty);

describe("sortQuoteLines", () => {
  it("keeps saved order when sortBy is none", () => {
    expect(sortQuoteLines(lines, {})).toBe(lines);
  });

  it("sorts by qty inside each option group (default)", () => {
    expect(qtys(sortQuoteLines(lines, { sortBy: "qty" }))).toEqual([100, 200, 500, 1000, 100, 200, 500, 1000]);
  });

  it("sorts by qty descending across all lines when grouping is off", () => {
    expect(qtys(sortQuoteLines(lines, { sortBy: "qty", sortDesc: true, sortGroupByNote: false })))
      .toEqual([1000, 1000, 500, 500, 200, 200, 100, 100]);
  });

  it("sorts by unit price", () => {
    expect(sortQuoteLines(lines, { sortBy: "price", sortGroupByNote: false }).map(x => x.unit_price))
      .toEqual([250, 280, 310, 320, 330, 350, 380, 400]);
  });

  it("sorts sku naturally (A2 before A10)", () => {
    expect(sortQuoteLines(lines, { sortBy: "sku" }).slice(0, 4).map(x => x.sku)).toEqual(["A", "A10", "B", "C"]);
    expect(sortQuoteLines(lines, { sortBy: "sku" }).slice(4).map(x => x.sku)).toEqual(["", "", "A1", "A2"]);
  });

  it("does not mutate the original array", () => {
    const before = qtys(lines);
    sortQuoteLines(lines, { sortBy: "qty" });
    expect(qtys(lines)).toEqual(before);
  });
});

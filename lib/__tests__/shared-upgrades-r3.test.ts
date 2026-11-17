import { describe, it, expect } from "vitest";
import { computeTotal, formatTotal, isSummableColumn, nextTotalMode, toNum } from "@/lib/table-totals";
import { estimateListPages, fitListToOnePage, FONT_MIN, type ListPrintSettings } from "@/lib/list-print";

describe("แถวรวมยอด (Σ รวม)", () => {
  it("เดาคอลัมน์ตัวเลข · ข้ามรหัส/id/เบอร์", () => {
    expect(isSummableColumn("amount", [100, "1,200", null, ""])).toBe(true);
    expect(isSummableColumn("name", ["ก", "ข", 3])).toBe(false);
    expect(isSummableColumn("code", [1, 2, 3])).toBe(false);
    expect(isSummableColumn("supplier_id", [1, 2])).toBe(false);
    expect(isSummableColumn("phone", ["0812345678"])).toBe(false);
    expect(isSummableColumn("qty", [])).toBe(false);
  });
  it("รวม / เฉลี่ย / สลับโหมด", () => {
    expect(computeTotal([100, "1,200", null, "x"], "sum")).toBe(1300);
    expect(computeTotal([1, 2], "avg")).toBe(1.5);
    expect(computeTotal([], "sum")).toBeNull();
    expect(formatTotal(1234.5)).toBe("1,234.5");
    expect(nextTotalMode("sum")).toBe("avg");
    expect(nextTotalMode("avg")).toBe("off");
    expect(nextTotalMode("off")).toBe("sum");
    expect(toNum("฿ 1,000")).toBe(1000);
  });
});

describe("พอดี 1 หน้า", () => {
  const base = {
    paper: "A4", orientation: "portrait", fontPx: 14, image: "m", density: "normal", zebra: false,
    signature: false, pageBreakPerGroup: false,
  } as unknown as ListPrintSettings;
  it("ลดเท่าที่จำเป็นจนลงหน้าเดียว", () => {
    const groups = [30];
    const noImg = { ...base, image: "none" } as ListPrintSettings;
    expect(estimateListPages(groups, noImg)).toBeGreaterThan(1);
    const r = fitListToOnePage(groups, noImg);
    expect(r.pages).toBe(1);
    expect(estimateListPages(groups, { ...noImg, ...r.patch })).toBe(1);
    expect(r.patch.image).toBeUndefined();
  });
  it("ลงหน้าเดียวอยู่แล้ว = ไม่เปลี่ยน · มากเกินไป = บอกจำนวนหน้าที่เหลือ", () => {
    expect(fitListToOnePage([3], base)).toEqual({ patch: {}, pages: 1 });
    const r = fitListToOnePage([500], base);
    expect(r.pages).toBeGreaterThan(1);
    expect(r.patch.fontPx).toBe(FONT_MIN);
  });
});

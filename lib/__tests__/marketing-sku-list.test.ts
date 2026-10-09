import { describe, it, expect } from "vitest";
import { cleanIds, cleanColor, countBy, isUuid, variantSummary, sortMarketingSkus, type MarketingSkuItem } from "@/lib/marketing/sku-list";

const A = "fd8d1b12-51cb-489f-a37a-352fb87f1278";
const B = "337b58c8-7952-47ab-a671-185224ea7e6f";

describe("marketing sku-list helpers", () => {
  it("isUuid รับเฉพาะ uuid", () => {
    expect(isUuid(A)).toBe(true);
    expect(isUuid("BBM02")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("cleanIds กรองของเสีย ตัดซ้ำ รับได้ทั้ง array และ comma string", () => {
    expect(cleanIds([A, A, "x", B, 5])).toEqual([A, B]);
    expect(cleanIds(`${A}, ${B},,bad`)).toEqual([A, B]);
    expect(cleanIds(undefined)).toEqual([]);
  });

  it("cleanIds จำกัดจำนวน", () => {
    expect(cleanIds([A, B], 1)).toEqual([A]);
  });

  it("cleanColor รับ hex เท่านั้น ไม่งั้นเป็นเทา", () => {
    expect(cleanColor("#F97316")).toBe("#F97316");
    expect(cleanColor("#abc")).toBe("#abc");
    expect(cleanColor("red")).toBe("#64748b");
    expect(cleanColor("url(javascript:1)")).toBe("#64748b");
  });

  it("variantSummary นับ SKU ย่อยที่ยังเปิดขาย / ทั้งหมด", () => {
    const v = (is_active: boolean) => ({ code: "x", color: null, is_active, image_key: null });
    expect(variantSummary([v(true), v(false), v(true)])).toEqual({ active: 2, total: 3 });
    expect(variantSummary([])).toEqual({ active: 0, total: 0 });
  });

  it("sortMarketingSkus: ตามป้าย (ไม่มีป้ายท้าย) / รหัสแบบเลข / SKU เหลือน้อยก่อน / แก้ล่าสุด", () => {
    const mk = (code: string, label_id: string | null, sku_active: number, updated_at: string | null): MarketingSkuItem =>
      ({ parent_sku_id: code, code, name: code, image_key: null, brand_id: null, label_id, note: null, sku_total: 5, sku_active, updated_at });
    const rows = [mk("BBP10", null, 5, null), mk("BBP2", "c", 1, "2026-10-01"), mk("BBP3", "h", 0, "2026-10-09")];
    const order = new Map([["h", 10], ["c", 20]]);
    expect(sortMarketingSkus(rows, "label", order).map((r) => r.code)).toEqual(["BBP3", "BBP2", "BBP10"]);
    expect(sortMarketingSkus(rows, "code", order).map((r) => r.code)).toEqual(["BBP2", "BBP3", "BBP10"]);
    expect(sortMarketingSkus(rows, "sku_low", order).map((r) => r.code)).toEqual(["BBP3", "BBP2", "BBP10"]);
    expect(sortMarketingSkus(rows, "updated", order).map((r) => r.code)).toEqual(["BBP3", "BBP2", "BBP10"]);
  });

  it("countBy นับตามคีย์", () => {
    const m = countBy([{ b: "x" }, { b: "y" }, { b: "x" }], (r) => r.b);
    expect(m.get("x")).toBe(2);
    expect(m.get("y")).toBe(1);
  });
});

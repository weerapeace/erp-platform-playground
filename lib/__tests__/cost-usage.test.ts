import { describe, it, expect } from "vitest";
import { costUsagePerUnit, type UsageLine } from "@/lib/cost-usage";

// ข้อมูลจริง DS-2026-0064 ไซส์ S: ผ้าขาวม้า (นาหมื่นศรี) ผืน 80×200 · 7 บรรทัดรวม 4,774.52 cm²
const PIECE = (qty: number, item = "nms"): UsageLine => ({ item_id: item, group_name: "ผ้า (ชิ้น)", qty, uom: "cm²", piece: true });
const SHEETS: Record<string, { width_cm: number | null; length_cm: number | null }> = {
  nms: { width_cm: 80, length_cm: 200 },
  foam: { width_cm: 150, length_cm: 200 },
  nosize: { width_cm: null, length_cm: null },
};
const sheetOf = (id: string) => SHEETS[id];

describe("costUsagePerUnit (ใช้ต่อใบ ที่หัวกลุ่มตีราคา)", () => {
  it("converts cm² of a sheet material into sheets per bag", () => {
    const u = costUsagePerUnit([1513.4, 998.2, 912.824, 660.1, 322, 299, 69].map((q) => PIECE(q)), sheetOf);
    expect(u.sheets?.area).toBeCloseTo(4774.524, 3);
    expect(u.sheets?.qty).toBeCloseTo(0.2984, 4);
    expect(u.sheets?.unit).toBe("ผืน");
    expect(u.sheets?.size).toBe("80×200");
    expect(u.sheets?.perSheet).toBe(3);
  });

  it("mixed sheet sizes: no single size / per-sheet count, reinforcement counts in แผ่น", () => {
    const u = costUsagePerUnit([PIECE(8000), { ...PIECE(15000, "foam"), group_name: "ตัวเสริม" }], sheetOf);
    expect(u.sheets?.qty).toBeCloseTo(1, 6);
    expect(u.sheets?.size).toBeNull();
    expect(u.sheets?.unit).toBe("ผืน/แผ่น");
    expect(u.sheets?.perSheet).toBeNull();
  });

  it("sums other materials by unit and counts sheet lines without a size", () => {
    const u = costUsagePerUnit([
      { item_id: "x", group_name: "ผ้า", qty: 0.5, uom: "หลา", piece: false },
      { item_id: "y", group_name: "ผ้า", qty: 0.35, uom: "หลา", piece: false },
      { item_id: "z", group_name: "ซิป", qty: 2, uom: "เส้น", piece: false },
      PIECE(500, "nosize"),
      PIECE(0),
    ], sheetOf);
    expect(u.sheets).toBeNull();
    expect(u.missingSize).toBe(1);
    expect(u.byUom.map((b) => b.uom)).toEqual(["หลา", "เส้น"]);
    expect(u.byUom[0].qty).toBeCloseTo(0.85, 6);
    expect(u.byUom[1].qty).toBe(2);
  });

  it("more than one sheet per bag has no per-sheet count", () => {
    const u = costUsagePerUnit([PIECE(20000)], sheetOf);
    expect(u.sheets?.qty).toBeCloseTo(1.25, 6);
    expect(u.sheets?.perSheet).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { woLaborTotal, woRatePerPiece, roundWage, laborBomTarget } from "@/lib/wo-labor";

describe("ค่าแรงรวมของใบจ่ายงาน", () => {
  it("ยังไม่มีรอบไหนลงค่าแรง = null (ไม่แตะค่าเดิมของใบ)", () => {
    expect(woLaborTotal(20, [])).toBeNull();
    expect(woLaborTotal(20, [{ qty: 20, wage: null }])).toBeNull();
  });
  it("ส่งครบรอบเดียว = ค่าแรงรอบนั้น (เหมือนเดิม)", () => {
    expect(woLaborTotal(20, [{ qty: 20, wage: 1000 }])).toBe(1000);
  });
  it("ส่งหลายรอบ = รวมทุกรอบ ไม่ใช่แค่รอบสุดท้าย", () => {
    expect(woLaborTotal(20, [{ qty: 10, wage: 500 }])).toBe(1000);                       // รอบแรก: ที่เหลือคิดราคาเดิม
    expect(woLaborTotal(20, [{ qty: 10, wage: 500 }, { qty: 10, wage: 500 }])).toBe(1000);
    expect(woLaborTotal(20, [{ qty: 10, wage: 500 }, { qty: 10, wage: 600 }])).toBe(1100);
  });
  it("รอบที่ยังไม่ลงค่าแรง คิดราคาต่อชิ้นของรอบล่าสุดที่มีค่าแรง", () => {
    expect(woLaborTotal(30, [{ qty: 10, wage: null }, { qty: 10, wage: 400 }])).toBe(1200);
  });
});

describe("ค่าแรงตอนรับงานคืน (ป๊อปรับงานคืน)", () => {
  it("ค่าแรง/ชิ้นตามใบจ่าย = ค่าแรงรวม ÷ จำนวนจ่าย", () => {
    expect(woRatePerPiece(2500, 50)).toBe(50);
    expect(woRatePerPiece(1000, 30)).toBe(33.33);
    expect(woRatePerPiece(null, 50)).toBeNull();
    expect(woRatePerPiece(0, 50)).toBeNull();
    expect(woRatePerPiece(500, 0)).toBeNull();
  });
  it("ส่งคืนบางส่วน = ยอดเฉพาะรอบนี้ (ไม่ใช่ยอดทั้งใบ) → ค่าแรงรวมของใบไม่บวม", () => {
    const rate = woRatePerPiece(2500, 50) as number;
    expect(roundWage(rate, 10)).toBe(500);
    expect(woLaborTotal(50, [{ qty: 10, wage: roundWage(rate, 10) }])).toBe(2500);
    expect(woLaborTotal(50, [{ qty: 49, wage: roundWage(rate, 49) }, { qty: 1, wage: roundWage(rate, 1) }])).toBe(2500);
  });
  it("เข้า BOM: ใบของช่าง = ราคาช่าง · ใบของโต๊ะ = ราคากลาง", () => {
    expect(laborBomTarget({ assignee_type: "craftsman", assignee_id: "c1", assignee_name: "ลม" })).toEqual({ craftsman_id: "c1", craftsman_name: "ลม" });
    expect(laborBomTarget({ assignee_type: "department", assignee_id: null, assignee_name: "โต๊ะเสถียร" })).toEqual({ craftsman_id: null, craftsman_name: "ราคากลาง" });
  });
});

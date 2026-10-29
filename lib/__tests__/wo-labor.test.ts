import { describe, it, expect } from "vitest";
import { woLaborTotal } from "@/lib/wo-labor";

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

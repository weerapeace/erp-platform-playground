import { describe, it, expect } from "vitest";
import { beltDesignLine, beltDesignSummary, beltDesignCode } from "@/lib/belt-builder-order";

const design = {
  id: "224698ae-8ef9-4ae6-bf3a-1108c76ada71",
  status: "saved",
  total_price: "1750.00",
  order_ref: null,
  selections: { labels: { strap: "สายดำ 35 มม.", buckle: "หัวเข็มกลม โรสโกลด์", keeper: "หูหนังสีเดียวกับสาย" }, engraving: { text: "LOUIS M." }, gender: "men", waist_in: 32, strap_cm: 105.3 },
};

describe("belt-builder-order", () => {
  it("แปลงแบบเป็นรายการออเดอร์ (ราคาจากแบบ × จำนวน)", () => {
    const r = beltDesignLine(design, 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line.unit_price).toBe(1750);
      expect(r.line.line_total).toBe(3500);
      expect(r.line.name).toContain(beltDesignCode(design.id));
      expect(r.line.belt_design_id).toBe(design.id);
      expect(r.line.variant_label).toContain("LOUIS M.");
      expect(r.line.variant_label).toContain("105.3");
    }
  });
  it("แบบที่สั่งไปแล้ว / ไม่มีราคา / ไม่พบ → ไม่รับ", () => {
    expect(beltDesignLine({ ...design, status: "ordered", order_ref: "LO-256910-00001" }, 1).ok).toBe(false);
    expect(beltDesignLine({ ...design, total_price: 0 }, 1).ok).toBe(false);
    expect(beltDesignLine(null, 1).ok).toBe(false);
  });
  it("สรุปแบบอ่านง่าย", () => {
    expect(beltDesignSummary(design.selections)).toBe('สายดำ 35 มม. · หัวเข็มกลม โรสโกลด์ · หูหนังสีเดียวกับสาย · สลัก "LOUIS M." · ชาย เอว 32″ (ตัดหนัง 105.3 ซม.)');
    expect(beltDesignSummary(null)).toBe("");
  });
});

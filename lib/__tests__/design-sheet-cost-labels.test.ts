import { describe, it, expect } from "vitest";
import { costTabLabel, generalLabelOf, DEFAULT_GENERAL_LABEL } from "../design-sheet-cost-labels";

describe("design-sheet-cost-labels · ชื่อแท็บตีราคา", () => {
  it("ไม่ตั้งชื่อ / ว่าง = ทั่วไป", () => {
    expect(generalLabelOf(null)).toBe(DEFAULT_GENERAL_LABEL);
    expect(generalLabelOf("   ")).toBe("ทั่วไป");
    expect(generalLabelOf(" ไซส์ใหญ่ ")).toBe("ไซส์ใหญ่");
  });
  it("คีย์ \"\" ใช้ชื่อแท็บทั่วไป · คีย์อื่นใช้ชื่อตัวเอง", () => {
    expect(costTabLabel("", "ไซส์ใหญ่")).toBe("ไซส์ใหญ่");
    expect(costTabLabel(null, "ทั่วไป")).toBe("ทั่วไป");
    expect(costTabLabel("CTL110", "ไซส์ใหญ่")).toBe("CTL110");
  });
});

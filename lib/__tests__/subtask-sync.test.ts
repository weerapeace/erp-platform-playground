import { describe, it, expect } from "vitest";
import { composeDescription } from "@/lib/subtask-sync";

describe("composeDescription (subtask -> product description sync)", () => {
  it("replace: ใช้ข้อความใหม่ทั้งหมด (ตัดช่องว่าง)", () => {
    expect(composeDescription("ของเดิม", "  ใหม่ ", "replace")).toBe("ใหม่");
    expect(composeDescription(null, "ใหม่", "replace")).toBe("ใหม่");
  });

  it("append: ต่อท้ายของเดิม คั่นด้วยบรรทัดว่าง", () => {
    expect(composeDescription("เดิม", "ใหม่", "append")).toBe("เดิม\n\nใหม่");
  });

  it("append: ของเดิมว่าง -> เหลือแค่ข้อความใหม่ (ไม่มีบรรทัดว่างนำ)", () => {
    expect(composeDescription("", "ใหม่", "append")).toBe("ใหม่");
    expect(composeDescription(null, "ใหม่", "append")).toBe("ใหม่");
    expect(composeDescription("   ", "ใหม่", "append")).toBe("ใหม่");
  });

  it("append: ตัดช่องว่างหัวท้ายทั้งสองส่วน", () => {
    expect(composeDescription("  เดิม  ", "  ใหม่  ", "append")).toBe("เดิม\n\nใหม่");
  });
});

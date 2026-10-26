import { describe, expect, it } from "vitest";
import { isChromelessPath } from "@/lib/chromeless-routes";

describe("isChromelessPath", () => {
  it("หน้าที่ไม่ใช่จอทำงาน ERP", () => {
    expect(isChromelessPath("/login")).toBe(true);
    expect(isChromelessPath("/auth/set-password")).toBe(true);
    expect(isChromelessPath("/print/design-sheet/1")).toBe(true);
    expect(isChromelessPath("/s/abc")).toBe(true);
    expect(isChromelessPath("/offer/xyz")).toBe(true);
    expect(isChromelessPath("/employee-line/me")).toBe(true);
  });
  it("จอทำงานปกติ = ไม่ใช่", () => {
    expect(isChromelessPath("/apps")).toBe(false);
    expect(isChromelessPath("/tasks")).toBe(false);
    expect(isChromelessPath("/master/work-board")).toBe(false);
    expect(isChromelessPath("/app/tasks")).toBe(false);
    expect(isChromelessPath("/sales-orders")).toBe(false);
  });
  it("เพิ่มหน้าเฉพาะตัวได้", () => {
    expect(isChromelessPath("/notify", ["/notify"])).toBe(true);
    expect(isChromelessPath("/notify")).toBe(false);
  });
});

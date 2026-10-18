import { describe, expect, it } from "vitest";
import { codeWarnings, normalizeCode, sameCode } from "./code-rules";

describe("codeWarnings", () => {
  it("พิมพ์ใหญ่ล้วน = ไม่เตือน", () => expect(codeWarnings("MGN194-01")).toEqual([]));
  it("ว่าง = ไม่เตือน", () => expect(codeWarnings("  ")).toEqual([]));
  it("ตัวพิมพ์เล็ก = เตือน + เสนอพิมพ์ใหญ่", () => {
    expect(codeWarnings("mgn194-01")).toEqual([{ kind: "lowercase", message: expect.any(String), fix: "MGN194-01" }]);
  });
  it("ช่องว่างหัวท้าย + พิมพ์เล็ก = 2 เตือน", () => {
    const w = codeWarnings(" Bag-1 ");
    expect(w.map((x) => x.kind)).toEqual(["spaces", "lowercase"]);
    expect(w[1].fix).toBe("BAG-1");
  });
  it("ตัวเลข/ภาษาไทยไม่นับเป็นพิมพ์เล็ก", () => expect(codeWarnings("ป้าย-01")).toEqual([]));
});

describe("normalize/sameCode", () => {
  it("เทียบแบบ DB", () => {
    expect(normalizeCode(" mgn194-01 ")).toBe("MGN194-01");
    expect(sameCode("mgn194-01", "MGN194-01 ")).toBe(true);
    expect(sameCode("MGN194-01", "MGN194-010")).toBe(false);
  });
});

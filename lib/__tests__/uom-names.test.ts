import { describe, it, expect } from "vitest";
import { findDupGroups, findUomClash, normUom, uomLabel, type UomRow } from "@/lib/uom-names";

const U = (id: string, name: string, th: string | null, en: string | null, usage = 0, aliases: string | null = null, active = true): UomRow =>
  ({ id, name, name_th: th, name_en: en, usage, aliases, active });

const real: UomRow[] = [
  U("yard", "Yard", "หลา", "Yard", 1),
  U("hla", "หลา", "หลา", "Yard", 2695, "yd"),
  U("units", "Units", "ชิ้น", "Pcs", 9341),
  U("pcs", "pcs.", "ชิ้น", "Pcs", 3),
  U("chin", "ชิ้น", "ชิ้น", "Pcs", 2),
  U("m", "m", "เมตร", "m", 34, "meter"),
  U("cm2", "cm²", "ตร.ซม.", "cm²", 597, "cm2"),
  U("old", "pcs", null, null, 0, null, false),
];

describe("uom-names", () => {
  it("normUom: ตัวเล็ก ตัดจุดท้าย ² = 2", () => {
    expect(normUom(" PCS. ")).toBe("pcs");
    expect(normUom("cm²")).toBe("cm2");
  });
  it("uomLabel: ไทย · อังกฤษ / ไม่ซ้ำคำ", () => {
    expect(uomLabel(real[1])).toBe("หลา · Yard");
    expect(uomLabel({ name: "kg", name_th: null, name_en: "kg" })).toBe("kg");
    expect(uomLabel({ name: "Days" })).toBe("Days");
  });
  it("findDupGroups: หลา/Yard และ Units/pcs./ชิ้น · ตัวที่ใช้มากสุดขึ้นก่อน · ไม่นับตัวในถังขยะ", () => {
    const g = findDupGroups(real);
    expect(g).toHaveLength(2);
    const ids = g.map((x) => x.map((u) => u.id));
    expect(ids).toContainEqual(["hla", "yard"]);
    expect(ids).toContainEqual(["units", "pcs", "chin"]);
  });
  it("findUomClash: พิมพ์ yd / PCS / Meter เจอหน่วยเดิม · ไม่นับตัวเอง", () => {
    expect(findUomClash(["yd"], real).map((u) => u.id)).toEqual(["hla"]);
    expect(findUomClash(["PCS"], real).map((u) => u.id).sort()).toEqual(["chin", "pcs", "units"]);
    expect(findUomClash(["Meter"], real, "m")).toEqual([]);
    expect(findUomClash(["ผืน", ""], real)).toEqual([]);
  });
});

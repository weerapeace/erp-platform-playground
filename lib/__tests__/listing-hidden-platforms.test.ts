import { describe, expect, it } from "vitest";
import { hiddenCodesOf, normalizeHiddenMap, setPlatformHidden } from "@/lib/listing-hidden-platforms";

describe("listing-hidden-platforms", () => {
  it("อ่านค่าเสีย/ไม่มี = ว่าง · ตัดค่าซ้ำ/ว่าง", () => {
    expect(normalizeHiddenMap(null)).toEqual({});
    expect(normalizeHiddenMap([1, 2])).toEqual({});
    expect(normalizeHiddenMap({ b1: ["instagram", "instagram", "", null], b2: "x", b3: [] })).toEqual({ b1: ["instagram"] });
  });

  it("ร้านที่ซ่อนของแบรนด์ (ไม่มีแบรนด์ = ไม่ซ่อนอะไร)", () => {
    const m = { b1: ["instagram"] };
    expect(hiddenCodesOf(m, "b1")).toEqual(["instagram"]);
    expect(hiddenCodesOf(m, "b2")).toEqual([]);
    expect(hiddenCodesOf(m, null)).toEqual([]);
  });

  it("ซ่อน/เลิกซ่อน ไม่แก้ตัวเดิม · เลิกซ่อนตัวสุดท้าย = ลบคีย์แบรนด์", () => {
    const m0 = { b1: ["instagram"] };
    const m1 = setPlatformHidden(m0, "b1", "facebook", true);
    expect(m1).toEqual({ b1: ["instagram", "facebook"] });
    expect(m0).toEqual({ b1: ["instagram"] });
    expect(setPlatformHidden(m1, "b1", "instagram", true)).toEqual({ b1: ["instagram", "facebook"] });
    const m2 = setPlatformHidden(setPlatformHidden(m1, "b1", "instagram", false), "b1", "facebook", false);
    expect(m2).toEqual({});
    expect(setPlatformHidden({}, "b2", "shopee", true)).toEqual({ b2: ["shopee"] });
  });
});

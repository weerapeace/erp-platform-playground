import { describe, expect, it } from "vitest";
import { groupFabricLayout } from "../group-fabric-layout";

describe("groupFabricLayout", () => {
  it("ผ้าม้วน: ต่อใบ × จำนวน ≈ รวม · หน่วยหลา (หาร 90)", () => {
    const g = groupFabricLayout([
      { key: "a", width_cm: 40, length_cm: 50, pieces: 2, face_width_cm: 150, waste_percent: 10 },
      { key: "b", width_cm: 10, length_cm: 50, pieces: 1, face_width_cm: 150 },
    ], { qty: 100 });
    expect(g?.mode).toBe("roll");
    expect(g!.qty).toBe(100);
    expect(g!.perUnit).toBeGreaterThan(0);
    expect(Math.abs(g!.perUnit * 100 - g!.total)).toBeLessThan(0.2);
    // พื้นที่ขั้นต่ำต่อใบ = 4500 cm² ÷ 150 ÷ 90 = 0.333 หลา (+เผื่อเสีย) → วางจริงต้องไม่น้อยกว่านั้น
    expect(g!.perUnit).toBeGreaterThanOrEqual(0.333);
  });
  it("ผ้าผืน: บอกผืนที่ต้องสั่ง + 1 ผืนได้กี่ใบ", () => {
    const g = groupFabricLayout([{ key: "a", width_cm: 30, length_cm: 50, pieces: 2 }], { qty: 40, sheet: { width_cm: 150, length_cm: 200 } });
    expect(g?.mode).toBe("sheet");
    expect(g!.total).toBeGreaterThanOrEqual(1);
    expect(g!.unitsPerSheet).toBeGreaterThanOrEqual(1);
  });
  it("ไม่มีขนาด / ไม่มีหน้ากว้าง = null · ไม่ใส่จำนวน = 100 ใบ", () => {
    expect(groupFabricLayout([{ key: "a", width_cm: null, length_cm: 5, pieces: 1, face_width_cm: 150 }], {})).toBeNull();
    expect(groupFabricLayout([{ key: "a", width_cm: 5, length_cm: 5, pieces: 1 }], {})).toBeNull();
    expect(groupFabricLayout([{ key: "a", width_cm: 5, length_cm: 5, pieces: 1, face_width_cm: 100 }], {})?.qty).toBe(100);
  });
});

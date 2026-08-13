import { describe, expect, it } from "vitest";
import { packFabric, type FabricPiece } from "../fabric-calc";

// ชิ้นจริงจากใบงาน DS-2026-0004 (ผ้าพิมพ์ลาย) — เคสที่เจ้าของถามว่า "ทำไมเหลือเศษเยอะ"
const DS0004 = (units: number): FabricPiece[] => ([
  { key: "a", label: "22.5x19", width_cm: 22.5, length_cm: 19, qty: 1 * units },
  { key: "b", label: "41x19", width_cm: 41, length_cm: 19, qty: 1 * units },
  { key: "c", label: "61x38.5", width_cm: 61, length_cm: 38.5, qty: 2 * units },
  { key: "d", label: "75x8", width_cm: 75, length_cm: 8, qty: 4 * units },
  { key: "e", label: "125x4", width_cm: 125, length_cm: 4, qty: 1 * units },
]);

const base = { faceWidthCm: 110, allowRotate: true, wastePercent: 15, gapCm: 0.5 };

describe("packFabric (nesting ผ้า)", () => {
  it("วางครบทุกชิ้นและไม่ล้นหน้ากว้างผ้า", () => {
    const r = packFabric({ ...base, pieces: DS0004(10) });
    expect(r.ok).toBe(true);
    const items = r.rows.flatMap((row) => row.items);
    expect(items.length).toBe(r.totalPieces);
    for (const it of items) expect(it.x + it.w).toBeLessThanOrEqual(110 + 1e-6);
  });

  it("ชิ้นไม่ทับกัน", () => {
    const items = packFabric({ ...base, pieces: DS0004(3) }).rows.flatMap((r) => r.items);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const overlap = a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
        expect(overlap).toBe(false);
      }
    }
  });

  it("ประหยัดผ้ากว่าสูตรเดิมในเคสจริง (เดิมยาว 946.5 ซม.)", () => {
    const r = packFabric({ ...base, pieces: DS0004(10) });
    expect(r.usedLengthCm).toBeLessThanOrEqual(900);   // ของใหม่วัดได้ 891 ซม.
    expect(r.packEfficiencyPercent).toBeGreaterThan(85);
  });

  it("แยก 'วางได้คุ้ม' (ไม่รวมเผื่อเสีย) ออกจาก 'คุ้มเทียบผ้าที่ซื้อ' (รวมเผื่อเสีย)", () => {
    const r = packFabric({ ...base, pieces: DS0004(10) });
    expect(r.packEfficiencyPercent).toBeGreaterThan(r.utilizationPercent);
    // เผื่อเสีย 15% → ผ้าที่ต้องซื้อ = ความยาวที่วาง × 1.15
    expect(r.lengthWithWasteCm).toBeCloseTo(r.usedLengthCm * 1.15, 5);
  });

  it("ห้ามหมุน = ทุกชิ้นวางตามท่าที่กรอก", () => {
    const r = packFabric({ ...base, allowRotate: false, pieces: DS0004(2).filter((p) => p.width_cm <= 110) });
    expect(r.ok).toBe(true);
    for (const it of r.rows.flatMap((row) => row.items)) expect(it.rotated).toBe(false);
  });

  it("ชิ้นกว้างเกินหน้าผ้าและหมุนไม่ได้ → บอกว่าวางไม่ได้", () => {
    const r = packFabric({ ...base, allowRotate: false, pieces: [{ key: "x", label: "125x4", width_cm: 125, length_cm: 4, qty: 1 }] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("กว้างเกินหน้าผ้า");
  });

  it("ผ้าผืน: ตอบเป็นจำนวนผืน", () => {
    const r = packFabric({ ...base, sheetLengthCm: 180, pieces: DS0004(20) });
    expect(r.ok).toBe(true);
    expect(r.sheets ?? 0).toBeGreaterThan(0);
    expect(r.sheetsUsed ?? 0).toBeGreaterThan(0);
    for (const it of r.rows.flatMap((row) => row.items)) expect(it.y + it.h).toBeLessThanOrEqual(180 + 1e-6);
  });

  it("บอกได้ว่าชิ้นไหนทำให้เหลือแถบว่าง (fitHints)", () => {
    const r = packFabric({ ...base, pieces: DS0004(1) });
    expect((r.fitHints ?? []).length).toBeGreaterThan(0);
    expect(r.fitHints![0].leftoverCm).toBeGreaterThan(0);
  });
});

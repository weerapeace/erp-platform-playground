import { describe, it, expect } from "vitest";
import { fabricQty, effectiveCalcMethod } from "../bom-calc";

// กฎกลางคิดปริมาณวัตถุดิบ — เน้นเคส "กลุ่มตั้งคิดตามหน้ากว้าง แต่ตัววัตถุดิบมีแต่ขนาดผืน"
// (เจ้าของเจอ 2026-10-08: ผ้าขาวม้าขายเป็นผืน 100×140 แต่กลุ่ม "ผ้า" = area_face → ได้ 0 เงียบ ๆ)
describe("effectiveCalcMethod", () => {
  it("area_face ที่มีหน้ากว้าง → คงเดิม", () => {
    expect(effectiveCalcMethod({ calc_method: "area_face", face_width_cm: 100, sheet_width: 100, sheet_length: 140 })).toBe("area_face");
  });
  it("area_face ไม่มีหน้ากว้าง แต่มีขนาดผืนเต็ม → คิดแบบผืน", () => {
    expect(effectiveCalcMethod({ calc_method: "area_face", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("area_sheet");
    expect(effectiveCalcMethod({ calc_method: "area_face", face_width_cm: 0, sheet_width: 79, sheet_length: 109 })).toBe("area_sheet");
  });
  it("area_face ไม่มีทั้งหน้ากว้างและขนาดผืน → คงเดิม (ให้ fabricQty คืน null)", () => {
    expect(effectiveCalcMethod({ calc_method: "area_face", face_width_cm: null, sheet_width: null, sheet_length: null })).toBe("area_face");
  });
  it("วิธีอื่นไม่ถูกแตะ", () => {
    expect(effectiveCalcMethod({ calc_method: "length", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("length");
    expect(effectiveCalcMethod({ calc_method: "manual", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("manual");
  });
});

describe("fabricQty fallback ผืน", () => {
  const base = { divisor: 90, waste_percent: 0, pieces: 2, cut_width: 25.5, cut_length: 55 };
  it("ผ้าขาวม้าผืน 100×140 ตัด 25.5×55 × 2 ชิ้น → 0.2004 ผืน (ไม่ใช่ 0)", () => {
    const q = fabricQty({ ...base, calc_method: "area_face", face_width_cm: null, sheet_width: 100, sheet_length: 140 });
    expect(q).toBeCloseTo((25.5 * 55 * 2) / (100 * 140), 4);
  });
  it("มีหน้ากว้าง → ยังคิดตามหน้ากว้างเหมือนเดิม", () => {
    const q = fabricQty({ ...base, calc_method: "area_face", face_width_cm: 100, sheet_width: 100, sheet_length: 140 });
    expect(q).toBeCloseTo((25.5 * 55 * 2) / 100 / 90, 4);
  });
  it("ไม่มีทั้งหน้ากว้างและขนาดผืน → null (ผู้เรียกต้องบอกผู้ใช้ ไม่ทับด้วย 0)", () => {
    expect(fabricQty({ ...base, calc_method: "area_face", face_width_cm: null })).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { fabricQty, effectiveCalcMethod, resolveSupplyForm, sheetUnitFor } from "../bom-calc";

// กฎกลางคิดปริมาณวัตถุดิบ — เน้นเคส "มาเป็น ม้วน/ผืน"
// (เจ้าของสั่ง 2026-10-08: ผ้า/PU/ตัวเสริม บางทีมาเป็นม้วน บางทีมาเป็นผืน เช่น 110×80 ต้องใส่ได้ทั้ง 2 แบบ)
describe("resolveSupplyForm — มาเป็นอะไร", () => {
  it("ระบุเองชนะทุกอย่าง", () => {
    expect(resolveSupplyForm({ calc_method: "area_face", supply_form: "sheet", face_width_cm: 100, sheet_width: null, sheet_length: null })).toBe("sheet");
    expect(resolveSupplyForm({ calc_method: "area_sheet", supply_form: "roll", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("roll");
  });
  it("ไม่ระบุ: มีหน้ากว้าง = ม้วน (มีทั้งคู่ก็ม้วน — เจ้าของเลือก)", () => {
    expect(resolveSupplyForm({ calc_method: "area_face", face_width_cm: 100, sheet_width: 100, sheet_length: 140 })).toBe("roll");
    expect(resolveSupplyForm({ calc_method: "area_sheet", face_width_cm: 150, sheet_width: null, sheet_length: null })).toBe("roll");
  });
  it("ไม่ระบุ: มีแค่ขนาดผืน = ผืน", () => {
    expect(resolveSupplyForm({ calc_method: "area_face", face_width_cm: null, sheet_width: 110, sheet_length: 80 })).toBe("sheet");
  });
  it("ไม่ระบุ + ไม่มีข้อมูลเลย = ตามกลุ่ม", () => {
    expect(resolveSupplyForm({ calc_method: "area_face", face_width_cm: null, sheet_width: null, sheet_length: null })).toBe("roll");
    expect(resolveSupplyForm({ calc_method: "area_sheet", face_width_cm: null, sheet_width: null, sheet_length: null })).toBe("sheet");
  });
  it("กลุ่มที่ไม่ใช่ผ้า (หนัง/ซิป/อะไหล่/manual) → null", () => {
    for (const m of ["area_100", "length", "count", "manual"]) {
      expect(resolveSupplyForm({ calc_method: m, supply_form: "sheet", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBeNull();
    }
  });
});

describe("effectiveCalcMethod", () => {
  it("ม้วน → area_face · ผืน → area_sheet", () => {
    expect(effectiveCalcMethod({ calc_method: "area_face", face_width_cm: 100, sheet_width: 100, sheet_length: 140 })).toBe("area_face");
    expect(effectiveCalcMethod({ calc_method: "area_face", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("area_sheet");
    expect(effectiveCalcMethod({ calc_method: "area_sheet", supply_form: "roll", face_width_cm: 100, sheet_width: 100, sheet_length: 140 })).toBe("area_face");
  });
  it("วิธีอื่นไม่ถูกแตะ", () => {
    expect(effectiveCalcMethod({ calc_method: "length", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("length");
    expect(effectiveCalcMethod({ calc_method: "manual", face_width_cm: null, sheet_width: 100, sheet_length: 140 })).toBe("manual");
  });
});

describe("fabricQty ตาม มาเป็น", () => {
  const base = { divisor: 90, waste_percent: 0, pieces: 2, cut_width: 25.5, cut_length: 55 };
  it("ผ้าขาวม้าผืน 100×140 ตัด 25.5×55 × 2 ชิ้น → 0.2004 ผืน (ไม่ใช่ 0)", () => {
    const q = fabricQty({ ...base, calc_method: "area_face", face_width_cm: null, sheet_width: 100, sheet_length: 140 });
    expect(q).toBeCloseTo((25.5 * 55 * 2) / (100 * 140), 4);
  });
  it("มีหน้ากว้าง → คิดตามหน้ากว้าง (หลา)", () => {
    const q = fabricQty({ ...base, calc_method: "area_face", face_width_cm: 100, sheet_width: 100, sheet_length: 140 });
    expect(q).toBeCloseTo((25.5 * 55 * 2) / 100 / 90, 4);
  });
  it("มีทั้งคู่ แต่ระบุ 'ผืน' → คิดแบบผืน", () => {
    const q = fabricQty({ ...base, calc_method: "area_face", supply_form: "sheet", face_width_cm: 100, sheet_width: 100, sheet_length: 140 });
    expect(q).toBeCloseTo((25.5 * 55 * 2) / (100 * 140), 4);
  });
  it("ระบุ 'ผืน' แต่ไม่มีขนาดผืน → null (ผู้เรียกต้องบอกผู้ใช้ ไม่ทับด้วย 0)", () => {
    expect(fabricQty({ ...base, calc_method: "area_face", supply_form: "sheet", face_width_cm: 100 })).toBeNull();
  });
  it("ไม่มีทั้งหน้ากว้างและขนาดผืน → null", () => {
    expect(fabricQty({ ...base, calc_method: "area_face", face_width_cm: null })).toBeNull();
  });
});

describe("sheetUnitFor — หน่วยแบบผืนแยกตามกลุ่ม", () => {
  it("ผ้า / ผ้า (ชิ้น) / ลายพิมพ์ = ผืน · ตัวเสริม / PU / อื่น ๆ = แผ่น", () => {
    expect(sheetUnitFor("ผ้า")).toBe("ผืน");
    expect(sheetUnitFor("ผ้า (ชิ้น)")).toBe("ผืน");
    expect(sheetUnitFor("ลายพิมพ์")).toBe("ผืน");
    expect(sheetUnitFor("ตัวเสริม")).toBe("แผ่น");
    expect(sheetUnitFor("PU")).toBe("แผ่น");
    expect(sheetUnitFor(null)).toBe("แผ่น");
  });
});

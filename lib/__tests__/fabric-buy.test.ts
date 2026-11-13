import { describe, expect, it } from "vitest";
import { calcFabricBuy, compareWidths, convertLength, roundBuy, unitFromUomName, type BuyInput } from "../fabric-buy";

// ชิ้น 50×50 ×2 ต่อใบ บนหน้าใช้ได้ 100 ซม. → แถวละ 2 ชิ้น = 1 ใบ/แถว ยาว 50 ซม.
const base: BuyInput = {
  pieces: [{ key: "a", label: "ตัวหน้า", width_cm: 50, length_cm: 50, per_unit: 2, no_rotate: true }],
  qty: 10, face_width_cm: 103, trim_cm: 3, allow_rotate: false, waste_pct: 0, unit: "m", round: "none",
};

describe("คิดผ้าก่อนซื้อ (fabric-buy)", () => {
  it("หักริมแล้ววางจริง: 10 ใบ = 10 แถว × 50 ซม. = 5 เมตร", () => {
    const r = calcFabricBuy(base);
    expect(r.ok).toBe(true);
    expect(r.usable_width_cm).toBe(100);
    expect(r.need).toBeCloseTo(5, 5);
    expect(r.per_unit_cm).toBeCloseTo(50, 5);
    expect(r.efficiency_pct).toBeCloseTo(100, 1);
  });

  it("ไม่หักริม → หน้า 103 ยังวางแถวละ 2 เท่าเดิม แต่ถ้าหักริมเกินจนเหลือ 99 → แถวละ 1 (ยาวขึ้น 2 เท่า)", () => {
    const r = calcFabricBuy({ ...base, trim_cm: 4 });
    expect(r.need).toBeCloseTo(10, 5);
  });

  it("เผื่อเสีย + หดตัว ทำให้ใช้มากขึ้น · ปัดขึ้นเป็นหน่วยเต็ม", () => {
    const r = calcFabricBuy({ ...base, waste_pct: 10, round: "unit" });
    expect(r.need).toBeCloseTo(5.5, 5);
    expect(r.need_rounded).toBe(6);
    const s = calcFabricBuy({ ...base, shrink_pct: 10, trim_cm: 0, face_width_cm: 120 });
    expect(s.need).toBeGreaterThan(5);   // ชิ้นขยายเป็น 55×55
  });

  it("ปัดเป็นม้วนเต็ม + หักสต็อก + งบ", () => {
    const r = calcFabricBuy({ ...base, qty: 100, round: "roll", roll_length: 30, price: 80, stock: 12 });
    // 100 ใบ = 50 เมตร → 2 ม้วน (60 ม.) · ต้องซื้อเพิ่ม 50−12 = 38 → ปัดม้วน = 60
    expect(r.need).toBeCloseTo(50, 5);
    expect(r.need_rounded).toBe(60);
    expect(r.rolls).toBe(2);
    expect(r.to_buy).toBe(60);
    expect(r.cost_total).toBeCloseTo(4000, 2);
    expect(r.cost_buy).toBe(4800);
    expect(r.cost_per_unit).toBeCloseTo(40, 2);
  });

  it("สต็อกพอ → ไม่ต้องซื้อ", () => {
    const r = calcFabricBuy({ ...base, stock: 99 });
    expect(r.to_buy).toBe(0);
  });

  it("ผ้าผืน → นับเป็นผืน", () => {
    const r = calcFabricBuy({ ...base, form: "sheet", sheet_length_cm: 100 });
    // ผืน 100×100 วางได้ 4 ชิ้น = 2 ใบ → 10 ใบ = 5 ผืน
    expect(r.unit_label).toBe("ผืน");
    expect(r.need).toBe(5);
  });

  it("ข้อมูลไม่ครบ → บอกเหตุผล ไม่พัง", () => {
    expect(calcFabricBuy({ ...base, qty: 0 }).ok).toBe(false);
    expect(calcFabricBuy({ ...base, face_width_cm: 0 }).error).toContain("หน้ากว้าง");
    expect(calcFabricBuy({ ...base, trim_cm: 200 }).ok).toBe(false);
    expect(calcFabricBuy({ ...base, pieces: [] }).ok).toBe(false);
    expect(calcFabricBuy({ ...base, form: "sheet", sheet_length_cm: 0 }).ok).toBe(false);
    expect(calcFabricBuy({ ...base, face_width_cm: 40, trim_cm: 0 }).ok).toBe(false);   // ชิ้นกว้างเกินผ้า
  });

  it("เทียบหน้ากว้าง: เลือกตัวถูกสุดเมื่อมีราคาครบ", () => {
    const rows = compareWidths(base, [{ face_width_cm: 103, price: 100 }, { face_width_cm: 80, price: 50 }]);
    // หน้า 103 → 5 ม. × 100 = 500 · หน้า 80 (ใช้ได้ 77 → แถวละ 1) → 10 ม. × 50 = 500 → เท่ากัน เลือกตัวแรก
    expect(rows.filter((r) => r.best)).toHaveLength(1);
    const rows2 = compareWidths(base, [{ face_width_cm: 103, price: 100 }, { face_width_cm: 80, price: 40 }]);
    expect(rows2.find((r) => r.best)?.face_width_cm).toBe(80);
    const noPrice = compareWidths(base, [{ face_width_cm: 103 }, { face_width_cm: 80 }]);
    expect(noPrice.find((r) => r.best)?.face_width_cm).toBe(103);
  });

  it("ตัวช่วยหน่วย/ปัด", () => {
    expect(roundBuy(5.01, "unit")).toBe(6);
    expect(roundBuy(5, "unit")).toBe(5);
    expect(roundBuy(5.004, "none")).toBe(5);
    expect(roundBuy(31, "roll", 30)).toBe(60);
    expect(roundBuy(0, "roll", 30)).toBe(0);
    expect(unitFromUomName("หลา")).toBe("yd");
    expect(unitFromUomName("เมตร")).toBe("m");
    expect(unitFromUomName("ม้วน")).toBe(null);
    expect(convertLength(1, "yd", "m")).toBeCloseTo(0.9144, 4);
    expect(convertLength(0.9144, "m", "yd")).toBeCloseTo(1, 4);
  });
});

describe("ใบสรุปพิมพ์ (fabric-buy-print)", () => {
  it("มีตัวเลขหลัก ชิ้นตัด ผัง และตารางเทียบ · กันอักขระพิเศษในชื่อ", async () => {
    const { renderFabricBuyHtml } = await import("../fabric-buy-print");
    const input = { ...base, price: 80, pieces: [{ ...base.pieces[0], label: "<หน้า>" }] };
    const res = calcFabricBuy(input);
    const cmp = compareWidths(input, [{ face_width_cm: 103, price: 80 }, { face_width_cm: 80, price: 40 }]);
    const html = renderFabricBuyHtml(input, res, cmp, { title: "t", date: "13 พ.ย.", fabric_name: "แคนวาส", source_label: "สูตร BOM-1" });
    expect(html).toContain("สรุปคิดผ้าก่อนซื้อ");
    expect(html).toContain("แคนวาส");
    expect(html).toContain("&lt;หน้า&gt;");
    expect(html).not.toContain("<หน้า>");
    expect(html).toContain("เทียบหน้ากว้าง");
    expect(html).toContain("<svg");
  });
});

describe("เฟส 2 — ลายซ้ำ · ทั้งตระกูล · ใบสั่งผลิตเก่า", () => {
  it("ชิ้นตรงลาย: ยาว 50 ลายซ้ำ 64 → ปัดเป็น 64 · ชิ้นไม่ติ๊กไม่เปลี่ยน", () => {
    const plain = calcFabricBuy({ ...base, repeat_cm: 64 });
    expect(plain.need).toBeCloseTo(5, 5);
    const m = calcFabricBuy({ ...base, repeat_cm: 64, pieces: [{ ...base.pieces[0], match: true }] });
    expect(m.need).toBeCloseTo(6.4, 5);   // 10 แถว × 64 ซม.
  });

  it("total แทน per_unit × qty", () => {
    const r = calcFabricBuy({ ...base, pieces: [{ ...base.pieces[0], per_unit: 0, total: 40 }] });
    expect(r.need).toBeCloseTo(10, 5);   // 40 ชิ้น = 20 แถว × 50
  });

  it("รวมผ้าข้ามสี: ซับในใช้ร่วม รวมยอด · ผ้าตัวนอกแยกตามสี · สีจำนวน 0 ข้าม", async () => {
    const { mergeFamilyFabrics } = await import("../fabric-buy");
    const line = (sku: string, w: number, l: number, n: number) => ({ component_sku: sku, component_name: sku, label: `${w}×${l}`, width_cm: w, length_cm: l, per_unit: n });
    const fs = mergeFamilyFabrics([
      { sku: "T-BK", color: "ดำ", qty: 300, lines: [line("CANVAS-BK", 40, 35, 2), line("LINING", 38, 33, 2)] },
      { sku: "T-CR", color: "ครีม", qty: 200, lines: [line("CANVAS-CR", 40, 35, 2), line("LINING", 38, 33, 2)] },
      { sku: "T-RD", color: "แดง", qty: 0, lines: [line("CANVAS-RD", 40, 35, 2)] },
    ]);
    expect(fs.map((f) => f.sku)).toEqual(["LINING", "CANVAS-BK", "CANVAS-CR"]);
    const lining = fs[0];
    expect(lining.qty).toBe(500);
    expect(lining.colors).toEqual(["ดำ", "ครีม"]);
    expect(lining.pieces).toHaveLength(1);
    expect(lining.pieces[0].total).toBe(1000);
    expect(lining.pieces[0].per_unit).toBe(2);
  });

  it("ชิ้นจากใบสั่งผลิตเก่า: หารจำนวนในใบ · ขนาดเดียวกันรวมกัน", async () => {
    const { piecesFromMoBlocks } = await import("../fabric-buy");
    const p = piecesFromMoBlocks([
      { label: "40×35", width_cm: 40, length_cm: 35, total_pieces: 100 },
      { label: "40×35", width_cm: 40, length_cm: 35, total_pieces: 100 },
      { label: "6×60", width_cm: 6, length_cm: 60, total_pieces: 200, no_rotate: true },
    ], 100);
    expect(p).toHaveLength(2);
    expect(p[0].per_unit).toBe(2);
    expect(p[1]).toMatchObject({ per_unit: 2, no_rotate: true });
    expect(piecesFromMoBlocks([{ label: "x", width_cm: 1, length_cm: 1, total_pieces: 5 }], 0)).toEqual([]);
  });
});

describe("สถานะวัดจริง", () => {
  it("ลายนิ้วมือ: ลำดับชิ้นไม่มีผล · ขนาดเปลี่ยน = ไม่ตรง", async () => {
    const { piecesFingerprint } = await import("../fabric-buy");
    const a = piecesFingerprint([{ width_cm: 40, length_cm: 35, per_unit: 2 }, { width_cm: 6, length_cm: 60, per_unit: 2, no_rotate: true }]);
    const b = piecesFingerprint([{ width_cm: 6, length_cm: 60, per_unit: 2, no_rotate: true }, { width_cm: 40, length_cm: 35, per_unit: 2 }]);
    expect(a).toBe(b);
    expect(piecesFingerprint([{ width_cm: 41, length_cm: 35, per_unit: 2 }])).not.toBe(piecesFingerprint([{ width_cm: 40, length_cm: 35, per_unit: 2 }]));
  });
  it("วัดแล้ว / ชิ้นเปลี่ยน / ยังไม่วัด", async () => {
    const { cutCheckState } = await import("../fabric-buy");
    const c = { id: "1", product_sku: "S", component_sku: "F", pieces_fp: "fp1", unit: "หลา", est_per_unit: 0.3, actual_per_unit: 0.31, actual_total: 31, actual_qty: 100, variance_pct: 3.3, mo_no: null, note: null, measured_by_name: "ก", measured_at: "2026-11-13T00:00:00Z" };
    expect(cutCheckState(c, "fp1").state).toBe("measured");
    expect(cutCheckState(c, "fp2").state).toBe("stale");
    expect(cutCheckState(null, "fp1").state).toBe("none");
    expect(cutCheckState(c, "fp1").detail).toContain("+3.3%");
  });
});

describe("ซื้อจากความยาววางรูปจริง", () => {
  it("เผื่อเสีย · ปัด · สต็อก · ราคา เหมือนกติกาเดิม", async () => {
    const { buyFromLength } = await import("../fabric-buy");
    const b = buyFromLength({ ...base, qty: 10, waste_pct: 10, unit: "m", round: "unit", price: 100, stock: 2 }, 500);
    expect(b.need).toBeCloseTo(5.5, 5);
    expect(b.need_rounded).toBe(6);
    expect(b.to_buy).toBe(4);
    expect(b.cost_buy).toBe(400);
    expect(b.per_unit_cm).toBeCloseTo(55, 5);
  });
});

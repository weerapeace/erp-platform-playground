import { describe, expect, it } from "vitest";
import { pieceLegend, pieceNumbers, planCutMarkers, renderCutSheetHtml } from "../fabric-cut-sheet";

const P = [
  { key: "a", label: "ตัวหน้า", width_cm: 40, length_cm: 35, per_unit: 2, no_rotate: true },
  { key: "b", label: "หูหิ้ว", width_cm: 6, length_cm: 60, per_unit: 2, no_rotate: true },
];

describe("ใบวิธีตัด (fabric-cut-sheet)", () => {
  it("เลขชิ้นตามลำดับรายการ · ตารางชิ้นรวมทั้งงาน", () => {
    expect(pieceNumbers(P)).toEqual({ a: 1, b: 2 });
    const l = pieceLegend(P, 100);
    expect(l.map((x) => [x.no, x.total])).toEqual([[1, 200], [2, 200]]);
  });

  it("ผ้าม้วน: หาแบบตัด N ใบ วางซ้ำ M รอบ + แบบเศษ · ใบรวมครบตามจำนวน", () => {
    const p = planCutMarkers({ pieces: P, qty: 103, faceWidthCm: 100, allowRotate: false });
    expect(p.ok).toBe(true);
    expect(p.whole).toBe(false);
    const bags = p.markers.reduce((s, m) => s + m.bags * m.repeats, 0);
    expect(bags).toBe(103);
    expect(p.markers[0].repeats).toBeGreaterThan(1);
    expect(p.total_length_cm).toBeGreaterThan(0);
  });

  it("ผ้าผืน: ใส่ได้ N ใบต่อผืน → จำนวนผืน", () => {
    // ผืน 100×100: ตัวหน้า 40×35 ×2 + หู 6×60 ×2 ต่อใบ
    const p = planCutMarkers({ pieces: P, qty: 10, faceWidthCm: 100, sheetLengthCm: 100, allowRotate: false });
    expect(p.ok).toBe(true);
    const bags = p.markers.reduce((s, m) => s + m.bags * m.repeats, 0);
    expect(bags).toBe(10);
    expect(p.total_sheets).toBe(p.markers.reduce((s, m) => s + m.repeats, 0));
  });

  it("ชิ้นต่อใบไม่เป็นเลขเต็ม → วางทั้งงานแบบเดียว", () => {
    const p = planCutMarkers({ pieces: [{ ...P[0], per_unit: 1.5 }], qty: 10, faceWidthCm: 100 });
    expect(p.whole).toBe(true);
    expect(p.markers).toHaveLength(1);
  });

  it("HTML: มีตราสถานะ · เลขชิ้น · ×รอบ · ช่วง 90 ซม. มี ต่อ · กันอักขระพิเศษ", () => {
    const legend = pieceLegend([{ ...P[0], label: "<หน้า>" }, P[1]], 300);
    const plan = planCutMarkers({ pieces: P, qty: 300, faceWidthCm: 50, allowRotate: false, maxBags: 6 });
    const html = renderCutSheetHtml("t", [{ title: "t", date: "13 พ.ย.", fabric_name: "แคนวาส", face_full_cm: 53, usable_cm: 50, qty: 300, legend, plan, waste_pct: 3, status: { measured: true, text: "วัดจริง 13 พ.ย." } }]);
    expect(html).toContain("พิสูจน์แล้ว");
    expect(html).toContain("&lt;หน้า&gt;");
    expect(html).toContain("× ");
    expect(html).toContain("แบบตัด A");
    if (plan.markers[0].length_cm > 90) expect(html).toContain("ต่อหน้าถัดไป");
    const est = renderCutSheetHtml("t", [{ title: "t", date: "-", fabric_name: "x", face_full_cm: 53, usable_cm: 50, qty: 300, legend, plan }]);
    expect(est).toContain("คาดการณ์");
  });

  it("ข้อมูลไม่ครบ → บอกเหตุผล", () => {
    expect(planCutMarkers({ pieces: [], qty: 5, faceWidthCm: 100 }).ok).toBe(false);
    expect(planCutMarkers({ pieces: P, qty: 5, faceWidthCm: 0 }).ok).toBe(false);
  });
});

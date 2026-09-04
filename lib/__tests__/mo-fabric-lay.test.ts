import { describe, expect, it } from "vitest";
import { layFabric } from "../mo-fabric-lay";

// ข้อมูลจริงจาก MO-2026-00273 (สั่ง 200 ใบ, หน้าผ้า 150 ซม.) — เคสที่เจ้าของบอก "ผ้าเหลือเยอะ"
// สูตรเดิม (พื้นที่ + เผื่อเสีย 15% ÷ 150 ÷ 90): CV#12-110 = 36.94 หลา · CANVAS#67 = 40.36 หลา
const CV110 = [
  { key: "a", label: "36.1×23.6", width_cm: 36.1, length_cm: 23.6, total_pieces: 400 },
  { key: "b", label: "15×15.5",   width_cm: 15,   length_cm: 15.5, total_pieces: 400 },
];
const CANVAS67 = [
  { key: "c", label: "36.1×29.9", width_cm: 36.1, length_cm: 29.9, total_pieces: 200 },
  { key: "d", label: "84.9×3.8",  width_cm: 84.9, length_cm: 3.8,  total_pieces: 800 },
];

describe("layFabric — วางผ้าให้คุ้มที่สุดในใบสั่งผลิต", () => {
  it("ผ้า CV#12-110: ใช้น้อยกว่าสูตรเดิม (36.94 หลา) และไม่ต่ำกว่าพื้นที่ล้วน", () => {
    const r = layFabric({ blocks: CV110, face_width_cm: 150, divisor: 90 });
    expect(r.ok).toBe(true);
    expect(r.qty).toBeLessThan(36.94);
    // พื้นที่ล้วน ÷ หน้าผ้า ÷ 90 = ขั้นต่ำทางทฤษฎี
    const floor = (36.1 * 23.6 * 400 + 15 * 15.5 * 400) / 150 / 90;
    expect(r.qty).toBeGreaterThanOrEqual(floor);
    expect(r.efficiency_pct).toBeGreaterThan(85);
  });

  it("ผ้า CANVAS#67: ชิ้นยาว 84.9×3.8 ต้องถูกหมุน → ใช้น้อยกว่าเดิม (40.36 หลา)", () => {
    const r = layFabric({ blocks: CANVAS67, face_width_cm: 150, divisor: 90 });
    expect(r.ok).toBe(true);
    expect(r.qty).toBeLessThan(40.36);
    expect(r.per_block.d.rotated_pct).toBeGreaterThan(50);
  });

  it("แบ่งปริมาณกลับให้แต่ละบล็อกแล้วรวมเท่ากับยอดรวม", () => {
    const r = layFabric({ blocks: CV110, face_width_cm: 150, divisor: 90 });
    const sum = Object.values(r.per_block).reduce((s, b) => s + b.qty, 0);
    expect(sum).toBeCloseTo(r.qty, 2);
    expect(r.per_block.a.share_pct + r.per_block.b.share_pct).toBeCloseTo(100, 0);
  });

  it("ห้ามหมุนรายบรรทัด: บล็อกที่ล็อกไม่ถูกหมุน แม้บล็อกอื่นหมุนได้", () => {
    const r = layFabric({
      blocks: [{ ...CANVAS67[0] }, { ...CANVAS67[1], no_rotate: true }],
      face_width_cm: 150, divisor: 90,
    });
    expect(r.ok).toBe(true);
    expect(r.per_block.d.rotated_pct).toBe(0);
    // ล็อกแล้ววางได้แค่ 1 ชิ้น/แถว → ใช้ผ้ามากกว่าแบบหมุนได้
    const free = layFabric({ blocks: CANVAS67, face_width_cm: 150, divisor: 90 });
    expect(r.qty).toBeGreaterThan(free.qty);
  });

  it("ไม่บวกเผื่อเสีย: ความยาว ÷ ตัวหาร ตรง ๆ", () => {
    const r = layFabric({ blocks: [{ key: "x", label: "50×30", width_cm: 50, length_cm: 30, total_pieces: 3 }], face_width_cm: 150, divisor: 90 });
    // 3 ชิ้นกว้าง 50 วางแถวเดียวพอดี → ยาว 30 ซม.
    expect(r.length_cm).toBeCloseTo(30, 5);
    expect(r.qty).toBeCloseTo(30 / 90, 4);
  });

  it("ผ้าผืน: ตอบเป็นจำนวนผืน", () => {
    const r = layFabric({ blocks: [{ key: "x", label: "50×30", width_cm: 50, length_cm: 30, total_pieces: 30 }], face_width_cm: 100, sheet_length_cm: 60, divisor: 90 });
    expect(r.ok).toBe(true);
    // ผืน 100×60 วางได้ 2×2 = 4 ชิ้น → 30 ชิ้น = 8 ผืน
    expect(r.sheets).toBe(8);
    expect(r.qty).toBe(8);
  });

  it("ไม่รู้หน้ากว้าง → ok=false (ให้ผู้เรียก fallback สูตรเดิม)", () => {
    const r = layFabric({ blocks: CV110, face_width_cm: 0 });
    expect(r.ok).toBe(false);
  });
});

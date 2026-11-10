import { describe, expect, it } from "vitest";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import { costItemPatch, isZeroCostLine, recomputeCostLine, restorePrevItem, withPrevItem, type CostItemLike } from "@/lib/design-sheet-cost-row";

// สูตร "เปลี่ยนวัสดุ" ที่ย้ายจากป๊อปอัปจอคอมมาไว้กลาง (2026-11-10) — หน้าคอม + หน้ามือถือต้องได้ผลเดียวกัน
const line = (p: Partial<CostLine> = {}): CostLine => ({
  item_id: "a", item_name: "ผ้าซับใน", group_name: "ผ้า", group_code: "fabric", calc_method: "area_face",
  width_cm: 26, length_cm: 21, pieces: 1, face_width_cm: 112, waste_percent: 10, divisor: 91.44,
  qty: null, uom: "หลา", unit_price: 29, amount: null, note: null, sort_order: 1, ...p,
});
const item = (p: Partial<CostItemLike> = {}): CostItemLike => ({
  id: "b", name: "ผ้าแคนวาส", price_per_unit: 45, uom: "หลา", face_width_cm: 150, width_cm: null, length_cm: null,
  group_name: "ผ้า", group_code: "fabric", calc_method: "area_face", loss_percent: 5, divisor: 91.44, uom_default: null, ...p,
});

describe("costItemPatch", () => {
  it("เปลี่ยนวัสดุ คงขนาด/จำนวนเดิม แต่เอาราคา/หน้ากว้าง/เผื่อเสียของวัสดุใหม่", () => {
    const p = costItemPatch(item(), line());
    expect(p).toMatchObject({ item_id: "b", item_name: "ผ้าแคนวาส", unit_price: 45, face_width_cm: 150, waste_percent: 5, price_basis: "manual", pieces: 1 });
    expect(p.width_cm).toBeUndefined();   // ไม่แตะขนาดที่ตัด
  });
  it("วัสดุชนิดชิ้น = ราคาต่อ cm² + หน่วย cm²", () => {
    const p = costItemPatch(item({ group_code: "fabric_piece", group_name: "ผ้า (ชิ้น)", price_per_unit: 100, width_cm: 50, length_cm: 40 }), line({ pieces: null }));
    expect(p.uom).toBe("cm²");
    expect(p.unit_price).toBeCloseTo(0.05, 6);
    expect(p.pieces).toBe(1);
  });
  it("คิดยอดใหม่ได้ทันทีด้วยสูตรกลาง", () => {
    const r = recomputeCostLine({ ...line(), ...costItemPatch(item(), line()) });
    expect(r.amount).not.toBeNull();
    expect(r.amount).toBeGreaterThan(0);
  });
});

describe("withPrevItem / restorePrevItem", () => {
  it("เปลี่ยนเป็นวัสดุอื่น = จำของเดิมไว้", () => {
    const r = line({ amount: 1.35 });
    const p = withPrevItem(r, costItemPatch(item(), r));
    expect(p.prev_item).toMatchObject({ item_id: "a", item_name: "ผ้าซับใน", unit_price: 29, amount: 1.35 });
  });
  it("เลือกวัสดุเดิมซ้ำ = ไม่จำ", () => {
    const r = line();
    expect(withPrevItem(r, { item_id: "a" }).prev_item).toBeUndefined();
  });
  it("จำไว้แล้ว ไม่ทับของเดิมตัวแรก · เลือกกลับเป็นตัวแรก = ล้าง", () => {
    const first = line();
    const changed = { ...first, ...withPrevItem(first, costItemPatch(item(), first)) } as CostLine;
    const again = withPrevItem(changed, costItemPatch(item({ id: "c", name: "ผ้าอื่น" }), changed));
    expect(again.prev_item).toBeUndefined();   // ไม่ส่ง = คงของเดิมตัวแรกไว้
    expect(withPrevItem(changed, { item_id: "a" }).prev_item).toBeNull();
  });
  it("กลับของเดิม = คืนวัสดุ/ราคา + ล้างที่จำไว้", () => {
    const first = line();
    const changed = { ...first, ...withPrevItem(first, costItemPatch(item(), first)) } as CostLine;
    expect(restorePrevItem(changed.prev_item!)).toMatchObject({ item_id: "a", unit_price: 29, prev_item: null });
  });
});

describe("isZeroCostLine", () => {
  it("เริ่มกรอกแล้วแต่ยอด 0 = เตือน · บรรทัดว่าง = ไม่เตือน", () => {
    expect(isZeroCostLine(line({ amount: null }))).toBe(true);
    expect(isZeroCostLine(line({ amount: 1.2 }))).toBe(false);
    expect(isZeroCostLine({ amount: null, item_id: null, item_name: null, qty: null, unit_price: null, width_cm: null })).toBe(false);
  });
});

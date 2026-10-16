import { describe, it, expect } from "vitest";
import {
  validatePart, validateSizeRule, parseAnchor, strapLengthCm, holePositionsCm, pickSizeRule, totalPrice, DEFAULT_ANCHOR, DEFAULT_STRAP_FORMULA,
} from "./belt-builder";

describe("belt-builder · validatePart", () => {
  it("ชิ้นส่วนถูกต้องผ่าน", () => {
    expect(validatePart({ part_type: "strap", name_th: "ดำ 35", anchor: DEFAULT_ANCHOR.strap, price_delta: 0 })).toEqual({ ok: true });
  });
  it("part_type นอก enum / anchor ไม่ครบ / ราคาติดลบ → error", () => {
    const r = validatePart({ part_type: "lace", name_th: "x", anchor: { x: 0, y: 0, w: 10 }, price_delta: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBe(3);
  });
  it("PATCH ตรวจเฉพาะคีย์ที่ส่งมา", () => {
    expect(validatePart({ price_delta: 150 }, { partial: true })).toEqual({ ok: true });
    expect(validatePart({ anchor: "{\"x\":1,\"y\":2,\"w\":3,\"h\":4}" }, { partial: true })).toEqual({ ok: true });
    expect(validatePart({ anchor: { x: 0, y: 0, w: 0, h: 5 } }, { partial: true }).ok).toBe(false);
  });
});

describe("belt-builder · parseAnchor", () => {
  it("รับได้ทั้ง object และ string JSON", () => {
    expect(parseAnchor({ x: "1", y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(parseAnchor("{\"x\":1,\"y\":2,\"w\":3,\"h\":4}")).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(parseAnchor({ x: 1 })).toBeNull();
    expect(parseAnchor("nope")).toBeNull();
  });
});

describe("belt-builder · size rules", () => {
  it("validateSizeRule เช็กช่วงเอว/สูตร/รู", () => {
    expect(validateSizeRule({ gender: "men", waist_min_in: 28, waist_max_in: 46, strap_formula: DEFAULT_STRAP_FORMULA, hole_count: 5, hole_spacing_cm: 2.5 })).toEqual({ ok: true });
    const bad = validateSizeRule({ gender: "kids", waist_min_in: 40, waist_max_in: 30, strap_formula: {}, hole_count: 0, hole_spacing_cm: 0 });
    expect(bad.ok).toBe(false);
  });
  it("strapLengthCm: เอว 32 นิ้ว ×2.54 + 24 = 105.3", () => {
    expect(strapLengthCm(32)).toBe(105.3);
    expect(strapLengthCm(0)).toBe(0);
  });
  it("holePositionsCm: รูกลางตรงรอบเอว", () => {
    const holes = holePositionsCm(32, DEFAULT_STRAP_FORMULA, 5, 2.5);
    expect(holes).toHaveLength(5);
    expect(holes[2]).toBe(81.3);
    expect(holes[0]).toBe(76.3);
  });
  it("pickSizeRule เลือกตามเพศ+ช่วง", () => {
    const rules = [
      { id: "m", gender: "men", waist_min_in: 28, waist_max_in: 46 },
      { id: "w", gender: "women", waist_min_in: 24, waist_max_in: 38 },
    ];
    expect(pickSizeRule(rules, "women", 30)?.id).toBe("w");
    expect(pickSizeRule(rules, "men", 20)).toBeNull();
  });
});

describe("belt-builder · totalPrice", () => {
  it("รวมฐาน + delta ทุกชิ้น + ค่าสลัก", () => {
    expect(totalPrice(1500, [{ price_delta: 200 }, { price_delta: "150" }, null], 100)).toBe(1950);
  });
});

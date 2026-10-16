import { describe, it, expect } from "vitest";
import { pickColumns } from "./_shared";
import { PARTS, SIZE_RULES, DESIGNS } from "./resources";

describe("belt-builder API · pickColumns + validate", () => {
  it("POST parts: ตัดคอลัมน์แปลก เติม default และ coerce ชนิด", () => {
    const body = { shop_id: "s1", part_type: "strap", name_th: "ดำ 35", price_delta: "150", sort_order: "7.6", is_active: "true", anchor: "{\"x\":0,\"y\":300,\"w\":1600,\"h\":150}", evil_col: "x", actor: "someone" };
    const p = pickColumns(PARTS, body, { partial: false });
    expect(p).not.toHaveProperty("evil_col");
    expect(p).not.toHaveProperty("actor");
    expect(p.price_delta).toBe(150);
    expect(p.sort_order).toBe(8);
    expect(p.is_active).toBe(true);
    expect(p.anchor).toEqual({ x: 0, y: 300, w: 1600, h: 150 });
    expect(p.attrs).toEqual({});           // default
    expect(PARTS.validate(p, {})).toEqual({ ok: true });
  });
  it("POST parts: ไม่มี shop_id / price ติดลบ / anchor พัง → ไม่ผ่าน", () => {
    const p = pickColumns(PARTS, { part_type: "buckle", name_th: "x", price_delta: -1, anchor: { x: 1 } }, { partial: false });
    const v = PARTS.validate(p, {});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toContain("shop_id");
    const v2 = PARTS.validate({ ...p, shop_id: "s1" }, {});
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.errors.length).toBe(2);
  });
  it("PATCH parts: ตรวจเฉพาะคีย์ที่ส่ง · JSON พังถูกทำเครื่องหมาย", () => {
    expect(pickColumns(PARTS, { price_delta: "0" }, { partial: true })).toEqual({ price_delta: 0 });
    expect(PARTS.validate({ price_delta: 0 }, { partial: true })).toEqual({ ok: true });
    expect(pickColumns(PARTS, { attrs: "{bad" }, { partial: true }).attrs).toBe("__INVALID_JSON__");
  });
  it("size rules: default สูตร/รู + ตรวจช่วงเอว", () => {
    const p = pickColumns(SIZE_RULES, { shop_id: "s1", gender: "women", waist_min_in: "24", waist_max_in: "38" }, { partial: false });
    expect(p.strap_formula).toEqual({ mult: 2.54, add_cm: 24 });
    expect(p.hole_count).toBe(5);
    expect(SIZE_RULES.validate(p, {})).toEqual({ ok: true });
    expect(SIZE_RULES.validate({ ...p, waist_max_in: 20 }, {}).ok).toBe(false);
  });
  it("designs: status นอก enum ไม่ผ่าน", () => {
    const p = pickColumns(DESIGNS, { shop_id: "s1", status: "paid", selections: { strap_id: "a" } }, { partial: false });
    expect(DESIGNS.validate(p, {}).ok).toBe(false);
    expect(DESIGNS.validate({ ...p, status: "in_cart" }, {})).toEqual({ ok: true });
  });
});

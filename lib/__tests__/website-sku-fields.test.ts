import { describe, it, expect } from "vitest";
import { parseSkuFieldsInput, planSkuFields, type SkuFieldsRow } from "../website-sku-fields";
import { baseColor, baseColorEn, buildSizeGrid } from "../website-size-options";
import { normalizeFieldMap, resolveProduct, type ChildSku, type ParentRow } from "../website-field-map";
import { pickSku } from "../website-orders";
import { renameCardColor } from "../website-card-colors";

/**
 * ✏️ แก้ชื่อสี (ไทย/อังกฤษ) + ราคา ของ SKU จากแถวสีในแท็บ 🛍
 *  - เว็บโชว์ชื่อไทย (color_th) ก่อน · หน้า /en ใช้ช่อง Color
 *  - SKU ไซส์ของสีเดียวกันต้องเปลี่ยนชื่อตาม (ไม่งั้นตาราง สี×ไซส์ หลุด)
 *  - ชื่อซ้ำกับสีอื่น = ไม่ยอม (เว็บรวมเป็นสีเดียว)
 */
const ID = (n: number) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;
const vo = (value: string) => ({ variant_option: { code: value, name: "ไซส์", value } });
const row = (n: number, code: string, color: string | null, color_th: string | null, size?: string, price = 890): SkuFieldsRow & ChildSku => ({
  id: ID(n),
  code,
  color,
  color_th,
  list_price: price,
  cover_image_r2_key: null,
  attribute_values: size ? vo(size) : {},
});

// ROAR02 (ข้อมูลจริง): Color = ชื่อขาย อังกฤษ · สี (ไทย) = ชื่อภายใน
const roar = [row(1, "ROAR02-01", "Snow Leopard", "Metallic Silver"), row(2, "ROAR02-02", "Classic Leopard", "Metallic Bronze")];
// MGN364 (ข้อมูลจริง): SKU ไซส์ สี (ไทย) มี " / L" ต่อท้าย
const mgn = [row(11, "MGN364-01", "ดำ", "ดำ"), row(12, "MGN364-01L", "ดำ", "ดำ / L", "L"), row(13, "MGN364-01M", "ดำ", "ดำ / M", "M"), row(14, "MGN364-02", "เทา", "เทา")];

describe("ชื่อสีบนเว็บ: ไทยก่อน + อังกฤษจากช่อง Color", () => {
  it("ไทย = color_th (ตัดไซส์ท้าย) · ว่าง = color", () => {
    expect(baseColor(roar[0])).toBe("Metallic Silver");
    expect(baseColor(mgn[1])).toBe("ดำ");
    expect(baseColor(row(9, "X", "Black", null))).toBe("Black");
  });
  it("อังกฤษ = ช่อง Color ถ้าไม่ใช่ภาษาไทย", () => {
    expect(baseColorEn(roar[0])).toBe("Snow Leopard");
    expect(baseColorEn(mgn[0])).toBe("");
  });
  it("ตัวเลือกบนเว็บส่ง label ไทย + label_en · ตาราง สี×ไซส์ ยังจับคู่สีติด", () => {
    const map = normalizeFieldMap({ options: { source: "sku_color", label: "สี" }, options2: { source: "variant_option", label: "ไซส์" }, price: { source: "sku_max" } });
    const parent = { id: "p", code: "MGN364", name_th: "x" } as unknown as ParentRow;
    const r = resolveProduct(map, parent, mgn as ChildSku[], null, null);
    expect(r.options?.items.map((i) => i.label)).toEqual(["ดำ", "เทา"]);
    expect(r.options2?.items.map((i) => i.label)).toEqual(["M", "L"]);
    expect(r.options2?.items.every((i) => i.colors?.length === 1)).toBe(true);
    const r2 = resolveProduct(map, { ...parent, code: "ROAR02" } as ParentRow, roar as ChildSku[], null, null);
    expect(r2.options?.items[0]).toMatchObject({ label: "Metallic Silver", label_en: "Snow Leopard" });
    expect(buildSizeGrid(mgn as ChildSku[])?.colors.map((c) => c.label)).toEqual(["ดำ", "เทา"]);
  });
  it("ออเดอร์: ชื่อไทยในใบสั่ง + ชื่ออังกฤษจากช่อง Color", () => {
    const p = pickSku(roar as ChildSku[], `sku-${ID(1).slice(0, 8)}`);
    expect(p.variantLabel).toBe("Metallic Silver");
    expect(p.colorEn).toBe("Snow Leopard");
  });
});

describe("parseSkuFieldsInput", () => {
  it("ราคา ≤ 0 / ไม่ใช่ตัวเลข = ไม่ยอม · ว่าง = ไม่แก้ราคา", () => {
    expect(parseSkuFieldsInput([{ skuId: ID(1), price: 0 }])).toMatch(/มากกว่า 0/);
    expect(parseSkuFieldsInput([{ skuId: ID(1), price: "abc" }])).toMatch(/มากกว่า 0/);
    expect(parseSkuFieldsInput([{ skuId: ID(1), price: "", colorTh: " ลายเสือ " }])).toEqual([{ skuId: ID(1), colorTh: "ลายเสือ" }]);
    expect(parseSkuFieldsInput([{ skuId: ID(1), price: "990.555" }])).toEqual([{ skuId: ID(1), price: 990.56 }]);
    expect(parseSkuFieldsInput([])).toMatch(/ไม่มีรายการ/);
    expect(parseSkuFieldsInput([{ skuId: "x" }])).toMatch(/รหัส SKU/);
  });
});

describe("planSkuFields", () => {
  it("แก้ชื่อไทย/อังกฤษ/ราคา → patch เฉพาะช่องที่เปลี่ยน + บอกชื่อเก่า→ใหม่", () => {
    const plan = planSkuFields(roar, [{ skuId: ID(1), colorTh: "เสือดาวหิมะ", colorEn: "Snow Leopard", price: 990 }]);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.updates).toEqual([
      { id: ID(1), code: "ROAR02-01", patch: { color_th: "เสือดาวหิมะ", list_price: 990 }, changes: { color_th: { old: "Metallic Silver", new: "เสือดาวหิมะ" }, list_price: { old: 890, new: 990 } } },
    ]);
    expect(plan.renames).toEqual([{ from: "Metallic Silver", to: "เสือดาวหิมะ" }]);
  });
  it("ไม่มีอะไรเปลี่ยน = ไม่มี update", () => {
    const plan = planSkuFields(roar, [{ skuId: ID(1), colorTh: "Metallic Silver", colorEn: "Snow Leopard", price: 890 }]);
    expect(plan).toEqual({ updates: [], renames: [] });
  });
  it("SKU ไซส์ของสีเดียวกันเปลี่ยนชื่อตาม (คง / L ท้าย) — สีอื่นไม่โดน", () => {
    const plan = planSkuFields(mgn, [{ skuId: ID(11), colorTh: "ดำด้าน", colorEn: "Matte Black" }]);
    if ("error" in plan) throw new Error(plan.error);
    const byId = Object.fromEntries(plan.updates.map((u) => [u.id, u.patch]));
    expect(byId[ID(11)]).toEqual({ color_th: "ดำด้าน", color: "Matte Black" });
    expect(byId[ID(12)]).toEqual({ color_th: "ดำด้าน / L", color: "Matte Black" });
    expect(byId[ID(13)]).toEqual({ color_th: "ดำด้าน / M", color: "Matte Black" });
    expect(byId[ID(14)]).toBeUndefined();
  });
  it("ชื่อซ้ำกับสีอื่นของรุ่น = ไม่ยอม · สลับชื่อกันในครั้งเดียว = ได้", () => {
    const dup = planSkuFields(roar, [{ skuId: ID(1), colorTh: "metallic bronze" }]);
    expect(dup).toMatchObject({ error: expect.stringMatching(/ซ้ำกับ ROAR02-02/) });
    const swap = planSkuFields(roar, [
      { skuId: ID(1), colorTh: "Metallic Bronze" },
      { skuId: ID(2), colorTh: "Metallic Silver" },
    ]);
    expect("error" in swap).toBe(false);
  });
  it("ล้างทั้งสองภาษา = ไม่ยอม · ล้างไทย = เว็บใช้ช่อง Color", () => {
    expect(planSkuFields(roar, [{ skuId: ID(1), colorTh: "", colorEn: "" }])).toMatchObject({ error: expect.stringMatching(/อย่างน้อย 1 ภาษา/) });
    const plan = planSkuFields(roar, [{ skuId: ID(1), colorTh: "" }]);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.updates[0].patch).toEqual({ color_th: null });
    expect(plan.renames).toEqual([{ from: "Metallic Silver", to: "Snow Leopard" }]);
  });
  it("SKU ไม่อยู่ในรุ่น = error", () => {
    expect(planSkuFields(roar, [{ skuId: ID(99), price: 1 }])).toMatchObject({ error: expect.any(String) });
  });
});

describe("renameCardColor", () => {
  it("ชื่อในการ์ด (โชว์/สีหลัก) เปลี่ยนตาม · ไม่มีชื่อเดิม = ตัวเดิม", () => {
    const cc = { colors: ["Metallic Silver", "Metallic Bronze"], main: "metallic silver" };
    expect(renameCardColor(cc, "Metallic Silver", "เสือดาวหิมะ")).toEqual({ colors: ["เสือดาวหิมะ", "Metallic Bronze"], main: "เสือดาวหิมะ" });
    const none = { colors: null, main: null };
    expect(renameCardColor(none, "a", "b")).toBe(none);
  });
});

import { describe, expect, it } from "vitest";
import { buildTiktokNewSkus, buildTiktokSkusPayload, planTiktokSkuEdit, tiktokMainWarehouse, tiktokModelsLite, tiktokOptNameKey, tiktokOptionGroups, tiktokSkuFormOf, tiktokSkuSignature, type TiktokSkuAdd } from "@/lib/tiktok-sku-edit";
import { tiktokListingView } from "@/lib/tiktok-listing-edit";

// รูปคำตอบ Get Product จริง (ย่อ): 2 สี × 2 ไซซ์ · สีมีรูป
const img = (u: string) => ({ uri: `tos-${u}`, urls: [`https://p16.ibyteimg.com/${u}.jpg`] });
const raw = {
  id: "P1", title: "กระเป๋าสะพายข้าง หนังแท้ ทรงสวย ใช้งานได้ทุกวัน", status: "ACTIVATE", product_status: "ACTIVATE",
  skus: [
    { id: "S1", seller_sku: "BAG-01S", price: { sale_price: "890", currency: "THB" }, inventory: [{ warehouse_id: "W1", quantity: 3 }], identifier_code: { code: "123", type: "EAN" }, sales_attributes: [{ id: "100000", name: "สี", value_id: "V1", value_name: "ดำ", sku_img: img("black") }, { id: "100007", name: "ไซซ์", value_id: "Z1", value_name: "S" }] },
    { id: "S2", seller_sku: "BAG-01M", price: { sale_price: "890", currency: "THB" }, inventory: [{ warehouse_id: "W1", quantity: 0 }], sales_attributes: [{ id: "100000", name: "สี", value_id: "V1", value_name: "ดำ", sku_img: img("black") }, { id: "100007", name: "ไซซ์", value_id: "Z2", value_name: "M" }] },
    { id: "S3", seller_sku: "BAG-02S", price: { sale_price: "950", currency: "THB" }, inventory: [{ warehouse_id: "W1", quantity: 5 }], sales_attributes: [{ id: "100000", name: "สี", value_id: "V2", value_name: "น้ำตาล", sku_img: img("brown") }, { id: "100007", name: "ไซซ์", value_id: "Z1", value_name: "S" }] },
  ],
};
const view = tiktokListingView(raw)!;

describe("tiktokOptionGroups / form", () => {
  it("แยกชั้น สี/ไซซ์ + ค่าไม่ซ้ำ + รูปของสี", () => {
    const g = tiktokOptionGroups(view.skus);
    expect(g.map((x) => x.name)).toEqual(["สี", "ไซซ์"]);
    expect(g[0].values.map((v) => v.name)).toEqual(["ดำ", "น้ำตาล"]);
    expect(g[0].values[0].skuIds).toEqual(["S1", "S2"]);
    expect(g[0].hasImages).toBe(true);
    expect(g[1].hasImages).toBe(false);
    const f = tiktokSkuFormOf(g);
    expect(f.primary).toBe("id:100000");
    expect(f.images["id:V1"]).toBe("tts:tos-black");
  });
  it("ลายเซ็นไม่รวมราคา/สต๊อก", () => {
    const changed = tiktokListingView({ ...raw, skus: raw.skus.map((s) => ({ ...s, price: { sale_price: "1" }, inventory: [{ warehouse_id: "W1", quantity: 99 }] })) })!;
    expect(tiktokSkuSignature(changed.skus)).toBe(tiktokSkuSignature(view.skus));
  });
});

describe("planTiktokSkuEdit", () => {
  const g = tiktokOptionGroups(view.skus);
  it("ไม่แก้ = ไม่ส่ง", () => {
    const p = planTiktokSkuEdit(g, tiktokSkuFormOf(g), { status: "ACTIVATE" });
    expect(p.changed).toBe(false);
  });
  it("เปลี่ยนรูปสีดำเป็นรูปใหม่จากระบบ", () => {
    const f = tiktokSkuFormOf(g); f.images["id:V1"] = "r2:products/x.jpg";
    const p = planTiktokSkuEdit(g, f, { status: "ACTIVATE" });
    expect(p.errors).toEqual([]);
    expect(p.imagesChanged).toBe(true);
    expect(p.newImages).toEqual(["r2:products/x.jpg"]);
    expect(p.changes[0].label).toContain("ดำ");
  });
  it("รูปไม่ครบทุกสี = error · ชื่อซ้ำ/ว่าง = error", () => {
    const f = tiktokSkuFormOf(g); f.images["id:V2"] = null;
    expect(planTiktokSkuEdit(g, f, { status: "ACTIVATE" }).errors.join()).toContain("ครบทุกค่า");
    const f2 = tiktokSkuFormOf(g); f2.names[tiktokOptNameKey("id:100000", "id:V2")] = "ดำ";
    expect(planTiktokSkuEdit(g, f2, { status: "ACTIVATE" }).errors.join()).toContain("ซ้ำ");
    const f3 = tiktokSkuFormOf(g); f3.names[tiktokOptNameKey("id:100007", "id:Z1")] = " ";
    expect(planTiktokSkuEdit(g, f3, { status: "ACTIVATE" }).errors.join()).toContain("ว่าง");
  });
  it("รอตรวจอยู่ = แก้ไม่ได้", () => {
    const f = tiktokSkuFormOf(g); f.names[tiktokOptNameKey("id:100000", "id:V1")] = "ดำด้าน";
    expect(planTiktokSkuEdit(g, f, { status: "PENDING" }).errors.join()).toContain("รอ TikTok ตรวจ");
  });
});

describe("buildTiktokSkusPayload", () => {
  const g = tiktokOptionGroups(view.skus);
  it("สินค้าที่ขายอยู่: ส่งทุก SKU · ไม่มีสต๊อก · ราคา/รหัสเดิม · รูปทุกสี · ชื่อที่แก้เป็น value_name", () => {
    const f = tiktokSkuFormOf(g);
    f.images["id:V1"] = "r2:new.jpg";
    f.names[tiktokOptNameKey("id:100000", "id:V2")] = "น้ำตาลเข้ม";
    const r = buildTiktokSkusPayload(raw.skus, g, f, (ref) => (ref.startsWith("tts:") ? ref.slice(4) : ref === "r2:new.jpg" ? "tos-new" : null), { includeInventory: false });
    expect(r.errors).toEqual([]);
    expect(r.skus.map((s) => s.id)).toEqual(["S1", "S2", "S3"]);
    expect(r.skus.every((s) => !("inventory" in s))).toBe(true);
    expect(r.skus[0]).toMatchObject({ seller_sku: "BAG-01S", price: { amount: "890", currency: "THB" }, identifier_code: { code: "123", type: "EAN" } });
    expect(r.skus[0].sales_attributes).toEqual([{ id: "100000", value_id: "V1", sku_img: { uri: "tos-new" } }, { id: "100007", value_id: "Z1" }]);
    expect(r.skus[2].sales_attributes).toEqual([{ id: "100000", value_name: "น้ำตาลเข้ม", sku_img: { uri: "tos-brown" } }, { id: "100007", value_id: "Z1" }]);
  });
  it("ฉบับร่าง: ส่งสต๊อกเดิมกลับ", () => {
    const r = buildTiktokSkusPayload(raw.skus, g, tiktokSkuFormOf(g), (ref) => ref.slice(4), { includeInventory: true });
    expect(r.skus[0].inventory).toEqual([{ warehouse_id: "W1", quantity: 3 }]);
  });
  it("ไม่รู้ uri รูป = error", () => {
    const f = tiktokSkuFormOf(g); f.images["id:V1"] = "r2:missing.jpg";
    expect(buildTiktokSkusPayload(raw.skus, g, f, (ref) => (ref.startsWith("tts:") ? ref.slice(4) : null), { includeInventory: false }).errors.length).toBe(1);
  });
});

// ───────── เพิ่มสีจากระบบ (2026-11-25) ─────────
describe("เพิ่มสีจากระบบ", () => {
  const g = tiktokOptionGroups(view.skus);
  const shopSkus = view.skus.map((x) => x.sellerSku);
  const withAdds = (adds: TiktokSkuAdd[]) => ({ ...tiktokSkuFormOf(g), adds });
  const red: TiktokSkuAdd = { code: "BAG-03", name: "แดง", image: "r2:products/red.jpg", price: null, stock: 4, sizes: [{ valueKey: "id:Z1", sku: "BAG-03S", price: 950, stock: 4 }] };
  it("สี×ไซซ์: ผ่าน + นับ SKU ใหม่ + รูปใหม่ต้องฝาก", () => {
    const p = planTiktokSkuEdit(g, withAdds([red]), { status: "ACTIVATE", existingSkus: shopSkus });
    expect(p.errors).toEqual([]);
    expect(p.addsChanged).toBe(true);
    expect(p.changed).toBe(true);
    expect(p.newSkuCount).toBe(1);
    expect(p.newImages).toEqual(["r2:products/red.jpg"]);
    expect(p.changes.at(-1)!.after).toContain("BAG-03S");
    expect(p.warnings.join()).toContain("สต๊อกตามระบบ");
  });
  it("สต๊อก 0 / ชื่อซ้ำ / ไม่มีรูป / รหัสซ้ำ / ราคาต่ำ = error", () => {
    const e = (a: Partial<TiktokSkuAdd>, z?: Partial<NonNullable<TiktokSkuAdd["sizes"]>[number]>) =>
      planTiktokSkuEdit(g, withAdds([{ ...red, ...a, sizes: [{ ...red.sizes![0], ...z }] }]), { status: "ACTIVATE", existingSkus: shopSkus }).errors.join();
    expect(e({}, { stock: 0 })).toContain("สต๊อกเป็น 0");
    expect(e({}, { stock: null })).toContain("ใส่สต๊อก");
    expect(e({ name: "ดำ" })).toContain("ชื่อซ้ำ");
    expect(e({ image: null })).toContain("ต้องใส่รูป");
    expect(e({}, { sku: "BAG-01S" })).toContain("มีบนร้านแล้ว");
    expect(e({}, { price: 10 })).toContain("ราคาต้องอยู่ระหว่าง");
    expect(e({}, { sku: "BAG 03S" })).toContain("ช่องว่าง");
    expect(planTiktokSkuEdit(g, withAdds([{ ...red, sizes: [] }]), { status: "ACTIVATE" }).errors.join()).toContain("อย่างน้อย 1");
  });
  it("ส่ง: SKU ใหม่ไม่มี id · สีใหม่ value_name + รูป · ไซซ์เดิม value_id · สต๊อกคลังหลัก", () => {
    const f = withAdds([red]);
    const uriOf = (ref: string) => (ref.startsWith("tts:") ? ref.slice(4) : ref === "r2:products/red.jpg" ? "tos-red" : null);
    const out = buildTiktokNewSkus(g, f, uriOf, { warehouseId: tiktokMainWarehouse(raw.skus)! });
    expect(out.errors).toEqual([]);
    expect(out.skus).toEqual([{
      seller_sku: "BAG-03S", price: { amount: "950", currency: "THB" }, inventory: [{ warehouse_id: "W1", quantity: 4 }],
      sales_attributes: [{ id: "100000", value_name: "แดง", sku_img: { uri: "tos-red" } }, { id: "100007", value_id: "Z1" }],
    }]);
  });
  it("สินค้าที่ขายอยู่ + เพิ่มสี: ตัวเลือกเดิมส่งสต๊อกเฉพาะที่ ≥ 1", () => {
    const out = buildTiktokSkusPayload(raw.skus, g, tiktokSkuFormOf(g), (r) => r.slice(4), { includeInventory: true, positiveOnly: true });
    expect(out.skus.map((x) => x.inventory ?? null)).toEqual([[{ warehouse_id: "W1", quantity: 3 }], null, [{ warehouse_id: "W1", quantity: 5 }]]);
  });
  it("ชั้นเดียว: seller_sku = รหัสสี · ไม่มีรูปตัวเลือก = ไม่ส่งรูป", () => {
    const one = tiktokListingView({ id: "P2", title: "x", skus: [{ id: "A1", seller_sku: "KR64-01", price: { sale_price: "249" }, inventory: [{ warehouse_id: "W9", quantity: 2 }], sales_attributes: [{ id: "100000", name: "สี", value_name: "เชอร์รี่ | 01" }] }] })!;
    const g1 = tiktokOptionGroups(one.skus);
    const f = { ...tiktokSkuFormOf(g1), adds: [{ code: "KR64-02", name: "ดำ | 02", image: null, price: 249, stock: 7 }] };
    const p = planTiktokSkuEdit(g1, f, { status: "ACTIVATE", existingSkus: ["KR64-01"] });
    expect(p.errors).toEqual([]);
    expect(p.warnings.join()).toContain("ไม่มีรูป");
    const out = buildTiktokNewSkus(g1, f, () => null, { warehouseId: "W9" });
    expect(out.skus).toEqual([{ seller_sku: "KR64-02", price: { amount: "249", currency: "THB" }, inventory: [{ warehouse_id: "W9", quantity: 7 }], sales_attributes: [{ id: "100000", value_name: "ดำ | 02" }] }]);
    expect(tiktokModelsLite(g1, one.skus)).toEqual([{ sku: "KR64-01", price: 249, tierIndex: [0] }]);
  });
});

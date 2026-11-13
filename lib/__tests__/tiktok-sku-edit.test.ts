import { describe, expect, it } from "vitest";
import { buildTiktokSkusPayload, planTiktokSkuEdit, tiktokOptNameKey, tiktokOptionGroups, tiktokSkuFormOf, tiktokSkuSignature } from "@/lib/tiktok-sku-edit";
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

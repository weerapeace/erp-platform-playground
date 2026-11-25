import { describe, expect, it } from "vitest";
import { lazadaListingView, lazVariationsOf } from "@/lib/lazada-listing-edit";
import { lazAddSkusXml, lazColorGroup, lazModelsLite, lazOptionGroups, lazOptionSignature, lazOptNameKey, lazRenameXml, planLazadaOptions, type LazOptForm } from "@/lib/lazada-option-edit";

// รูปคำตอบ /product/item/get (ย่อ): "จำนวน · สี" — สีอยู่ชั้นที่ 2 · มีรูปตัวเลือก
const sku = (id: string, seller: string, props: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  SkuId: id, SellerSku: seller, price: 199, special_price: 159, quantity: 3, Status: "active", Images: ["https://th-live.slatic.net/p/a.jpg"],
  package_weight: "0.2", package_length: "10", package_width: "5", package_height: "3", saleProp: props, ...extra,
});
const item = {
  item_id: "900", attributes: { name: "ลิปสติก" }, primary_category: "1",
  variation: {
    Variation2: { name: "color_family", label: "Color Family", hasImage: false, customize: false, options: ["น้ำตาล #537", "แดง #783"] },
    Variation1: { name: "pack", label: "จำนวน", hasImage: false, customize: true, options: { option: ["1 หลอด"] } },
  },
  skus: [
    sku("1", "LP-537", { pack: "1 หลอด", color_family: "น้ำตาล #537" }),
    sku("2", "LP-783", { pack: "1 หลอด", color_family: "แดง #783" }, { Status: "inactive" }),
  ],
};
const v = lazadaListingView(item)!;

describe("lazVariationsOf / lazOptionGroups", () => {
  it("เรียงตาม Variation1… + options ทั้งแบบ array และ { option }", () => {
    expect(lazVariationsOf(item.variation).map((x) => [x.key, x.name, x.customize, x.options])).toEqual([
      ["Variation1", "pack", true, ["1 หลอด"]], ["Variation2", "color_family", false, ["น้ำตาล #537", "แดง #783"]],
    ]);
    const g = lazOptionGroups(v);
    expect(g.map((x) => x.label)).toEqual(["จำนวน", "สี"]);
    expect(g[1].values.map((x) => [x.value, x.skuIds])).toEqual([["น้ำตาล #537", ["1"]], ["แดง #783", ["2"]]]);
  });
  it("หาชั้นสีจากรหัสในระบบ (ไม่ใช่ชั้นแรกเสมอ)", () => {
    const g = lazOptionGroups(v);
    expect(lazColorGroup(g, v.skus, ["LP-537", "LP-783"])).toBe("color_family");
    expect(lazColorGroup(g, v.skus, [])).toBe("color_family");   // เสมอ = ชื่อสี
    expect(lazModelsLite(g, "color_family", v.skus).map((m) => m.tierIndex)).toEqual([[0, 0], [1, 0]]);
  });
  it("ลายเซ็นไม่ขึ้นกับลำดับ key ของ saleProp", () => {
    const flipped = lazadaListingView({ ...item, skus: item.skus.map((s) => ({ ...s, saleProp: { color_family: s.saleProp.color_family, pack: s.saleProp.pack } })) })!;
    expect(lazOptionSignature(flipped)).toBe(lazOptionSignature(v));
  });
});

describe("planLazadaOptions + XML", () => {
  const g = lazOptionGroups(v);
  const base: LazOptForm = { names: {}, adds: [], colorGroup: "color_family" };
  it("ไม่แก้ = ไม่ส่ง", () => {
    expect(planLazadaOptions(v, g, base).changed).toBe(false);
    expect(lazRenameXml("900", v, g, base)).toBeNull();
  });
  it("แก้ชื่อสี: เฉพาะ SKU นั้น · saleProp ครบทุกชั้น · สถานะเดิม · ชั้นกำหนดเอง = ประกาศ variation", () => {
    const f = { ...base, names: { [lazOptNameKey("color_family", "แดง #783")]: "แดงสด #783" } };
    const p = planLazadaOptions(v, g, f);
    expect(p.errors).toEqual([]);
    expect(p.renamedSkuIds).toEqual(["2"]);
    const xml = lazRenameXml("900", v, g, f)!;
    expect(xml).toContain("<SkuId>2</SkuId>");
    expect(xml).not.toContain("<SkuId>1</SkuId>");
    expect(xml).toContain("<Status>inactive</Status>");
    expect(xml).toContain("<saleProp><pack><![CDATA[1 หลอด]]></pack><color_family><![CDATA[แดงสด #783]]></color_family></saleProp>");
    expect(xml).toContain("<variation><variation1><name>pack</name>");
    expect(xml).toContain("<option><![CDATA[แดงสด #783]]></option>");
  });
  it("ชื่อซ้ำ/ว่าง = error · ชั้นกำหนดเองยาวเกิน 20 = error", () => {
    expect(planLazadaOptions(v, g, { ...base, names: { [lazOptNameKey("color_family", "แดง #783")]: "น้ำตาล #537" } }).errors.join()).toContain("ซ้ำ");
    expect(planLazadaOptions(v, g, { ...base, names: { [lazOptNameKey("color_family", "แดง #783")]: " " } }).errors.join()).toContain("ว่าง");
    expect(planLazadaOptions(v, g, { ...base, names: { [lazOptNameKey("pack", "1 หลอด")]: "ชุดใหญ่พิเศษสุดคุ้มมากที่สุด 1 หลอด" } }).errors.join()).toContain("ยาวเกิน");
  });
  it("เพิ่มสี (สี×จำนวน): AssociatedSku = SellerSku เดิม · SKU ใหม่ไม่มี SkuId · สต๊อก 0 · กล่องเดิม · รูปที่ฝากแล้ว", () => {
    const f: LazOptForm = { ...base, adds: [{ code: "LP-817", name: "เขียว #817", image: "r2:x/817.jpg", price: null, special: 159, sizes: [{ value: "1 หลอด", sku: "LP-817", price: 199 }] }] };
    const p = planLazadaOptions(v, g, f);
    expect(p.errors).toEqual([]);
    expect(p.newSkuCount).toBe(1);
    expect(p.newImages).toEqual(["r2:x/817.jpg"]);
    const out = lazAddSkusXml("900", v, g, f, (r) => (r === "r2:x/817.jpg" ? "https://th-live.slatic.net/p/817.jpg" : null));
    expect(out.errors).toEqual([]);
    expect(out.sellerSkus).toEqual(["LP-817"]);
    expect(out.xml).toContain("<AssociatedSku>LP-537</AssociatedSku>");
    expect(out.xml).toContain("<Sku><SellerSku>LP-817</SellerSku><saleProp><color_family><![CDATA[เขียว #817]]></color_family><pack><![CDATA[1 หลอด]]></pack></saleProp><quantity>0</quantity><price>199</price><special_price>159</special_price>");
    expect(out.xml).toContain("<package_weight>0.2</package_weight>");
    expect(out.xml).toContain("<Images><Image><![CDATA[https://th-live.slatic.net/p/817.jpg]]></Image></Images>");
    expect(out.xml).not.toMatch(/<Sku><SkuId>/);
  });
  it("เพิ่มสี: ไม่มีรูป / รหัสซ้ำ / ไม่ติ๊กไซซ์ / ราคาลดสูงกว่า = error", () => {
    const e = (a: Partial<LazOptForm["adds"][number]>) => planLazadaOptions(v, g, { ...base, adds: [{ code: "LP-817", name: "เขียว #817", image: "r2:x.jpg", price: null, special: null, sizes: [{ value: "1 หลอด", sku: "LP-817", price: 199 }], ...a }] }).errors.join();
    expect(e({ image: null })).toContain("ต้องใส่รูป");
    expect(e({ sizes: [{ value: "1 หลอด", sku: "LP-537", price: 199 }] })).toContain("มีบนร้านแล้ว");
    expect(e({ sizes: [] })).toContain("อย่างน้อย 1");
    expect(e({ special: 250 })).toContain("ราคาลดต้องต่ำกว่า");
    expect(e({ name: "แดง #783" })).toContain("ซ้ำ");
  });
});

import { describe, it, expect } from "vitest";
import { lazadaListingView, lazImageList, lazDateText, lazSkuLabel, lazStatusBadge } from "./lazada-listing-edit";

// รูปแบบตามคู่มือ /product/item/get (open.lazada.com · สำรวจ 2026-11-10)
const item = {
  item_id: 16196625125, primary_category: 12211, status: "Active", subStatus: "",
  images: "[\"https://th-live.slatic.net/p/a.jpg\",\"https://th-live.slatic.net/p/b.jpg\"]",
  variation: { Variation1: { name: "color_family", label: "Color Family", has_image: true } },
  attributes: { name: "เข็มขัดหนัง IG-EQ011", brand: "No Brand", description: "<p>หนังแท้</p>", short_description: "<ul><li>ยาว 120 ซม.</li></ul>" },
  skus: [
    { SkuId: 127317001489, SellerSku: "IG-EQ011-01", price: 328, special_price: 159, special_from_time: "2026-11-01 00:00:00", special_to_time: "2026-11-30 23:59:59",
      quantity: 3, Available: 3, Status: "active", saleProp: { color_family: "Black" }, Images: ["https://th-live.slatic.net/p/s1.jpg", "", "", "", "", "", "", ""],
      package_weight: "0.3", package_length: "30", package_width: "10", package_height: "5", Url: "https://www.lazada.co.th/products/i16196625125-s127317001489.html" },
    { SkuId: 127317001490, SellerSku: "IG-EQ011-02", price: 328, special_price: 400, quantity: 0, Status: "inactive", saleProp: { color_family: "Brown" } },
    { SkuId: 127317001491, SellerSku: "IG-EQ011-03", price: 328 },
  ],
};

describe("lazadaListingView", () => {
  const v = lazadaListingView(item)!;
  it("ข้อมูลหลัก: ชื่อ/แบรนด์/หมวด/รายละเอียด/จุดเด่น/รูป (รูปเป็นข้อความ JSON ก็อ่านได้)", () => {
    expect(v).toMatchObject({ itemId: "16196625125", name: "เข็มขัดหนัง IG-EQ011", brand: "No Brand", categoryId: "12211", status: "Active" });
    expect(v.description).toBe("<p>หนังแท้</p>");
    expect(v.shortDescription).toContain("<li>");
    expect(v.images).toEqual(["https://th-live.slatic.net/p/a.jpg", "https://th-live.slatic.net/p/b.jpg"]);
  });
  it("ตัวเลือก: ชื่อจาก saleProp · ราคาลด+ช่วงวัน · กล่อง · รูปตัดช่องว่าง", () => {
    expect(v.skus[0]).toMatchObject({
      skuId: "127317001489", sellerSku: "IG-EQ011-01", label: "สี: Black", price: 328, specialPrice: 159,
      specialFrom: "2026-11-01 00:00", specialTo: "2026-11-30 23:59", available: 3, status: "active",
      images: ["https://th-live.slatic.net/p/s1.jpg"], weight: 0.3, length: 30, width: 10, height: 5,
    });
  });
  it("ราคาลดสูงกว่าราคาปกติ = ไม่นับเป็นราคาลด · ไม่มี saleProp = ใช้รหัส", () => {
    expect(v.skus[1].specialPrice).toBeNull();
    expect(v.skus[1].status).toBe("inactive");
    expect(v.skus[2].label).toBe("IG-EQ011-03");
  });
  it("ไม่มี item_id = null", () => expect(lazadaListingView({ attributes: { name: "x" } })).toBeNull());
  it("เหตุผลที่ถูกปัดตก (array ของ object) → ข้อความ", () => {
    const r = lazadaListingView({ ...item, status: "Suspended", rejectReason: [{ violationDetail: "No White Background", suggestion: "ใช้พื้นขาว" }] })!;
    expect(r.rejectReasons).toEqual(["No White Background — ใช้พื้นขาว"]);
  });
});

describe("ตัวช่วย", () => {
  it("lazImageList: array / ข้อความ JSON / ลิงก์เดี่ยว / ไม่ใช่ลิงก์", () => {
    expect(lazImageList(["https://x/1.jpg", "", null])).toEqual(["https://x/1.jpg"]);
    expect(lazImageList("https://x/2.jpg")).toEqual(["https://x/2.jpg"]);
    expect(lazImageList("[bad json")).toEqual([]);
    expect(lazImageList(["javascript:alert(1)"])).toEqual([]);
  });
  it("lazDateText: ข้อความ → 16 ตัวแรก · มิลลิวินาที → เวลาไทย", () => {
    expect(lazDateText("2026-11-01 00:00:00")).toBe("2026-11-01 00:00");
    expect(lazDateText(String(Date.UTC(2026, 10, 1, 17, 0)))).toBe("2026-11-02 00:00");
    expect(lazDateText("")).toBeNull();
  });
  it("lazSkuLabel: ชั้นที่รู้จักแปลไทย · ชั้นอื่นใช้ป้ายจาก variation · หลายชั้นคั่นด้วย ·", () => {
    expect(lazSkuLabel({ saleProp: { color_family: "Black", size: "M" } })).toBe("สี: Black · ไซซ์: M");
    expect(lazSkuLabel({ saleProp: { buckle_type: "Pin" } }, { Variation2: { name: "buckle_type", label: "Buckle Type" } })).toBe("Buckle Type: Pin");
    expect(lazSkuLabel({ SellerSku: "X" })).toBeNull();
  });
  it("lazStatusBadge: สถานะ Lazada → ภาษาคน", () => {
    expect(lazStatusBadge("Active").tone).toBe("ok");
    expect(lazStatusBadge("InActive").label).toBe("ปิดขาย");
    expect(lazStatusBadge("Pending QC").tone).toBe("wait");
    expect(lazStatusBadge("suspended").tone).toBe("bad");
    expect(lazStatusBadge(null).tone).toBe("none");
  });
});

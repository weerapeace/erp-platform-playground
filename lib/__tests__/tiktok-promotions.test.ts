import { describe, expect, it } from "vitest";
import { tiktokPromoPrice, tiktokPromosForProduct, ttsPromosOf, ttsPromoWithDetail } from "@/lib/tiktok-promotions";

// รูปคำตอบตามเอกสาร Search Promotion Activities / Get Activity (ย่อ)
const search = { activities: [
  { id: "A1", title: "ลด 50%", activity_type: "DIRECT_DISCOUNT", status: "ONGOING", begin_time: 1700000000, end_time: 1800000000, product_level: "PRODUCT" },
  { id: "A2", title: "ส่งฟรี", activity_type: "SHIPPING_DISCOUNT", status: "ONGOING", product_level: "SHOP", discount: { shipping_discount: { threshold_type: "MINIMAL_ORDER_AMOUNT", threshold_value: "199", type: "FREE_SHIPPING" } } },
  { id: "A3", title: "แฟลชเซล 11.11", activity_type: "FLASHSALE", status: "NOT_START", product_level: "VARIATION" },
] };

describe("ttsPromosOf / detail", () => {
  it("แปลงรายการ + ป้ายภาษาไทย + เงื่อนไขส่วนลดค่าส่ง", () => {
    const list = ttsPromosOf(search);
    expect(list.map((p) => [p.id, p.typeLabel, p.statusLabel])).toEqual([["A1", "ลดราคา (%)", "กำลังใช้"], ["A2", "ส่วนลดค่าส่ง", "กำลังใช้"], ["A3", "แฟลชเซล", "ยังไม่เริ่ม"]]);
    expect(list[1].detail).toContain("ส่งฟรี");
    expect(list[0].products).toBeNull();
  });
  it("เติมสินค้า → หาโปรของสินค้า + ราคาหลังโปร", () => {
    const [a1, , a3] = ttsPromosOf(search);
    const d1 = ttsPromoWithDetail(a1, { activity_id: "A1", title: "ลด 50%", activity_type: "DIRECT_DISCOUNT", status: "ONGOING", products: [{ id: "P1", discount: "50" }] });
    const d3 = ttsPromoWithDetail(a3, { activity_id: "A3", activity_type: "FLASHSALE", status: "NOT_START", products: [{ id: "P1", skus: [{ id: "S1", activity_price: { amount: "399" } }] }, { id: "P2" }] });
    expect(tiktokPromosForProduct([d3, d1], "P1").map((p) => p.id)).toEqual(["A1", "A3"]);
    expect(tiktokPromoPrice(d1, "P1", "S1", 890)).toBe(445);
    expect(tiktokPromoPrice(d3, "P1", "S1", 890)).toBe(399);
    expect(tiktokPromoPrice(d3, "P9", "S1", 890)).toBeNull();
  });
});

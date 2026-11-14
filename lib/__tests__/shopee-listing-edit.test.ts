import { describe, expect, test } from "vitest";
import {
  planShopeeDisplay, planShopeeEdit, shopeeDescriptionOf, shopeeLimitsOf, shopeeListingView, shopeeStatusBadge, shopeeTextLength, shopeeUnlistErrors,
  type ShopeeListingView,
} from "@/lib/shopee-listing-edit";
import { listingHistoryText } from "@/lib/line-listing-edit";

const BASE = {
  item_id: 800123, item_name: "Louis Montini กระเป๋าสตางค์", item_status: "NORMAL", description: "หนังแท้ 100%", description_type: "normal",
  image: { image_url_list: ["https://cf.shopee.co.th/file/a", "https://cf.shopee.co.th/file/b"] }, category_id: 100637, item_sku: "TTM090",
  brand: { original_brand_name: "Louis Montini" }, weight: 0.3, dimension: { package_length: 20, package_width: 10, package_height: 5 },
  has_model: true, has_promotion: true, update_time: 1763000000,
};
const MODELS = { models: [{ model_id: "1", sku: "TTM090-01", label: "สี: ดำ", price: 990, original_price: 1590, stock: 7, image: null, status: "MODEL_NORMAL" }] };
const LIMITS = { nameMin: 10, nameMax: 120, descMin: 20, descMax: 3000, imagesMax: 9 };
const view = (patch: Partial<ShopeeListingView> = {}): ShopeeListingView => ({ ...shopeeListingView(BASE, MODELS, LIMITS)!, ...patch });

describe("Shopee ลิ้นชัก — มุมมองจากของจริง", () => {
  test("แปลงรายละเอียด + ตัวเลือก + ช่วงความยาว", () => {
    const v = shopeeListingView(BASE, MODELS, LIMITS)!;
    expect(v).toMatchObject({ itemId: "800123", name: "Louis Montini กระเป๋าสตางค์", status: "NORMAL", description: "หนังแท้ 100%", descriptionEditable: true,
      images: ["https://cf.shopee.co.th/file/a", "https://cf.shopee.co.th/file/b"], categoryId: "100637", brand: "Louis Montini", itemSku: "TTM090",
      weight: 0.3, dims: { length: 20, width: 10, height: 5 }, hasModel: true, inPromotion: true, limits: LIMITS });
    expect(v.models[0]).toEqual({ modelId: "1", sku: "TTM090-01", label: "สี: ดำ", price: 990, originalPrice: 1590, stock: 7, image: null, status: "MODEL_NORMAL" });
    expect(shopeeListingView({ item_name: "x" }, null)).toBeNull();
  });
  test("รายละเอียดแบบ extended = ต่อข้อความ + แก้ไม่ได้", () => {
    const d = shopeeDescriptionOf({ description_type: "extended", description_info: { extended_description: { field_list: [{ field_type: "text", text: "บรรทัด 1" }, { field_type: "image", image_info: { image_id: "x" } }, { field_type: "text", text: "บรรทัด 2" }] } } });
    expect(d).toEqual({ text: "บรรทัด 1\nบรรทัด 2", type: "extended" });
    expect(shopeeListingView({ ...BASE, description_type: "extended" }, null)!.descriptionEditable).toBe(false);
  });
  test("ช่วงความยาวจาก get_item_limit · อ่านไม่ได้ = null", () => {
    expect(shopeeLimitsOf({ response: { item_name_length_limit: { min_limit: 10, max_limit: 120 }, item_description_length_limit: { min_limit: 20, max_limit: 3000 }, item_image_count_limit: { max_limit: 9 } } }))
      .toEqual(LIMITS);
    expect(shopeeLimitsOf({ response: {} })).toBeNull();
    expect(shopeeLimitsOf(null)).toBeNull();
  });
  test("นับตัวอักษรไทยแบบที่คนเห็น", () => {
    expect(shopeeTextLength("กระเป๋า")).toBeLessThanOrEqual(7);
    expect(shopeeTextLength("abc")).toBe(3);
  });
});

describe("Shopee ลิ้นชัก — แผนแก้ชื่อ/รายละเอียด", () => {
  test("ส่งเฉพาะช่องที่เปลี่ยน", () => {
    const p = planShopeeEdit(view(), { name: "Louis Montini กระเป๋าสตางค์หนังแท้", description: "หนังแท้ 100%" });
    expect(p.body).toEqual({ item_name: "Louis Montini กระเป๋าสตางค์หนังแท้" });
    expect(p.changes).toHaveLength(1);
    expect(p.errors).toEqual([]);
  });
  test("ไม่เปลี่ยน = ไม่มีอะไรส่ง · ช่องว่างซ้ำถูกยุบ", () => {
    expect(planShopeeEdit(view(), { name: "  Louis  Montini กระเป๋าสตางค์ ", description: "หนังแท้ 100%" }).changes).toHaveLength(0);
  });
  test("ชื่อสั้น/ยาวเกินช่วงของร้าน · ว่าง = error", () => {
    expect(planShopeeEdit(view(), { name: "สั้น" }).errors[0]).toContain("สั้นไป");
    expect(planShopeeEdit(view(), { name: "ก".repeat(130) }).errors[0]).toContain("ยาวไป");
    expect(planShopeeEdit(view(), { name: "   " }).errors[0]).toContain("ว่าง");
  });
  test("ไม่รู้ช่วง = ให้ Shopee ตรวจเอง", () => {
    expect(planShopeeEdit(view({ limits: null }), { name: "สั้น" }).errors).toEqual([]);
  });
  test("รายละเอียดแบบ extended แก้ไม่ได้", () => {
    expect(planShopeeEdit(view({ descriptionEditable: false, descriptionType: "extended" }), { description: "ใหม่ยาวพอสมควรเกินยี่สิบตัวอักษรแน่นอน" }).errors[0]).toContain("Seller Centre");
  });
  test("รอตรวจ/ถูกแบน = เตือน", () => {
    expect(planShopeeEdit(view({ status: "REVIEWING" }), { name: "Louis Montini ชื่อใหม่ยาวพอ" }).warnings[0]).toContain("รอ Shopee ตรวจ");
  });
});

describe("Shopee ลิ้นชัก — เปิด/ปิดขาย", () => {
  test("ขายอยู่ → ปิด = unlist · อยู่ในโปรโมชัน = เตือน", () => {
    const p = planShopeeDisplay(view(), false);
    expect(p.api).toBe("unlist");
    expect(p.warnings[0]).toContain("โปรโมชัน");
  });
  test("ปิดอยู่ → เปิด = relist · อยู่สถานะนั้นแล้ว = ไม่ส่ง", () => {
    expect(planShopeeDisplay(view({ status: "UNLIST" }), true).api).toBe("relist");
    expect(planShopeeDisplay(view(), true).api).toBe("none");
    expect(planShopeeDisplay(view({ status: "UNLIST" }), false).api).toBe("none");
  });
  test("รอตรวจ/ถูกแบน/ลบแล้ว = ทำไม่ได้", () => {
    expect(planShopeeDisplay(view({ status: "REVIEWING" }), false).errors).toHaveLength(1);
    expect(planShopeeDisplay(view({ status: "BANNED" }), true).errors).toHaveLength(1);
    expect(planShopeeDisplay(view({ status: "SELLER_DELETE" }), true).errors).toHaveLength(1);
  });
  test("ผล unlist_item: failure_list = เหตุผลจาก Shopee · success_list = สำเร็จ", () => {
    expect(shopeeUnlistErrors({ response: { failure_list: [{ item_id: 800123, failed_reason: "Can't unlist item when item is under promotion" }], success_list: [] } }, "800123"))
      .toEqual(["Can't unlist item when item is under promotion"]);
    expect(shopeeUnlistErrors({ response: { failure_list: [], success_list: [{ item_id: 800123, unlist: true }] } }, "800123")).toEqual([]);
    expect(shopeeUnlistErrors({ response: {} }, "800123")[0]).toContain("ไม่ได้ยืนยัน");
  });
  test("ป้ายสถานะ", () => {
    expect(shopeeStatusBadge("NORMAL")).toEqual({ label: "ขายอยู่", tone: "ok" });
    expect(shopeeStatusBadge("UNLIST").label).toBe("ปิดขาย");
    expect(shopeeStatusBadge("BANNED").tone).toBe("bad");
  });
});

describe("Shopee ลิ้นชัก — ข้อความประวัติ", () => {
  test("แก้ / เปิดปิดขาย / ไม่สำเร็จ", () => {
    expect(listingHistoryText({ source: "shopee_listing_edit", ok: true, changes: [{ label: "ชื่อสินค้า" }, { label: "รายละเอียด" }] })).toBe("แก้บน Shopee: ชื่อสินค้า · รายละเอียด");
    expect(listingHistoryText({ source: "shopee_listing_edit", ok: false, error: "x", changes: [{ label: "ชื่อสินค้า" }] })).toBe("แก้บน Shopee: ชื่อสินค้า — ไม่สำเร็จ: x");
    expect(listingHistoryText({ source: "shopee_listing_display", ok: true, open: false })).toBe("ปิดขายบน Shopee");
    expect(listingHistoryText({ source: "shopee_listing_display", ok: false, open: true, error: "y" })).toBe("เปิดขายบน Shopee — ไม่สำเร็จ: y");
  });
});

import { describe, expect, test } from "vitest";
import {
  planShopeeDisplay, planShopeeEdit, shopeeDescriptionOf, shopeeLimitsOf, shopeeListingView, shopeeStatusBadge, shopeeTextLength, shopeeUnlistErrors,
  applyShopeeBulkPrice, planShopeePrices, shopeePriceBatches, shopeePriceResult, shopeePriceRowsFromView,
  planShopeeImages, shopeeImagesMax, shopeeRefsForSend, shopeeImageIdOfRef, shopeeR2KeyOfRef,
  type ShopeeListingView,
} from "@/lib/shopee-listing-edit";
import { listingHistoryText } from "@/lib/line-listing-edit";

const BASE = {
  item_id: 800123, item_name: "Louis Montini กระเป๋าสตางค์", item_status: "NORMAL", description: "หนังแท้ 100%", description_type: "normal",
  image: { image_url_list: ["https://cf.shopee.co.th/file/a", "https://cf.shopee.co.th/file/b"], image_id_list: ["ida", "idb"], image_ratio: "1:1" }, category_id: 100637, item_sku: "TTM090",
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
    expect(v.models[0]).toEqual({ modelId: "1", sku: "TTM090-01", label: "สี: ดำ", price: 990, originalPrice: 1590, stock: 7, image: null, status: "MODEL_NORMAL", promo: false });
    expect(shopeeListingView({ item_name: "x" }, null)).toBeNull();
    expect(v.imageIds).toEqual(["ida", "idb"]);
    expect(v.imageRatio).toBe("1:1");
    // ลิงก์ว่างถูกตัด — รหัสต้องตัดตามให้ตรงตำแหน่ง · ไม่มีรหัส = ""
    const odd = shopeeListingView({ ...BASE, image: { image_url_list: ["", "https://u/b", "https://u/c"], image_id_list: ["x", "yb"] } }, null)!;
    expect(odd.images).toEqual(["https://u/b", "https://u/c"]);
    expect(odd.imageIds).toEqual(["yb", ""]);
  });
  test("รายละเอียดแบบ extended = ต่อข้อความ + แก้ไม่ได้", () => {
    const d = shopeeDescriptionOf({ description_type: "extended", description_info: { extended_description: { field_list: [{ field_type: "text", text: "บรรทัด 1" }, { field_type: "image", image_info: { image_id: "x" } }, { field_type: "text", text: "บรรทัด 2" }] } } });
    expect(d).toEqual({ text: "บรรทัด 1\nบรรทัด 2", type: "extended" });
    expect(shopeeListingView({ ...BASE, description_type: "extended" }, null)!.descriptionEditable).toBe(false);
  });
  test("ช่วงความยาวจาก get_item_limit · อ่านไม่ได้ = null", () => {
    expect(shopeeLimitsOf({ response: { item_name_length_limit: { min_limit: 10, max_limit: 120 }, item_description_length_limit: { min_limit: 20, max_limit: 3000 }, item_image_count_limit: { max_limit: 9 } } }))
      .toEqual({ ...LIMITS, priceMin: null, priceMax: null });
    expect(shopeeLimitsOf({ response: { item_name_length_limit: { min_limit: 10, max_limit: 120 }, price_limit: { min_limit: 10, max_limit: 150000 } } }))
      .toMatchObject({ nameMin: 10, nameMax: 120, priceMin: 10, priceMax: 150000 });
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



describe("Shopee ลิ้นชัก — เฟส 4B ราคาตั้ง", () => {
  const MODELS3 = { models: [
    { model_id: "1", sku: "A-1", label: "สี: ดำ", price: 990, original_price: 1590, stock: 7, image: null, status: "MODEL_NORMAL", promo: true },
    { model_id: "2", sku: "A-2", label: "สี: น้ำตาล", price: 1590, original_price: 1590, stock: 0, image: null, status: "MODEL_NORMAL", promo: false },
  ] };
  const v3 = (): ShopeeListingView => shopeeListingView(BASE, MODELS3, { ...LIMITS, priceMin: 10, priceMax: 100000 })!;
  test("แถวราคาจากของจริง (ไม่มีตัวเลือก = model 0)", () => {
    expect(shopeePriceRowsFromView(v3())).toEqual([
      { modelId: "1", label: "สี: ดำ", price: 1590, promo: true },
      { modelId: "2", label: "สี: น้ำตาล", price: 1590, promo: false },
    ]);
    const single = shopeeListingView({ ...BASE, has_model: false, price_info: [{ current_price: 490, original_price: 590 }] }, null)!;
    expect(shopeePriceRowsFromView(single)).toEqual([{ modelId: "0", label: "สินค้าเดียว (ไม่มีตัวเลือก)", price: 590, promo: true }]);
  });
  test("ส่งเฉพาะตัวที่เปลี่ยน + เตือนโปรโมชัน", () => {
    const p = planShopeePrices(v3(), [{ modelId: "1", label: "สี: ดำ", price: 1490, promo: true }, { modelId: "2", label: "สี: น้ำตาล", price: 1590, promo: false }]);
    expect(p.errors).toEqual([]);
    expect(p.changes).toEqual([{ modelId: "1", label: "สี: ดำ", before: 1590, after: 1490, promo: true }]);
    expect(p.warnings.join(" ")).toContain("โปรโมชัน");
  });
  test("ไทยต้องเป็นจำนวนเต็ม · ว่าง · นอกช่วงร้าน · เปลี่ยน ≥80% = บล็อก", () => {
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: 1590.5, promo: false }]).errors[0]).toContain("จำนวนเต็ม");
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: null, promo: false }]).errors[0]).toContain("ว่าง");
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: 5, promo: false }]).errors[0]).toMatch(/ต่ำกว่า|80%/);
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: 200, promo: false }]).errors[0]).toContain("80%");
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: 9000, promo: false }]).errors[0]).toContain("80%");
  });
  test("ลดครึ่ง/ขึ้น 2 เท่า = เตือน (ไม่บล็อก) · ไม่พบตัวเลือก = error", () => {
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: 700, promo: false }]).warnings.join(" ")).toContain("ครึ่ง");
    expect(planShopeePrices(v3(), [{ modelId: "2", label: "x", price: 3500, promo: false }]).warnings.join(" ")).toContain("2 เท่า");
    expect(planShopeePrices(v3(), [{ modelId: "9", label: "หาย", price: 100, promo: false }]).errors[0]).toContain("ไม่พบตัวเลือก");
  });
  test("ก้อนส่ง update_price ชุดละ 50 · model_id ตัวเลข", () => {
    const changes = Array.from({ length: 51 }, (_, i) => ({ modelId: String(i + 1), label: `m${i}`, before: 100, after: 120, promo: false }));
    const b = shopeePriceBatches("800123", changes);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ item_id: 800123 });
    expect(b[0].price_list).toHaveLength(50);
    expect(b[1].price_list[0]).toEqual({ model_id: 51, original_price: 120 });
  });
  test("ผลรายตัว: failure_list = เหตุผล · success_list = ผ่าน · ไม่อยู่ทั้งคู่ = ยังไม่ยืนยัน (ไม่นับว่าล้ม)", () => {
    const res = shopeePriceResult({ response: { failure_list: [{ model_id: 1, failed_reason: "Price cannot be changed when model is under promotion." }], success_list: [{ model_id: 2, original_price: 1490 }] } }, ["1", "2", "3"]);
    expect(res.ok).toEqual(["2"]);
    expect(res.failed).toEqual([{ modelId: "1", reason: "Price cannot be changed when model is under promotion." }]);
    expect(res.unsure).toEqual(["3"]);
  });
  test("สินค้าไม่มีตัวเลือก (model 0): Shopee ตอบด้วยรหัสตัวเลือกภายใน = ผ่าน · ตอบว่าง = ยังไม่ยืนยัน · failure = ไม่ผ่าน", () => {
    expect(shopeePriceResult({ response: { success_list: [{ model_id: 123456789, original_price: 1251 }], failure_list: [] } }, ["0"])).toEqual({ ok: ["0"], failed: [], unsure: [] });
    // คำตอบจริงจากร้าน (BCG01-03 2026-11-15): ไม่มี model_id ใน success_list
    expect(shopeePriceResult({ error: "", message: "", response: { failure_list: [], success_list: [{ original_price: 1250 }] } }, ["0"])).toEqual({ ok: ["0"], failed: [], unsure: [] });
    expect(shopeePriceResult({ response: {} }, ["0"])).toEqual({ ok: [], failed: [], unsure: ["0"] });
    expect(shopeePriceResult({ response: { failure_list: [{ model_id: 123456789, failed_reason: "Can't update price when item is under promotion." }] } }, ["0"]))
      .toEqual({ ok: [], failed: [{ modelId: "0", reason: "Can't update price when item is under promotion." }], unsure: [] });
  });
  test("แก้หลายตัว: ตั้งราคาเดียว / ปรับ % ปัดบาทเต็ม / เฉพาะที่ติ๊ก", () => {
    const rows = shopeePriceRowsFromView(v3());
    expect(applyShopeeBulkPrice(rows, new Set(), { price: 1290 }).rows.map((r) => r.price)).toEqual([1290, 1290]);
    expect(applyShopeeBulkPrice(rows, new Set(["2"]), { pct: -10 }).rows.map((r) => r.price)).toEqual([1590, 1431]);
    expect(applyShopeeBulkPrice(rows, new Set(), {}).error).toContain("ใส่ราคา");
  });
  test("ข้อความประวัติแก้ราคา", () => {
    expect(listingHistoryText({ source: "shopee_listing_prices", ok: true, sent: 1, changes: [{ label: "สี: ดำ", text: "1,590฿ → 1,490฿" }] })).toBe("แก้ราคาบน Shopee 1 ตัวเลือก (1,590฿ → 1,490฿)");
    expect(listingHistoryText({ source: "shopee_listing_prices", ok: false, sent: 0, error: "x", changes: [{ label: "a" }, { label: "b" }] })).toBe("แก้ราคาบน Shopee 2 ตัวเลือก — ไม่สำเร็จ: x");
    expect(listingHistoryText({ source: "shopee_listing_prices", ok: true, sent: 0, unsure: ["0"], changes: [{ label: "สินค้าเดียว", text: "1,250฿ → 1,251฿" }] })).toBe("แก้ราคาบน Shopee 1 ตัวเลือก (1,250฿ → 1,251฿) · รอ Shopee ยืนยัน 1 ตัวเลือก");
  });
});

describe("Shopee เฟส 4C — รูปสินค้า", () => {
  const A = "https://cf.shopee.co.th/file/a", B = "https://cf.shopee.co.th/file/b";
  test("ฟอร์ม → ref ที่ส่ง: รูปเดิม = spi:<รหัส> · รูปใหม่ r2: ผ่าน · ลิงก์แปลก = null", () => {
    const v = view();
    expect(shopeeRefsForSend([B, "r2:products/x.jpg", A], v)).toEqual(["spi:idb", "r2:products/x.jpg", "spi:ida"]);
    expect(shopeeRefsForSend(["https://elsewhere/z.jpg"], v)).toBeNull();
    expect(shopeeRefsForSend([A], view({ imageIds: ["", "idb"] }))).toBeNull(); // รูปเดิมไม่มีรหัส
    expect(shopeeImageIdOfRef("spi:abc")).toBe("abc");
    expect(shopeeR2KeyOfRef("r2:k/1.jpg")).toBe("k/1.jpg");
    expect(shopeeImageIdOfRef("r2:k")).toBeNull();
  });
  test("ไม่เปลี่ยน = changed false · สลับลำดับ = เปลี่ยนปก", () => {
    expect(planShopeeImages(view(), ["spi:ida", "spi:idb"]).changed).toBe(false);
    const p = planShopeeImages(view(), ["spi:idb", "spi:ida"]);
    expect(p).toMatchObject({ changed: true, newImages: 0, removed: 0, coverChanged: true, errors: [] });
    expect(p.changes).toEqual([{ label: "รูปสินค้า", before: "2 รูป", after: "2 รูป (เปลี่ยนปก)" }]);
    expect(p.warnings.some((w) => w.includes("ปก"))).toBe(true);
  });
  test("เพิ่มรูปใหม่ + เอาออก → นับถูก + เตือนฝากรูป", () => {
    const p = planShopeeImages(view(), ["spi:ida", "r2:products/x.jpg", "r2:products/y.jpg"]);
    expect(p).toMatchObject({ changed: true, newImages: 2, removed: 1, coverChanged: false, errors: [] });
    expect(p.changes[0].after).toBe("3 รูป (ใหม่ 2 · เอาออก 1)");
    expect(p.warnings.join(" ")).toContain("จัตุรัส");
    expect(planShopeeImages(view({ imageRatio: "3:4" }), ["spi:ida", "r2:k"]).warnings.join(" ")).toContain("3:4");
  });
  test("บล็อก: ไม่มีรูป · เกินจำนวนของร้าน · ซ้ำ · ไม่รู้จัก · ถูกลบแล้ว", () => {
    expect(planShopeeImages(view(), []).errors).toContain("ต้องมีรูปสินค้าอย่างน้อย 1 รูป");
    const ten = Array.from({ length: 10 }, (_, i) => `r2:k${i}`);
    expect(planShopeeImages(view(), ten).errors.join(" ")).toContain("สูงสุด 9 รูป");
    expect(shopeeImagesMax(view({ limits: { ...LIMITS, imagesMax: 12 } }))).toBe(12);
    expect(planShopeeImages(view({ limits: { ...LIMITS, imagesMax: 12 } }), ten).errors).toEqual([]);
    expect(planShopeeImages(view(), ["spi:ida", "spi:ida"]).errors.join(" ")).toContain("ซ้ำ");
    expect(planShopeeImages(view(), ["https://x"]).errors.join(" ")).toContain("ไม่รู้จัก");
    expect(planShopeeImages(view({ status: "SELLER_DELETE" }), ["spi:idb"]).errors.join(" ")).toContain("ถูกลบแล้ว");
  });
  test("ประวัติ: แก้รูป = ป้าย รูปสินค้า", () => {
    expect(listingHistoryText({ source: "shopee_listing_edit", ok: true, changes: [{ label: "รูปสินค้า", text: "2 รูป → 3 รูป" }] })).toBe("แก้บน Shopee: รูปสินค้า");
  });
});

import { describe, expect, test } from "vitest";
import {
  tiktokListingView, tiktokStatusBadge, tiktokIsOpen, planTiktokDisplay, planTiktokTitle, ttsTitleLength, tiktokDisplayErrors, keepSkuStatus,
  TTS_TITLE_MIN, TTS_TITLE_MAX, TTS_PRICE_MIN, TTS_PRICE_MAX, planTiktokPrices, applyTiktokBulkPrice, tiktokPriceBlock, tiktokPriceChangeText, tiktokPriceRowsFromView, type TiktokPriceRow,
} from "@/lib/tiktok-listing-edit";
import { listingHistoryText } from "@/lib/line-listing-edit";

// รูปตามเอกสาร get-product-202309 + ช่องที่เจอจริงในร้าน (audit sample 2026-11-12)
const detail = {
  id: "1729000000000000001",
  title: "กระเป๋าสตางค์หนังแท้ ผู้ชาย ใบสั้น Louis Montini",
  status: "ACTIVATE",
  product_status: "ACTIVATE",
  audit: { status: "APPROVED", pre_approved_reasons: [] },
  has_draft: false,
  brand: { id: "1", name: "Louis Montini" },
  category_chains: [{ id: "1", local_name: "กระเป๋า", is_leaf: false }, { id: "2", local_name: "กระเป๋าสตางค์", is_leaf: true }],
  main_images: [{ urls: ["https://p16.example/a.jpg"], thumb_urls: ["https://p16.example/a-t.jpg"] }, { thumb_urls: ["https://p16.example/b-t.jpg"] }],
  description: "<p>หนังแท้</p>",
  skus: [
    { id: "s1", seller_sku: "MPU12-04", price: { currency: "THB", tax_exclusive_price: "590" }, inventory: [{ quantity: 3 }, { quantity: 2 }], status_info: { status: "NORMAL" }, sales_attributes: [{ name: "สี", value_name: "ดำ" }] },
    { id: "s2", seller_sku: "MPU12-05", price: { sale_price: "650" }, inventory: [], status_info: { status: "DEACTIVATED" } },
  ],
  audit_failed_reasons: [{ position: "product", reasons: ["รูปไม่ชัด"], suggestions: ["ถ่ายใหม่", "รูปไม่ชัด"] }],
  update_time: 1762900000,
};

describe("tiktokListingView — รายละเอียดสินค้า → มุมมองในลิ้นชัก", () => {
  test("อ่านช่องหลักครบ", () => {
    const v = tiktokListingView(detail)!;
    expect(v.productId).toBe("1729000000000000001");
    expect(v.status).toBe("ACTIVATE");
    expect(v.productStatus).toBe("ACTIVATE");
    expect(v.auditStatus).toBe("APPROVED");
    expect(v.brand).toBe("Louis Montini");
    expect(v.category).toBe("กระเป๋าสตางค์");
    expect(v.images).toEqual(["https://p16.example/a.jpg", "https://p16.example/b-t.jpg"]);
    expect(v.skus).toEqual([
      { skuId: "s1", sellerSku: "MPU12-04", label: "สี: ดำ", price: 590, stock: 5, status: "NORMAL" },
      { skuId: "s2", sellerSku: "MPU12-05", label: "MPU12-05", price: 650, stock: null, status: "DEACTIVATED" },
    ]);
    expect(v.rejectReasons).toEqual(["รูปไม่ชัด", "ถ่ายใหม่"]);   // ไม่ซ้ำ
    expect(v.pendingTitle).toBeNull();
  });
  test("ไม่มี id = null", () => {
    expect(tiktokListingView({ title: "x" })).toBeNull();
    expect(tiktokListingView(null)).toBeNull();
  });
  test("ฉบับรอตรวจมีชื่อใหม่ → pendingTitle", () => {
    const v = tiktokListingView({ ...detail, status: "PENDING", audit: { status: "AUDITING" } }, { id: detail.id, title: "ชื่อใหม่ที่ยาวพอสำหรับ TikTok ไทย 25 ตัวขึ้นไป" })!;
    expect(v.pendingTitle).toBe("ชื่อใหม่ที่ยาวพอสำหรับ TikTok ไทย 25 ตัวขึ้นไป");
    expect(v.productStatus).toBe("ACTIVATE");      // ระหว่างตรวจ ร้านยังขายอยู่
    expect(tiktokIsOpen(v)).toBe(true);
  });
  test("ฉบับรอตรวจชื่อเดิม / คนละสินค้า → ไม่มี pendingTitle", () => {
    expect(tiktokListingView(detail, { id: detail.id, title: detail.title })!.pendingTitle).toBeNull();
    expect(tiktokListingView(detail, { id: "other", title: "อื่น" })!.pendingTitle).toBeNull();
  });
  test("ไม่มี product_status → ใช้ status", () => {
    const { product_status: _ps, ...rest } = detail; void _ps;
    expect(tiktokListingView({ ...rest, status: "SELLER_DEACTIVATED" })!.productStatus).toBe("SELLER_DEACTIVATED");
  });
});

describe("ป้ายสถานะ", () => {
  test("สถานะหลัก", () => {
    expect(tiktokStatusBadge("ACTIVATE")).toEqual({ label: "เปิดขาย", tone: "ok" });
    expect(tiktokStatusBadge("seller_deactivated").tone).toBe("off");
    expect(tiktokStatusBadge("PENDING").tone).toBe("wait");
    expect(tiktokStatusBadge("PLATFORM_DEACTIVATED").tone).toBe("bad");
    expect(tiktokStatusBadge("WHATEVER").label).toBe("WHATEVER");
    expect(tiktokStatusBadge(null).label).toBe("ไม่ทราบสถานะ");
  });
});

describe("planTiktokDisplay — เปิด/ปิดขาย", () => {
  test("ปิดตัวที่เปิดอยู่ = deactivate", () => {
    expect(planTiktokDisplay({ productStatus: "ACTIVATE", status: "ACTIVATE" }, false)).toMatchObject({ api: "deactivate", errors: [] });
  });
  test("เปิดตัวที่ร้านปิด = activate + เตือนว่าต้องรอตรวจ", () => {
    const p = planTiktokDisplay({ productStatus: "SELLER_DEACTIVATED", status: "SELLER_DEACTIVATED" }, true);
    expect(p.api).toBe("activate");
    expect(p.warnings.join(" ")).toContain("ตรวจ");
  });
  test("TikTok ระงับ → เปิดได้แต่เตือนเพิ่ม", () => {
    const p = planTiktokDisplay({ productStatus: "PLATFORM_DEACTIVATED", status: "PLATFORM_DEACTIVATED" }, true);
    expect(p.api).toBe("activate");
    expect(p.warnings).toHaveLength(2);
  });
  test("อยู่สถานะนั้นแล้ว = ไม่ส่ง", () => {
    expect(planTiktokDisplay({ productStatus: "ACTIVATE", status: "ACTIVATE" }, true).api).toBe("none");
    expect(planTiktokDisplay({ productStatus: "SELLER_DEACTIVATED", status: "SELLER_DEACTIVATED" }, false).api).toBe("none");
  });
  test("แก้ชื่อรอตรวจ (status PENDING แต่ productStatus ACTIVATE) ยังปิดขายได้", () => {
    expect(planTiktokDisplay({ productStatus: "ACTIVATE", status: "PENDING" }, false).api).toBe("deactivate");
  });
  test("ร่าง / ถูกระงับ / ลบแล้ว = ทำไม่ได้ พร้อมเหตุผล", () => {
    for (const s of ["DRAFT", "FREEZE", "DELETED"]) {
      const p = planTiktokDisplay({ productStatus: s, status: s }, true);
      expect(p.api).toBe("none");
      expect(p.errors[0]).toContain("Seller Center");
    }
  });
});

describe("planTiktokTitle — ตรวจชื่อก่อนส่ง", () => {
  const ok = "กระเป๋าสตางค์หนังแท้ผู้ชาย ใบยาว สีดำ";   // > 25 ตัว
  test("ชื่อเดิม = ไม่เปลี่ยน ไม่มี error", () => {
    expect(planTiktokTitle(ok, ok)).toMatchObject({ changed: false, errors: [], warnings: [] });
  });
  test("ชื่อเดิมมีเว้นวรรคซ้ำ ไม่นับว่าแก้", () => {
    expect(planTiktokTitle("A  B   C", "A B C").changed).toBe(false);
  });
  test("ชื่อใหม่ถูกต้อง → changed + คำเตือนเรื่องตรวจ", () => {
    const p = planTiktokTitle(ok, `  ${ok}   ใหม่ `);
    expect(p.changed).toBe(true);
    expect(p.title).toBe(`${ok} ใหม่`);
    expect(p.errors).toEqual([]);
    expect(p.warnings[0]).toContain("ตรวจ");
  });
  test("สั้น / ยาว / ว่าง / มี HTML", () => {
    expect(planTiktokTitle(ok, "สั้น").errors[0]).toContain(`${TTS_TITLE_MIN}–${TTS_TITLE_MAX}`);
    expect(planTiktokTitle(ok, "ก".repeat(TTS_TITLE_MAX + 1)).errors[0]).toContain("ยาวไป");
    expect(planTiktokTitle(ok, "   ").errors[0]).toContain("ว่าง");
    expect(planTiktokTitle(ok, `<b>${ok}</b>`).errors).toContain("ชื่อสินค้าใส่แท็ก HTML ไม่ได้");
  });
  test("นับตัวอักษรแบบคนเห็น (emoji = 1)", () => {
    expect(ttsTitleLength("ab😀")).toBe(3);
  });
});

describe("tiktokDisplayErrors — data.errors[] (code 0 ก็ยังพังรายตัวได้)", () => {
  test("ไม่มี errors = []", () => {
    expect(tiktokDisplayErrors({}, "p1")).toEqual([]);
    expect(tiktokDisplayErrors(null, "p1")).toEqual([]);
  });
  test("อ่านข้อความ + extra_errors เฉพาะสินค้านี้", () => {
    const data = { errors: [
      { code: 1, message: "ทำไม่ได้", detail: { product_id: "p1", extra_errors: [{ code: 2, message: "ขาดคุณสมบัติ" }] } },
      { code: 3, message: "ตัวอื่น", detail: { product_id: "p2" } },
    ] };
    expect(tiktokDisplayErrors(data, "p1")).toEqual(["ทำไม่ได้ · ขาดคุณสมบัติ"]);
  });
});

describe("keepSkuStatus — สำเนาย่อไม่ทำสถานะ SKU หาย", () => {
  test("เติมของเดิมเมื่อใหม่เป็น null", () => {
    const next = [{ id: "a", status: null }, { id: "b", status: "NORMAL" }, { id: "c", status: null }];
    expect(keepSkuStatus(next, { skus: [{ id: "a", status: "DEACTIVATED" }, { id: "b", status: "DEACTIVATED" }] }))
      .toEqual([{ id: "a", status: "DEACTIVATED" }, { id: "b", status: "NORMAL" }, { id: "c", status: null }]);
  });
});

describe("ประวัติในลิ้นชัก (listingHistoryText)", () => {
  test("แก้ชื่อ / รอตรวจ / ไม่สำเร็จ", () => {
    expect(listingHistoryText({ source: "tiktok_listing_edit", ok: true, audit_status: "AUDITING", changes: [{ label: "ชื่อสินค้า" }] })).toBe("แก้บน TikTok: ชื่อสินค้า (TikTok ส่งไปรอตรวจ)");
    expect(listingHistoryText({ source: "tiktok_listing_edit", ok: false, error: "x", changes: [{ label: "ชื่อสินค้า" }] })).toBe("แก้บน TikTok: ชื่อสินค้า — ไม่สำเร็จ: x");
    // รายการจริงแรก: audit_status ผิดเป็น APPROVED แต่สรุปว่ารอตรวจ → ยังต้องขึ้นว่ารอตรวจ
    expect(listingHistoryText({ source: "tiktok_listing_edit", ok: true, audit_status: "APPROVED", summary: "ส่งชื่อใหม่แล้ว — รอ TikTok ตรวจ (ระหว่างนี้ร้านยังใช้ชื่อเดิม)", changes: [{ label: "ชื่อสินค้า" }] })).toBe("แก้บน TikTok: ชื่อสินค้า (TikTok ส่งไปรอตรวจ)");
    expect(listingHistoryText({ source: "tiktok_listing_edit", ok: true, audit_status: "APPROVED", summary: "แก้ชื่อแล้ว — ขึ้นร้านแล้ว", changes: [{ label: "ชื่อสินค้า" }] })).toBe("แก้บน TikTok: ชื่อสินค้า");
  });
  test("เปิด/ปิดขาย", () => {
    expect(listingHistoryText({ source: "tiktok_listing_display", open: false, ok: true, summary: "ปิดขายทั้งสินค้า" })).toBe("ปิดขายบน TikTok");
    expect(listingHistoryText({ source: "tiktok_listing_display", open: true, ok: true, summary: "ส่งเปิดขายแล้ว — รอ TikTok ตรวจ" })).toBe("เปิดขายบน TikTok (รอ TikTok ตรวจ)");
  });
});

describe("เฟส B ราคา — planTiktokPrices / applyTiktokBulkPrice / tiktokPriceBlock", () => {
  const base: TiktokPriceRow[] = [
    { skuId: "a", label: "ดำ", sellerSku: "X-01", price: 590 },
    { skuId: "b", label: "น้ำตาล", sellerSku: "X-02", price: 650 },
  ];
  test("ไม่แก้ = ไม่มีอะไรส่ง ไม่มีคำเตือน", () => {
    expect(planTiktokPrices(base, base.map((r) => ({ ...r })))).toEqual({ changes: [], errors: [], warnings: [] });
  });
  test("ส่งเฉพาะตัวที่เปลี่ยน + ปัด 2 ตำแหน่ง + เตือนว่ามีผลทันที", () => {
    const p = planTiktokPrices(base, [{ ...base[0], price: 499.999 }, base[1]]);
    expect(p.changes).toEqual([{ skuId: "a", label: "ดำ", before: 590, after: 500 }]);
    expect(p.errors).toEqual([]);
    expect(p.warnings[0]).toContain("ทันที");
    expect(tiktokPriceChangeText(p.changes[0])).toBe("590฿ → 500฿");
  });
  test("นอกช่วง 30–260,000 / ว่าง = error", () => {
    expect(planTiktokPrices(base, [{ ...base[0], price: 29 }]).errors[0]).toContain("30");
    expect(planTiktokPrices(base, [{ ...base[0], price: 260_001 }]).errors[0]).toContain("260,000");
    expect(planTiktokPrices(base, [{ ...base[0], price: null }]).errors[0]).toContain("ว่าง");
    expect(TTS_PRICE_MIN).toBe(30);
    expect(TTS_PRICE_MAX).toBe(260_000);
  });
  test("ตัวเลือกที่ไม่มีบนร้าน = error", () => {
    expect(planTiktokPrices(base, [{ skuId: "zz", label: "?", sellerSku: null, price: 100 }]).errors[0]).toContain("ไม่พบตัวเลือก");
  });
  test("เปลี่ยนแรง (ลดครึ่ง / ขึ้น 2 เท่า) = เตือนให้ตรวจ", () => {
    expect(planTiktokPrices(base, [{ ...base[0], price: 295 }]).warnings.join(" ")).toContain("ครึ่ง");
    expect(planTiktokPrices(base, [{ ...base[0], price: 1180 }]).warnings.join(" ")).toContain("2 เท่า");
  });
  test("ตั้งราคาเดียวกัน — ไม่ติ๊ก = ทุกตัว · ติ๊ก = เฉพาะที่ติ๊ก", () => {
    expect(applyTiktokBulkPrice(base, new Set(), { price: 450 }).rows.map((r) => r.price)).toEqual([450, 450]);
    const r = applyTiktokBulkPrice(base, new Set(["b"]), { price: 450 });
    expect(r.rows.map((x) => x.price)).toEqual([590, 450]);
    expect(r.changed).toBe(1);
  });
  test("ปรับ % ปัดเป็นบาทเต็ม", () => {
    expect(applyTiktokBulkPrice(base, new Set(), { pct: -10 }).rows.map((r) => r.price)).toEqual([531, 585]);
  });
  test("ใส่ไม่ครบ / ใส่ทั้งคู่ / % เกินช่วง = error", () => {
    expect(applyTiktokBulkPrice(base, new Set(), {}).error).toBeTruthy();
    expect(applyTiktokBulkPrice(base, new Set(), { price: 100, pct: 10 }).error).toBeTruthy();
    expect(applyTiktokBulkPrice(base, new Set(), { pct: -100 }).error).toBeTruthy();
  });
  test("แก้ราคาได้เฉพาะสินค้าเปิดขาย", () => {
    expect(tiktokPriceBlock({ productStatus: "ACTIVATE", status: "PENDING" })).toBeNull();
    expect(tiktokPriceBlock({ productStatus: "SELLER_DEACTIVATED", status: "SELLER_DEACTIVATED" })).toContain("เปิดขาย");
  });
  test("แถวราคาจากมุมมอง", () => {
    expect(tiktokPriceRowsFromView(tiktokListingView(detail)!)).toEqual([
      { skuId: "s1", label: "สี: ดำ", sellerSku: "MPU12-04", price: 590 },
      { skuId: "s2", label: "MPU12-05", sellerSku: "MPU12-05", price: 650 },
    ]);
  });
  test("ข้อความประวัติ", () => {
    expect(listingHistoryText({ source: "tiktok_listing_prices", ok: true, changes: [{ label: "ราคา ดำ", text: "590฿ → 500฿" }] })).toBe("แก้ราคาบน TikTok 1 ตัวเลือก (590฿ → 500฿)");
    expect(listingHistoryText({ source: "tiktok_listing_prices", ok: false, error: "อยู่ในโปรโมชัน", changes: [{}, {}] })).toBe("แก้ราคาบน TikTok 2 ตัวเลือก — ไม่สำเร็จ: อยู่ในโปรโมชัน");
  });
});

import { describe, expect, it } from "vitest";
import {
  summarizeListing, shopStateOf, duplicateCounts, duplicateKey, inShopTab, inShopQueue, notListedTrustworthy,
  LOW_STOCK_MAX, type ShopItem,
} from "@/lib/platform-listing-health";

// รูปร่างจริงจาก LINE SHOPPING (ย่อ) — WK42 ของ Louis Montini
const lineRaw = (over: Record<string, unknown> = {}) => ({
  line: {
    id: 1007609478, code: "WK42", name: "กระเป๋าใส่บัตร WK42", isDisplay: true,
    category: { id: 60, nameEn: "Bags>Wallet", nameTh: "กระเป๋า>กระเป๋าเงิน" },
    imageUrls: ["https://obs.line-scdn.net/a"],
    variants: [
      { sku: "WK42-01D", price: 690, discountedPrice: 430, availableNumber: 3, imageUrl: "https://obs.line-scdn.net/v1" },
      { sku: "WK42-01N", price: 690, discountedPrice: 430, availableNumber: 3 },
    ],
    ...over,
  },
});

const item = (over: Partial<ShopItem> = {}): ShopItem => ({
  id: "x", external_product_id: "1", title: "A", sku_code: "A-01", matched_parent_sku_id: "p1", matched_code: "A", matched_name: "A",
  matched_cover_key: null, match_ignored: false, dup_count: 0, open_tasks: 0,
  image: "u", imageKnown: true, stock: 10, display: true, price: 100, salePrice: null, variants: 1, category: null, state: "selling",
  ...over,
});

describe("shopStateOf", () => {
  it("ไม่มีข้อมูลสถานะจากร้าน = ไม่รู้สถานะ", () => expect(shopStateOf(true, 5, false)).toBe("nodata"));
  it("ปิดขายชนะสต๊อก", () => expect(shopStateOf(false, 79, true)).toBe("hidden"));
  it("ไม่รู้ว่าเปิดขายไหม = รอตรวจ", () => expect(shopStateOf(null, 5, true)).toBe("review"));
  it("เปิดขาย + สต๊อก 0 = หมด", () => expect(shopStateOf(true, 0, true)).toBe("out"));
  it(`เปิดขาย + เหลือ ≤${LOW_STOCK_MAX} = ใกล้หมด`, () => {
    expect(shopStateOf(true, LOW_STOCK_MAX, true)).toBe("low");
    expect(shopStateOf(true, 1, true)).toBe("low");
  });
  it("เปิดขาย + ของพอ = ขายอยู่", () => expect(shopStateOf(true, LOW_STOCK_MAX + 1, true)).toBe("selling"));
  it("เปิดขายแต่ไม่รู้สต๊อก = ขายอยู่", () => expect(shopStateOf(true, null, true)).toBe("selling"));
});

describe("summarizeListing · LINE", () => {
  it("รวมสต๊อกทุกตัวเลือก + ราคา/ราคาลดต่ำสุด + รูปแรก + หมวด", () => {
    const s = summarizeListing("line_shopping", lineRaw(), 999);
    expect(s).toMatchObject({ stock: 6, display: true, price: 690, salePrice: 430, variants: 2, image: "https://obs.line-scdn.net/a", imageKnown: true, category: "กระเป๋า>กระเป๋าเงิน", state: "selling" });
  });
  it("ไม่มี imageUrls → ใช้รูปตัวเลือกแรกที่มี", () => {
    expect(summarizeListing("line_shopping", lineRaw({ imageUrls: [] })).image).toBe("https://obs.line-scdn.net/v1");
  });
  it("ไม่มีรูปเลย → image null แต่ imageKnown (นับเป็นไม่มีรูปบนร้านได้)", () => {
    const s = summarizeListing("line_shopping", lineRaw({ imageUrls: [], variants: [{ price: 10, availableNumber: 5 }] }));
    expect(s.image).toBeNull(); expect(s.imageKnown).toBe(true);
  });
  it("ราคาลดไม่ต่ำกว่าราคาปกติ = ไม่ถือว่าลด", () => {
    expect(summarizeListing("line_shopping", lineRaw({ variants: [{ price: 100, discountedPrice: 100, availableNumber: 9 }] })).salePrice).toBeNull();
  });
  it("สต๊อกติดลบ/ว่าง ไม่ทำให้ยอดรวมเพี้ยน", () => {
    expect(summarizeListing("line_shopping", lineRaw({ variants: [{ price: 1, availableNumber: -2 }, { price: 1 }, { price: 1, availableNumber: "4" }] })).stock).toBe(4);
  });
  it("isDisplay=false = ปิดขาย (ถึงจะมีของ)", () => {
    expect(summarizeListing("line_shopping", lineRaw({ isDisplay: false })).state).toBe("hidden");
  });
  it("ไม่มี raw.line (สร้างจากระบบเรา ยังไม่ดึงกลับ) = รอตรวจ + ใช้ราคาจากคอลัมน์", () => {
    const s = summarizeListing("line_shopping", { created_by_erp: true }, 1290);
    expect(s).toMatchObject({ state: "review", price: 1290, imageKnown: false, stock: null });
  });
});

describe("summarizeListing · ร้านอื่น", () => {
  it("Shopee จากไฟล์ export (basic_info) = ไม่รู้สถานะ ไม่ตัดสินเรื่องรูป", () => {
    const s = summarizeListing("shopee", { basic_info: { et_title_product_name: "กรรไกร" } }, null);
    expect(s).toMatchObject({ state: "nodata", imageKnown: false, stock: null, display: null });
  });
  it("Lazada active + สต๊อก = ขายอยู่ · ไม่มีรูป (ไม่เก็บ) → imageKnown false", () => {
    const s = summarizeListing("lazada", { lazada: { status: "Active", skus: [{ price: 50, special_price: 39, available: 10 }, { price: 60, available: 2 }] } });
    expect(s).toMatchObject({ state: "selling", stock: 12, price: 50, salePrice: 39, variants: 2, imageKnown: false });
  });
  it("Lazada inactive = ปิดขาย · สถานะแปลก ๆ = รอตรวจ", () => {
    expect(summarizeListing("lazada", { lazada: { status: "inactive", skus: [] } }).state).toBe("hidden");
    expect(summarizeListing("lazada", { lazada: { status: "pending", skus: [{ available: 1 }] } }).state).toBe("review");
  });
});

describe("ชื่อ+รหัสซ้ำ", () => {
  it("ชื่อ+รหัสเหมือนกันทุกตัว = ซ้ำ (ไม่สนช่องว่าง/ตัวพิมพ์)", () => {
    expect(duplicateKey(" JEAN08  กระเป๋า ", "JEAN08")).toBe(duplicateKey("jean08 กระเป๋า", "jean08"));
  });
  it("รหัสเหมือนแต่ชื่อต่าง (ลงแยกขนาด) = ไม่ซ้ำ · ไม่มีชื่อ = ไม่นับ", () => {
    const m = duplicateCounts([
      { id: "1", title: "อะไหล่ 30 มม.", sku_code: "BCN32" },
      { id: "2", title: "อะไหล่ 32 มม.", sku_code: "BCN32" },
      { id: "3", title: "JEAN08", sku_code: "JEAN08" },
      { id: "4", title: "JEAN08", sku_code: "JEAN08" },
      { id: "5", title: "JEAN08", sku_code: "JEAN08" },
      { id: "6", title: null, sku_code: "X" },
      { id: "7", title: null, sku_code: "X" },
    ]);
    expect([...m.entries()].sort()).toEqual([["3", 3], ["4", 3], ["5", 3]]);
  });
});

describe("แท็บ + กองงาน", () => {
  it("แท็บขายอยู่ รวมใกล้หมด", () => {
    expect(inShopTab(item({ state: "low" }), "selling")).toBe(true);
    expect(inShopTab(item({ state: "out" }), "selling")).toBe(false);
  });
  it("ยังไม่จับคู่ ไม่นับตัวที่กดไม่ต้องจับคู่", () => {
    expect(inShopTab(item({ matched_parent_sku_id: null }), "unmatched")).toBe(true);
    expect(inShopTab(item({ matched_parent_sku_id: null, match_ignored: true }), "unmatched")).toBe(false);
  });
  it("แท็บยังไม่ลง ไม่ใช่รายการบนร้าน", () => expect(inShopTab(item(), "notlisted")).toBe(false));
  it("กองไม่มีรูปบนร้าน นับเฉพาะร้านที่ส่งข้อมูลรูปมา", () => {
    expect(inShopQueue(item({ image: null, imageKnown: true }), "noimg_shop")).toBe(true);
    expect(inShopQueue(item({ image: null, imageKnown: false }), "noimg_shop")).toBe(false);
  });
  it("กองซ้ำ = กลุ่มที่มี ≥2", () => {
    expect(inShopQueue(item({ dup_count: 6 }), "dup")).toBe(true);
    expect(inShopQueue(item({ dup_count: 0 }), "dup")).toBe(false);
  });
});

describe("notListedTrustworthy", () => {
  it("ยังไม่จับคู่เกิน 20% = เชื่อไม่ได้ (เช่น LINE Louis Montini 919/921)", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ matched_parent_sku_id: i < 2 ? "p" : null, match_ignored: false }));
    expect(notListedTrustworthy(rows)).toBe(false);
  });
  it("ไม่นับตัวที่กดไม่ต้องจับคู่ · ไม่มีรายการ = เชื่อได้", () => {
    const rows = [...Array.from({ length: 9 }, () => ({ matched_parent_sku_id: "p", match_ignored: false })), { matched_parent_sku_id: null, match_ignored: true }];
    expect(notListedTrustworthy(rows)).toBe(true);
    expect(notListedTrustworthy([])).toBe(true);
  });
});

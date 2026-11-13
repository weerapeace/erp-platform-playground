import { describe, expect, it } from "vitest";
import { LazApiError, lazConnHealth, lazErrorText, lazProductToCatalogItem, lazShopConflict, type LazCredRow } from "./lazada";

// ด่าน 1 ร้าน = 1 แบรนด์ — ข้อมูลจริง: IG = seller 100179222188 / TH1JHEBLW3 · LM ยังไม่เชื่อม
describe("lazShopConflict", () => {
  const IG = "brand-ig", LM = "brand-lm";
  const igRow: LazCredRow = { brand_id: IG, meta: { stage: "connected", seller_id: "100179222188", short_code: "TH1JHEBLW3" } };
  const igShop = { seller_id: "100179222188", short_code: "TH1JHEBLW3" };
  const lmShop = { seller_id: "100200300400", short_code: "TH1LMSHOP1" };

  it("เลือกแบรนด์ LM แต่ล็อกอินบัญชี IG → บล็อก (ร้านเชื่อมอยู่กับแบรนด์อื่น)", () => {
    expect(lazShopConflict([igRow], LM, igShop)).toEqual({ kind: "other_brand", brand_id: IG });
  });
  it("เลือกแบรนด์ LM แล้วล็อกอินบัญชี LM จริง → ผ่าน", () => {
    expect(lazShopConflict([igRow], LM, lmShop)).toBeNull();
  });
  it("IG เชื่อมใหม่ (ต่ออายุ) ด้วยร้านเดิม → ผ่าน · seller_id เป็นตัวเลขก็เทียบได้", () => {
    expect(lazShopConflict([igRow], IG, igShop)).toBeNull();
    expect(lazShopConflict([igRow], IG, { seller_id: 100179222188 as unknown as string })).toBeNull();
  });
  it("IG เชื่อมใหม่แต่เผลอล็อกอินร้านอื่น → บล็อก (แบรนด์นี้มีร้านอยู่แล้ว)", () => {
    expect(lazShopConflict([igRow], IG, lmShop)).toEqual({ kind: "brand_has_other_shop", current_short_code: "TH1JHEBLW3" });
  });
  it("แถวที่กดตัดการเชื่อมต่อแล้ว (meta เหลือแค่ stage) ไม่นับ → ย้ายร้านได้", () => {
    const off: LazCredRow = { brand_id: IG, meta: { stage: "disconnected" } };
    expect(lazShopConflict([off], LM, igShop)).toBeNull();
    expect(lazShopConflict([off], IG, lmShop)).toBeNull();
    expect(lazShopConflict([{ brand_id: IG, meta: { ...igShop, stage: "disconnected" } }], LM, igShop)).toBeNull();
  });
  it("ไม่มี seller_id → เทียบ short_code (ไม่สนตัวพิมพ์)", () => {
    const row: LazCredRow = { brand_id: IG, meta: { stage: "connected", short_code: "TH1JHEBLW3" } };
    expect(lazShopConflict([row], LM, { short_code: "th1jheblw3" })).toEqual({ kind: "other_brand", brand_id: IG });
  });
  it("Lazada ไม่ส่งรหัสร้านมา → ตัดสินไม่ได้ ปล่อยผ่านแบบเดิม · ยังไม่มีใครเชื่อม → ผ่าน", () => {
    expect(lazShopConflict([igRow], LM, {})).toBeNull();
    expect(lazShopConflict([igRow], LM, { seller_id: null, short_code: "" })).toBeNull();
    expect(lazShopConflict([], LM, lmShop)).toBeNull();
    expect(lazShopConflict([{ brand_id: LM, meta: null }], LM, lmShop)).toBeNull();
  });
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28);

describe("lazConnHealth", () => {
  it("ยังไม่เชื่อม = none", () => {
    expect(lazConnHealth(null, NOW).state).toBe("none");
    expect(lazConnHealth({ stage: "disconnected" }, NOW).state).toBe("none");
  });
  it("ตัวต่ออายุหมดแล้ว = expired (เคสจริง IG: หมด 5 ส.ค.)", () => {
    const h = lazConnHealth({ stage: "connected", refresh_expires_at: 1785912852122, expires_at: 1783925652122 }, NOW);
    expect(h).toMatchObject({ state: "expired", days_left: 0 });
  });
  it("เหลือ ≤ 7 วัน = expiring · มากกว่านั้น = connected", () => {
    expect(lazConnHealth({ stage: "connected", refresh_expires_at: NOW + 5 * DAY }, NOW)).toMatchObject({ state: "expiring", days_left: 5 });
    expect(lazConnHealth({ stage: "connected", refresh_expires_at: NOW + 20 * DAY }, NOW)).toMatchObject({ state: "connected", days_left: 20 });
  });
  it("ไม่รู้วันหมดของตัวต่ออายุ → ดูจากกุญแจหลัก", () => {
    expect(lazConnHealth({ stage: "connected", expires_at: NOW + DAY }, NOW).state).toBe("connected");
    expect(lazConnHealth({ stage: "connected", expires_at: NOW - DAY }, NOW).state).toBe("expired");
  });
});

describe("lazProductToCatalogItem", () => {
  const sample = {
    item_id: 3456789012, primary_category: 13478, status: "Active", created_time: "1719900000000",
    attributes: { name: "IG International อะไหล่หมุด ขนาด 6 มม. 1 ชิ้น PIN6", brand: "No Brand", description: "<p>ยาวมาก</p>" },
    skus: [
      { SellerSku: "PIN-6-GD", SkuId: 111, ShopSku: "3456789012_TH-111", price: 25, special_price: 19, quantity: 40, Available: 38, Status: "active", Images: ["https://x/1.jpg"] },
      { SellerSku: "PIN-6-SV", SkuId: 112, price: "20", quantity: "0", Status: "inactive" },
      { SellerSku: "PIN-6-GD", SkuId: 113, price: 0 },
    ],
  };
  it("แปลงเป็นรายการมาตรฐาน (ราคาปกติต่ำสุด · รหัสไม่ซ้ำ · สถานะตัวเล็ก)", () => {
    const it0 = lazProductToCatalogItem(sample)!;
    expect(it0).toMatchObject({ external_product_id: "3456789012", title: sample.attributes.name, skus: ["PIN-6-GD", "PIN-6-SV"], price: 20, status: "active" });
  });
  it("เก็บสต๊อก/ราคาลดต่อ SKU ใน raw แต่ไม่เก็บ HTML รายละเอียด/รูป", () => {
    const raw = lazProductToCatalogItem(sample)!.raw.lazada as Record<string, unknown>;
    expect((raw.skus as Record<string, unknown>[])[0]).toMatchObject({ seller_sku: "PIN-6-GD", sku_id: "111", special_price: 19, available: 38 });
    expect(JSON.stringify(raw)).not.toContain("ยาวมาก");
    expect(JSON.stringify(raw)).not.toContain("1.jpg");
  });
  it("ไม่มี item_id = ข้าม", () => expect(lazProductToCatalogItem({ attributes: { name: "x" } })).toBeNull());
  it("มี saleProp → เก็บชื่อตัวเลือก (label) · ไม่มี = ไม่มีช่อง label", () => {
    const raw = lazProductToCatalogItem({ ...sample, skus: [{ ...sample.skus[0], saleProp: { color_family: "Gold" } }, sample.skus[1]] })!.raw.lazada as Record<string, unknown>;
    const skus = raw.skus as Record<string, unknown>[];
    expect(skus[0].label).toBe("สี: Gold");
    expect("label" in skus[1]).toBe(false);
  });
});

describe("lazErrorText", () => {
  it("แปลรหัสที่รู้จักเป็นภาษาคน", () => {
    expect(lazErrorText(new LazApiError("ApiCallLimit", "ApiCallLimit"))).toContain("ถี่เกินไป");
    expect(lazErrorText(new LazApiError("this API service is disabled, please get more information from Notice", "998"))).toContain("ปิดระบบนี้ชั่วคราว");
    expect(lazErrorText(new LazApiError("sku under campaign participation and cannot be edited", "501"))).toContain("ร่วมแคมเปญ");
    expect(lazErrorText(new LazApiError("Invalid access token", "IllegalAccessToken"))).toContain("เชื่อมต่อ Lazada ใหม่");
  });
  it("ไม่รู้จัก = ข้อความเดิมของ Lazada · ไม่มีข้อความ = บอกให้ลองใหม่", () => {
    expect(lazErrorText(new Error("E9999 something odd"))).toBe("Lazada ตอบว่า: E9999 something odd");
    expect(lazErrorText(new Error(""))).toContain("ลองใหม่");
  });
  it("LazApiError ยังเป็น Error เดิม (ผู้เรียกเก่าอ่าน message ได้เหมือนเดิม)", () => {
    const e = new LazApiError("boom", "E1");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("boom");
  });
});

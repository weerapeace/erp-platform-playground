import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  shopeeSignBase, shopeeSign, shopeeAuthUrl, shopeeCallbackParams, shopeeConfigured, shopeeEnv, shopeeHost,
  shopeeErrorText, shopeeIsRateLimit, ShopeeApiError, shopeeTokenOf, shopeeTokenTimes, shopeeReconnectBy, shopeeShopInfoOf,
  SHOPEE_HOSTS, SHOPEE_REFRESH_TTL_MS, shopeeItemListOf, shopeeModelsToSlim, shopeeItemToCatalogItem, shopeeListingStatus, SHOPEE_PULL_STATUSES,
} from "@/lib/shopee";
import { summarizeListing, countsAsDuplicate } from "@/lib/platform-listing-health";

describe("Shopee — เซ็นคำขอ", () => {
  test("ข้อความที่เซ็น: ระดับแอป = partner_id+path+timestamp · ระดับร้าน ต่อ access_token+shop_id", () => {
    expect(shopeeSignBase(2001887, "/api/v2/shop/auth_partner", 1655714431)).toBe("2001887/api/v2/shop/auth_partner1655714431");
    expect(shopeeSignBase("2001887", "/api/v2/shop/get_shop_info", 1655714431, "tok123", 601234))
      .toBe("2001887/api/v2/shop/get_shop_info1655714431tok123601234");
  });
  test("ลายเซ็น = HMAC-SHA256 hex ตัวเล็ก (ตรงกับ node:crypto)", async () => {
    const base = "2001887/api/v2/auth/token/get1655714431";
    const key = "shpk_test_partner_key_0123456789abcdef";
    const sig = await shopeeSign(base, key);
    expect(sig).toBe(createHmac("sha256", key).update(base).digest("hex"));
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Shopee — ลิงก์อนุญาต + อ่านคำขอที่พากลับ", () => {
  test("ลิงก์มี partner_id/timestamp/sign/redirect ครบ และเซ็นด้วยสูตรระดับแอป", async () => {
    const redirect = "https://erp-platform-playground.vercel.app/api/shopee/callback?state=enc%3Av1%3Aab%2Bc%3D";
    const url = new URL(await shopeeAuthUrl(redirect, { timestamp: 1700000000, env: "live", partnerId: "123", partnerKey: "k" }));
    expect(url.origin + url.pathname).toBe("https://partner.shopeemobile.com/api/v2/shop/auth_partner");
    expect(url.searchParams.get("partner_id")).toBe("123");
    expect(url.searchParams.get("timestamp")).toBe("1700000000");
    expect(url.searchParams.get("redirect")).toBe(redirect);   // ถอดกลับได้ตรงทุกตัว (state ที่ encode ไว้ไม่เพี้ยน)
    expect(url.searchParams.get("sign")).toBe(createHmac("sha256", "k").update("123/api/v2/shop/auth_partner1700000000").digest("hex"));
  });
  test("sandbox ใช้โฮสต์ทดลอง", async () => {
    const url = await shopeeAuthUrl("https://x.test/cb", { timestamp: 1, env: "sandbox", partnerId: "1", partnerKey: "k" });
    expect(url.startsWith(`${SHOPEE_HOSTS.sandbox}/api/v2/shop/auth_partner?`)).toBe(true);
  });
  test("คำขอปกติ ?state=&code=&shop_id=", () => {
    expect(shopeeCallbackParams(new URLSearchParams("state=enc:v1:abc&code=C1&shop_id=601234")))
      .toEqual({ code: "C1", shopId: "601234", mainAccountId: "", state: "enc:v1:abc" });
  });
  test("Shopee ต่อ ?code= ซ้อนท้าย state → แยกให้ถูก", () => {
    expect(shopeeCallbackParams(new URLSearchParams("state=enc:v1:abc?code=C1&shop_id=601234")))
      .toEqual({ code: "C1", shopId: "601234", mainAccountId: "", state: "enc:v1:abc" });
  });
  test("บัญชีหลัก (main_account_id) ไม่มี shop_id", () => {
    expect(shopeeCallbackParams(new URLSearchParams("state=s&code=C&main_account_id=99")).mainAccountId).toBe("99");
  });
});

describe("Shopee — ตั้งค่า env", () => {
  const keep = { ...process.env };
  beforeEach(() => { delete process.env.SHOPEE_PARTNER_ID; delete process.env.SHOPEE_PARTNER_KEY; delete process.env.SHOPEE_ENV; });
  afterEach(() => { process.env = { ...keep }; });
  test("ต้องมี Partner ID (ตัวเลข) + Key", () => {
    expect(shopeeConfigured()).toBe(false);
    process.env.SHOPEE_PARTNER_ID = "abc"; process.env.SHOPEE_PARTNER_KEY = "k";
    expect(shopeeConfigured()).toBe(false);
    process.env.SHOPEE_PARTNER_ID = " 2001887 ";
    expect(shopeeConfigured()).toBe(true);
  });
  test("SHOPEE_ENV: ไม่ตั้ง/สะกดอื่น = live · sandbox = sandbox", () => {
    expect(shopeeEnv(undefined)).toBe("live");
    expect(shopeeEnv("LIVE")).toBe("live");
    expect(shopeeEnv(" Sandbox ")).toBe("sandbox");
    expect(shopeeEnv("test")).toBe("live");
    expect(shopeeHost("live")).toBe("https://partner.shopeemobile.com");
  });
});

describe("Shopee — กุญแจ + เวลาหมดอายุ", () => {
  test("อ่านคำตอบกุญแจ", () => {
    const t = shopeeTokenOf({ access_token: "A", refresh_token: "R", expire_in: 14400, shop_id_list: [601234], request_id: "x", error: "" });
    expect(t).toEqual({ access_token: "A", refresh_token: "R", expire_in: 14400, shop_id_list: [601234], merchant_id_list: [] });
  });
  test("ไม่มีกุญแจ = โยน", () => {
    expect(() => shopeeTokenOf({ access_token: "A" })).toThrow(ShopeeApiError);
  });
  test("access 4 ชม. ตาม expire_in · ตัวต่ออายุ 30 วัน", () => {
    const now = 1_700_000_000_000;
    expect(shopeeTokenTimes({ expire_in: 14400 }, now)).toEqual({ expires_at: now + 14_400_000, rt_expires_at: now + SHOPEE_REFRESH_TTL_MS });
    expect(shopeeTokenTimes({ expire_in: 0 }, now).expires_at).toBe(now + 4 * 3600 * 1000);   // ไม่บอก = ถือ 4 ชม.
  });
  test("วันต้องเชื่อมใหม่ = ตัวที่หมดก่อน (ตัวต่ออายุ vs สิทธิ์ร้าน)", () => {
    expect(shopeeReconnectBy({ rt_expires_at: 100, auth_expires_at: 50 })).toBe(50);
    expect(shopeeReconnectBy({ rt_expires_at: 100, auth_expires_at: null })).toBe(100);
    expect(shopeeReconnectBy({})).toBeUndefined();
  });
});

describe("Shopee — ข้อมูลร้าน (get_shop_info)", () => {
  test("ช่องชั้นบนสุด + expire_time วินาที → ms", () => {
    expect(shopeeShopInfoOf({ shop_name: "Louis Montini", region: "TH", status: "NORMAL", expire_time: 1794000000, is_cb: false, error: "", request_id: "r" }))
      .toEqual({ shop_name: "Louis Montini", region: "TH", status: "NORMAL", auth_expires_at: 1794000000000, is_cb: false });
  });
  test("ห่อใน response ก็อ่านได้ · ไม่มีวันหมด = null", () => {
    expect(shopeeShopInfoOf({ response: { shop_name: "X" } })).toEqual({ shop_name: "X", region: null, status: null, auth_expires_at: null, is_cb: null });
  });
});

describe("Shopee — ข้อความ error ภาษาคน", () => {
  test("ลายเซ็นผิด → บอกให้ตรวจ SHOPEE_PARTNER_KEY", () => {
    expect(shopeeErrorText(new ShopeeApiError("Wrong sign.", "error_sign"))).toContain("SHOPEE_PARTNER_KEY");
  });
  test("กุญแจหมดอายุ (Shopee สะกด acceess) → ให้เชื่อมใหม่", () => {
    expect(shopeeErrorText(new ShopeeApiError("Invalid access_token.", "invalid_acceess_token"))).toContain("เชื่อมต่อ Shopee ใหม่");
    expect(shopeeErrorText(new ShopeeApiError("Invalid access_token.", "error_auth"))).toContain("เชื่อมต่อ Shopee ใหม่");
  });
  test("429 = ให้รอ", () => {
    const e = new ShopeeApiError("HTTP 429", "http_429", null, 429);
    expect(shopeeIsRateLimit(e)).toBe(true);
    expect(shopeeErrorText(e)).toContain("รอสักครู่");
  });
  test("ไม่รู้จัก = ข้อความเดิม", () => {
    expect(shopeeErrorText(new ShopeeApiError("something odd", "error_xyz"))).toBe("something odd");
  });
});


describe("Shopee — สินค้า (get_item_list / base_info / model_list → raw.shopee)", () => {
  test("รายการ: item_id เป็นข้อความ · total / has_next / next_offset", () => {
    const p = shopeeItemListOf({ response: { item: [{ item_id: 800123, item_status: "NORMAL", update_time: 1700 }, { item_id: null }], total_count: 120, has_next_page: true, next_offset: 50 } });
    expect(p).toEqual({ items: [{ item_id: "800123", item_status: "NORMAL", update_time: 1700 }], total: 120, hasNext: true, nextOffset: 50 });
    expect(shopeeItemListOf({ response: {} })).toEqual({ items: [], total: 0, hasNext: false, nextOffset: 0 });
  });
  test("ไม่ขอตัวที่ร้านลบแล้ว", () => {
    expect(SHOPEE_PULL_STATUSES).not.toContain("SELLER_DELETE");
    expect(SHOPEE_PULL_STATUSES).not.toContain("SHOPEE_DELETE");
  });
  const MODELS = {
    tier_variation: [
      { name: "สี", option_list: [{ option: "ดำ", image: { image_url: "https://cf.shopee.co.th/file/black" } }, { option: "น้ำตาล", image: { image_url: "https://cf.shopee.co.th/file/brown" } }] },
      { name: "ขนาด", option_list: [{ option: "M" }, { option: "L" }] },
    ],
    model: [
      { model_id: 1, tier_index: [0, 1], model_sku: "TTM090-01L", price_info: [{ current_price: 990, original_price: 1590 }], stock_info_v2: { summary_info: { total_available_stock: 7 } } },
      { model_id: 2, tier_index: [1, 0], model_sku: "TTM090-02M", price_info: [{ current_price: 1090, original_price: 1690 }], stock_info: [{ current_stock: 3 }] },
    ],
  };
  test("ตัวเลือก: ชื่อ 'สี: ดำ · ขนาด: L' + รูปของชั้นแรก + สต๊อก (รุ่นใหม่/รุ่นเก่า)", () => {
    const s = shopeeModelsToSlim(MODELS);
    expect(s.tiers).toEqual([{ name: "สี", options: ["ดำ", "น้ำตาล"] }, { name: "ขนาด", options: ["M", "L"] }]);
    expect(s.models[0]).toEqual({ model_id: "1", sku: "TTM090-01L", label: "สี: ดำ · ขนาด: L", price: 990, original_price: 1590, stock: 7, image: "https://cf.shopee.co.th/file/black", status: null });
    expect(s.models[1]).toMatchObject({ label: "สี: น้ำตาล · ขนาด: M", stock: 3, image: "https://cf.shopee.co.th/file/brown" });
    expect(shopeeModelsToSlim(null)).toEqual({ tiers: [], models: [] });
  });
  test("สินค้ามีตัวเลือก: skus = รหัสหลักก่อน + รหัสตัวเลือก · ราคา = ราคาตั้งต่ำสุด · status ตัวเล็ก", () => {
    const base = { item_id: 800123, item_name: "Louis Montini กระเป๋าสตางค์", item_sku: "TTM090", item_status: "NORMAL", update_time: 1700, has_model: true, category_id: 100637,
      image: { image_url_list: ["https://cf.shopee.co.th/file/a", "https://cf.shopee.co.th/file/b"] }, brand: { original_brand_name: "Louis Montini" }, weight: 0.3, description: "ยาวมาก" };
    const it = shopeeItemToCatalogItem(base, shopeeModelsToSlim(MODELS))!;
    expect(it.external_product_id).toBe("800123");
    expect(it.title).toBe("Louis Montini กระเป๋าสตางค์");
    expect(it.skus).toEqual(["TTM090", "TTM090-01L", "TTM090-02M"]);
    expect(it.price).toBe(1590);
    expect(it.status).toBe("normal");
    expect(it.raw.shopee).toMatchObject({ item_id: "800123", image: "https://cf.shopee.co.th/file/a", image_count: 2, category_id: "100637", has_model: true, price: null, stock: null, brand: "Louis Montini" });
    expect(JSON.stringify(it.raw)).not.toContain("ยาวมาก");   // ไม่เก็บคำอธิบายยาว
  });
  test("สินค้าไม่มีตัวเลือก: ราคา/สต๊อกระดับสินค้า", () => {
    const it = shopeeItemToCatalogItem({ item_id: "9", item_name: "X", item_sku: "", item_status: "UNLIST", has_model: false, price_info: [{ current_price: 199, original_price: 299 }], stock_info_v2: { summary_info: { total_available_stock: 0 } } }, null)!;
    expect(it.skus).toEqual([]);
    expect(it.price).toBe(299);
    expect(it.raw.shopee).toMatchObject({ has_model: false, price: 199, original_price: 299, stock: 0, models: [] });
    expect(shopeeListingStatus("UNLIST")).toBe("unlist");
  });
  test("ไม่มี item_id = ข้าม", () => {
    expect(shopeeItemToCatalogItem({ item_name: "X" }, null)).toBeNull();
  });
});

describe("Shopee — สรุปการ์ดในหน้าสินค้าบนแพลตฟอร์ม (summarizeListing)", () => {
  const MODELS2 = { tier_variation: [{ name: "สี", option_list: [{ option: "ดำ", image: { image_url: "https://cf.shopee.co.th/file/k" } }, { option: "น้ำตาล" }] }],
    model: [
      { model_id: 1, tier_index: [0], model_sku: "A-1", price_info: [{ current_price: 990, original_price: 1590 }], stock_info_v2: { summary_info: { total_available_stock: 2 } } },
      { model_id: 2, tier_index: [1], model_sku: "A-2", price_info: [{ current_price: 1590, original_price: 1590 }], stock_info_v2: { summary_info: { total_available_stock: 0 } } },
    ] };
  const base = { item_id: 1, item_name: "X", item_status: "NORMAL", has_model: true, image: { image_url_list: ["https://cf.shopee.co.th/file/c"] } };
  test("ขายอยู่ · สต๊อกรวม 2 (ใกล้หมด) · ราคาตั้ง 1590 ราคาลด 990 · 2 ตัวเลือก · รูปแรก", () => {
    const it = shopeeItemToCatalogItem(base, shopeeModelsToSlim(MODELS2))!;
    const s = summarizeListing("shopee", it.raw, it.price, it.status);
    expect(s).toMatchObject({ image: "https://cf.shopee.co.th/file/c", imageKnown: true, stock: 2, display: true, price: 1590, salePrice: 990, variants: 2, state: "low" });
  });
  test("ปิดขาย (UNLIST) = hidden · รอตรวจ = review · ร้านลบแล้ว (removed) = gone", () => {
    const hid = shopeeItemToCatalogItem({ ...base, item_status: "UNLIST" }, shopeeModelsToSlim(MODELS2))!;
    expect(summarizeListing("shopee", hid.raw).state).toBe("hidden");
    const rev = shopeeItemToCatalogItem({ ...base, item_status: "REVIEWING" }, shopeeModelsToSlim(MODELS2))!;
    expect(summarizeListing("shopee", rev.raw).state).toBe("review");
    expect(summarizeListing("shopee", hid.raw, null, "removed").state).toBe("gone");
  });
  test("ตัวจากไฟล์ export (ไม่มี raw.shopee) = ไม่รู้สถานะ เหมือนเดิม", () => {
    expect(summarizeListing("shopee", { basic_info: { name: "x" } }, 199).state).toBe("nodata");
  });
});

describe("Shopee — ป้าย 'ซ้ำ' (countsAsDuplicate)", () => {
  test("banned (Shopee แบน ลูกค้าไม่เห็น) ไม่นับซ้ำ · ปิดขาย/รอตรวจ/ขายอยู่ ยังนับ · ไฟล์ export (null) นับเหมือนเดิม", () => {
    expect(countsAsDuplicate("banned")).toBe(false);
    expect(countsAsDuplicate("unlist")).toBe(true);
    expect(countsAsDuplicate("reviewing")).toBe(true);
    expect(countsAsDuplicate("normal")).toBe(true);
    expect(countsAsDuplicate(null)).toBe(true);
  });
});

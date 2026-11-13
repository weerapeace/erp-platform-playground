import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  shopeeSignBase, shopeeSign, shopeeAuthUrl, shopeeCallbackParams, shopeeConfigured, shopeeEnv, shopeeHost,
  shopeeErrorText, shopeeIsRateLimit, ShopeeApiError, shopeeTokenOf, shopeeTokenTimes, shopeeReconnectBy, shopeeShopInfoOf,
  SHOPEE_HOSTS, SHOPEE_REFRESH_TTL_MS,
} from "@/lib/shopee";

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

import { describe, expect, test, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { ttsSignInput, ttsSign, ttsExpiryMs, ttsShopsFromApi, ttsAuthUrl, ttsConfigured, ttsErrorText, ttsBrandMismatch, TtsApiError } from "@/lib/tiktok-shop";

describe("TikTok Shop — ชื่อร้านไม่ตรงแบรนด์ (เตือน)", () => {
  test("ร้าน Louis Montini ไปติดแบรนด์ IG International = ไม่ตรง (เคสจริง 2026-11-12)", () => { expect(ttsBrandMismatch("Louis Montini", "IG International")).toBe(true); });
  test("ชื่อเดียวกัน / ต่างแค่ตัวพิมพ์ ช่องว่าง สัญลักษณ์ = ตรง", () => {
    expect(ttsBrandMismatch("Louis Montini", "Louis Montini")).toBe(false);
    expect(ttsBrandMismatch("LOUIS-MONTINI", "louis montini")).toBe(false);
  });
  test("ชื่อร้านมีคำต่อท้าย เช่น Official = ยังนับว่าตรง", () => { expect(ttsBrandMismatch("Louis Montini Official", "Louis Montini")).toBe(false); });
  test("ไม่มีชื่อฝั่งใดฝั่งหนึ่ง = ไม่เตือน", () => { expect(ttsBrandMismatch(null, "IG International")).toBe(false); expect(ttsBrandMismatch("x", "")).toBe(false); });
});

describe("TikTok Shop — เซ็นคำขอ (ตามเอกสาร sign-your-api-request)", () => {
  test("เรียง query ตามตัวอักษร ไม่รวม sign/access_token แล้วต่อ path ไว้หน้า body ไว้ท้าย", () => {
    const input = ttsSignInput("/product/202309/products/search", { timestamp: "1700000000", app_key: "abc", sign: "x", access_token: "t", page_size: "20" }, '{"status":"ALL"}');
    expect(input).toBe('/product/202309/products/searchapp_keyabcpage_size20timestamp1700000000{"status":"ALL"}');
  });

  test("ไม่มี body = ไม่ต่อท้าย", () => {
    expect(ttsSignInput("/authorization/202309/shops", { app_key: "k", timestamp: "1" })).toBe("/authorization/202309/shopsapp_keyktimestamp1");
  });

  test("sign = HMAC-SHA256(secret, secret+input+secret) hex ตัวเล็ก", async () => {
    const secret = "s3cr3t";
    const q = { app_key: "abc", timestamp: "1700000000" };
    const expected = createHmac("sha256", secret).update(secret + ttsSignInput("/authorization/202309/shops", q, "") + secret).digest("hex");
    await expect(ttsSign("/authorization/202309/shops", q, "", secret)).resolves.toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("TikTok Shop — เวลาหมดอายุ", () => {
  const now = 1_762_000_000_000;
  test("unix วินาที (ตามเอกสาร) → ms", () => { expect(ttsExpiryMs(1_762_600_000, now)).toBe(1_762_600_000_000); });
  test("ms อยู่แล้ว → คงเดิม", () => { expect(ttsExpiryMs(1_762_600_000_000, now)).toBe(1_762_600_000_000); });
  test("ระยะเวลาเป็นวินาที → now + ระยะ", () => { expect(ttsExpiryMs(604_800, now)).toBe(now + 604_800_000); });
  test("ค่าว่าง/เพี้ยน → 0", () => { expect(ttsExpiryMs(null, now)).toBe(0); expect(ttsExpiryMs("abc", now)).toBe(0); expect(ttsExpiryMs(0, now)).toBe(0); });
});

describe("TikTok Shop — รายชื่อร้านที่อนุญาต", () => {
  test("อ่าน shops[] ได้ cipher + ชื่อ", () => {
    const shops = ttsShopsFromApi({ shops: [{ id: "7000", name: "Louis Montini", region: "TH", seller_type: "LOCAL", cipher: "GCP_abc", code: "THLCxxx" }] });
    expect(shops).toEqual([{ id: "7000", name: "Louis Montini", region: "TH", code: "THLCxxx", cipher: "GCP_abc", seller_type: "LOCAL" }]);
  });
  test("ข้ามแถวที่ไม่มี cipher/id · รูปแบบเพี้ยนไม่พัง", () => {
    expect(ttsShopsFromApi({ shops: [{ id: "1" }, { cipher: "c" }] })).toEqual([]);
    expect(ttsShopsFromApi({ shops: "x" } as unknown as Record<string, unknown>)).toEqual([]);
    expect(ttsShopsFromApi(null)).toEqual([]);
  });
});

describe("TikTok Shop — ลิงก์อนุญาต / ค่าตั้ง", () => {
  beforeEach(() => {
    process.env.TIKTOK_SHOP_APP_KEY = "k"; process.env.TIKTOK_SHOP_APP_SECRET = "s"; process.env.TIKTOK_SHOP_SERVICE_ID = "7706624936186087220";
  });
  test("ลิงก์อนุญาตใช้ services.tiktokshop.com (ไม่ใช่ US) + service_id + state", () => {
    expect(ttsAuthUrl("a b")).toBe("https://services.tiktokshop.com/open/authorize?service_id=7706624936186087220&state=a%20b");
  });
  test("ขาดตัวใดตัวหนึ่ง = ยังไม่ตั้ง", () => {
    expect(ttsConfigured()).toBe(true);
    process.env.TIKTOK_SHOP_SERVICE_ID = " ";
    expect(ttsConfigured()).toBe(false);
  });
});

describe("TikTok Shop — ข้อความ error ภาษาคน", () => {
  test("timestamp ผิด", () => { expect(ttsErrorText(new TtsApiError("Invalid timestamp", "36009004"))).toContain("เวลา"); });
  test("36009004 ที่ไม่ใช่เรื่องเวลา ไม่ถูกตีเป็นเวลา (รหัสใช้ซ้ำหลายสาเหตุ)", () => {
    expect(ttsErrorText(new TtsApiError("Invalid credentials. Invalid app_key query parameter.", "36009004"))).toContain("App Key");
    expect(ttsErrorText(new TtsApiError("Invalid credentials. The x-tts-access-token header is invalid.", "36009004"))).toContain("เชื่อมต่อ TikTok Shop ใหม่");
  });
  test("105005 สิทธิ์ไม่พอ → บอกชื่อสิทธิ์ + ที่เปิด + ให้เชื่อมใหม่ (ข้อความจริงที่เจอ 2026-11-12)", () => {
    const t = ttsErrorText(new TtsApiError("Access denied. This app has not been granted any access scope required by this endpoint. Add a required scope to the app, reauthorize it, and retry with a new access token.", "105005", null, "Shop Authorized Information (seller.authorization.info)"));
    expect(t).toContain("Shop Authorized Information");
    expect(t).toContain("จัดการ API");
    expect(t).toContain("เผยแพร่การเปลี่ยนแปลง");
    expect(t).toContain("เชื่อมต่อใหม่");
  });
  test("ลายเซ็นผิด 106001", () => { expect(ttsErrorText(new TtsApiError("Invalid credentials. The sign query parameter is invalid.", "106001"))).toContain("ลายเซ็น"); });
  test("กุญแจหมดอายุ 105002", () => { expect(ttsErrorText(new TtsApiError("Expired credentials.", "105002"))).toContain("หมดอายุ"); });
  test("อื่น ๆ แนบรหัส", () => { expect(ttsErrorText(new TtsApiError("boom", "123"))).toBe("boom (รหัส 123)"); });
});

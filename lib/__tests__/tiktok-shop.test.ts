import { describe, expect, test, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { ttsSignInput, ttsSign, ttsExpiryMs, ttsShopsFromApi, ttsAuthUrl, ttsConfigured, ttsErrorText, ttsBrandMismatch, TtsApiError, ttsProductToCatalogItem, ttsDetailExtras, ttsIsRateLimit } from "@/lib/tiktok-shop";
import { summarizeListing } from "@/lib/platform-listing-health";
import { ttsOrderToPlatformOrder, ttsCategoryLeafPaths } from "@/lib/tiktok-shop";
import { tiktokToInternal } from "@/lib/platform-order-status";

describe("TikTok Shop — หมวดหมู่ (ชื่อเต็ม ราก > … > ใบ)", () => {
  // รูปจากเอกสาร get-categories-202309 + ชื่อจริงจาก category_chains ของสินค้า Louis Montini
  const CATS = [
    { id: "824584", parent_id: "0", local_name: "กระเป๋าและกระเป๋าเดินทาง", is_leaf: false },
    { id: "902920", parent_id: "824584", local_name: "อุปกรณ์เสริมสำหรับกระเป๋า", is_leaf: false },
    { id: "904584", parent_id: "902920", local_name: "สายสะพายและโซ่กระเป๋า", is_leaf: true, permission_statuses: ["AVAILABLE"] },
    { id: "905000", parent_id: "824584", local_name: "กระเป๋าถือ", is_leaf: true, permission_statuses: ["INVITE_ONLY"] },
  ];
  test("เก็บเฉพาะใบสุด + ชื่อเต็มคั่น ' > ' + สถานะสิทธิ์", () => {
    expect(ttsCategoryLeafPaths(CATS)).toEqual([
      { id: "905000", path: "กระเป๋าและกระเป๋าเดินทาง > กระเป๋าถือ", permission: "INVITE_ONLY" },
      { id: "904584", path: "กระเป๋าและกระเป๋าเดินทาง > อุปกรณ์เสริมสำหรับกระเป๋า > สายสะพายและโซ่กระเป๋า", permission: "AVAILABLE" },
    ]);
  });
  test("พ่อหาย/วนซ้ำ ไม่ค้าง", () => {
    expect(ttsCategoryLeafPaths([{ id: "1", parent_id: "9", local_name: "ลอย", is_leaf: true }])[0].path).toBe("ลอย");
    expect(ttsCategoryLeafPaths([{ id: "1", parent_id: "2", local_name: "A", is_leaf: true }, { id: "2", parent_id: "1", local_name: "B", is_leaf: false }])[0].path).toBe("B > A");
  });
});

describe("TikTok Shop — แปลงออเดอร์เป็นหัว+รายการ ศูนย์ออเดอร์", () => {
  const ORDER = {
    id: "576461413038785752", status: "AWAITING_SHIPMENT", create_time: 1762900000, rts_sla_time: 1763100000, update_time: 1762950000,
    payment: { currency: "THB", total_amount: "1170", sub_total: "1180", shipping_fee: "0", seller_discount: "10", platform_discount: "0" },
    is_cod: true, shipping_provider: "J&T Express", tracking_number: "", packages: [{ id: "pkg1" }],
    recipient_address: { name: "ส*****ย", phone_number: "(+66)08*****12", full_address: "ไม่ควรเก็บ" },
    line_items: [
      { id: "l1", sku_id: "s1", seller_sku: "LM-W001-BK", product_name: "กระเป๋าสตางค์", sku_name: "ดำ", sale_price: "590" },
      { id: "l2", sku_id: "s1", seller_sku: "LM-W001-BK", product_name: "กระเป๋าสตางค์", sku_name: "ดำ", sale_price: "590" },
      { id: "l3", sku_id: "s9", seller_sku: "GIFT-1", product_name: "ของแถม", sale_price: "0", is_gift: true },
    ],
  };
  test("หัวออเดอร์: สถานะในระบบ + บนร้าน + ยอด + กำหนดส่ง + COD", () => {
    const m = ttsOrderToPlatformOrder(ORDER, tiktokToInternal)!;
    expect(m.external_order_id).toBe("576461413038785752");
    expect(m.head).toMatchObject({ status: "new", platform_status: "AWAITING_SHIPMENT", total: 1170, currency: "THB", carrier: "J&T Express", tracking_no: null, package_no: "pkg1", cod_amount: 1170, customer_name: "ส*****ย" });
    expect(m.head.ordered_at).toBe(new Date(1762900000 * 1000).toISOString());
    expect(m.head.ship_by_at).toBe(new Date(1763100000 * 1000).toISOString());
  });
  test("1 แถว = 1 ชิ้น → รวมตาม SKU · ของแถมราคา 0", () => {
    const m = ttsOrderToPlatformOrder(ORDER, tiktokToInternal)!;
    expect(m.items).toEqual([
      { sku_id: "s1", sku_code: "LM-W001-BK", name: "กระเป๋าสตางค์", variant: "ดำ", qty: 2, price: 590 },
      { sku_id: "s9", sku_code: "GIFT-1", name: "ของแถม", variant: null, qty: 1, price: 0 },
    ]);
  });
  test("ไม่เก็บที่อยู่/เบอร์ผู้รับ", () => {
    const s = JSON.stringify(ttsOrderToPlatformOrder(ORDER, tiktokToInternal));
    expect(s).not.toContain("ไม่ควรเก็บ");
    expect(s).not.toContain("08*****12");
  });
  test("สถานะไม่รู้จัก = new (ให้คนดู) · ไม่มี id = ข้าม", () => {
    expect(ttsOrderToPlatformOrder({ ...ORDER, status: "NEW_THING" }, tiktokToInternal)!.head.status).toBe("new");
    expect(ttsOrderToPlatformOrder({ status: "UNPAID" }, tiktokToInternal)).toBeNull();
  });
  test("ไม่ใช่เก็บเงินปลายทาง = cod_amount 0 ไม่ใช่ว่าง (ช่องในฐานข้อมูลห้ามว่าง — เจอจริง 2026-11-12)", () => {
    expect(ttsOrderToPlatformOrder({ ...ORDER, is_cod: false }, tiktokToInternal)!.head.cod_amount).toBe(0);
    expect(ttsOrderToPlatformOrder({ ...ORDER, is_cod: true, payment: {} }, tiktokToInternal)!.head.cod_amount).toBe(0);
  });
});

// รูปตามเอกสาร api_meta (search-products-202502 / get-product-202309)
const SEARCH_PRODUCT = {
  id: "1729592969712207008", title: "กระเป๋าสตางค์หนังแท้ Louis Montini", status: "ACTIVATE", update_time: 1762900000, create_time: 1750000000,
  skus: [
    { id: "s1", seller_sku: "LM-W001-BK", price: { tax_exclusive_price: "590.00", currency: "THB" }, inventory: [{ warehouse_id: "w1", quantity: 5 }, { warehouse_id: "w2", quantity: 2 }], status_info: { status: "NORMAL" } },
    { id: "s2", seller_sku: "LM-W001-BR", price: { tax_exclusive_price: "550", currency: "THB" }, inventory: [{ warehouse_id: "w1", quantity: 0 }], status_info: { status: "NORMAL" } },
    { id: "s3", seller_sku: "LM-W001-BK", price: { sale_price: "590", currency: "THB" }, inventory: [] },
  ],
  description: "<p>ยาวมาก</p>",
};
const DETAIL = {
  main_images: [{ uri: "tos-x", urls: ["https://p16.tiktokcdn.com/a.jpg"], thumb_urls: ["https://p16.tiktokcdn.com/a_t.jpg"] }],
  category_chains: [{ id: "1", local_name: "กระเป๋า", is_leaf: false, parent_id: "0" }, { id: "2", local_name: "กระเป๋าสตางค์ผู้ชาย", is_leaf: true, parent_id: "1" }],
  skus: [{ id: "s1", sales_attributes: [{ name: "สี", value_name: "ดำ" }] }, { id: "s2", sales_attributes: [{ name: "สี", value_name: "น้ำตาล" }] }],
  description: "<p>HTML</p>",
};

describe("TikTok Shop — แปลงสินค้าเป็นแถวสินค้าบนแพลตฟอร์ม", () => {
  test("รหัส SKU ไม่ซ้ำ · ราคาต่ำสุด (tax_exclusive_price → sale_price) · สถานะตัวเล็ก · สต๊อกรวมทุกคลัง", () => {
    const it = ttsProductToCatalogItem(SEARCH_PRODUCT, ttsDetailExtras(DETAIL))!;
    expect(it.external_product_id).toBe("1729592969712207008");
    expect(it.skus).toEqual(["LM-W001-BK", "LM-W001-BR"]);
    expect(it.price).toBe(550);
    expect(it.status).toBe("activate");
    const tt = it.raw.tiktok;
    expect(tt.skus[0]).toMatchObject({ id: "s1", seller_sku: "LM-W001-BK", price: 590, stock: 7, status: "NORMAL", label: "สี: ดำ" });
    expect(tt.skus[2]).toMatchObject({ price: 590, stock: null });
    expect(tt.image).toBe("https://p16.tiktokcdn.com/a.jpg");
    expect(tt.category).toBe("กระเป๋าสตางค์ผู้ชาย");
    expect(tt.update_time).toBe(1762900000);
  });
  test("ไม่เก็บคำบรรยาย (HTML) ลงฐานข้อมูล", () => {
    const it = ttsProductToCatalogItem(SEARCH_PRODUCT, ttsDetailExtras(DETAIL))!;
    expect(JSON.stringify(it.raw)).not.toContain("<p>");
  });
  test("ไม่มีรายละเอียด = รูป/หมวดว่าง ยังได้แถว · ไม่มี id = ข้าม", () => {
    const it = ttsProductToCatalogItem(SEARCH_PRODUCT)!;
    expect(it.raw.tiktok.image).toBeNull();
    expect(ttsProductToCatalogItem({ title: "x" })).toBeNull();
  });
  test("รูปจาก thumb_urls เมื่อไม่มี urls · หมวดใช้ตัวท้ายเมื่อไม่มี is_leaf", () => {
    const ex = ttsDetailExtras({ main_images: [{ thumb_urls: ["t.jpg"] }], category_chains: [{ local_name: "A" }, { local_name: "B" }] });
    expect(ex.image).toBe("t.jpg"); expect(ex.category).toBe("B");
  });
  test("รู้ว่าโดนจำกัดความถี่", () => {
    expect(ttsIsRateLimit(new TtsApiError("Too many requests", "36009002"))).toBe(true);
    expect(ttsIsRateLimit(new TtsApiError("Access denied", "105005"))).toBe(false);
  });
});

describe("TikTok Shop — สรุปสถานะบนร้าน (summarizeListing)", () => {
  test("เปิดขาย + สต๊อกรวม + รูป + หมวด", () => {
    const it = ttsProductToCatalogItem(SEARCH_PRODUCT, ttsDetailExtras(DETAIL))!;
    const s = summarizeListing("tiktok", it.raw, null, it.status);
    expect(s).toMatchObject({ display: true, stock: 7, price: 550, salePrice: null, variants: 3, image: "https://p16.tiktokcdn.com/a.jpg", imageKnown: true, category: "กระเป๋าสตางค์ผู้ชาย", state: "selling" });
  });
  test("ปิดโดยผู้ขาย = ปิดขาย · ฉบับร่าง/รอตรวจ = รอตรวจ · สต๊อก 0 = หมด", () => {
    const base = ttsProductToCatalogItem(SEARCH_PRODUCT)!.raw.tiktok;
    expect(summarizeListing("tiktok", { tiktok: { ...base, status: "SELLER_DEACTIVATED" } }).state).toBe("hidden");
    expect(summarizeListing("tiktok", { tiktok: { ...base, status: "PENDING" } }).state).toBe("review");
    expect(summarizeListing("tiktok", { tiktok: { ...base, skus: [{ price: 10, stock: 0 }] } }).state).toBe("out");
  });
  test("ป้าย 'ไม่อยู่บนร้านแล้ว' ชนะทุกสถานะ", () => {
    expect(summarizeListing("tiktok", ttsProductToCatalogItem(SEARCH_PRODUCT)!.raw, null, "removed").state).toBe("gone");
  });
});

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

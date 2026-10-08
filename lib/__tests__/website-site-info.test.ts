import { describe, it, expect } from "vitest";
import {
  normalizeSiteInfo,
  publicSiteInfo,
  calcShippingFee,
  orderPrefixFor,
  cleanOrderPrefix,
  cleanUrl,
  siteInfoToRows,
  SITE_INFO_FIELDS,
} from "../website-site-info";
import { validateOrderInput, pickSku, orderNoPrefix } from "../website-orders";
import type { ChildSku } from "../website-field-map";

/**
 * กันบั๊กที่จะทำให้ลูกค้าสั่งของแล้วได้ของผิด/ราคาผิด:
 *  - ค่า store_settings เก็บเป็น string ทั้งหมด → ต้องแปลงกลับเป็นตัวเลข/จริงเท็จให้ถูก
 *  - ตัวย่อเลขออเดอร์ห้ามหลุดไป API สาธารณะ
 *  - รหัสตัวเลือก "sku-xxxxxxxx" ต้องชี้กลับไป SKU ลูกตัวเดิมที่ API สินค้าส่งไป
 */
describe("website-site-info", () => {
  it("แปลงค่าจาก store_settings (string) เป็นชนิดที่ถูกต้อง + เติมค่าเริ่มต้นช่องที่ไม่มี", () => {
    const info = normalizeSiteInfo([
      { key: "shipping_flat", value: "60" },
      { key: "pay_cod", value: "0" },
      { key: "contact_phone", value: "  081-234-5678 " },
      { key: "social_facebook", value: "javascript:alert(1)" },
      { key: "unknown_key", value: "x" },
    ]);
    expect(info.shipping_flat).toBe(60);
    expect(info.pay_cod).toBe(false);
    expect(info.pay_promptpay).toBe(true); // ไม่ได้ตั้ง = ค่าเริ่มต้น
    expect(info.free_shipping_min).toBe(0);
    expect(info.contact_phone).toBe("081-234-5678");
    expect(info.social_facebook).toBe(""); // ลิงก์ที่ไม่ใช่ http(s) ต้องถูกทิ้ง
    expect((info as unknown as Record<string, unknown>).unknown_key).toBeUndefined();
  });

  it("รับค่าจากฟอร์ม (object) ได้เหมือนกัน", () => {
    const info = normalizeSiteInfo({ shipping_flat: 0, free_shipping_min: "1,500", pay_cod: true, order_prefix: "lm-x" });
    expect(info.shipping_flat).toBe(0);
    expect(info.free_shipping_min).toBe(1500);
    expect(info.order_prefix).toBe("LMX");
  });

  it("publicSiteInfo ตัดฟิลด์ภายในออก", () => {
    const pub = publicSiteInfo(normalizeSiteInfo({ order_prefix: "LM", promptpay_number: "0812345678" }));
    expect((pub as Record<string, unknown>).order_prefix).toBeUndefined();
    expect(pub.promptpay_number).toBe("0812345678");
  });

  it("ค่าส่ง: ฟรีเมื่อถึงยอดขั้นต่ำ · 0 = ไม่มีเงื่อนไข", () => {
    expect(calcShippingFee(500, { shipping_flat: 50, free_shipping_min: 1000 })).toBe(50);
    expect(calcShippingFee(1000, { shipping_flat: 50, free_shipping_min: 1000 })).toBe(0);
    expect(calcShippingFee(99999, { shipping_flat: 50, free_shipping_min: 0 })).toBe(50);
    expect(calcShippingFee(10, { shipping_flat: 0, free_shipping_min: 0 })).toBe(0);
  });

  it("ตัวย่อเลขออเดอร์: ตั้งไว้ใช้ตามนั้น ไม่ตั้งใช้จาก slug", () => {
    expect(orderPrefixFor({ order_prefix: "LM" }, "louismontini")).toBe("LM");
    expect(orderPrefixFor({ order_prefix: "" }, "louismontini")).toBe("LO");
    expect(orderPrefixFor({ order_prefix: "" }, "---")).toBe("WEB");
    expect(cleanOrderPrefix("louis montini!")).toBe("LOUISM");
    expect(orderNoPrefix(normalizeSiteInfo({ order_prefix: "LM" }), "louismontini", new Date(2026, 9, 8))).toBe("LM-256910-");
  });

  it("siteInfoToRows เขียนครบทุกช่อง และ bool เป็น 1/0", () => {
    const rows = siteInfoToRows("shop-1", normalizeSiteInfo({ pay_cod: false }));
    expect(rows).toHaveLength(SITE_INFO_FIELDS.length);
    expect(rows.find((r) => r.key === "pay_cod")?.value).toBe("0");
    expect(rows.every((r) => r.shop_id === "shop-1")).toBe(true);
  });

  it("cleanUrl รับเฉพาะ http(s)", () => {
    expect(cleanUrl("https://lin.ee/abc")).toBe("https://lin.ee/abc");
    expect(cleanUrl("lin.ee/abc")).toBe("");
    expect(cleanUrl("")).toBe("");
  });
});

describe("website-orders", () => {
  const P = "11111111-2222-3333-4444-555555555555";
  const good = {
    items: [{ productId: P, optionId: "sku-abcd1234", qty: 2 }],
    customer: { name: "สมชาย", phone: "081-234-5678" },
    ship: { addressLine: "99/9 ถ.สุขุมวิท", province: "กรุงเทพฯ", postal: "10110" },
    paymentMethod: "cod",
  };

  it("รับออเดอร์ที่ครบถ้วน และทำความสะอาดเบอร์/รหัสไปรษณีย์", () => {
    const r = validateOrderInput(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.customer.phone).toBe("0812345678");
      expect(r.input.ship.postal).toBe("10110");
      expect(r.input.items[0].qty).toBe(2);
    }
  });

  it("บอกว่าขาดอะไร ไม่เดาค่าให้", () => {
    expect(validateOrderInput({ ...good, items: [] })).toMatchObject({ ok: false, error: "ตะกร้าว่าง" });
    expect(validateOrderInput({ ...good, customer: { name: "ก", phone: "0812345678" } }).ok).toBe(false);
    expect(validateOrderInput({ ...good, customer: { name: "สมชาย", phone: "12" } }).ok).toBe(false);
    expect(validateOrderInput({ ...good, ship: { addressLine: "" } }).ok).toBe(false);
    expect(validateOrderInput({ ...good, paymentMethod: "card" }).ok).toBe(false);
    expect(validateOrderInput({ ...good, items: [{ productId: "not-uuid", qty: 1 }] }).ok).toBe(false);
    expect(validateOrderInput({ ...good, items: [{ productId: P, qty: 100 }] }).ok).toBe(false);
  });

  const kids: ChildSku[] = [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", code: "X-01", color: "ดำ", list_price: 100, cover_image_r2_key: null, attribute_values: { variant_option: { name: "ขนาด", value: "S" } } },
    { id: "cccccccc-0000-0000-0000-000000000002", code: "X-02", color: "ดำ", list_price: 100, cover_image_r2_key: null, attribute_values: { variant_option: { name: "ขนาด", value: "M" } } },
    { id: "bbbbbbbb-0000-0000-0000-000000000003", code: "X-03", color: "น้ำตาล", list_price: 100, cover_image_r2_key: null, attribute_values: { variant_option: { name: "ขนาด", value: "M" } } },
  ];

  it("pickSku: รหัส sku-xxxxxxxx ชี้กลับไป SKU สีนั้น · มี opt2 ด้วยต้องได้ตัวที่ตรงทั้งสีและขนาด", () => {
    expect(pickSku(kids, "sku-bbbbbbbb")).toMatchObject({ sku: { code: "X-03" }, variantLabel: "น้ำตาล" });
    // สีดำ (รหัสจาก X-01) + ขนาด M (รหัสจาก X-02) → ต้องได้ X-02 (ดำ+M) ไม่ใช่ X-01 (ดำ+S)
    expect(pickSku(kids, "sku-aaaaaaaa", "opt2-cccccccc")).toMatchObject({ sku: { code: "X-02" }, variantLabel: "ดำ / M" });
    // สีน้ำตาล + ขนาด M → X-03
    expect(pickSku(kids, "sku-bbbbbbbb", "opt2-cccccccc")).toMatchObject({ sku: { code: "X-03" } });
  });

  it("pickSku: ไม่มีตัวเลือก → ใช้ SKU ตัวแรก · รหัสมั่ว → ไม่พัง", () => {
    expect(pickSku(kids)).toMatchObject({ sku: { code: "X-01" }, variantLabel: null });
    expect(pickSku(kids, "custom-1")).toMatchObject({ sku: { code: "X-01" }, variantLabel: null });
    expect(pickSku([], "sku-aaaaaaaa")).toEqual({ sku: null, variantLabel: null });
  });
});

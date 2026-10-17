import { describe, it, expect } from "vitest";
import { currentOrderEvent, orderEmail, orderEventOf, orderMessage, restockMessage, trackUrl, type MessageOrder } from "../customer-messages";
import { toOrderView, validateOrderInput, type OrderRow } from "../website-orders";
import { personalizeLabel } from "../website-personalize";
import { resetPasswordMessage, verifyEmailMessage } from "../member-emails";

/**
 * 🌐 ก้อน 6 — ออเดอร์จำภาษาลูกค้า + ข้อความแจ้งลูกค้า 2 ภาษา
 */
const order: MessageOrder = {
  orderNo: "LM-256910-00001",
  customerName: "Anna",
  paymentMethod: "promptpay",
  paymentStatus: "unpaid",
  items: [{ name: "Nylon Backpack", variantLabel: "Navy", qty: 2, lineTotal: 1980 }],
  subtotal: 1980,
  shippingFee: 50,
  discount: 0,
  grandTotal: 2030,
  note: "",
  promptpay: { number: "0812345678", name: "Louis Montini" },
};
const shop = { name: "Louis Montini", siteUrl: "https://louismontini.co.th", orderNote: "Ships in 1-2 days", contactLine: "@louis" };

describe("เรื่องที่ต้องแจ้งลูกค้า", () => {
  it("เปลี่ยนสถานะ → เรื่องที่แจ้ง · สถานะเดิม/กลับเป็นรอ = ไม่แจ้ง", () => {
    const b = { status: "pending", paymentStatus: "unpaid" };
    expect(orderEventOf(b, { ...b, status: "shipped" })).toBe("shipped");
    expect(orderEventOf(b, { ...b, paymentStatus: "paid" })).toBe("paid");
    expect(orderEventOf({ ...b, status: "preparing" }, b)).toBeNull();
    expect(orderEventOf(b, b)).toBeNull();
  });
  it("เรื่องตั้งต้นของปุ่มคัดลอก = ตามสถานะตอนนี้", () => {
    expect(currentOrderEvent({ status: "pending", paymentStatus: "unpaid" })).toBe("placed");
    expect(currentOrderEvent({ status: "pending", paymentStatus: "paid" })).toBe("paid");
    expect(currentOrderEvent({ status: "shipped", paymentStatus: "paid" })).toBe("shipped");
    expect(currentOrderEvent({ status: "cancelled", paymentStatus: "refunded" })).toBe("cancelled");
  });
});

describe("ข้อความ 2 ภาษา", () => {
  it("ลูกค้าอังกฤษ: ยืนยันออเดอร์ + วิธีโอน + รายการ + ลิงก์ /en/track", () => {
    const m = orderMessage("placed", order, shop, "en");
    expect(m.subject).toBe("We've received your order LM-256910-00001 — Louis Montini");
    expect(m.text).toContain("Hi Anna,");
    expect(m.text).toContain("PromptPay 0812345678");
    expect(m.text).toContain("Nylon Backpack (Navy) ×2");
    expect(m.text).toContain("Ships in 1-2 days");
    expect(m.link?.href).toBe("https://louismontini.co.th/en/track?no=LM-256910-00001");
    expect(m.text).not.toMatch(/[ก-ฺเ-๛]/); // ไม่มีอักษรไทย (฿ อยู่ช่วงเดียวกันใน Unicode — เว้นไว้)
  });
  it("ลูกค้าไทย: ภาษาไทย ลิงก์ไม่มี /en", () => {
    const m = orderMessage("shipped", { ...order, customerName: "สมชาย", note: "Kerry TH123" }, { ...shop, orderNote: "" }, "th");
    expect(m.title).toBe("จัดส่งสินค้าแล้ว");
    expect(m.text).toContain("ข้อมูลจากร้าน: Kerry TH123");
    expect(m.link?.href).toBe("https://louismontini.co.th/track?no=LM-256910-00001");
  });
  it("ร้านยังไม่มีโดเมน = ไม่มีลิงก์ · อีเมลมี html lang ตามลูกค้า + escape", () => {
    expect(trackUrl(null, "X", "en")).toBeNull();
    const e = orderEmail("a@b.co", "cancelled", { ...order, customerName: "<b>Anna</b>" }, { ...shop, siteUrl: null }, "en");
    expect(e.html).toContain('<html lang="en">');
    expect(e.html).toContain("&lt;b&gt;Anna&lt;/b&gt;");
    expect(e.subject).toBe("Order LM-256910-00001 cancelled — Louis Montini");
  });
  it("ของเข้าแล้ว (แจ้งเมื่อมีของ)", () => {
    const en = restockMessage({ productName: "Tote", option: "Black", productUrl: "https://x.co/en/product/t1", customerName: null }, { name: "Shop" }, "en");
    expect(en).toContain("Tote (Black) is back in stock");
    expect(en).toContain("https://x.co/en/product/t1");
    expect(restockMessage({ productName: "กระเป๋า", option: null, productUrl: null, customerName: "เอ" }, { name: "ร้าน" }, "th")).toContain("สวัสดีคุณเอ");
  });
  it("อีเมลสมาชิกตามภาษา", () => {
    expect(verifyEmailMessage("a@b.co", "Shop", "https://x.co/en/account/verify?token=1", "en").subject).toBe("Confirm your email — Shop");
    expect(resetPasswordMessage("a@b.co", "Shop", "https://x.co/account/reset?token=1").subject).toBe("ตั้งรหัสผ่านใหม่ — Shop");
  });
});

describe("ออเดอร์จำภาษา", () => {
  const P = "11111111-2222-3333-4444-555555555555";
  const good = { items: [{ productId: P, qty: 1 }], customer: { name: "Anna", phone: "0812345678" }, ship: { addressLine: "99/9 Sukhumvit" }, paymentMethod: "cod" };
  it("รับ lang จากหน้าเว็บ · ค่าแปลก/ไม่ส่ง = ไทย", () => {
    expect(validateOrderInput({ ...good, lang: "en" })).toMatchObject({ ok: true, input: { lang: "en" } });
    expect(validateOrderInput({ ...good, lang: "fr" })).toMatchObject({ ok: true, input: { lang: "th" } });
    expect(validateOrderInput(good)).toMatchObject({ ok: true, input: { lang: "th" } });
  });
  it("หน้าตามออเดอร์: ลูกค้าอังกฤษเห็นชื่ออังกฤษ · พนักงาน (th) เห็นไทย · ไม่มีชื่ออังกฤษ = ไทย", () => {
    const row = { order_no: "A", status: "pending", payment_method: "cod", payment_status: "unpaid", customer_name: "Anna", customer_phone: "0812345678", ship_address_line: null, ship_subdistrict: null, ship_district: null, ship_province: null, ship_postal: null, subtotal: 100, shipping_fee: 0, discount: 0, grand_total: 100, note: null, created_at: "2026-10-17T00:00:00Z", id: "x", lang: "en" } as OrderRow;
    const items = [
      { name: "กระเป๋าเป้", variant_label: "กรมท่า", name_en: "Backpack", variant_label_en: "Navy", unit_price: 100, qty: 1, line_total: 100 },
      { name: "สายสะพาย", variant_label: null, name_en: null, variant_label_en: null, unit_price: 0, qty: 1, line_total: 0 },
    ];
    const v = toOrderView(row, items, null);
    expect(v.lang).toBe("en");
    expect(v.items.map((i) => [i.name, i.variantLabel])).toEqual([["Backpack", "Navy"], ["สายสะพาย", null]]);
    expect(toOrderView(row, items, null, "th").items[0].name).toBe("กระเป๋าเป้");
    expect(toOrderView({ ...row, lang: null }, items, null).lang).toBe("th");
  });
  it("ปั๊มชื่อภาษาอังกฤษ", () => {
    expect(personalizeLabel({ text: "ANN", style: "gold", position: "right" }, null, "en")).toBe('Name stamp "ANN" · Gold foil · Bottom right');
    expect(personalizeLabel({ text: "ANN", style: "gold", position: "right" })).toBe('ปั๊ม "ANN" · พิมพ์ทอง · มุมขวาล่าง');
  });
});

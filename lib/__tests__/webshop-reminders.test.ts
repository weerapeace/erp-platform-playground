import { describe, expect, it } from "vitest";
import { CART_MAX_ITEMS, cartDue, cartHash, cartReminderMessage, cleanCartItems, priceDropped, wishlistAlertMessage, WISHLIST_MAX_PER_MESSAGE } from "@/lib/webshop-reminders";

const H = 3_600_000;
const item = (over: Record<string, unknown> = {}) => ({ code: "BG-01", name: "กระเป๋า", variant: "ดำ", qty: 1, price: 1290, slug: "bg-01", ...over });

describe("cleanCartItems", () => {
  it("ทิ้งแถวไม่มีชื่อ/จำนวนผิด · ตัดจำนวน/ราคา/slug", () => {
    const out = cleanCartItems([item(), { name: "", qty: 1 }, { name: "x", qty: 0 }, item({ qty: 500, price: -5, slug: "BG 01/<x>", variant: "" }), "junk"]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ qty: 99, price: 0, slug: "bg01x", variant: null });
  });
  it("ไม่ใช่ array = ว่าง · สูงสุด 30 แถว", () => {
    expect(cleanCartItems(null)).toEqual([]);
    expect(cleanCartItems(Array.from({ length: 50 }, () => item()))).toHaveLength(CART_MAX_ITEMS);
  });
});

describe("cartHash / cartDue", () => {
  const items = cleanCartItems([item(), item({ code: "BG-02", qty: 2 })]);
  it("ลำดับไม่มีผล · จำนวนเปลี่ยน = ต่าง · ใช้ได้ในตัวกรอง DB", () => {
    expect(cartHash(items)).toBe(cartHash([...items].reverse()));
    expect(cartHash(items)).not.toBe(cartHash([items[0], { ...items[1], qty: 3 }]));
    expect(cartHash(items)).toMatch(/^[0-9a-f]{16}$/);
  });
  it("ยังไม่ถึงชั่วโมงที่ตั้ง = ยังไม่เตือน · ถึงแล้ว = เตือน · เก่าเกิน 7 วัน = ไม่เตือน", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    const at = (h: number) => new Date(now - h * H).toISOString();
    expect(cartDue({ updated_at: at(5), reminded_hash: null, items }, 6, now)).toBe(false);
    expect(cartDue({ updated_at: at(6), reminded_hash: null, items }, 6, now)).toBe(true);
    expect(cartDue({ updated_at: at(24 * 8), reminded_hash: null, items }, 6, now)).toBe(false);
  });
  it("เตือนของชุดนี้ไปแล้ว = ไม่เตือนซ้ำ · ตะกร้าว่าง = ไม่เตือน", () => {
    const now = Date.now();
    const old = new Date(now - 10 * H).toISOString();
    expect(cartDue({ updated_at: old, reminded_hash: cartHash(items), items }, 6, now)).toBe(false);
    expect(cartDue({ updated_at: old, reminded_hash: "other", items }, 6, now)).toBe(true);
    expect(cartDue({ updated_at: old, reminded_hash: null, items: [] }, 6, now)).toBe(false);
  });
});

describe("priceDropped", () => {
  it("ลดถึง % ที่ตั้ง = แจ้ง · ไม่ถึง = ไม่แจ้ง", () => {
    expect(priceDropped(1000, 950, 5, null)).toBe(true);
    expect(priceDropped(1000, 951, 5, null)).toBe(false);
  });
  it("แจ้งราคานี้ไปแล้ว = ไม่แจ้งซ้ำ · ลดลงอีก = แจ้ง", () => {
    expect(priceDropped(1000, 900, 5, 900)).toBe(false);
    expect(priceDropped(1000, 850, 5, 900)).toBe(true);
  });
  it("ไม่มีราคาอ้างอิง/ราคา 0 = ไม่แจ้ง", () => {
    expect(priceDropped(null, 500, 5, null)).toBe(false);
    expect(priceDropped(1000, 0, 5, null)).toBe(false);
  });
});

describe("ถ้อยคำ", () => {
  it("ตะกร้าค้าง: ไทย มีรายการ ยอดรวม ปุ่มไปตะกร้า และบอกวิธีปิดรับ", () => {
    const items = cleanCartItems([item(), item({ code: "BG-02", name: "เข็มขัด", variant: null, qty: 2, price: 590 })]);
    const m = cartReminderMessage({ lang: "th", shopName: "ร้าน A", customerName: "บี", items, total: 2470, cartUrl: "https://a.com/cart" });
    expect(m.subject).toBe("ร้าน A: ของในตะกร้ายังรอคุณอยู่");
    expect(m.email.table?.at(-1)).toMatchObject({ right: "฿2,470", bold: true });
    expect(m.email.button?.href).toBe("https://a.com/cart");
    expect(m.line).toContain("เข็มขัด × 2");
    expect(m.line).toContain("🔗 https://a.com/cart");
    expect(m.text).toContain("ปิดรับได้ที่หน้าบัญชีของฉัน");
  });
  it("ตะกร้าค้าง: อังกฤษ · ไม่มีลิงก์เว็บ = ไม่มีปุ่ม", () => {
    const m = cartReminderMessage({ lang: "en", shopName: "Shop", customerName: "", items: cleanCartItems([item()]), total: 1290, cartUrl: null });
    expect(m.email.title).toBe("Your cart is waiting for you");
    expect(m.email.button).toBeUndefined();
    expect(m.email.lines[0]).toBe("Hi,");
  });
  it("ของถูกใจลดราคา: 1 ชิ้น = ปุ่มไปหน้าสินค้า · หลายชิ้น = ไปหน้าบัญชี · สูงสุด 5 ชิ้น", () => {
    const d = (n: number) => ({ name: `รุ่น ${n}`, oldPrice: 1000, newPrice: 800, url: `https://a.com/product/r${n}` });
    const one = wishlistAlertMessage({ lang: "th", shopName: "A", customerName: "บี", drops: [d(1)], accountUrl: "https://a.com/account" });
    expect(one.email.button).toEqual({ text: "ดูสินค้า", href: "https://a.com/product/r1" });
    expect(one.email.table?.[0]).toEqual({ left: "รุ่น 1", right: "฿1,000 → ฿800" });
    const many = wishlistAlertMessage({ lang: "en", shopName: "A", customerName: "B", drops: Array.from({ length: 8 }, (_, i) => d(i)), accountUrl: "https://a.com/en/account" });
    expect(many.email.button?.href).toBe("https://a.com/en/account");
    expect(many.email.table).toHaveLength(WISHLIST_MAX_PER_MESSAGE);
  });
});

import { describe, expect, it } from "vitest";
import { cleanItemGift, itemGiftLabel, priceItemGift, readItemGift } from "@/lib/website-item-gift";
import { DEFAULT_CART, normalizeCart, pickCartRecs, recsAt, recsSetFits, normalizeRecsSet } from "@/lib/website-cart";
import { normalizeGiftCards, wrapFeeFor } from "@/lib/website-gift-cards";

const INFO = { gift_enabled: true, gift_fee: 50, card_enabled: true, card_fee: 20 };
const CARDS = normalizeGiftCards({
  designs: [{ id: "rose", name: "กุหลาบ", bg: "#FFFFFF", color: "#000000" }],
  wraps: [
    { id: "kraft", name: "กระดาษคราฟท์", fee: 0 },
    { id: "box", name: "กล่องของขวัญ", nameEn: "Gift box", fee: 80 },
    { id: "old", name: "เลิกใช้", fee: 10, enabled: false },
  ],
});

describe("cleanItemGift", () => {
  it("ไม่ได้เลือก = null · ข้อความเฉพาะการ์ด · แบบห่อเฉพาะตอนห่อ", () => {
    expect(cleanItemGift(null)).toBeNull();
    expect(cleanItemGift({ wrap: false, card: false })).toBeNull();
    expect(cleanItemGift({ wrap: true, message: "x", style: "Box!" })).toEqual({ wrap: true, card: false, message: "", style: "box" });
    expect(cleanItemGift({ card: true, message: " สุขสันต์\r\nวันเกิด ", style: "box" })).toEqual({ wrap: false, card: true, message: "สุขสันต์\nวันเกิด", style: "" });
    expect(cleanItemGift({ card: true, message: "ก".repeat(400) })?.message.length).toBe(300);
  });
});

describe("wrapFeeFor", () => {
  it("ไม่มีแบบห่อ = ค่าห่อเดิม · มีแบบ = ราคาตามแบบ · แบบปิด/ไม่เลือก = บอกให้เลือกใหม่", () => {
    expect(wrapFeeFor(null, null, 50)).toEqual({ ok: true, fee: 50, style: null });
    expect(wrapFeeFor(CARDS, "box", 50)).toMatchObject({ ok: true, fee: 80 });
    expect(wrapFeeFor(CARDS, "old", 50)).toMatchObject({ ok: false });
    expect(wrapFeeFor(CARDS, "", 50)).toMatchObject({ ok: false, error: expect.stringContaining("เลือกแบบห่อ") });
  });
});

describe("priceItemGift", () => {
  it("ค่าห่อ × จำนวนชิ้น · การ์ด 1 ใบ/รายการ (ไม่มีแบบห่อ = ค่าห่อเดิม)", () => {
    const r = priceItemGift({ wrap: true, card: true, message: "hi", style: "" }, 3, INFO);
    expect(r).toMatchObject({ ok: true, gift: { wrap: true, card: true, message: "hi", wrapFee: 150, cardFee: 20, styleName: "", cardInfo: null } });
  });
  it("แบบห่อ = ราคาตามแบบ × ชิ้น + ชื่อแบบ · การ์ดมีลาย/ถึง-จาก", () => {
    const r = priceItemGift({ wrap: true, card: true, message: "รักนะ", style: "box", cardInfo: { design: "rose", font: "hand", to: "แม่", from: "ต้น" } }, 2, INFO, "TTM130", CARDS);
    expect(r).toMatchObject({ ok: true, gift: { wrapFee: 160, style: "box", styleName: "กล่องของขวัญ", styleNameEn: "Gift box", cardInfo: { design: "rose", to: "แม่", from: "ต้น" } } });
  });
  it("ลายการ์ดปิดแล้ว / แบบห่อปิดแล้ว = บอกให้แก้ (มีชื่อสินค้า)", () => {
    expect(priceItemGift({ wrap: false, card: true, message: "x", style: "", cardInfo: { design: "nope", font: "hand" } }, 1, INFO, "TTM130", CARDS)).toMatchObject({ ok: false, error: expect.stringContaining("TTM130") });
    expect(priceItemGift({ wrap: true, card: false, message: "", style: "old" }, 1, INFO, "TTM130", CARDS)).toMatchObject({ ok: false });
  });
  it("ร้านปิดบริการ = บอกให้เอาออก", () => {
    expect(priceItemGift({ wrap: true, card: false, message: "", style: "" }, 1, { ...INFO, gift_enabled: false }, "TTM130")).toMatchObject({ ok: false, error: expect.stringContaining("TTM130") });
    expect(priceItemGift({ wrap: false, card: true, message: "", style: "" }, 1, { ...INFO, card_enabled: false })).toMatchObject({ ok: false });
  });
  it("ไม่ได้เลือก = ไม่มีค่าบริการ", () => expect(priceItemGift(null, 2, INFO)).toEqual({ ok: true, gift: null }));
});

describe("readItemGift + ป้าย", () => {
  it("อ่านค่าที่เก็บ (รวมข้อมูลรอบแรกที่ไม่มีแบบห่อ)", () => {
    expect(readItemGift({ wrap: true, card: false, message: "", wrapFee: 50 })).toMatchObject({ wrap: true, styleName: "", wrapFee: 50, cardInfo: null });
    const g = readItemGift({ wrap: true, card: true, message: "hi", style: "box", styleName: "กล่อง", cardInfo: { design: "rose", font: "hand", to: "A", printedAt: "2026-10-22" } });
    expect(g?.cardInfo).toMatchObject({ design: "rose", to: "A", printedAt: "2026-10-22" });
  });
  it("ไทย/อังกฤษ + ชื่อแบบห่อ", () => {
    expect(itemGiftLabel({ wrap: true, card: true })).toBe("🎀 ห่อของขวัญ · 💌 การ์ด");
    expect(itemGiftLabel({ wrap: true, card: false, styleName: "กล่อง", styleNameEn: "Box" }, "en")).toBe("🎀 Gift wrapped (Box)");
    expect(itemGiftLabel({ wrap: false, card: true }, "en")).toBe("💌 Card");
  });
});

describe("ตะกร้า: ค่าใหม่ + สินค้าแนะนำ", () => {
  it("ค่าเริ่มต้น = แบบเดิม", () => {
    const c = normalizeCart({});
    expect(c).toMatchObject({ pageLayout: "classic", pageBtn: "auto", select: false, giftMode: "order", lineRelated: false, lineRelatedCount: 3, recsPromoBadge: false });
    expect(c.recsSets[0]).toMatchObject({ cats: [], ifCats: [], tabs: [] });
    expect(DEFAULT_CART.giftMode).toBe("order");
  });
  it("แท็บเพิ่ม: กรองที่มาไม่รู้จัก/ซ้ำกับที่มาหลัก · สูงสุด 3", () => {
    expect(normalizeRecsSet({ source: "auto", tabs: ["recent", "auto", "x", "wishlist", "bought", "featured"] }).tabs).toEqual(["recent", "wishlist", "bought"]);
  });
  it("โชว์ชุดเฉพาะเมื่อในตะกร้ามีหมวด", () => {
    const set = normalizeRecsSet({ on: true, ifCats: ["bags"] });
    expect(recsSetFits(set, ["wallets"])).toBe(false);
    expect(recsSetFits(set, ["bags", "bags-tote"])).toBe(true);
    const cfg = normalizeCart({ recsSets: [{ on: true, ifCats: ["bags"], place: "bottom" }, { on: true, place: "bottom" }] });
    expect(recsAt(cfg, "bottom", true, ["wallets"]).length).toBe(1);
  });
  const ALL = [
    { id: "a", code: "A", slug: "a", price: 100, categories: ["bag-charms"], boughtWith: ["C", "B"] },
    { id: "b", code: "B", slug: "b", price: 100, categories: ["bags"] },
    { id: "c", code: "C", slug: "c", price: 100, categories: ["bag-charms"], featured: true },
    { id: "d", code: "D", slug: "d", price: 100, categories: ["bag-charms"], boughtWith: ["B"] },
  ];
  const base = { recsCodes: [], recsLimit: 6, recsFreeShip: false };
  it("ตามหมวด / ดูล่าสุด (ตามลำดับ · ข้ามของในตะกร้า) / ซื้อคู่กันบ่อย", () => {
    expect(pickCartRecs(ALL, ["d"], { ...base, recsSource: "category", recsCats: ["bag-charms"] }).map((p) => p.id)).toEqual(["c", "a"]);
    expect(pickCartRecs(ALL, ["d"], { ...base, recsSource: "recent", recsPick: ["c", "d", "b", "zzz"] }).map((p) => p.id)).toEqual(["c", "b"]);
    expect(pickCartRecs(ALL, ["a", "d"], { ...base, recsSource: "bought" }).map((p) => p.id)).toEqual(["b", "c"]);
    expect(pickCartRecs(ALL, ["b"], { ...base, recsSource: "bought" })).toEqual([]);
  });
});

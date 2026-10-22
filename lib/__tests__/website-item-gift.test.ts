import { describe, expect, it } from "vitest";
import { cleanItemGift, itemGiftLabel, priceItemGift } from "@/lib/website-item-gift";
import { DEFAULT_CART, normalizeCart, pickCartRecs, recsAt, recsSetFits, normalizeRecsSet } from "@/lib/website-cart";

const INFO = { gift_enabled: true, gift_fee: 50, card_enabled: true, card_fee: 20 };

describe("cleanItemGift", () => {
  it("ไม่ได้เลือก = null · ข้อความเฉพาะการ์ด", () => {
    expect(cleanItemGift(null)).toBeNull();
    expect(cleanItemGift({ wrap: false, card: false })).toBeNull();
    expect(cleanItemGift({ wrap: true, message: "x" })).toEqual({ wrap: true, card: false, message: "" });
    expect(cleanItemGift({ card: true, message: " สุขสันต์\r\nวันเกิด " })).toEqual({ wrap: false, card: true, message: "สุขสันต์\nวันเกิด" });
    expect(cleanItemGift({ card: true, message: "ก".repeat(400) })?.message.length).toBe(300);
  });
});

describe("priceItemGift", () => {
  it("ค่าห่อ × จำนวนชิ้น · การ์ด 1 ใบ/รายการ", () => {
    const r = priceItemGift({ wrap: true, card: true, message: "hi" }, 3, INFO);
    expect(r).toEqual({ ok: true, gift: { wrap: true, card: true, message: "hi", wrapFee: 150, cardFee: 20 } });
  });
  it("ร้านปิดบริการ = บอกให้เอาออก", () => {
    expect(priceItemGift({ wrap: true, card: false, message: "" }, 1, { ...INFO, gift_enabled: false }, "TTM130")).toMatchObject({ ok: false, error: expect.stringContaining("TTM130") });
    expect(priceItemGift({ wrap: false, card: true, message: "" }, 1, { ...INFO, card_enabled: false })).toMatchObject({ ok: false });
  });
  it("ไม่ได้เลือก = ไม่มีค่าบริการ", () => expect(priceItemGift(null, 2, INFO)).toEqual({ ok: true, gift: null }));
});

describe("itemGiftLabel", () => {
  it("ไทย/อังกฤษ", () => {
    expect(itemGiftLabel({ wrap: true, card: true })).toBe("🎀 ห่อของขวัญ · 💌 การ์ด");
    expect(itemGiftLabel({ wrap: false, card: true }, "en")).toBe("💌 Card");
  });
});

describe("ตะกร้า: ค่าใหม่ + สินค้าแนะนำตามหมวด", () => {
  it("ค่าเริ่มต้น = แบบเดิม", () => {
    const c = normalizeCart({});
    expect(c).toMatchObject({ pageLayout: "classic", pageBtn: "auto", select: false, showCategory: false, changeOption: false, personalize: false, memberBtn: false, giftMode: "order" });
    expect(c.recsSets[0]).toMatchObject({ cats: [], ifCats: [] });
    expect(DEFAULT_CART.giftMode).toBe("order");
  });
  it("อ่านค่าที่ตั้ง + กรองรหัสหมวด", () => {
    const c = normalizeCart({ pageLayout: "split", pageBtn: "button", giftMode: "item", select: true, recsSets: [{ source: "category", cats: ["Bag-Charms", "bad key!"], ifCats: ["bags"] }] });
    expect(c).toMatchObject({ pageLayout: "split", pageBtn: "button", giftMode: "item", select: true });
    expect(c.recsSets[0]).toMatchObject({ source: "category", cats: ["bag-charms"], ifCats: ["bags"] });
  });
  it("โชว์ชุดเฉพาะเมื่อในตะกร้ามีหมวด", () => {
    const set = normalizeRecsSet({ on: true, ifCats: ["bags"] });
    expect(recsSetFits(set, ["wallets"])).toBe(false);
    expect(recsSetFits(set, ["bags", "bags-tote"])).toBe(true);
    expect(recsSetFits(set)).toBe(true);
    const cfg = normalizeCart({ recsSets: [{ on: true, ifCats: ["bags"], place: "bottom" }, { on: true, place: "bottom" }] });
    expect(recsAt(cfg, "bottom", true, ["wallets"]).length).toBe(1);
    expect(recsAt(cfg, "bottom", true, ["bags"]).length).toBe(2);
  });
  it("pickCartRecs ตามหมวด: เฉพาะหมวดที่เลือก · แนะนำขึ้นก่อน · ไม่ซ้ำของในตะกร้า", () => {
    const all = [
      { id: "a", price: 100, categories: ["bag-charms"] },
      { id: "b", price: 100, categories: ["bags"] },
      { id: "c", price: 100, categories: ["bag-charms"], featured: true },
      { id: "d", price: 100, categories: ["bag-charms"] },
    ];
    const out = pickCartRecs(all, ["d"], { recsSource: "category", recsCodes: [], recsLimit: 6, recsFreeShip: false, recsCats: ["bag-charms"] });
    expect(out.map((p) => p.id)).toEqual(["c", "a"]);
  });
});

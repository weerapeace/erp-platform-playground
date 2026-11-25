import { describe, expect, it } from "vitest";
import type { Cat, CatsData, Purchase, Supply, Weight } from "@/lib/cats";
import { cleanCatBody } from "@/lib/cats";
import { DEFAULT_MEAL_PLAN } from "@/lib/cats-supplies";
import {
  anniversaries, knownShops, nextAnniversary, priceCheck, priceHistory, priceStats, setupSteps, shoppingList, shoppingText, sinceText, weightAlert,
} from "@/lib/cats-extras";
import { digestLines } from "@/lib/cats-notify";
import { buildCatBook, catBookBody, thDate } from "@/lib/cats-book";

const base = { is_active: true, created_at: "2026-11-01T01:00:00Z", updated_at: "2026-11-01T01:00:00Z", deleted_at: null };
const CAT1 = "11111111-1111-4111-8111-111111111111";
const CAT2 = "22222222-2222-4222-8222-222222222222";
const cat = (p: Partial<Cat>): Cat => ({ ...base, id: CAT1, name: "มะลิ", photo_r2_key: null, sex: "female", birth_date: null, adopted_date: null, breed: null, color: null, neutered: true, microchip: null, note: null, sort_order: 0, ...p });
const wt = (id: string, date: string, kg: number, catId = CAT1): Weight => ({ ...base, id, cat_id: catId, date, weight_kg: kg, note: null, created_at: `${date}T02:00:00Z` });
const sup = (p: Partial<Supply>): Supply => ({
  ...base, id: "s1", type: "dry_food", wet_kind: null, brand: "Royal Canin", flavor: "Indoor", unit: "bag",
  pack_size: 2000, pack_size_unit: "g", unit_size_g: null, units_per_pack: null, price: 600, price_per: "pack",
  daily_g: 100, pack_lasts_days: null, stock_base_qty: 0.5, stock_base_at: "2026-11-01T01:00:00Z",
  shop_url: "https://s.shopee.co.th/x", shop_name: "Pet Mall", cat_ids: null, note: null, sort_order: 0, ...p,
});
const buy = (p: Partial<Purchase>): Purchase => ({ ...base, id: "p1", supply_id: "s1", date: "2026-10-01", qty: 1, packs: null, price_paid: 600, shop_name: "Pet Mall", note: null, created_at: "2026-10-01T03:00:00Z", ...p });
const data = (p: Partial<CatsData>): CatsData => ({ cats: [], clinics: [], vaccinations: [], treatments: [], weights: [], supplies: [], purchases: [], vet_visits: [], expenses: [], ...p });

describe("เตือนน้ำหนัก", () => {
  it("ลดเกิน 5% จากครั้งก่อน = เตือน · ลดน้อยกว่า = ไม่เตือน", () => {
    expect(weightAlert([wt("a", "2026-11-01", 4.4), wt("b", "2026-11-20", 4.1)], CAT1, "2026-11-25")).toEqual({ kind: "drop", pct: 6.8, fromKg: 4.4, toKg: 4.1, date: "2026-11-20" });
    expect(weightAlert([wt("a", "2026-11-01", 4.4), wt("b", "2026-11-20", 4.3)], CAT1, "2026-11-25")).toBeNull();
  });
  it("ไม่ได้ชั่งเกิน 30 วัน = เตือน · ยังไม่เคยชั่ง = ไม่เตือน · ไม่ปนแมวตัวอื่น", () => {
    expect(weightAlert([wt("a", "2026-10-01", 4)], CAT1, "2026-11-25")).toEqual({ kind: "stale", days: 55, date: "2026-10-01" });
    expect(weightAlert([], CAT1, "2026-11-25")).toBeNull();
    expect(weightAlert([wt("a", "2026-11-01", 5, CAT2), wt("b", "2026-11-20", 3, CAT2)], CAT1, "2026-11-25")).toBeNull();
  });
});

describe("วันเกิด / วันรับเลี้ยง", () => {
  it("ครบรอบถัดไป: ปีนี้ถ้ายังไม่ผ่าน · ปีหน้าถ้าผ่านแล้ว · 29 ก.พ. ปีปกติ = 28 ก.พ.", () => {
    expect(nextAnniversary("2023-11-30", "2026-11-25")).toEqual({ date: "2026-11-30", years: 3 });
    expect(nextAnniversary("2023-03-12", "2026-11-25")).toEqual({ date: "2027-03-12", years: 4 });
    expect(nextAnniversary("2024-02-29", "2026-11-25")).toEqual({ date: "2027-02-28", years: 3 });
    expect(nextAnniversary("2027-01-01", "2026-11-25")).toBeNull();
  });
  it("ภายใน 7 วัน · ไม่นับปีแรก (0 ปี) · แมวที่ลบแล้วไม่ขึ้น", () => {
    const cats = [
      cat({ name: "ส้มโอ", birth_date: "2023-11-30" }),
      cat({ id: CAT2, name: "ใหม่", adopted_date: "2026-11-27" }),
      cat({ id: "x", name: "ลบแล้ว", birth_date: "2020-11-26", is_active: false }),
    ];
    const r = anniversaries(cats, "2026-11-25", 7);
    expect(r.map((a) => [a.catName, a.kind, a.daysLeft, a.years])).toEqual([["ส้มโอ", "birthday", 5, 3]]);
  });
  it("อยู่บ้านมานานเท่าไหร่", () => {
    expect(sinceText("2023-05-01", "2026-11-25")).toBe("3 ปี 6 เดือน");
    expect(sinceText("2026-11-10", "2026-11-25")).toBe("15 วัน");
    expect(cleanCatBody("cats", { name: "a", adopted_date: "2026-13-01" }, false).ok).toBe(false);
  });
});

describe("ประวัติราคา เทียบร้าน", () => {
  const s = sup({});
  const ps = [
    buy({ id: "p1", date: "2026-09-02", price_paid: 1120, qty: 2, shop_name: "PetHub" }),
    buy({ id: "p2", date: "2026-10-10", price_paid: 590, shop_name: "Pet Mall" }),
    buy({ id: "p3", date: "2026-11-20", price_paid: 645, shop_name: "Pet Mall" }),
    buy({ id: "p4", date: "2026-11-21", price_paid: null }),
  ];
  it("ราคาต่อถุง ใหม่สุดก่อน · ไม่นับใบที่ไม่มีราคา", () => {
    expect(priceHistory(s, ps).map((r) => [r.id, r.perPack])).toEqual([["p3", 645], ["p2", 590], ["p1", 560]]);
  });
  it("สรุป: ถูกสุด/แพงสุด/เฉลี่ย · เทียบร้าน (ราคาดีสุดของแต่ละร้าน)", () => {
    const st = priceStats(priceHistory(s, ps))!;
    expect([st.min.shop, st.max.perPack, st.avgPerPack]).toEqual(["PetHub", 645, 598]);
    expect(st.shops).toEqual([{ shop: "PetHub", bestPerPack: 560, count: 1 }, { shop: "Pet Mall", bestPerPack: 590, count: 2 }]);
  });
  it("อาหารเปียก: ต่อแพ็ค = ต่อชิ้น × ชิ้นต่อแพ็ค", () => {
    const w = sup({ id: "w", type: "wet_food", unit: "pouch", units_per_pack: 12, price: null });
    expect(priceHistory(w, [buy({ supply_id: "w", qty: 24, price_paid: 336 })])[0]).toMatchObject({ perUnit: 14, perPack: 168 });
  });
  it("ตอนซื้อเข้า: แพงกว่าครั้งก่อน ≥ 10% = เตือน · แก้ใบเดิมไม่เทียบกับตัวเอง", () => {
    expect(priceCheck(s, ps, 1, 720)).toMatchObject({ pctVsLast: 11.6, warn: true, lastPerPack: 645 });
    expect(priceCheck(s, ps, 1, 650)).toMatchObject({ warn: false });
    expect(priceCheck(s, ps, 1, 700, "p3")).toMatchObject({ lastPerPack: 590, pctVsLast: 18.6 });
    expect(priceCheck(s, [], 1, 700)).toBeNull();
  });
  it("ร้านที่เคยใช้: ร้านประจำก่อน · ไม่ซ้ำ", () => {
    expect(knownShops(s, [s], ps)).toEqual(["Pet Mall", "PetHub"]);
  });
});

describe("รายการต้องซื้อ", () => {
  it("เฉพาะของที่จะหมดในช่วง · ซื้อให้พอ 30 วัน ปัดเป็นถุงเต็ม · บอกร้านที่ถูกสุดเมื่อเคยซื้อหลายร้าน", () => {
    // เม็ด: เหลือ 0.5 ถุง (1000 กรัม) ใช้วันละ 100 → หมดใน 10 วัน · 30 วันต้องใช้ 1.5 ถุง − 0.5 = 1 ถุง
    const dry = sup({});
    const litter = sup({ id: "l", type: "litter", brand: "Kasty", flavor: null, pack_lasts_days: 10, stock_base_qty: 5, price: 149 }); // 50 วัน → ไม่ขึ้น
    const ps = [buy({ id: "a", shop_name: "PetHub", price_paid: 560, created_at: "2026-09-01T00:00:00Z" }), buy({ id: "b", price_paid: 600, created_at: "2026-09-02T00:00:00Z" })];
    const items = shoppingList({ supplies: [dry, litter], purchases: ps }, DEFAULT_MEAL_PLAN, "2026-11-01", 14, 30);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ daysLeft: 10, buyPacks: 1, packLabel: "1 ถุง", estCost: 600, shop: "Pet Mall", cheapest: { shop: "PetHub", perPack: 560 } });
    const text = shoppingText(items, "1 พ.ย. 69");
    expect(text).toContain("Royal Canin Indoor × 1 ถุง — หมดใน 10 วัน");
    expect(text).toContain("Pet Mall: https://s.shopee.co.th/x");
    expect(text).toContain("เคยถูกสุด: PetHub 560 บาท/ถุง");
    expect(text).toContain("รวมประมาณ 600 บาท");
  });
  it("ไม่มีของใกล้หมด = รายการว่าง", () => {
    expect(shoppingList({ supplies: [sup({ stock_base_qty: 10 })], purchases: [] }, DEFAULT_MEAL_PLAN, "2026-11-01")).toEqual([]);
    expect(shoppingText([], "x")).toBe("");
  });
});

describe("ตัวช่วยเริ่มต้น", () => {
  it("ขั้นที่ทำแล้วติ๊กเองจากข้อมูลจริง", () => {
    expect(setupSteps(data({}), {}).map((s) => s.done)).toEqual([false, false, false, false, false]);
    const d = data({ cats: [cat({})], supplies: [sup({})] });
    // มีแต่อาหารเม็ด → ข้ามตารางมื้อได้ · นับสต็อกแล้ว (0.5 ถุง)
    expect(setupSteps(d, {}).map((s) => s.done)).toEqual([true, true, true, true, false]);
    expect(setupSteps(d, { notify: { enabled: true, health_days: 3, supply_days: 7 } }).every((s) => s.done)).toBe(true);
    const wet = data({ cats: [cat({})], supplies: [sup({ type: "wet_food", wet_kind: "gravy", stock_base_qty: 0 })] });
    expect(setupSteps(wet, {}).map((s) => s.done)).toEqual([true, true, false, false, false]);
  });
});

describe("แจ้งเตือน LINE รอบ 5", () => {
  const notify = { enabled: true, health_days: 3, supply_days: 7 };
  it("น้ำหนักลด = เช้าหลังวันที่ชั่ง (ครั้งเดียว)", () => {
    const d = data({ cats: [cat({})], weights: [wt("a", "2026-11-01", 4.4), wt("b", "2026-11-24", 4.0)] });
    expect(digestLines(d, null, notify, "2026-11-25").map((l) => l.key)).toEqual([`w:${CAT1}`]);
    expect(digestLines(d, null, notify, "2026-11-26")).toEqual([]);
  });
  it("ไม่ได้ชั่ง: เตือนวันที่ 31 แล้วทุก 30 วัน", () => {
    const d = data({ cats: [cat({})], weights: [wt("a", "2026-10-01", 4)] });
    expect(digestLines(d, null, notify, "2026-11-01")).toHaveLength(1);
    expect(digestLines(d, null, notify, "2026-11-02")).toHaveLength(0);
    expect(digestLines(d, null, notify, "2026-12-01")).toHaveLength(1);
  });
  it("วันเกิด = เช้าวันนั้นเท่านั้น", () => {
    const d = data({ cats: [cat({ name: "ส้มโอ", birth_date: "2023-11-30" })] });
    expect(digestLines(d, null, notify, "2026-11-29")).toEqual([]);
    expect(digestLines(d, null, notify, "2026-11-30")[0].text).toBe(`🎂 วันนี้วันเกิด "ส้มโอ" ครบ 3 ขวบ`);
  });
});

describe("สมุดสุขภาพ", () => {
  it("วันที่แบบไทยย่อ", () => {
    expect(thDate("2026-11-25")).toBe("25 พ.ย. 69");
    expect(thDate(null)).toBe("—");
  });
  it("ใส่เฉพาะหัวข้อที่เลือก · กันอักขระพิเศษ · หลายตัว = หลายหน้า", () => {
    const c = cat({ name: "มะลิ <b>", microchip: "900123" });
    const d = data({ cats: [c], weights: [wt("a", "2026-10-01", 4), wt("b", "2026-11-01", 4.2)] });
    const body = catBookBody(c, d, new Set(["weights"]), "2026-11-25", null);
    expect(body).toContain("มะลิ &lt;b&gt;");
    expect(body).toContain("ไมโครชิป 900123");
    expect(body).toContain("<svg");
    expect(body).not.toContain("วัคซีน</div>");
    const html = buildCatBook([c, cat({ id: CAT2, name: "ส้มโอ" })], d, new Set(["vaccinations"]), "2026-11-25", () => null);
    expect(html.match(/class="doc-page"/g)).toHaveLength(2);
    expect(html).toContain("ยังไม่มีบันทึก");
  });
});

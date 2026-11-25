import { describe, expect, it } from "vitest";
import type { CatsData, Purchase, Supply } from "@/lib/cats";
import { cleanCatBody } from "@/lib/cats";
import { cleanMealPlan, cleanNotify, mealDaily, pricePerUnit, supplyStatus, wetKindSummary, DEFAULT_MEAL_PLAN, type MealPlan } from "@/lib/cats-supplies";
import { costEntries, monthlyTotals, monthSummary, shortMonthTh } from "@/lib/cats-costs";
import { digestLines, digestText } from "@/lib/cats-notify";

const base = { is_active: true, created_at: "2026-11-01T01:00:00Z", updated_at: "2026-11-01T01:00:00Z", deleted_at: null };
const CAT1 = "11111111-1111-4111-8111-111111111111";
const CAT2 = "22222222-2222-4222-8222-222222222222";
const sup = (p: Partial<Supply>): Supply => ({
  ...base, id: "s1", type: "dry_food", wet_kind: null, brand: "Royal Canin", flavor: null, unit: "bag",
  pack_size: 2000, pack_size_unit: "g", unit_size_g: null, units_per_pack: null, price: 1000, price_per: "pack",
  daily_g: 100, pack_lasts_days: null, stock_base_qty: 2, stock_base_at: "2026-11-01T01:00:00Z",
  shop_url: null, shop_name: null, cat_ids: null, note: null, sort_order: 0, ...p,
});
const buy = (p: Partial<Purchase>): Purchase => ({ ...base, id: "p1", supply_id: "s1", date: "2026-11-05", qty: 1, packs: null, price_paid: 1000, shop_name: null, note: null, created_at: "2026-11-05T03:00:00Z", ...p });
const plan = (gravy: number[], jelly: number[], pct = 100): MealPlan => ({ meals: gravy.map((g, i) => ({ key: `m${i}`, label: `มื้อ${i}`, gravy: g, jelly: jelly[i] ?? 0 })), dry_ratio_pct: pct });

describe("ตารางมื้อ", () => {
  it("รวมชิ้นต่อวันแยกเกรวี่/เจลลี่ (ตัวอย่างในสเปก)", () => {
    expect(mealDaily(plan([0, 0.5, 1], [1, 1, 0]))).toEqual({ gravy: 1.5, jelly: 2 });
  });
  it("ตรวจตารางมื้อ: ปัดทีละครึ่ง · ห้ามชื่อว่าง · ไม่เกิน 8 มื้อ", () => {
    const r = cleanMealPlan({ meals: [{ label: "เช้า", gravy: 0.7, jelly: -1 }], dry_ratio_pct: 150 });
    expect(r.ok && r.value).toEqual({ meals: [{ key: "m1", label: "เช้า", gravy: 0.5, jelly: 0 }], dry_ratio_pct: 100 });
    expect(cleanMealPlan({ meals: [{ label: " " }] }).ok).toBe(false);
    expect(cleanMealPlan({ meals: Array(9).fill({ label: "x" }) }).ok).toBe(false);
  });
});

describe("สต็อก / วันหมด / ต่อเดือน", () => {
  it("อาหารเม็ด: 2 ถุง×2000 กรัม ใช้วันละ 100 กรัม → 40 วัน · ค่าต่อเดือน 1,500", () => {
    const s = sup({});
    const st = supplyStatus(s, [], DEFAULT_MEAL_PLAN, [s], "2026-11-01");
    expect(st.remaining).toBe(2);
    expect(st.daysLeft).toBe(40);
    expect(st.runOut).toBe("2026-12-11");
    expect(st.monthlyPacks).toBe(2);
    expect(st.monthlyCost).toBe(1500);
  });
  it("ผ่านไป 10 วัน = ใช้ไป 0.5 ถุง · ซื้อเข้าหลังนับบวกเพิ่ม · ซื้อก่อนนับไม่นับซ้ำ · ใบที่ลบไม่นับ", () => {
    const s = sup({});
    const ps = [buy({}), buy({ id: "p0", created_at: "2026-10-30T00:00:00Z" }), buy({ id: "px", is_active: false })];
    const st = supplyStatus(s, ps, DEFAULT_MEAL_PLAN, [s], "2026-11-11");
    expect(st.remaining).toBe(2.5);
    expect(st.daysLeft).toBe(50);
  });
  it("สต็อกไม่ติดลบ", () => {
    const s = sup({ stock_base_qty: 0.1 });
    expect(supplyStatus(s, [], DEFAULT_MEAL_PLAN, [s], "2026-12-30").remaining).toBe(0);
  });
  it("ให้อาหารเปียกด้วย → อาหารเม็ดเหลือตาม %", () => {
    const s = sup({});
    const st = supplyStatus(s, [], plan([1], [0], 50), [s], "2026-11-01");
    expect(st.daily).toBeCloseTo(0.025);
    expect(st.daysLeft).toBe(80);
  });
  it("อาหารเปียก: ราคาแพ็ค 12 ซอง 240 บาท → ซองละ 20 · 2 ซอง/วัน → 60 ซอง/เดือน = 5 แพ็ค ฿1,200", () => {
    const s = sup({ id: "w1", type: "wet_food", wet_kind: "jelly", unit: "pouch", units_per_pack: 12, price: 240, price_per: "pack", stock_base_qty: 7, daily_g: null, pack_size: null });
    expect(pricePerUnit(s)).toBe(20);
    const st = supplyStatus(s, [], plan([0, 0], [1, 1]), [s], "2026-11-01");
    expect(st.daysLeft).toBe(3);
    expect(st.monthlyUnits).toBe(60);
    expect(st.monthlyPacks).toBe(5);
    expect(st.monthlyCost).toBe(1200);
  });
  it("เปียกชนิดเดียวกันหลายยี่ห้อ แบ่งการใช้เท่ากัน · สรุปรวมตามชนิด", () => {
    const a = sup({ id: "a", type: "wet_food", wet_kind: "gravy", stock_base_qty: 10, price: 15, price_per: "piece" });
    const b = sup({ id: "b", type: "wet_food", wet_kind: "gravy", stock_base_qty: 5, price: 15, price_per: "piece" });
    const p = plan([1, 1], [0, 0]);
    expect(supplyStatus(a, [], p, [a, b], "2026-11-01").daily).toBe(1);
    const sum = wetKindSummary([a, b], [], p, "2026-11-03");
    expect(sum.gravy).toEqual({ remaining: 11, daily: 2, daysLeft: 5, count: 2 });
    expect(sum.jelly.daysLeft).toBeNull();
  });
  it("ทราย: 1 ถุงใช้ 15 วัน · 2 ถุง → 30 วัน · ต่อเดือน 2 ถุง", () => {
    const s = sup({ type: "litter", pack_size: 6, pack_size_unit: "L", pack_lasts_days: 15, price: 195, daily_g: null });
    const st = supplyStatus(s, [], DEFAULT_MEAL_PLAN, [s], "2026-11-01");
    expect(st.daysLeft).toBe(30);
    expect(st.monthlyPacks).toBe(2);
    expect(st.monthlyCost).toBe(390);
  });
  it("ยังตั้งไม่ครบ → บอกช่องที่ขาด", () => {
    const s = sup({ daily_g: null, price: null });
    expect(supplyStatus(s, [], DEFAULT_MEAL_PLAN, [s], "2026-11-01").missing).toEqual(["กรัมต่อวัน", "ราคา"]);
  });
  it("ตรวจค่าของใช้: เปียกต้องเลือกเกรวี่/เจลลี่ · ลิงก์ต้อง https · ชนิดอื่นล้าง wet_kind", () => {
    expect(cleanCatBody("supplies", { type: "wet_food", brand: "x" }, false).ok).toBe(false);
    expect(cleanCatBody("supplies", { type: "dry_food", brand: "x", shop_url: "shopee.co.th" }, false).ok).toBe(false);
    const r = cleanCatBody("supplies", { type: "litter", brand: "x", wet_kind: "gravy", cat_ids: [CAT1, CAT1, "bad"] }, false);
    expect(r.ok && r.patch.wet_kind).toBeNull();
    expect(r.ok && r.patch.cat_ids).toEqual([CAT1]);
  });
});

const cat = (id: string, name: string, active = true) => ({ ...base, id, name, is_active: active, photo_r2_key: null, sex: null, birth_date: null, adopted_date: null, breed: null, color: null, neutered: false, microchip: null, note: null, sort_order: 0 });
const emptyData = (): CatsData => ({ cats: [cat(CAT1, "มะลิ"), cat(CAT2, "ข้าวตู")], clinics: [], vaccinations: [], treatments: [], weights: [], supplies: [], purchases: [], vet_visits: [], expenses: [] });

describe("สรุปค่าใช้จ่าย", () => {
  it("รวมทุกแหล่ง แยกหมวด แยกแมว (ส่วนกลางแบ่งเท่ากัน)", () => {
    const d = emptyData();
    d.supplies = [sup({})];
    d.purchases = [buy({ price_paid: 1000 })];
    d.vaccinations = [{ ...base, id: "v", cat_id: CAT1, vaccine_name: "FVRCP", date_given: "2026-11-10", clinic_id: null, next_due_date: null, cost: 600, note: null }];
    d.vet_visits = [{ ...base, id: "h", cat_id: CAT2, date: "2026-11-12", clinic_id: null, symptoms: null, diagnosis: "หวัด", medicines: null, cost: 800, receipt_r2_key: null, note: null }];
    d.expenses = [{ ...base, id: "e", cat_id: null, category: "snack", date: "2026-11-20", amount: 200, note: "ขนม" }, { ...base, id: "e2", cat_id: CAT1, category: "toy", date: "2026-10-02", amount: 99, note: null }];
    const all = costEntries(d);
    const s = monthSummary(all, "2026-11", [CAT1, CAT2]);
    expect(s.total).toBe(2600);
    expect(s.byCategory.map((c) => [c.category, c.amount])).toEqual([["dry_food", 1000], ["vaccine", 600], ["vet", 800], ["snack", 200]]);
    expect(Object.fromEntries(s.byCat.map((c) => [c.catId, c.amount]))).toEqual({ [CAT1]: 1200, [CAT2]: 1400 });
    expect(monthlyTotals(all, "2026-11", 2)).toEqual([{ ym: "2026-10", total: 99 }, { ym: "2026-11", total: 2600 }]);
  });
  it("ไม่นับรายการที่ลบ / ไม่มีเงิน · ของใช้ระบุแมว แบ่งเฉพาะแมวนั้น", () => {
    const d = emptyData();
    d.supplies = [sup({ cat_ids: [CAT2] })];
    d.purchases = [buy({ price_paid: 500 }), buy({ id: "p2", price_paid: 300, is_active: false }), buy({ id: "p3", price_paid: null })];
    const s = monthSummary(costEntries(d), "2026-11", [CAT1, CAT2]);
    expect(s.total).toBe(500);
    expect(s.byCat).toEqual([{ catId: CAT2, amount: 500 }]);
  });
  it("ชื่อเดือนไทย", () => { expect(shortMonthTh("2026-11")).toBe("พ.ย. 69"); });
});

describe("ข้อความเตือน LINE", () => {
  const notify = { enabled: true, health_days: 3, supply_days: 7 };
  it("ส่งเฉพาะวันที่ถึงจุดเตือน (3 วัน / พรุ่งนี้ / วันนี้) · ของหมดเตือนที่ 7/3/1/0 วัน + ลิงก์ร้าน", () => {
    const d = emptyData();
    d.treatments = [{ ...base, id: "t", cat_id: CAT1, type: "flea", product: "Revolution", date_given: "2026-10-28", interval_days: 30, next_due_date: "2026-11-27", cost: null, note: null }];
    const s = sup({ stock_base_qty: 0.35, stock_base_at: "2026-11-24T01:00:00Z", shop_url: "https://shopee.co.th/x" });   // 0.35 ถุง / 0.05 ต่อวัน = 7 วัน
    d.supplies = [s];
    const lines = digestLines(d, null, notify, "2026-11-24");
    expect(lines.map((l) => l.key)).toEqual(["t:t", "s:s1"]);
    expect(lines[1].url).toBe("https://shopee.co.th/x");
    expect(digestLines(d, null, notify, "2026-11-25")).toEqual([]);   // 2 วัน / 6 วัน = ไม่ใช่จุดเตือน
    expect(digestLines(d, null, notify, "2026-12-01").map((l) => l.key)).toEqual(["s:s1"]);   // หมดวันนี้
    expect(digestLines(d, null, notify, "2026-12-03")).toEqual([]);   // หมดมาแล้ว 2 วัน = ไม่เตือนซ้ำ
    const txt = digestText(lines, "2026-11-24", "https://erp.example/")!;
    expect(txt).toContain("มะลิ — ยาหยดกันเห็บหมัด · Revolution 27/11/2026 (อีก 3 วัน)");
    expect(txt).toContain("สั่งซื้อ: https://shopee.co.th/x");
    expect(txt.endsWith("https://erp.example/misc/cats")).toBe(true);
  });
  it("ทดสอบ = ทุกเรื่องในช่วงเตือน · ไม่มีเรื่อง = ไม่ส่ง", () => {
    const d = emptyData();
    d.vaccinations = [{ ...base, id: "v", cat_id: CAT2, vaccine_name: "FVRCP", date_given: "2025-11-26", clinic_id: null, next_due_date: "2026-11-26", cost: null, note: null }];
    expect(digestLines(d, null, notify, "2026-11-24", false)).toEqual([]);
    expect(digestLines(d, null, notify, "2026-11-24", true)).toHaveLength(1);
    expect(digestText([], "2026-11-24", "x")).toBeNull();
  });
  it("ค่าตั้งเตือน 1–30 วัน", () => {
    expect(cleanNotify({ enabled: true, health_days: 0 }).ok).toBe(false);
    expect(cleanNotify({ enabled: "yes", health_days: 5, supply_days: 10 })).toEqual({ ok: true, value: { enabled: false, health_days: 5, supply_days: 10 } });
  });
});

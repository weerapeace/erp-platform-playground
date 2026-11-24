/**
 * 🐾 ทะเบียนแมว — กติกาอาหาร / ทราย / สต็อก (pure · ใช้ทั้ง API และหน้าเว็บ · ที่เดียว)
 *
 * สต็อกไม่ต้องตัดเอง:
 *   คงเหลือ = นับล่าสุด (stock_base_qty ณ stock_base_at) + ซื้อเข้าที่บันทึกหลังจากนั้น − ใช้ต่อวัน × จำนวนวันตั้งแต่นับ
 *   หน่วยสต็อก: อาหารเม็ด/ทราย = ถุง (ใส่ 1.5 ได้) · อาหารเปียก = ชิ้น (ซอง/กระป๋อง)
 * ใช้ต่อวัน:
 *   อาหารเม็ด = กรัมต่อวัน ÷ กรัมต่อถุง (ถ้าให้อาหารเปียกด้วย ลดเหลือ dry_ratio_pct %)
 *   อาหารเปียก = ผลรวมตารางมื้อของชนิดนั้น (เกรวี่ / เจลลี่) — ถ้ามีหลายยี่ห้อชนิดเดียวกัน แบ่งเท่ากัน
 *   ทราย = 1 ÷ (1 ถุงใช้ได้กี่วัน)
 * ต่อเดือน (30 วัน): ใช้กี่หน่วย · ต้องซื้อกี่แพ็ค (ปัดขึ้น) · ค่าใช้จ่าย = ใช้ต่อวัน × 30 × ราคาต่อหน่วย
 * คู่มือ docs/cat-registry.md
 */
import { daysBetween, type Purchase, type Supply, type WetKind } from "@/lib/cats";

// ─── ตารางมื้อ (อาหารเปียก · กองกลางรวมทุกตัว) ─────────────────────────────
export type Meal = { key: string; label: string; gravy: number; jelly: number };
export type MealPlan = { meals: Meal[]; dry_ratio_pct: number };

export const DEFAULT_MEAL_PLAN: MealPlan = {
  meals: [
    { key: "morning", label: "เช้า", gravy: 0, jelly: 0 },
    { key: "noon", label: "เที่ยง", gravy: 0, jelly: 0 },
    { key: "evening", label: "เย็น", gravy: 0, jelly: 0 },
  ],
  dry_ratio_pct: 100,
};

const halfStep = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(50, Math.round(n * 2) / 2);   // ครึ่งชิ้นได้ · สูงสุด 50 ชิ้นต่อมื้อ
};

/** ตรวจตารางมื้อที่ส่งมา (ชื่อมื้อ 1-20 ตัวอักษร · สูงสุด 8 มื้อ · จำนวนปัดทีละครึ่ง) */
export function cleanMealPlan(raw: unknown): { ok: true; value: MealPlan } | { ok: false; error: string } {
  const r = (raw ?? {}) as Partial<MealPlan>;
  if (!Array.isArray(r.meals)) return { ok: false, error: "ตารางมื้อไม่ถูกต้อง" };
  if (r.meals.length > 8) return { ok: false, error: "ตั้งได้ไม่เกิน 8 มื้อ" };
  const meals: Meal[] = [];
  for (const [i, m] of r.meals.entries()) {
    const label = String(m?.label ?? "").trim().slice(0, 20);
    if (!label) return { ok: false, error: `ตั้งชื่อมื้อที่ ${i + 1}` };
    const key = String(m?.key ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || `m${i + 1}`;
    meals.push({ key, label, gravy: halfStep(m?.gravy), jelly: halfStep(m?.jelly) });
  }
  const pct = Number(r.dry_ratio_pct ?? 100);
  const dry_ratio_pct = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 100;
  return { ok: true, value: { meals, dry_ratio_pct } };
}

export function asMealPlan(v: unknown): MealPlan {
  const r = cleanMealPlan(v);
  return r.ok ? r.value : DEFAULT_MEAL_PLAN;
}

/** ชิ้นต่อวันของแต่ละชนิด (ผลรวมทุกมื้อ) */
export function mealDaily(plan: MealPlan): Record<WetKind, number> {
  return plan.meals.reduce((a, m) => ({ gravy: a.gravy + m.gravy, jelly: a.jelly + m.jelly }), { gravy: 0, jelly: 0 });
}

// ─── ของใช้ 1 ตัว ───────────────────────────────────────────────────────
/** วันที่ (เวลาไทย) ของ timestamp */
export const bkkDate = (iso: string) => new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 10);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** กรัมต่อถุง (อาหารเม็ด) */
export function gramsPerPack(s: Supply): number | null {
  if (!s.pack_size) return null;
  if (s.pack_size_unit === "kg") return s.pack_size * 1000;
  if (s.pack_size_unit === "g" || !s.pack_size_unit) return s.pack_size;
  return null;   // ลิตร = แปลงเป็นกรัมไม่ได้
}

/** ราคาต่อ "หน่วยสต็อก" (ถุง หรือ ชิ้น) */
export function pricePerUnit(s: Supply): number | null {
  if (s.price == null) return null;
  if (s.type !== "wet_food") return Number(s.price);
  if (s.price_per === "piece") return Number(s.price);
  return s.units_per_pack ? Number(s.price) / s.units_per_pack : null;
}

/** ใช้ต่อวัน (หน่วยสต็อก) — null = ยังตั้งไม่ครบ */
export function supplyDaily(s: Supply, plan: MealPlan, all: Supply[]): number | null {
  if (s.type === "dry_food") {
    const g = gramsPerPack(s);
    if (!g || s.daily_g == null) return null;
    const wet = mealDaily(plan);
    const ratio = wet.gravy + wet.jelly > 0 ? plan.dry_ratio_pct / 100 : 1;
    return (Number(s.daily_g) * ratio) / g;
  }
  if (s.type === "litter") return s.pack_lasts_days ? 1 / Number(s.pack_lasts_days) : null;
  if (!s.wet_kind) return null;
  const same = all.filter((x) => x.is_active && x.type === "wet_food" && x.wet_kind === s.wet_kind).length || 1;
  return mealDaily(plan)[s.wet_kind] / same;
}

/** ซื้อเข้าที่นับรวมสต็อก = ใบที่ยังใช้งาน และบันทึกหลังนับสต็อกล่าสุด */
export function purchasesAfterBase(s: Supply, purchases: Purchase[]): Purchase[] {
  const base = Date.parse(s.stock_base_at);
  return purchases.filter((p) => p.is_active && p.supply_id === s.id && Date.parse(p.created_at) > base);
}

export type SupplyStatus = {
  remaining: number;          // หน่วยสต็อก (ไม่ติดลบ)
  daily: number | null;
  daysLeft: number | null;    // null = ไม่รู้ (ยังตั้งไม่ครบ / ไม่ได้ใช้) · ไม่ติดลบ
  daysLeftRaw: number | null; // ติดลบได้ = หมดมาแล้วกี่วัน (แจ้งเตือนใช้ตัวนี้ จะได้ไม่เตือนซ้ำทุกวันหลังหมด)
  runOut: string | null;      // วันที่คาดว่าหมด (YYYY-MM-DD · อาจเป็นวันที่ผ่านมาแล้ว)
  monthlyUnits: number | null;
  monthlyPacks: number | null; // ต้องซื้อกี่แพ็ค/ถุงต่อเดือน (ปัดขึ้น)
  monthlyCost: number | null;
  missing: string[];          // ช่องที่ยังไม่ได้ตั้ง (บอกผู้ใช้)
};

export function supplyStatus(s: Supply, purchases: Purchase[], plan: MealPlan, all: Supply[], today: string): SupplyStatus {
  const daily = supplyDaily(s, plan, all);
  const bought = purchasesAfterBase(s, purchases).reduce((n, p) => n + Number(p.qty), 0);
  const days = Math.max(0, daysBetween(bkkDate(s.stock_base_at), today));
  const unclamped = Number(s.stock_base_qty) + bought - (daily ?? 0) * days;
  const remaining = Math.max(0, r2(unclamped));
  const daysLeftRaw = daily && daily > 0 ? Math.floor(unclamped / daily + 1e-9) : null;
  const daysLeft = daysLeftRaw == null ? null : Math.max(0, daysLeftRaw);
  const runOut = daysLeftRaw == null ? null : addDays(today, daysLeftRaw);
  const monthlyUnits = daily == null ? null : r2(daily * 30);
  const perPack = s.type === "wet_food" ? (s.units_per_pack || 1) : 1;
  const monthlyPacks = monthlyUnits == null ? null : Math.ceil(monthlyUnits / perPack - 1e-9);
  const ppu = pricePerUnit(s);
  const monthlyCost = monthlyUnits == null || ppu == null ? null : Math.round(monthlyUnits * ppu);
  const missing: string[] = [];
  if (s.type === "dry_food") { if (!gramsPerPack(s)) missing.push("ขนาดถุง (กรัม)"); if (s.daily_g == null) missing.push("กรัมต่อวัน"); }
  if (s.type === "litter" && !s.pack_lasts_days) missing.push("1 ถุงใช้ได้กี่วัน");
  if (s.type === "wet_food" && daily === 0) missing.push("ตารางมื้อ");
  if (s.price == null) missing.push("ราคา");
  return { remaining, daily, daysLeft, daysLeftRaw, runOut, monthlyUnits, monthlyPacks, monthlyCost, missing };
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** อาหารเปียกรวมตามชนิด (เกรวี่ / เจลลี่) — หน้าสต็อกแสดงแยก */
export function wetKindSummary(supplies: Supply[], purchases: Purchase[], plan: MealPlan, today: string): Record<WetKind, { remaining: number; daily: number; daysLeft: number | null; count: number }> {
  const daily = mealDaily(plan);
  const out = { gravy: { remaining: 0, daily: daily.gravy, daysLeft: null as number | null, count: 0 }, jelly: { remaining: 0, daily: daily.jelly, daysLeft: null as number | null, count: 0 } };
  const active = supplies.filter((s) => s.is_active);
  for (const s of active) {
    if (s.type !== "wet_food" || !s.wet_kind) continue;
    out[s.wet_kind].remaining = r2(out[s.wet_kind].remaining + supplyStatus(s, purchases, plan, active, today).remaining);
    out[s.wet_kind].count += 1;
  }
  for (const k of ["gravy", "jelly"] as const) out[k].daysLeft = out[k].daily > 0 ? Math.floor(out[k].remaining / out[k].daily + 1e-9) : null;
  return out;
}

/** หน่วยสต็อกของของชิ้นนี้ (ป้าย) */
export function stockUnitLabel(s: Pick<Supply, "type" | "unit">): string {
  if (s.type !== "wet_food") return "ถุง";
  return s.unit === "can" ? "กระป๋อง" : "ซอง";
}

/** จำนวนแบบอ่านง่าย (ไม่มีทศนิยมเกินจำเป็น) */
export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, ""));

/** ค่าเริ่มของราคาที่จ่าย ตอนกดซื้อเข้า (แก้ได้) */
export function suggestPricePaid(s: Supply, qtyUnits: number): number | null {
  const ppu = pricePerUnit(s);
  return ppu == null ? null : Math.round(ppu * qtyUnits * 100) / 100;
}

// ─── แจ้งเตือน (ค่าตั้ง) ────────────────────────────────────────────────
export type NotifySettings = { enabled: boolean; health_days: number; supply_days: number };
export const DEFAULT_NOTIFY: NotifySettings = { enabled: false, health_days: 3, supply_days: 7 };

export function cleanNotify(raw: unknown): { ok: true; value: NotifySettings } | { ok: false; error: string } {
  const r = (raw ?? {}) as Partial<NotifySettings>;
  const hd = Math.round(Number(r.health_days ?? DEFAULT_NOTIFY.health_days));
  const sd = Math.round(Number(r.supply_days ?? DEFAULT_NOTIFY.supply_days));
  if (!Number.isFinite(hd) || hd < 1 || hd > 30) return { ok: false, error: "เตือนวัคซีน/ยาล่วงหน้าได้ 1–30 วัน" };
  if (!Number.isFinite(sd) || sd < 1 || sd > 30) return { ok: false, error: "เตือนของใกล้หมดล่วงหน้าได้ 1–30 วัน" };
  return { ok: true, value: { enabled: r.enabled === true, health_days: hd, supply_days: sd } };
}

export function asNotify(v: unknown): NotifySettings {
  const r = cleanNotify(v);
  return r.ok ? r.value : DEFAULT_NOTIFY;
}

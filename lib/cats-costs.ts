/**
 * 🐾 ทะเบียนแมว — สรุปค่าใช้จ่าย (pure · ที่เดียว)
 *   รวมจาก: ซื้อเข้า (อาหารเม็ด/เปียก/ทราย) · วัคซีน · ยา · หาหมอ · ค่าใช้จ่ายอื่น (ขนม/ของเล่น/อาบน้ำตัดขน/ค่าหมอ/อื่นๆ)
 *   แยกตามแมว: รายการของแมวตัวเดียว = ตัวนั้น · ของใช้ที่ระบุแมว = แบ่งเท่ากันตามรายชื่อ · ส่วนกลาง (ไม่ระบุ) = แบ่งเท่ากันทุกตัวที่ยังอยู่
 * คู่มือ docs/cat-registry.md
 */
import { EXPENSE_CATEGORY_LABEL, SUPPLY_TYPE_LABEL, TREATMENT_LABEL, type CatsData, type ExpenseCategory, type SupplyType } from "@/lib/cats";

export type CostCategory = SupplyType | "vaccine" | "meds" | ExpenseCategory;
export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  ...SUPPLY_TYPE_LABEL, vaccine: "วัคซีน", meds: "ยา", ...EXPENSE_CATEGORY_LABEL,
};
export const COST_CATEGORY_ORDER: CostCategory[] = ["dry_food", "wet_food", "litter", "vaccine", "meds", "vet", "snack", "toy", "grooming", "other"];

export type CostEntry = {
  key: string;
  date: string;
  amount: number;
  category: CostCategory;
  catIds: string[] | null;    // null = ส่วนกลาง
  label: string;
  source: { kind: "purchases" | "vaccinations" | "treatments" | "vet_visits" | "expenses"; id: string };
};

/** รายการค่าใช้จ่ายทั้งหมด (เฉพาะที่มีจำนวนเงิน > 0 และยังไม่ลบ) */
export function costEntries(d: CatsData): CostEntry[] {
  const out: CostEntry[] = [];
  const supply = new Map(d.supplies.map((s) => [s.id, s]));
  for (const p of d.purchases) {
    const s = supply.get(p.supply_id);
    if (!p.is_active || !s || !(Number(p.price_paid) > 0)) continue;
    out.push({ key: `p:${p.id}`, date: p.date, amount: Number(p.price_paid), category: s.type, catIds: s.cat_ids?.length ? s.cat_ids : null, label: [s.brand, s.flavor].filter(Boolean).join(" "), source: { kind: "purchases", id: p.id } });
  }
  for (const v of d.vaccinations) if (v.is_active && Number(v.cost) > 0) out.push({ key: `v:${v.id}`, date: v.date_given, amount: Number(v.cost), category: "vaccine", catIds: [v.cat_id], label: v.vaccine_name, source: { kind: "vaccinations", id: v.id } });
  for (const t of d.treatments) if (t.is_active && Number(t.cost) > 0) out.push({ key: `t:${t.id}`, date: t.date_given, amount: Number(t.cost), category: "meds", catIds: [t.cat_id], label: `${TREATMENT_LABEL[t.type]} ${t.product}`, source: { kind: "treatments", id: t.id } });
  for (const x of d.vet_visits) if (x.is_active && Number(x.cost) > 0) out.push({ key: `h:${x.id}`, date: x.date, amount: Number(x.cost), category: "vet", catIds: [x.cat_id], label: x.diagnosis || x.symptoms || "หาหมอ", source: { kind: "vet_visits", id: x.id } });
  for (const e of d.expenses) if (e.is_active && Number(e.amount) > 0) out.push({ key: `e:${e.id}`, date: e.date, amount: Number(e.amount), category: e.category, catIds: e.cat_id ? [e.cat_id] : null, label: e.note || EXPENSE_CATEGORY_LABEL[e.category], source: { kind: "expenses", id: e.id } });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export type MonthSummary = {
  total: number;
  byCategory: { category: CostCategory; amount: number }[];
  byCat: { catId: string | null; amount: number }[];   // catId null = ส่วนของแมวที่ลบไปแล้ว
  entries: CostEntry[];
};

/** สรุปเดือน ym ("YYYY-MM") · activeCatIds = แมวที่ยังอยู่ (ใช้แบ่งส่วนกลาง) */
export function monthSummary(all: CostEntry[], ym: string, activeCatIds: string[]): MonthSummary {
  const entries = all.filter((e) => e.date.slice(0, 7) === ym);
  const cat = new Map<CostCategory, number>();
  const per = new Map<string | null, number>();
  const active = new Set(activeCatIds);
  for (const e of entries) {
    cat.set(e.category, (cat.get(e.category) ?? 0) + e.amount);
    const targets = (e.catIds ?? activeCatIds).filter((id) => active.has(id));
    if (!targets.length) { per.set(null, (per.get(null) ?? 0) + e.amount); continue; }
    const share = e.amount / targets.length;
    for (const id of targets) per.set(id, (per.get(id) ?? 0) + share);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total: round(entries.reduce((n, e) => n + e.amount, 0)),
    byCategory: COST_CATEGORY_ORDER.filter((c) => cat.has(c)).map((c) => ({ category: c, amount: round(cat.get(c)!) })),
    byCat: [...per.entries()].map(([catId, amount]) => ({ catId, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    entries,
  };
}

/** ยอดรวมย้อนหลัง n เดือน (เก่า → ใหม่) สำหรับกราฟแท่ง */
export function monthlyTotals(all: CostEntry[], endYm: string, n = 6): { ym: string; total: number }[] {
  const [y, m] = endYm.split("-").map(Number);
  const out: { ym: string; total: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const ym = d.toISOString().slice(0, 7);
    out.push({ ym, total: Math.round(all.filter((e) => e.date.slice(0, 7) === ym).reduce((s, e) => s + e.amount, 0)) });
  }
  return out;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-11" → "พ.ย. 69" */
export function shortMonthTh(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

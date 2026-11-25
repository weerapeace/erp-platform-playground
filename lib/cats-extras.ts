/**
 * 🐾 ทะเบียนแมว รอบ 5 — กติกาเสริม (pure · ใช้ทั้ง API / แจ้งเตือน LINE / หน้าเว็บ · ทดสอบได้)
 *   weightAlert   = น้ำหนักลดผิดปกติ (ลดเกิน 5% จากครั้งก่อน) · ไม่ได้ชั่งนานเกิน 30 วัน
 *   anniversaries = วันเกิด / วันรับเลี้ยง ที่ใกล้ถึง (ทุกปี · 29 ก.พ. ปีปกติ = 28 ก.พ.)
 *   shoppingList  = รายการต้องซื้อ: ของที่จะหมดใน N วัน + ซื้อกี่แพ็คให้พอใช้ M วัน + ร้านที่เคยขายถูกสุด
 *   priceHistory / priceCheck = ประวัติราคาต่อชิ้น เทียบร้าน · เตือนเมื่อแพงกว่าครั้งก่อน
 *   setupSteps    = ตัวช่วยเริ่มต้น (ขั้นไหนทำแล้ว คำนวณจากข้อมูลจริง ไม่ต้องเก็บสถานะ)
 * คู่มือ docs/cat-registry.md
 */
import { daysBetween, type Cat, type CatsData, type Purchase, type Supply, type Weight } from "@/lib/cats";
import { asNotify, fmtQty, pricePerUnit, stockUnitLabel, supplyStatus, type MealPlan } from "@/lib/cats-supplies";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── น้ำหนัก ──────────────────────────────────────────────────────────────
export const WEIGHT_DROP_PCT = 5;
export const WEIGHT_STALE_DAYS = 30;

export type WeightAlert =
  | { kind: "drop"; pct: number; fromKg: number; toKg: number; date: string }
  | { kind: "stale"; days: number; date: string };

/** เทียบครั้งล่าสุดกับครั้งก่อน · ยังไม่เคยชั่ง = ไม่เตือน (ไม่มีอะไรให้เทียบ) */
export function weightAlert(weights: Weight[], catId: string, today: string): WeightAlert | null {
  const rows = weights.filter((w) => w.is_active && w.cat_id === catId)
    .sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  if (prev && Number(prev.weight_kg) > 0) {
    const pct = ((Number(prev.weight_kg) - Number(last.weight_kg)) / Number(prev.weight_kg)) * 100;
    if (pct >= WEIGHT_DROP_PCT - 1e-9) return { kind: "drop", pct: Math.round(pct * 10) / 10, fromKg: Number(prev.weight_kg), toKg: Number(last.weight_kg), date: last.date };
  }
  const days = daysBetween(last.date, today);
  if (days > WEIGHT_STALE_DAYS) return { kind: "stale", days, date: last.date };
  return null;
}

export function weightAlertText(a: WeightAlert): string {
  return a.kind === "drop"
    ? `น้ำหนักลด ${a.pct}% (${a.fromKg} → ${a.toKg} กก.)`
    : `ไม่ได้ชั่งมา ${a.days} วัน`;
}

// ─── วันเกิด / วันรับเลี้ยง ────────────────────────────────────────────────
export type Anniversary = { key: string; catId: string; catName: string; kind: "birthday" | "adopted"; date: string; daysLeft: number; years: number };

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** วันครบรอบครั้งถัดไป (รวมวันนี้) ของวันที่ต้นทาง */
export function nextAnniversary(origin: string, today: string): { date: string; years: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(origin) || origin > today) return null;
  const [oy, om, od] = origin.split("-").map(Number);
  const ty = Number(today.slice(0, 4));
  for (const y of [ty, ty + 1]) {
    const d = om === 2 && od === 29 && !isLeap(y) ? 28 : od;
    const date = ymd(y, om, d);
    if (date >= today) return { date, years: y - oy };
  }
  return null;
}

/** ครบรอบภายใน withinDays วัน (0 = เฉพาะวันนี้) เรียงใกล้สุดก่อน · ปีแรก (0 ปี) ไม่นับ */
export function anniversaries(cats: Cat[], today: string, withinDays = 7): Anniversary[] {
  const out: Anniversary[] = [];
  for (const c of cats) {
    if (!c.is_active) continue;
    for (const [kind, origin] of [["birthday", c.birth_date], ["adopted", c.adopted_date]] as const) {
      if (!origin) continue;
      const n = nextAnniversary(origin, today);
      if (!n || n.years < 1) continue;
      const daysLeft = daysBetween(today, n.date);
      if (daysLeft <= withinDays) out.push({ key: `${kind}:${c.id}`, catId: c.id, catName: c.name, kind, date: n.date, daysLeft, years: n.years });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.catName.localeCompare(b.catName, "th"));
}

export function anniversaryText(a: Anniversary): string {
  const what = a.kind === "birthday" ? `วันเกิด "${a.catName}" ครบ ${a.years} ขวบ` : `ครบ ${a.years} ปีที่ "${a.catName}" มาอยู่บ้าน`;
  return a.daysLeft === 0 ? `วันนี้${what}` : `อีก ${a.daysLeft} วัน ${what}`;
}

/** อยู่บ้านมานานเท่าไหร่ (ข้อความ) */
export function sinceText(origin: string | null | undefined, today: string): string {
  if (!origin || origin > today) return "";
  const [oy, om, od] = origin.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - oy) * 12 + (tm - om) - (td < od ? 1 : 0);
  if (months < 1) return `${daysBetween(origin, today)} วัน`;
  const y = Math.floor(months / 12); months -= y * 12;
  return [y ? `${y} ปี` : "", months ? `${months} เดือน` : ""].filter(Boolean).join(" ");
}

// ─── ประวัติราคา ──────────────────────────────────────────────────────────
export type PriceRow = { id: string; date: string; shop: string; qty: number; paid: number; perUnit: number; perPack: number };

const unitsPerPack = (s: Supply) => (s.type === "wet_food" ? s.units_per_pack || 1 : 1);
const shopOf = (p: Purchase) => (p.shop_name ?? "").trim() || "ไม่ระบุร้าน";

/** ใบซื้อเข้าที่มีราคา → ราคาต่อชิ้น (ต่อหน่วยสต็อก) และต่อแพ็ค · ใหม่สุดก่อน */
export function priceHistory(s: Supply, purchases: Purchase[]): PriceRow[] {
  const per = unitsPerPack(s);
  return purchases
    .filter((p) => p.is_active && p.supply_id === s.id && p.price_paid != null && Number(p.price_paid) > 0 && Number(p.qty) > 0)
    .map((p) => {
      const perUnit = Number(p.price_paid) / Number(p.qty);
      return { id: p.id, date: p.date, shop: shopOf(p), qty: Number(p.qty), paid: Number(p.price_paid), perUnit: r2(perUnit), perPack: r2(perUnit * per) };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export type PriceStats = { avgPerPack: number; min: PriceRow; max: PriceRow; shops: { shop: string; bestPerPack: number; count: number }[] };

export function priceStats(rows: PriceRow[]): PriceStats | null {
  if (!rows.length) return null;
  const min = rows.reduce((a, b) => (b.perUnit < a.perUnit ? b : a));
  const max = rows.reduce((a, b) => (b.perUnit > a.perUnit ? b : a));
  const avgPerPack = Math.round(rows.reduce((n, r) => n + r.perPack, 0) / rows.length);
  const m = new Map<string, { shop: string; bestPerPack: number; count: number }>();
  for (const r of rows) {
    const cur = m.get(r.shop);
    if (!cur) m.set(r.shop, { shop: r.shop, bestPerPack: r.perPack, count: 1 });
    else { cur.count += 1; cur.bestPerPack = Math.min(cur.bestPerPack, r.perPack); }
  }
  return { avgPerPack, min, max, shops: [...m.values()].sort((a, b) => a.bestPerPack - b.bestPerPack) };
}

export const PRICE_UP_WARN_PCT = 10;

/** ตอนกรอกซื้อเข้า: เทียบกับครั้งก่อน + ร้านที่ถูกสุด (null = ยังไม่มีอะไรให้เทียบ) */
export function priceCheck(s: Supply, purchases: Purchase[], qty: number, paid: number, excludeId?: string): { pctVsLast: number | null; lastPerPack: number | null; cheapest: PriceRow | null; warn: boolean } | null {
  if (!(qty > 0) || !(paid > 0)) return null;
  const rows = priceHistory(s, purchases).filter((r) => r.id !== excludeId);
  if (!rows.length) return null;
  const perPack = (paid / qty) * unitsPerPack(s);
  const last = rows[0];
  const pct = last.perPack > 0 ? Math.round(((perPack - last.perPack) / last.perPack) * 1000) / 10 : null;
  const cheapest = rows.reduce((a, b) => (b.perUnit < a.perUnit ? b : a));
  return { pctVsLast: pct, lastPerPack: last.perPack, cheapest, warn: pct != null && pct >= PRICE_UP_WARN_PCT };
}

/** ชื่อร้านที่เคยใช้ (ร้านประจำของรายการก่อน · แล้วร้านที่เคยซื้อ) ไว้ให้เลือกในช่อง */
export function knownShops(s: Supply | null, supplies: Supply[], purchases: Purchase[]): string[] {
  const out = new Set<string>();
  if (s?.shop_name?.trim()) out.add(s.shop_name.trim());
  for (const p of purchases) if (p.is_active && p.shop_name?.trim() && (!s || p.supply_id === s.id)) out.add(p.shop_name.trim());
  for (const x of supplies) if (x.is_active && x.shop_name?.trim()) out.add(x.shop_name.trim());
  for (const p of purchases) if (p.is_active && p.shop_name?.trim()) out.add(p.shop_name.trim());
  return [...out].slice(0, 30);
}

// ─── รายการต้องซื้อ ───────────────────────────────────────────────────────
export type ShoppingItem = {
  supply: Supply; name: string; daysLeft: number; remaining: number;
  buyUnits: number; buyPacks: number; packLabel: string; estCost: number | null;
  shop: string | null; url: string | null; cheapest: { shop: string; perPack: number } | null;
};

export const supplyName = (s: Supply) => [s.brand, s.flavor].filter(Boolean).join(" ");

/** ของที่จะหมดภายใน withinDays วัน · ซื้อให้พอใช้ coverDays วันนับจากวันนี้ (ปัดเป็นแพ็ค/ถุงเต็ม อย่างน้อย 1) */
export function shoppingList(data: Pick<CatsData, "supplies" | "purchases">, plan: MealPlan, today: string, withinDays = 14, coverDays = 30): ShoppingItem[] {
  const active = data.supplies.filter((s) => s.is_active);
  const out: ShoppingItem[] = [];
  for (const s of active) {
    const st = supplyStatus(s, data.purchases, plan, active, today);
    if (st.daily == null || st.daily <= 0 || st.daysLeft == null || st.daysLeft > withinDays) continue;
    const per = unitsPerPack(s);
    const need = Math.max(0, st.daily * coverDays - st.remaining);
    const buyPacks = Math.max(1, Math.ceil(need / per - 1e-9));
    const buyUnits = buyPacks * per;
    const ppu = pricePerUnit(s);
    const stats = priceStats(priceHistory(s, data.purchases));
    const best = stats?.shops[0] ?? null;
    out.push({
      supply: s, name: supplyName(s), daysLeft: st.daysLeft, remaining: st.remaining,
      buyUnits, buyPacks,
      packLabel: s.type === "wet_food" ? `${buyPacks} แพ็ค (${buyUnits} ${stockUnitLabel(s)})` : `${buyPacks} ถุง`,
      estCost: ppu == null ? null : Math.round(ppu * buyUnits),
      shop: s.shop_name?.trim() || null, url: s.shop_url || null,
      cheapest: best && stats && stats.shops.length > 1 ? { shop: best.shop, perPack: best.bestPerPack } : null,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, "th"));
}

/** ข้อความไว้คัดลอกไปวางแชต */
export function shoppingText(items: ShoppingItem[], dateLabel: string): string {
  if (!items.length) return "";
  const lines = items.map((i) => {
    const when = i.daysLeft === 0 ? "หมดแล้ว" : `หมดใน ${i.daysLeft} วัน`;
    const head = `• ${i.name} × ${i.packLabel} — ${when}${i.estCost != null ? ` · ~${i.estCost.toLocaleString("th-TH")} บาท` : ""}`;
    const extra = [i.url ? `  ${i.shop ? `${i.shop}: ` : ""}${i.url}` : i.shop ? `  ร้าน: ${i.shop}` : "", i.cheapest && i.cheapest.shop !== i.shop ? `  เคยถูกสุด: ${i.cheapest.shop} ${fmtQty(i.cheapest.perPack)} บาท/${i.supply.type === "wet_food" ? "แพ็ค" : "ถุง"}` : ""].filter(Boolean);
    return [head, ...extra].join("\n");
  });
  const total = items.reduce((n, i) => n + (i.estCost ?? 0), 0);
  return `🛒 ของแมวต้องซื้อ (${dateLabel})\n${lines.join("\n")}${total ? `\nรวมประมาณ ${total.toLocaleString("th-TH")} บาท` : ""}`;
}

// ─── ตัวช่วยเริ่มต้น ──────────────────────────────────────────────────────
export type SetupStepKey = "cats" | "supplies" | "meal" | "stock" | "notify";
export type SetupStep = { key: SetupStepKey; title: string; hint: string; done: boolean };

export function setupSteps(data: CatsData, settings: { meal_plan?: unknown; notify?: unknown }): SetupStep[] {
  const sup = data.supplies.filter((s) => s.is_active);
  const hasWet = sup.some((s) => s.type === "wet_food");
  const counted = sup.length > 0 && sup.every((s) => Number(s.stock_base_qty) > 0 || data.purchases.some((p) => p.is_active && p.supply_id === s.id));
  return [
    { key: "cats", title: "เพิ่มแมว", hint: "ชื่อ · รูป · วันเกิด", done: data.cats.some((c) => c.is_active) },
    { key: "supplies", title: "เพิ่มอาหาร / ทราย", hint: "ยี่ห้อ · ขนาด · ราคา · ร้าน", done: sup.length > 0 },
    { key: "meal", title: "ตั้งตารางมื้อ", hint: hasWet ? "มื้อละกี่ชิ้น (อาหารเปียก)" : "ข้ามได้ถ้าไม่ให้อาหารเปียก", done: settings.meal_plan != null || (sup.length > 0 && !hasWet) },
    { key: "stock", title: "นับสต็อกตั้งต้น", hint: "ตอนนี้มีอยู่เท่าไหร่", done: counted },
    { key: "notify", title: "เปิดแจ้งเตือน LINE", hint: "ต้องตั้งกลุ่มแมวที่ศูนย์ LINE ก่อน", done: asNotify(settings.notify).enabled },
  ];
}

/**
 * 🏷 โปรโมชันอัตโนมัติของเว็บร้าน — กฎล้วน (ไม่แตะ DB · ทดสอบได้)
 * ⚠️ มิเรอร์: เว็บร้าน src/lib/promotions.ts คัดลอกตัวคิดจากไฟล์นี้ (ตะกร้าโชว์ก่อน · ERP คิดใหม่ตอนรับออเดอร์เสมอ) — แก้ที่นี่ต้องคัดลอกทับ
 *
 * ชนิด:
 *   flash        ⚡ ลดราคาตั้งเวลา — ลด % ทุกชิ้นของรุ่นที่ร่วม (ราคาโชว์ขีดฆ่า + นับถอยหลังบนเว็บ) · ซ้อนกับโปรอื่นได้
 *   qty_percent  ซื้อครบ N ชิ้น ลด X% (นับรวมทุกรุ่นที่ร่วม)
 *   bxgy         ซื้อ X แถม Y (ชิ้นที่ถูกสุดในแต่ละชุด ลด getPercent% · 100 = ฟรี)
 *   tier         ยอดครบขั้น ลด (ขั้นสูงสุดที่ถึง · % หรือบาท)
 *   bundle       ซื้อเป็นเซ็ต (ต้องมีครบทุกรุ่นในเซ็ต) ลด % หรือบาทต่อเซ็ต
 * วิธีรวม: ⚡ ลดก่อน (ต่อชิ้น) → โปรตะกร้า (4 ชนิดหลัง) ใช้ "ตัวที่ลดได้มากสุด" ตัวเดียว (ลูกค้าเข้าใจง่าย ไม่ลดซ้อนจนขาดทุน)
 * คูปอง: คิดหลังโปรจากยอดที่ลดแล้ว · โปรที่ตั้ง "ใช้คู่คูปองไม่ได้" + ลูกค้าใส่โค้ด → ERP ไม่รับโค้ด (บอกเหตุผล)
 * เงินเป็นบาท ปัดทศนิยม 2 ตำแหน่ง
 */
export type PromoKind = "flash" | "qty_percent" | "bxgy" | "tier" | "bundle";

export const PROMO_KINDS: { key: PromoKind; label: string; hint: string }[] = [
  { key: "flash", label: "⚡ ลดราคาตั้งเวลา (Flash sale)", hint: "ลด % ทุกชิ้นของรุ่นที่เลือก ช่วงเวลาที่ตั้ง · เว็บโชว์ราคาขีดฆ่า + นับถอยหลัง" },
  { key: "qty_percent", label: "ซื้อครบ N ชิ้น ลด %", hint: "เช่น ซื้อ 2 ชิ้นขึ้นไป ลด 10% (นับรวมทุกรุ่นที่ร่วม)" },
  { key: "bxgy", label: "ซื้อ X แถม Y", hint: "เช่น ซื้อ 2 แถม 1 — ชิ้นที่ถูกสุดในแต่ละชุดฟรี (หรือลด %)" },
  { key: "tier", label: "ยอดครบ ลดขั้นบันได", hint: "เช่น ครบ ฿1,500 ลด ฿100 · ครบ ฿3,000 ลด 10%" },
  { key: "bundle", label: "ซื้อเป็นเซ็ต ลดพิเศษ", hint: "เช่น กระเป๋า + เข็มขัด รุ่นที่กำหนด ซื้อคู่กันลด ฿200" },
];

export type DiscountKind = "percent" | "fixed";

export interface PromoScope {
  /** all = ทุกสินค้า · codes = รหัสรุ่นที่เลือก · categories = หมวดเว็บที่เลือก */
  mode: "all" | "codes" | "categories";
  codes: string[];
  categories: string[];
}

export interface PromoRule {
  scope: PromoScope;
  /** flash / qty_percent: ลดกี่ % */
  percent?: number;
  /** qty_percent: ขั้นต่ำกี่ชิ้น */
  minQty?: number;
  /** bxgy */
  buyQty?: number;
  getQty?: number;
  getPercent?: number;
  /** tier: ขั้นยอดซื้อ (บาท) */
  tiers?: { min: number; kind: DiscountKind; value: number }[];
  /** bundle: รหัสรุ่นในเซ็ต (ต้องมีครบ) + ส่วนลดต่อเซ็ต */
  bundleCodes?: string[];
  bundleKind?: DiscountKind;
  bundleValue?: number;
  /** ใช้คู่คูปองไม่ได้ */
  noCoupon?: boolean;
  /** ข้อความป้ายบนเว็บ (ว่าง = สร้างให้เอง) */
  badge?: string;
}

export interface Promotion {
  id: string;
  name: string;
  kind: PromoKind;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  rule: PromoRule;
}

export interface PromoLine {
  code: string;
  categories: string[];
  /** ราคาต่อชิ้น (บาท) */
  unitPrice: number;
  qty: number;
}

export interface AppliedPromo {
  id: string;
  name: string;
  kind: PromoKind;
  amount: number;
}

export interface PromoResult {
  /** ส่วนลดรวมทุกโปร (บาท · ไม่เกินยอดสินค้า) */
  total: number;
  applied: AppliedPromo[];
  /** ⚡ ราคาต่อชิ้นหลังลดของแต่ละบรรทัด (ลำดับเดียวกับที่ส่งมา) — ไว้โชว์ในตะกร้า */
  flashUnit: number[];
  /** โปรที่ใช้แล้ว ห้ามใช้คูปองคู่ */
  blocksCoupon: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (n: unknown) => Math.max(0, Math.min(100, Number(n) || 0));
const up = (s: string) => String(s ?? "").trim().toUpperCase();

export function isLive(p: Pick<Promotion, "active" | "startsAt" | "endsAt">, now: Date = new Date()): boolean {
  if (!p.active) return false;
  const t = now.getTime();
  if (p.startsAt && new Date(p.startsAt).getTime() > t) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() <= t) return false;
  return true;
}

export function inScope(scope: PromoScope, line: Pick<PromoLine, "code" | "categories">): boolean {
  if (scope.mode === "all") return true;
  if (scope.mode === "codes") return scope.codes.map(up).includes(up(line.code));
  return line.categories.some((c) => scope.categories.includes(c));
}

/** ⚡ % ลดของรุ่นนี้ตอนนี้ (หลายโปรทับกัน = เอามากสุด) */
export function flashPercent(promos: Promotion[], line: Pick<PromoLine, "code" | "categories">, now: Date = new Date()): { percent: number; promo: Promotion | null } {
  let best: Promotion | null = null;
  let pct = 0;
  for (const p of promos) {
    if (p.kind !== "flash" || !isLive(p, now) || !inScope(p.rule.scope, line)) continue;
    const v = clampPct(p.rule.percent);
    if (v > pct) {
      pct = v;
      best = p;
    }
  }
  return { percent: pct, promo: best };
}

/** ส่วนลดของโปรตะกร้า 1 ตัว (บาท) จากราคาหลัง ⚡ */
export function cartPromoAmount(p: Promotion, lines: PromoLine[], unit: number[]): number {
  const idx = lines.map((l, i) => ({ l, i })).filter(({ l }) => inScope(p.rule.scope, l));
  const eligQty = idx.reduce((s, { l }) => s + l.qty, 0);
  const eligSub = idx.reduce((s, { l, i }) => s + unit[i] * l.qty, 0);
  const rule = p.rule;
  switch (p.kind) {
    case "qty_percent": {
      const min = Math.max(1, Math.round(rule.minQty ?? 2));
      return eligQty >= min ? r2((eligSub * clampPct(rule.percent)) / 100) : 0;
    }
    case "bxgy": {
      const buy = Math.max(1, Math.round(rule.buyQty ?? 1));
      const get = Math.max(1, Math.round(rule.getQty ?? 1));
      const pct = rule.getPercent == null ? 100 : clampPct(rule.getPercent);
      // ทุกชิ้นเรียงแพง → ถูก · ชุดละ buy+get ชิ้น → get ชิ้นท้ายของชุด (ถูกสุดในชุด) ได้ลด
      const units = idx.flatMap(({ l, i }) => Array.from({ length: l.qty }, () => unit[i])).sort((a, b) => b - a);
      const size = buy + get;
      let off = 0;
      for (let g = 0; g + size <= units.length; g += size) for (let k = g + buy; k < g + size; k++) off += (units[k] * pct) / 100;
      return r2(off);
    }
    case "tier": {
      const tiers = (rule.tiers ?? []).filter((t) => t.min >= 0 && t.value > 0).sort((a, b) => b.min - a.min);
      const t = tiers.find((x) => eligSub >= x.min && eligSub > 0);
      if (!t) return 0;
      return r2(t.kind === "percent" ? (eligSub * clampPct(t.value)) / 100 : Math.min(t.value, eligSub));
    }
    case "bundle": {
      const codes = [...new Set((rule.bundleCodes ?? []).map(up).filter(Boolean))];
      if (codes.length < 2) return 0;
      const qtyOf = (c: string) => lines.reduce((s, l) => s + (up(l.code) === c ? l.qty : 0), 0);
      const sets = Math.min(...codes.map(qtyOf));
      if (!(sets > 0)) return 0;
      // ราคาเซ็ต = ชิ้นที่ถูกสุดของแต่ละรุ่นในเซ็ต
      const setPrice = codes.reduce((s, c) => s + Math.min(...lines.map((l, i) => (up(l.code) === c ? unit[i] : Infinity))), 0);
      const v = Math.max(0, Number(rule.bundleValue) || 0);
      const per = rule.bundleKind === "percent" ? (setPrice * clampPct(v)) / 100 : Math.min(v, setPrice);
      return r2(per * sets);
    }
    default:
      return 0;
  }
}

/** คิดโปรทั้งตะกร้า — ⚡ ต่อชิ้นก่อน แล้วโปรตะกร้าที่ลดได้มากสุด 1 ตัว */
export function evaluatePromotions(promos: Promotion[], lines: PromoLine[], now: Date = new Date()): PromoResult {
  const applied: AppliedPromo[] = [];
  const flashBy = new Map<string, AppliedPromo>();
  const unit = lines.map((l) => {
    const { percent, promo } = flashPercent(promos, l, now);
    if (!promo || !percent) return l.unitPrice;
    const after = r2(l.unitPrice * (1 - percent / 100));
    const cut = r2((l.unitPrice - after) * l.qty);
    const a = flashBy.get(promo.id) ?? { id: promo.id, name: promo.name, kind: promo.kind, amount: 0 };
    a.amount = r2(a.amount + cut);
    flashBy.set(promo.id, a);
    return after;
  });
  applied.push(...flashBy.values());

  let best: { p: Promotion; amount: number } | null = null;
  for (const p of promos) {
    if (p.kind === "flash" || !isLive(p, now)) continue;
    const amount = cartPromoAmount(p, lines, unit);
    if (amount > 0 && (!best || amount > best.amount)) best = { p, amount };
  }
  if (best) applied.push({ id: best.p.id, name: best.p.name, kind: best.p.kind, amount: best.amount });

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const total = r2(Math.min(subtotal, applied.reduce((s, a) => s + a.amount, 0)));
  const blocksCoupon = applied.some((a) => promos.find((p) => p.id === a.id)?.rule.noCoupon);
  return { total, applied, flashUnit: unit, blocksCoupon };
}

const baht = (n: number) => `฿${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** ป้ายบนเว็บ (ตั้งเองได้ใน rule.badge) */
export function promoBadge(p: Pick<Promotion, "kind" | "rule">, lang: "th" | "en" = "th"): string {
  if (p.rule.badge?.trim()) return p.rule.badge.trim();
  const r = p.rule;
  const en = lang === "en";
  switch (p.kind) {
    case "flash":
      return en ? `⚡ ${clampPct(r.percent)}% off` : `⚡ ลด ${clampPct(r.percent)}%`;
    case "qty_percent":
      return en ? `Buy ${r.minQty ?? 2}+ save ${clampPct(r.percent)}%` : `ซื้อ ${r.minQty ?? 2} ชิ้น ลด ${clampPct(r.percent)}%`;
    case "bxgy":
      return (r.getPercent ?? 100) >= 100 ? (en ? `Buy ${r.buyQty ?? 1} get ${r.getQty ?? 1} free` : `ซื้อ ${r.buyQty ?? 1} แถม ${r.getQty ?? 1}`) : en ? `Buy ${r.buyQty ?? 1}, get ${r.getQty ?? 1} at ${clampPct(r.getPercent)}% off` : `ซื้อ ${r.buyQty ?? 1} ชิ้นที่ ${(r.buyQty ?? 1) + 1} ลด ${clampPct(r.getPercent)}%`;
    case "tier": {
      const t = [...(r.tiers ?? [])].sort((a, b) => a.min - b.min)[0];
      if (!t) return "";
      const v = t.kind === "percent" ? `${t.value}%` : baht(t.value);
      return en ? `Spend ${baht(t.min)} save ${v}` : `ครบ ${baht(t.min)} ลด ${v}`;
    }
    case "bundle":
      return en ? `Bundle & save ${r.bundleKind === "percent" ? `${r.bundleValue}%` : baht(r.bundleValue ?? 0)}` : `ซื้อเป็นเซ็ต ลด ${r.bundleKind === "percent" ? `${r.bundleValue}%` : baht(r.bundleValue ?? 0)}`;
    default:
      return "";
  }
}

/** ตรวจ/ทำความสะอาดค่าจากหน้าจอ ERP — ผิด = error ภาษาคน */
export function sanitizePromotion(raw: unknown): { ok: true; promo: Omit<Promotion, "id"> } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = String(r.kind ?? "") as PromoKind;
  if (!PROMO_KINDS.some((k) => k.key === kind)) return { ok: false, error: "เลือกชนิดโปรโมชัน" };
  const name = String(r.name ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "ตั้งชื่อโปรโมชัน (ลูกค้าเห็นในตะกร้า)" };
  const iso = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  };
  const startsAt = iso(r.startsAt);
  const endsAt = iso(r.endsAt);
  if (startsAt === undefined || endsAt === undefined) return { ok: false, error: "วันเวลาเริ่ม/สิ้นสุดไม่ถูกต้อง" };
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, error: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" };
  if (kind === "flash" && !endsAt) return { ok: false, error: "Flash sale ต้องมีเวลาสิ้นสุด (เว็บนับถอยหลังให้)" };

  const rr = (r.rule ?? {}) as Record<string, unknown>;
  const sc = (rr.scope ?? {}) as Record<string, unknown>;
  const list = (v: unknown, max: number, f: (s: string) => string) => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).map((x) => f(String(x).trim())).filter(Boolean))].slice(0, max);
  const scope: PromoScope = {
    mode: sc.mode === "codes" || sc.mode === "categories" ? sc.mode : "all",
    codes: list(sc.codes, 300, up),
    categories: list(sc.categories, 50, (s) => s.slice(0, 60)),
  };
  if (scope.mode === "codes" && !scope.codes.length) return { ok: false, error: "เลือกรหัสรุ่นที่ร่วมโปรอย่างน้อย 1 รุ่น" };
  if (scope.mode === "categories" && !scope.categories.length) return { ok: false, error: "เลือกหมวดที่ร่วมโปรอย่างน้อย 1 หมวด" };

  const num = (v: unknown) => Number(v);
  const rule: PromoRule = { scope, noCoupon: rr.noCoupon === true, badge: String(rr.badge ?? "").trim().slice(0, 40) || undefined };
  if (kind === "flash" || kind === "qty_percent") {
    const pct = num(rr.percent);
    if (!(pct > 0 && pct < 100)) return { ok: false, error: "ส่วนลดต้องมากกว่า 0 และน้อยกว่า 100%" };
    rule.percent = Math.round(pct * 100) / 100;
  }
  if (kind === "qty_percent") {
    const m = Math.round(num(rr.minQty));
    if (!(m >= 2 && m <= 100)) return { ok: false, error: "จำนวนชิ้นขั้นต่ำ 2–100" };
    rule.minQty = m;
  }
  if (kind === "bxgy") {
    const b = Math.round(num(rr.buyQty));
    const g = Math.round(num(rr.getQty));
    const gp = rr.getPercent == null || rr.getPercent === "" ? 100 : num(rr.getPercent);
    if (!(b >= 1 && b <= 20) || !(g >= 1 && g <= 20)) return { ok: false, error: "ซื้อ/แถม ต้องเป็น 1–20 ชิ้น" };
    if (!(gp > 0 && gp <= 100)) return { ok: false, error: "ชิ้นที่แถมลดได้ 1–100% (100 = ฟรี)" };
    Object.assign(rule, { buyQty: b, getQty: g, getPercent: gp });
  }
  if (kind === "tier") {
    const tiers = (Array.isArray(rr.tiers) ? rr.tiers : [])
      .map((t) => t as Record<string, unknown>)
      .map((t) => ({ min: Math.max(0, num(t.min)), kind: (t.kind === "percent" ? "percent" : "fixed") as DiscountKind, value: num(t.value) }))
      .filter((t) => t.min > 0 && t.value > 0 && (t.kind === "fixed" || t.value < 100))
      .sort((a, b) => a.min - b.min)
      .slice(0, 6);
    if (!tiers.length) return { ok: false, error: "ใส่ขั้นยอดซื้ออย่างน้อย 1 ขั้น (ยอดครบ + ส่วนลด)" };
    rule.tiers = tiers;
  }
  if (kind === "bundle") {
    const codes = list(rr.bundleCodes, 6, up);
    const v = num(rr.bundleValue);
    const bk: DiscountKind = rr.bundleKind === "percent" ? "percent" : "fixed";
    if (codes.length < 2) return { ok: false, error: "เซ็ตต้องมีอย่างน้อย 2 รุ่น" };
    if (!(v > 0) || (bk === "percent" && v >= 100)) return { ok: false, error: "ใส่ส่วนลดของเซ็ต" };
    Object.assign(rule, { bundleCodes: codes, bundleKind: bk, bundleValue: v });
    rule.scope = { mode: "codes", codes, categories: [] };
  }
  return { ok: true, promo: { name, kind, active: r.active !== false, startsAt, endsAt, rule } };
}

export function promotionFromRow(r: Record<string, unknown>): Promotion {
  const rule = (r.rule ?? {}) as PromoRule;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    kind: String(r.kind) as PromoKind,
    active: r.active !== false,
    startsAt: (r.starts_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    rule: { ...rule, scope: rule.scope ?? { mode: "all", codes: [], categories: [] } },
  };
}

/** ส่งให้เว็บร้าน: เฉพาะที่เปิด + ยังไม่หมดเวลา (รวมที่ยังไม่เริ่ม — เว็บซ่อนเองจนถึงเวลา) */
export function publicPromotions(list: Promotion[], now: Date = new Date()): Promotion[] {
  return list.filter((p) => p.active && (!p.endsAt || new Date(p.endsAt).getTime() > now.getTime()));
}

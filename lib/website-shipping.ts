/**
 * 🚚 ของกลาง (pure · ไม่มี import) — วิธีจัดส่งของเว็บร้าน + คิดค่าส่ง
 *
 * ⚠️ มิเรอร์ทั้งไฟล์ → เว็บร้าน (repo storefront) src/lib/shipping.ts — แก้ที่นี่แล้วคัดลอกไปทั้งไฟล์
 *    เว็บร้านใช้คิดค่าส่งให้ลูกค้าเห็นก่อนกดสั่ง · ERP คิดใหม่ฝั่งเซิร์ฟเวอร์ตอนรับออเดอร์เสมอ (ไม่เชื่อเลขจากหน้าเว็บ)
 *
 * เก็บที่ store_settings key "shipping_methods" (JSON ก้อนเดียวต่อร้าน — แบบเดียวกับ gift_cards)
 * ร้านที่ยังไม่ตั้ง = 1 วิธี "ส่งมาตรฐาน" จากค่าส่งเหมา/ส่งฟรีเมื่อยอดถึง เดิม (shipping_flat / free_shipping_min) → หน้าตา/ยอดเหมือนเดิมทุกอย่าง
 *
 * เจ้าของสั่งเฟส 1 (2026-10-20): หลายวิธีส่ง · ค่าส่งเหมาหรือตามจำนวนชิ้น (เลือกกล่องให้) · ส่งฟรีแยกตามวิธี
 *   · บวกพื้นที่ห่างไกลตามรหัสไปรษณีย์ · จำกัดพื้นที่ (เช่น ด่วนในวันเฉพาะ กทม.) · เก็บปลายทางได้ไหม + ค่าธรรมเนียม COD
 *   · ระยะเวลาถึง + รอบตัดส่ง
 */

export type ShippingFeeRule =
  | { kind: "flat"; amount: number }
  /** ตามจำนวนชิ้น: แถวแรกที่ qty ≤ upTo (upTo null = ไม่จำกัด) · box = ชื่อกล่องแนะนำ (ตามกล่องมาตรฐานของคลัง) */
  | { kind: "tiers"; tiers: { upTo: number | null; fee: number; box: string }[] };

export type ShippingArea = "all" | "bkk" | "metro";

export interface ShippingMethod {
  id: string;
  /** ส่งถึงบ้าน / รับเองที่ร้าน (ไม่ต้องใช้ที่อยู่ ไม่บวกพื้นที่ห่างไกล) */
  kind: "ship" | "pickup";
  enabled: boolean;
  name: string;
  name_en?: string;
  /** ขนส่งที่ใช้ (คีย์เดียวกับ lib/parcel-tracking PARCEL_CARRIERS) — ใช้เลือกขนส่งให้ตอนใส่เลขพัสดุ */
  carrier: string;
  fee: ShippingFeeRule;
  /** ส่งฟรีเมื่อยอดสินค้าถึง (0 = ไม่มี) */
  freeMin: number;
  /** บวกเพิ่มเมื่อรหัสไปรษณีย์อยู่ในพื้นที่ห่างไกล (0 = ไม่บวก) */
  remoteFee: number;
  /** ส่งได้เฉพาะพื้นที่ */
  area: ShippingArea;
  /** ลูกค้าเลือกเก็บเงินปลายทางได้ไหม */
  codAllowed: boolean;
  /** ค่าธรรมเนียมเก็บปลายทาง (บวกเมื่อเลือก COD) */
  codFee: number;
  /** ระยะเวลาถึง เช่น "1–3 วัน" */
  eta: string;
  eta_en?: string;
  /** รอบตัดส่ง "HH:MM" (ว่าง = ไม่บอก) — สั่งก่อนเวลานี้ ส่งวันนี้ */
  cutoff: string;
  /** หมายเหตุสั้น ๆ ที่ลูกค้าเห็น เช่น ที่อยู่หน้าร้าน/เวลารับ */
  note: string;
  note_en?: string;
}

export interface ShippingConfig {
  methods: ShippingMethod[];
  /** รหัสไปรษณีย์พื้นที่ห่างไกล — ใส่ 5 หลัก (ตรงตัว) หรือ 2-4 หลัก (ขึ้นต้นด้วย) */
  remotePostals: string[];
  /** true = ร้านยังไม่เคยตั้ง (สร้างจากค่าส่งเหมาเดิม) */
  legacy?: boolean;
}

/** ตัวอย่างพื้นที่ห่างไกลที่ขนส่งส่วนใหญ่บวกเพิ่ม — ⚠️ เจ้าของควรเช็กกับขนส่งที่ใช้จริงแล้วแก้ได้ในหน้าตั้งค่า */
export const SUGGESTED_REMOTE_POSTALS: string[] = [
  "94", "95", "96", // ปัตตานี ยะลา นราธิวาส
  "58", // แม่ฮ่องสอน
  "84140", "84280", "84310", "84320", "84330", "84360", // เกาะสมุย เกาะพะงัน เกาะเต่า
  "81150", "81210", // เกาะลันตา เกาะพีพี
  "82160", // เกาะยาว
  "23170", "23000", // เกาะช้าง เกาะกูด/ตราด (บางพื้นที่)
  "20120", // เกาะสีชัง
  "91110", // เกาะหลีเป๊ะ/สตูล (บางพื้นที่)
  "63170", // อุ้มผาง
];

export const SHIPPING_AREAS: { key: ShippingArea; th: string; en: string; hint: string }[] = [
  { key: "all", th: "ทั่วประเทศ", en: "Nationwide", hint: "ส่งได้ทุกรหัสไปรษณีย์" },
  { key: "bkk", th: "กรุงเทพฯ + สมุทรปราการ", en: "Bangkok & Samut Prakan", hint: "รหัสไปรษณีย์ขึ้นต้น 10" },
  { key: "metro", th: "กรุงเทพฯ และปริมณฑล", en: "Greater Bangkok", hint: "รหัสขึ้นต้น 10, 11, 12, 73, 74" },
];
const AREA_PREFIX: Record<ShippingArea, string[] | null> = { all: null, bkk: ["10"], metro: ["10", "11", "12", "73", "74"] };

const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fb;
};
const str = (v: unknown, max = 200): string => String(v ?? "").trim().slice(0, max);
const digits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

function normFee(raw: unknown, fbFlat: number): ShippingFeeRule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.kind === "tiers" && Array.isArray(r.tiers)) {
    const tiers = (r.tiers as Record<string, unknown>[])
      .slice(0, 12)
      .map((t) => ({ upTo: t.upTo == null || t.upTo === "" ? null : Math.max(1, Math.floor(num(t.upTo, 1))), fee: num(t.fee), box: str(t.box, 30) }))
      .sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
    if (tiers.length) {
      // แถวสุดท้ายต้องรับทุกจำนวน (กันลูกค้าซื้อเกินตารางแล้วคิดค่าส่งไม่ได้)
      tiers[tiers.length - 1] = { ...tiers[tiers.length - 1], upTo: null };
      return { kind: "tiers", tiers };
    }
  }
  return { kind: "flat", amount: num(r.amount, fbFlat) };
}

const cutoffOk = (v: unknown) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(str(v, 5)) ? str(v, 5) : "");

/** ทำความสะอาด 1 วิธี (ค่าแปลก ๆ → ค่าปลอดภัย) */
export function normalizeMethod(raw: unknown, i = 0): ShippingMethod {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = r.kind === "pickup" ? "pickup" : "ship";
  const id = str(r.id, 40).replace(/[^a-z0-9_-]/gi, "") || `m${i + 1}`;
  const out: ShippingMethod = {
    id,
    kind,
    enabled: r.enabled !== false,
    name: str(r.name, 80) || (kind === "pickup" ? "รับเองที่ร้าน" : "ส่งมาตรฐาน"),
    carrier: str(r.carrier, 20),
    fee: kind === "pickup" ? { kind: "flat", amount: num((r.fee as Record<string, unknown> | undefined)?.amount, 0) } : normFee(r.fee, 0),
    freeMin: num(r.freeMin),
    remoteFee: kind === "pickup" ? 0 : num(r.remoteFee),
    area: (["all", "bkk", "metro"] as const).includes(r.area as ShippingArea) ? (r.area as ShippingArea) : "all",
    codAllowed: r.codAllowed === true,
    codFee: num(r.codFee),
    eta: str(r.eta, 60),
    cutoff: cutoffOk(r.cutoff),
    note: str(r.note, 200),
  };
  if (str(r.name_en, 80)) out.name_en = str(r.name_en, 80);
  if (str(r.eta_en, 60)) out.eta_en = str(r.eta_en, 60);
  if (str(r.note_en, 200)) out.note_en = str(r.note_en, 200);
  return out;
}

/** วิธีเดียวจากค่าเดิม (ร้านที่ยังไม่ตั้งวิธีส่ง) — ยอดเท่าเดิมทุกบาท */
export function legacyMethod(legacy: { shipping_flat: number; free_shipping_min: number; pay_cod: boolean }): ShippingMethod {
  return {
    id: "std",
    kind: "ship",
    enabled: true,
    name: "ส่งมาตรฐาน",
    name_en: "Standard delivery",
    carrier: "",
    fee: { kind: "flat", amount: Math.max(0, legacy.shipping_flat) },
    freeMin: Math.max(0, legacy.free_shipping_min),
    remoteFee: 0,
    area: "all",
    codAllowed: legacy.pay_cod,
    codFee: 0,
    eta: "",
    cutoff: "",
    note: "",
  };
}

/** อ่านค่าที่เก็บไว้ (JSON) → config ที่ใช้ได้เสมอ (มีอย่างน้อย 1 วิธี) */
export function normalizeShipping(raw: unknown, legacy: { shipping_flat: number; free_shipping_min: number; pay_cod: boolean }): ShippingConfig {
  let r = raw;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      r = null;
    }
  }
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const list = Array.isArray(o.methods) ? (o.methods as unknown[]).slice(0, 10).map((m, i) => normalizeMethod(m, i)) : [];
  // id ซ้ำ → เติมเลขท้าย
  const seen = new Set<string>();
  for (const m of list) {
    let id = m.id;
    let n = 2;
    while (seen.has(id)) id = `${m.id}-${n++}`;
    m.id = id;
    seen.add(id);
  }
  const remotePostals = Array.isArray(o.remotePostals)
    ? [...new Set((o.remotePostals as unknown[]).map((p) => digits(p).slice(0, 5)).filter((p) => p.length >= 2))].slice(0, 500)
    : [];
  if (!list.length) return { methods: [legacyMethod(legacy)], remotePostals, legacy: true };
  return { methods: list, remotePostals };
}

/** รหัสไปรษณีย์นี้อยู่พื้นที่ห่างไกลไหม (5 หลักตรงตัว หรือขึ้นต้นด้วยรหัสสั้น) */
export function isRemotePostal(postal: string, cfg: Pick<ShippingConfig, "remotePostals">): boolean {
  const p = digits(postal);
  if (p.length !== 5) return false;
  return cfg.remotePostals.some((r) => (r.length === 5 ? p === r : p.startsWith(r)));
}

/** วิธีนี้ส่งถึงรหัสไปรษณีย์นี้ไหม (ยังไม่กรอกรหัส = ถือว่าได้ก่อน) */
export function methodServes(m: ShippingMethod, postal: string): boolean {
  if (m.kind === "pickup") return true;
  const prefixes = AREA_PREFIX[m.area];
  if (!prefixes) return true;
  const p = digits(postal);
  if (p.length !== 5) return true;
  return prefixes.some((x) => p.startsWith(x));
}

export interface ShippingQuote {
  methodId: string;
  /** ค่าส่งรวม (รวมพื้นที่ห่างไกลแล้ว · ไม่รวม COD) */
  fee: number;
  /** ค่าส่งปกติก่อนส่งฟรี */
  baseFee: number;
  remoteFee: number;
  /** ค่าธรรมเนียมเก็บปลายทาง (คิดเมื่อ cod = true) */
  codFee: number;
  freeApplied: boolean;
  /** ขาดอีกเท่าไรถึงส่งฟรี (ไม่มีโปรส่งฟรี/ได้แล้ว = 0) */
  toFree: number;
  box: string;
  available: boolean;
  /** ไม่ว่าง = เหตุผลที่เลือกไม่ได้ (area / disabled / cod) */
  reason: "" | "disabled" | "area" | "cod";
}

/** คิดค่าส่ง 1 วิธี — subtotal = ยอดสินค้าหลังส่วนลดที่ใช้เทียบส่งฟรี · qty = จำนวนชิ้นรวม */
export function quoteMethod(
  m: ShippingMethod,
  ctx: { subtotal: number; qty: number; postal: string; cod: boolean },
  cfg: Pick<ShippingConfig, "remotePostals">,
): ShippingQuote {
  let baseFee = 0;
  let box = "";
  if (m.fee.kind === "flat") baseFee = m.fee.amount;
  else {
    const q = Math.max(1, Math.floor(ctx.qty || 1));
    const tier = m.fee.tiers.find((t) => t.upTo == null || q <= t.upTo) ?? m.fee.tiers[m.fee.tiers.length - 1];
    baseFee = tier?.fee ?? 0;
    box = tier?.box ?? "";
  }
  const freeApplied = m.freeMin > 0 && ctx.subtotal >= m.freeMin;
  const remote = m.kind === "ship" && m.remoteFee > 0 && isRemotePostal(ctx.postal, cfg);
  // ส่งฟรี = ฟรีเฉพาะค่าส่งปกติ · พื้นที่ห่างไกลยังบวก (ขนส่งเก็บจริง)
  const remoteFee = remote ? m.remoteFee : 0;
  const fee = Math.round(((freeApplied ? 0 : baseFee) + remoteFee) * 100) / 100;
  const reason: ShippingQuote["reason"] = !m.enabled ? "disabled" : !methodServes(m, ctx.postal) ? "area" : ctx.cod && !m.codAllowed ? "cod" : "";
  return {
    methodId: m.id,
    fee,
    baseFee,
    remoteFee,
    codFee: ctx.cod && m.codAllowed ? m.codFee : 0,
    freeApplied,
    toFree: m.freeMin > 0 && !freeApplied ? Math.round((m.freeMin - ctx.subtotal) * 100) / 100 : 0,
    box,
    available: reason === "",
    reason,
  };
}

/** วิธีที่ลูกค้าเห็น (เปิดอยู่) เรียงตามที่ร้านตั้ง */
export const visibleMethods = (cfg: ShippingConfig): ShippingMethod[] => cfg.methods.filter((m) => m.enabled);

/** เลือกวิธีเริ่มต้น = วิธีแรกที่ใช้ได้กับที่อยู่/การชำระนี้ */
export function defaultMethodId(cfg: ShippingConfig, ctx: { postal: string; cod: boolean }): string | null {
  const m = visibleMethods(cfg).find((x) => methodServes(x, ctx.postal) && (!ctx.cod || x.codAllowed));
  return m?.id ?? null;
}

/** ข้อความรอบตัดส่ง เช่น "สั่งก่อน 14:00 ส่งวันนี้" (เวลาไทย) — ไม่ตั้งรอบ = "" */
export function cutoffText(m: ShippingMethod, now: Date, lang: "th" | "en" = "th"): string {
  if (!m.cutoff) return "";
  const th = new Date(now.getTime() + 7 * 3600 * 1000); // UTC+7
  const [h, mi] = m.cutoff.split(":").map(Number);
  const before = th.getUTCHours() * 60 + th.getUTCMinutes() < h * 60 + mi;
  if (lang === "en") return before ? `Order before ${m.cutoff} — ships today` : `Ships next business day (cut-off ${m.cutoff})`;
  return before ? `สั่งก่อน ${m.cutoff} ส่งวันนี้` : `ส่งรอบถัดไป (ตัดรอบ ${m.cutoff})`;
}

/** สรุปวิธีคิดค่าส่งเป็นภาษาคน (หน้าตั้งค่า/หน้าสินค้า) */
export function feeSummary(m: ShippingMethod): string {
  if (m.kind === "pickup" && m.fee.kind === "flat" && m.fee.amount === 0) return "ฟรี";
  if (m.fee.kind === "flat") return m.fee.amount === 0 ? "ฟรี" : `฿${m.fee.amount}`;
  const fees = m.fee.tiers.map((t) => t.fee);
  return `฿${Math.min(...fees)}–${Math.max(...fees)} ตามจำนวนชิ้น`;
}

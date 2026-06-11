/**
 * Money / Currency Service กลาง
 *
 * **Rule**: ทุกการคำนวณเงินใน ERP ต้องใช้ service นี้ — ห้ามใช้ Number + toFixed เอง
 *
 * ระบบใช้ "minor units" (สตางค์) ภายในการคำนวณ
 *   100.00 บาท = 10000 minor units (THB scale = 2)
 *   $1.99      = 199 minor units
 * เพื่อเลี่ยง floating-point error ของ JavaScript
 *
 * รองรับ rounding modes:
 *   half-up    — ปัดเศษ 0.5 ขึ้น (ค่าเริ่มต้น สำหรับ retail)
 *   half-even  — Banker's rounding (สำหรับ accounting)
 *   floor      — ปัดลงเสมอ
 *   ceil       — ปัดขึ้นเสมอ
 */

// ============================================================
// Currency catalog
// ============================================================

export type CurrencyCode = "THB" | "USD" | "EUR" | "JPY" | "CNY" | "VND";

export type Currency = {
  code:    CurrencyCode;
  symbol:  string;
  /** จำนวนทศนิยม (0 = JPY/VND, 2 = THB/USD/EUR) */
  scale:   number;
  /** ตัวคั่นพันหลัก สำหรับ format */
  locale:  string;
};

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  THB: { code: "THB", symbol: "฿",  scale: 2, locale: "th-TH" },
  USD: { code: "USD", symbol: "$",  scale: 2, locale: "en-US" },
  EUR: { code: "EUR", symbol: "€",  scale: 2, locale: "de-DE" },
  JPY: { code: "JPY", symbol: "¥",  scale: 0, locale: "ja-JP" },
  CNY: { code: "CNY", symbol: "¥",  scale: 2, locale: "zh-CN" },
  VND: { code: "VND", symbol: "₫",  scale: 0, locale: "vi-VN" },
};

export const DEFAULT_CURRENCY: CurrencyCode = "THB";

// ============================================================
// Money type — เก็บเป็น minor units (integer)
// ============================================================

export type Money = {
  /** จำนวนใน minor unit (สตางค์ฯ) */
  amount:   number;
  currency: CurrencyCode;
};

export type RoundingMode = "half-up" | "half-even" | "floor" | "ceil";

// ---- Constructors ----

/** ขยายค่าทศนิยม → integer (THB 100.50 → 10050) */
export function toMinor(value: number, currency: CurrencyCode = DEFAULT_CURRENCY, mode: RoundingMode = "half-up"): number {
  const scale = CURRENCIES[currency].scale;
  const factor = Math.pow(10, scale);
  const scaled = value * factor;
  return roundInteger(scaled, mode);
}

/** บีบ integer → ทศนิยม (10050 → 100.50) */
export function toMajor(minor: number, currency: CurrencyCode = DEFAULT_CURRENCY): number {
  const factor = Math.pow(10, CURRENCIES[currency].scale);
  return minor / factor;
}

/** สร้าง Money จาก major units (เช่น 100.50 บาท) */
export function money(value: number, currency: CurrencyCode = DEFAULT_CURRENCY, mode: RoundingMode = "half-up"): Money {
  return { amount: toMinor(value, currency, mode), currency };
}

/** Money เปล่า (0) */
export function zero(currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return { amount: 0, currency };
}

// ============================================================
// Rounding
// ============================================================

function roundInteger(n: number, mode: RoundingMode): number {
  switch (mode) {
    case "floor":     return Math.floor(n);
    case "ceil":      return Math.ceil(n);
    case "half-even": return roundHalfEven(n);
    case "half-up":
    default:          return Math.round(n);
  }
}

/** Banker's rounding — 0.5 → ปัดเข้าหาเลขคู่ */
function roundHalfEven(n: number): number {
  const floor = Math.floor(n);
  const diff  = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ============================================================
// Arithmetic
// ============================================================

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Money currency mismatch: ${a.currency} vs ${b.currency} — ใช้ convert() ก่อนถ้าจำเป็น`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

/** Money × scalar (เช่น price × qty) */
export function multiply(m: Money, factor: number, mode: RoundingMode = "half-up"): Money {
  return { amount: roundInteger(m.amount * factor, mode), currency: m.currency };
}

/** Money / scalar */
export function divide(m: Money, divisor: number, mode: RoundingMode = "half-up"): Money {
  if (divisor === 0) throw new Error("Money: divide by zero");
  return { amount: roundInteger(m.amount / divisor, mode), currency: m.currency };
}

/** Σ Money[] — ทุกตัวต้องสกุลเดียวกัน */
export function sum(items: Money[], currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  if (items.length === 0) return zero(currency);
  const cur = items[0].currency;
  let total = 0;
  for (const m of items) {
    if (m.currency !== cur) throw new Error(`Money.sum: currency mismatch ${m.currency} vs ${cur}`);
    total += m.amount;
  }
  return { amount: total, currency: cur };
}

/** เปอร์เซ็นต์ (rate = 7 หมายถึง 7%) */
export function percent(m: Money, rate: number, mode: RoundingMode = "half-up"): Money {
  return { amount: roundInteger(m.amount * rate / 100, mode), currency: m.currency };
}

/** ขนาดสัมพัทธ์ */
export function isZero(m: Money): boolean { return m.amount === 0; }
export function isNegative(m: Money): boolean { return m.amount < 0; }
export function abs(m: Money): Money { return { amount: Math.abs(m.amount), currency: m.currency }; }
export function negate(m: Money): Money { return { amount: -m.amount, currency: m.currency }; }

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount - b.amount;
}

// ============================================================
// Currency conversion (simple, exchange rate per pair)
// ============================================================

export type ExchangeRate = {
  from: CurrencyCode;
  to:   CurrencyCode;
  rate: number;          // 1 from = rate * to
};

/** แปลง Money เป็นอีกสกุล — ต้องให้ rate */
export function convert(m: Money, to: CurrencyCode, rate: number, mode: RoundingMode = "half-up"): Money {
  if (m.currency === to) return m;
  const majorFrom = toMajor(m.amount, m.currency);
  const majorTo   = majorFrom * rate;
  return money(majorTo, to, mode);
}

// ============================================================
// Currency normalize / display (ของกลาง — เลิกเขียน curLabel ซ้ำตามหน้า)
// ============================================================

/** แปลงรหัสที่เก็บในข้อมูลจริง (YUAN/RMB/CNY/฿/บาท ฯลฯ) → CurrencyCode มาตรฐาน */
export function normalizeCurrency(raw: unknown): CurrencyCode {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "YUAN" || s === "RMB" || s === "CNY" || s === "¥") return "CNY";
  if (s === "" || s === "THB" || s === "บาท" || s === "฿") return "THB";
  if (s in CURRENCIES) return s as CurrencyCode;
  return DEFAULT_CURRENCY;
}

/** ป้ายแสดงผลที่ทีมคุ้น (CNY → "RMB", อื่นๆ → code ตรงๆ) */
export function currencyLabel(raw: unknown): string {
  const code = normalizeCurrency(raw);
  return code === "CNY" ? "RMB" : code;
}

/**
 * ฟอร์แมตจำนวนเงินสำหรับโชว์ (ตาราง/ฟอร์ม/การ์ด)
 * THB → ฿1,234.5 · สกุลอื่น → 1,234.5 RMB (ใช้ code กันสับสน ¥ ญี่ปุ่น/จีน)
 */
export function formatAmount(value: number, raw: unknown = DEFAULT_CURRENCY): string {
  const code = normalizeCurrency(raw);
  const cur = CURRENCIES[code];
  const numStr = value.toLocaleString(cur.locale, { maximumFractionDigits: cur.scale });
  return code === "THB" ? `฿${numStr}` : `${numStr} ${currencyLabel(code)}`;
}

// ============================================================
// Format
// ============================================================

export type FormatOptions = {
  /** แสดงสัญลักษณ์สกุลเงิน */
  symbol?: boolean;
  /** ใช้ code (THB) แทน symbol (฿) */
  code?:   boolean;
  /** จำนวนทศนิยม override (default = currency scale) */
  decimals?: number;
};

export function format(m: Money, opts: FormatOptions = { symbol: true }): string {
  const cur = CURRENCIES[m.currency];
  const decimals = opts.decimals ?? cur.scale;
  const value = toMajor(m.amount, m.currency);
  const numStr = value.toLocaleString(cur.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (opts.code)   return `${numStr} ${cur.code}`;
  if (opts.symbol) return `${cur.symbol}${numStr}`;
  return numStr;
}

/** ฟอร์แมตเลขล้วน (ไม่มีสัญลักษณ์/code) — สะดวกใน input */
export function formatNumber(m: Money, decimals?: number): string {
  return format(m, { symbol: false, decimals });
}

// ============================================================
// Parse — string → Money
// ============================================================

/** parse "฿1,234.56" หรือ "1234.56" → Money */
export function parse(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  const cleaned = input.replace(/[^\d.,\-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return zero(currency);
  return money(n, currency);
}

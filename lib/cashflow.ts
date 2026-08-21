/**
 * ของกลาง — กระแสเงินสด (Cashflow)
 *
 * แนวคิด: ไม่ว่าเงินจะมาจากไหน (ใบขาย · ใบซื้อ · เงินเดือน · งวดผ่อน · โอนเงินจีน)
 * เราแปลงให้เป็น "รายการเงิน 1 บรรทัด" หน้าตาเดียวกันหมด = CashflowEvent
 * แล้วเอามาต่อกันเป็นเส้นเงินคงเหลือรายวัน
 *
 * ไฟล์นี้ตั้งใจให้ "ไม่แตะฐานข้อมูล" — คำนวณล้วน ๆ เพื่อให้ทดสอบง่ายและใช้ได้ทั้งฝั่ง server/ฝั่งหน้าจอ
 * การดึงข้อมูลจริงอยู่ที่ app/api/cashflow/route.ts
 *
 * ห้ามเขียนสูตรรวมยอด/สีแหล่งที่มาซ้ำในหน้า UI — เพิ่มที่นี่ที่เดียว ทุกหน้าจะเปลี่ยนตาม
 */

// ============================================================
// ชนิดข้อมูล
// ============================================================

/** ทิศทางเงิน: in = เงินไหลเข้าบริษัท, out = เงินไหลออก */
export type CashflowDirection = "in" | "out";

/**
 * ความมั่นใจของรายการ
 *  actual   = ยืนยันวันและยอดแล้ว (เช่น รอบจ่ายเงินเดือนที่อนุมัติแล้ว)
 *  expected = มีเอกสารจริงรออยู่ แต่วันอาจเลื่อน (เช่น ใบซื้อค้างจ่าย)
 *  estimate = ระบบเดาให้จากค่าเฉลี่ย/ค่าตั้งต้น (เช่น เงินเดือนเดือนหน้าที่ยังไม่ได้ทำรอบ)
 */
export type CashflowCertainty = "actual" | "expected" | "estimate";

/** แหล่งที่มาของรายการ */
export type CashflowSource =
  | "sales_order"     // ใบขายที่ยืนยันแล้ว (เงินเข้า)
  | "billing_note"    // ใบวางบิล (เงินเข้า)
  | "purchase_order"  // ใบซื้อค้างจ่าย (เงินออก)
  | "payroll"         // เงินเดือน (เงินออก)
  | "loan"            // งวดผ่อนเงินกู้ (เงินออก)
  | "od_interest"     // ดอกเบี้ย OD (เงินออก)
  | "china"           // โอนเงินจีน (เงินออก)
  | "manual";         // รายการที่กรอกเอง — ค่าเช่า ค่าน้ำไฟ ภาษี ประกันสังคม (เข้าหรือออกก็ได้)

export type CashflowEvent = {
  /** ไม่ซ้ำทั้งชุด — ใช้เป็น key ของตาราง */
  id: string;
  /** วันที่คาดว่าเงินจะเข้า/ออก รูปแบบ "YYYY-MM-DD" */
  date: string;
  direction: CashflowDirection;
  source: CashflowSource;
  certainty: CashflowCertainty;
  /** เลขเอกสาร เช่น SO-2026-0001 */
  ref: string;
  /** ชื่อคู่ค้า / เจ้าหนี้ / ธนาคาร */
  party: string;
  /** จำนวนเงินบาท — เป็นบวกเสมอ (ทิศทางอยู่ที่ direction) */
  amount: number;
  /** true = รู้วันแน่นอน · false = ระบบเดาวันให้ (ยังไม่ได้ตั้งเครดิต ฯลฯ) */
  dateConfident: boolean;
  /** เหตุผลที่เดาวัน — โชว์ให้ผู้ใช้เข้าใจว่าทำไมถึงเป็นวันนี้ */
  dateNote?: string;
  note?: string;
  /** ลิงก์ไปหน้าเอกสารต้นทาง */
  href?: string;
  /**
   * เลื่อนวันได้ไหม (ใช้ที่กระดานเงินสด /cashflow/board)
   * false = ธนาคาร/พนักงานรอไม่ได้ เช่น งวดผ่อน · เงินเดือน · ดอกเบี้ย OD
   */
  movable?: boolean;
  /** id เอกสารต้นทาง — ใช้ตอนบันทึกวันใหม่ (ไม่ใช่ id ของ event) */
  docId?: string;
};

/** ชนิดเอกสารที่กระดานเลื่อนวันให้ได้ + ช่องที่เก็บวันนั้นในฐานข้อมูล */
export const MOVABLE_SOURCES: Partial<Record<CashflowSource, { table: string; dateField: string; label: string }>> = {
  purchase_order: { table: "purchase_orders_v2",              dateField: "payment_due_date",        label: "วันครบกำหนดจ่าย" },
  billing_note:   { table: "erp_playground_billing_notes",    dateField: "due_date",                label: "วันครบกำหนดชำระ" },
  sales_order:    { table: "erp_playground_sales_orders",     dateField: "expected_payment_date",   label: "วันที่คาดว่าจะได้รับเงิน" },
  china:          { table: "china_bills",                     dateField: "transfer_date",           label: "วันโอนเงิน" },
};

export const isMovableSource = (s: string): boolean => !!MOVABLE_SOURCES[s as CashflowSource];

/** ป้าย / ไอคอน / สี ของแต่ละแหล่ง — ใช้ร่วมกันทุกหน้า */
export const CASHFLOW_SOURCE: Record<CashflowSource, { label: string; icon: string; color: string; href: string }> = {
  sales_order:    { label: "คำสั่งขาย",   icon: "🧾", color: "#1D9E75", href: "/sales-orders" },
  billing_note:   { label: "ใบวางบิล",    icon: "📑", color: "#3FB6A8", href: "/billing-notes" },
  purchase_order: { label: "จัดซื้อ",     icon: "🛒", color: "#EF9F27", href: "/purchasing/po-list" },
  payroll:        { label: "เงินเดือน",   icon: "👥", color: "#7C5CD6", href: "/payroll/payments" },
  loan:           { label: "เงินกู้",     icon: "🏦", color: "#DC2626", href: "/loan-installments" },
  od_interest:    { label: "ดอกเบี้ย OD", icon: "📈", color: "#B45309", href: "/od-facilities" },
  china:          { label: "เงินจีน",     icon: "🇨🇳", color: "#DB2777", href: "/app/china-pay" },
  manual:         { label: "รายการประจำ", icon: "📌", color: "#0F766E", href: "/cashflow" },
};

export const CASHFLOW_CERTAINTY: Record<CashflowCertainty, { label: string; hint: string; badge: string }> = {
  actual:   { label: "แน่นอน",    hint: "ยืนยันวันและยอดแล้ว",                              badge: "bg-emerald-100 text-emerald-700" },
  expected: { label: "คาดว่าจะ",  hint: "มีเอกสารจริงรออยู่ แต่วันอาจเลื่อนได้",             badge: "bg-blue-100 text-blue-700" },
  estimate: { label: "ประมาณการ", hint: "ระบบเดาให้จากค่าเฉลี่ย/ค่าตั้งต้น ยังไม่มีเอกสารจริง", badge: "bg-slate-100 text-slate-600" },
};

export const sourceLabel = (s: string) => CASHFLOW_SOURCE[s as CashflowSource]?.label ?? s;
export const sourceIcon  = (s: string) => CASHFLOW_SOURCE[s as CashflowSource]?.icon  ?? "•";
export const sourceColor = (s: string) => CASHFLOW_SOURCE[s as CashflowSource]?.color ?? "#94a3b8";

// ============================================================
// วันที่ — ใช้ UTC ล้วน เพื่อไม่ให้เวลาไทย (UTC+7) ร่นวันไป 1 วัน
// (กับดักที่เคยเจอ: new Date(y, m, 1).toISOString() ในเขตเวลาไทยจะได้วันก่อนหน้า)
// ============================================================

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** "YYYY-MM-DD" → Date (เที่ยงคืน UTC) */
export function parseISO(iso: string): Date {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export const toISO = (d: Date): string => d.toISOString().slice(0, 10);

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** วันสุดท้ายของเดือนที่ iso อยู่ */
export function endOfMonthISO(iso: string): string {
  const d = parseISO(iso);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** วันที่ N ของเดือนที่ iso อยู่ (ถ้าเดือนนั้นสั้นกว่า → วันสุดท้ายของเดือน) */
export function dayOfMonthISO(iso: string, day: number): string {
  const d = parseISO(iso);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(day, last))));
}

/** วันที่ 1 ของทุกเดือนที่คาบเกี่ยวช่วง from..to */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = parseISO(to);
  const cur = parseISO(from);
  cur.setUTCDate(1);
  while (cur <= end) {
    out.push(toISO(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/** จำนวนวันจาก a ถึง b (b - a) */
export const daysBetween = (a: string, b: string): number =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);

// ============================================================
// รวมยอด
// ============================================================

export type CashflowDay = {
  date: string;
  in: number;
  out: number;
  net: number;
  /** เงินคงเหลือสะสม ณ สิ้นวันนั้น */
  balance: number;
  events: CashflowEvent[];
};

export type CashflowSeries = {
  days: CashflowDay[];
  /** ของค้างรับจากอดีต (ก่อนวัน from) ที่ทบเข้ายอดตั้งต้น */
  carriedIn: number;
  /** ของค้างจ่ายจากอดีต ที่ทบเข้ายอดตั้งต้น */
  carriedOut: number;
  /** เงินคงเหลือ ณ จุดเริ่มต้นกราฟ (= ยอดตั้งต้น + ค้างรับ - ค้างจ่าย) */
  startBalance: number;
};

/**
 * สร้างเส้นเงินคงเหลือรายวัน
 * - รายการที่ตกก่อนวัน from จะถูกยุบรวมเข้า "ยอดยกมา" (ไม่ทิ้ง — ของค้างเก่ายังต้องรับ/ต้องจ่าย)
 * - คืนเฉพาะวันที่มีรายการ (ไม่ปั่นแถวว่างเป็นร้อย ๆ วัน)
 */
export function buildDailySeries(
  events: CashflowEvent[],
  openingBalance: number,
  from: string,
  to: string,
): CashflowSeries {
  let carriedIn = 0;
  let carriedOut = 0;
  const byDate = new Map<string, CashflowEvent[]>();

  for (const e of events) {
    if (e.date > to) continue;
    if (e.date < from) {
      if (e.direction === "in") carriedIn += e.amount;
      else carriedOut += e.amount;
      continue;
    }
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  const startBalance = openingBalance + carriedIn - carriedOut;
  let running = startBalance;
  const days: CashflowDay[] = [];

  for (const date of [...byDate.keys()].sort()) {
    const list = byDate.get(date)!;
    let inAmt = 0;
    let outAmt = 0;
    for (const e of list) {
      if (e.direction === "in") inAmt += e.amount;
      else outAmt += e.amount;
    }
    running += inAmt - outAmt;
    days.push({ date, in: inAmt, out: outAmt, net: inAmt - outAmt, balance: running, events: list });
  }

  return { days, carriedIn, carriedOut, startBalance };
}

/** วันแรกที่เงินคงเหลือติดลบ (null = ไม่ติดลบเลยในช่วงนี้) */
export function firstNegativeDay(days: CashflowDay[]): CashflowDay | null {
  return days.find((d) => d.balance < 0) ?? null;
}

export type CashflowTotals = { in: number; out: number; net: number; count: number };

export function totals(events: CashflowEvent[]): CashflowTotals {
  let inAmt = 0;
  let outAmt = 0;
  for (const e of events) {
    if (e.direction === "in") inAmt += e.amount;
    else outAmt += e.amount;
  }
  return { in: inAmt, out: outAmt, net: inAmt - outAmt, count: events.length };
}

/** รวมยอดแยกตามแหล่ง — ใช้ทำการ์ดสรุป */
export function totalsBySource(
  events: CashflowEvent[],
): { source: CashflowSource; in: number; out: number; count: number }[] {
  const map = new Map<CashflowSource, { source: CashflowSource; in: number; out: number; count: number }>();
  for (const e of events) {
    const cur = map.get(e.source) ?? { source: e.source, in: 0, out: 0, count: 0 };
    if (e.direction === "in") cur.in += e.amount;
    else cur.out += e.amount;
    cur.count += 1;
    map.set(e.source, cur);
  }
  return [...map.values()].sort((a, b) => b.in + b.out - (a.in + a.out));
}

/** รวมยอดรายเดือน — ใช้ทำกราฟแท่ง */
export function totalsByMonth(
  days: CashflowDay[],
): { month: string; in: number; out: number; net: number; endBalance: number }[] {
  const map = new Map<string, { month: string; in: number; out: number; net: number; endBalance: number }>();
  for (const d of days) {
    const month = d.date.slice(0, 7);
    const cur = map.get(month) ?? { month, in: 0, out: 0, net: 0, endBalance: 0 };
    cur.in += d.in;
    cur.out += d.out;
    cur.net = cur.in - cur.out;
    cur.endBalance = d.balance;   // วันสุดท้ายของเดือนที่มีรายการ = ยอดคงเหลือสิ้นเดือน
    map.set(month, cur);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ============================================================
// แสดงผล
// ============================================================

/** ฿1,234,567 — ตัดทศนิยมทิ้งเพื่อให้อ่านตัวเลขใหญ่ง่าย */
export const THB = (n: number): string =>
  (n < 0 ? "-฿" : "฿") + Math.abs(Math.round(n)).toLocaleString("th-TH");

/** ย่อหลักล้าน/พัน สำหรับแกนกราฟ เช่น 1.2 ล้าน */
export function THBShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} ล้าน`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

/** ชื่อเดือนไทยแบบสั้น จาก "YYYY-MM" */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function monthLabelTH(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTHS[(m || 1) - 1]} ${String((y || 0) + 543).slice(-2)}`;
}


// ============================================================
// รายการที่กรอกเอง (ค่าเช่า · ค่าน้ำไฟ · ภาษี · ประกันสังคม)
// ============================================================

export type ManualRepeatKind = "once" | "monthly";

/** หมวดที่ใช้บ่อย — เลือกจากดรอปดาวน์ได้ หรือพิมพ์เองก็ได้ */
export const MANUAL_CATEGORIES = [
  "ค่าเช่า",
  "ค่าน้ำ / ค่าไฟ",
  "อินเทอร์เน็ต / โทรศัพท์",
  "ภาษี",
  "ประกันสังคม",
  "ค่าขนส่ง",
  "ค่าบริการรายเดือน",
  "อื่น ๆ",
];

/**
 * วันที่ของรายการรายเดือนในเดือนที่ระบุ
 * day = 0 หมายถึงสิ้นเดือน · เดือนที่สั้นกว่าวันที่ระบุจะเลื่อนมาวันสุดท้ายให้เอง
 * (เช่น ตั้งวันที่ 31 เดือน ก.พ. จะได้ 28/29)
 */
export function manualDateInMonth(monthStart: string, day: number): string {
  return day <= 0 ? endOfMonthISO(monthStart) : dayOfMonthISO(monthStart, day);
}

/** ป้ายไทยของรอบ เช่น "ทุกวันที่ 5" / "ทุกสิ้นเดือน" / "ครั้งเดียว 5 ก.ย." */
export function manualScheduleLabel(
  kind: string, dayOfMonth: number | null | undefined, onceDate: string | null | undefined,
): string {
  if (kind === "once") return onceDate ? `ครั้งเดียว ${formatDayMonthTH(onceDate)}` : "ครั้งเดียว";
  if (dayOfMonth === 0) return "ทุกสิ้นเดือน";
  return dayOfMonth ? `ทุกวันที่ ${dayOfMonth}` : "ทุกเดือน";
}

const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-09-05" → "5 ก.ย." */
export function formatDayMonthTH(iso: string): string {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${TH_MONTHS_SHORT[d.getUTCMonth()]}`;
}

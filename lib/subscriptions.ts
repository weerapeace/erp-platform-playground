/**
 * ของกลางแอป Subscription — ใช้ร่วมทั้งหน้า UI และ API
 *
 * ⚠️ ใช้ตาราง `subscriptions` + `subscription_invoices` + Storage bucket `invoices`
 *    ที่แอปเดิม (software-subscriptions.pages.dev) ใช้อยู่ — ข้อมูลชุดเดียวกัน ไม่สร้างซ้ำ
 * ⚠️ คอลัมน์ข้อความหลายช่อง (chrome_profile/invoice_url/notes/account_email/card_last4)
 *    เป็น NOT NULL default '' → ตอนเขียน DB ต้องใช้ `?? ''` ห้ามเป็น null (ดู toSubRow)
 */

export type BillingCycle = "monthly" | "yearly" | "one-time";
export type Currency = "THB" | "USD" | "EUR";
export type SubType = "work" | "personal";

/** รูปแบบ row ตรงกับ DB (snake_case) — หน้า UI บริโภคตรง ๆ ไม่ต้อง map */
export type Subscription = {
  id: string;
  name: string;
  category: string;
  billing_cycle: BillingCycle;
  cost: number;
  currency: Currency;
  billing_date: string | null;
  chrome_profile: string;
  chrome_profile_url: string;
  chrome_profile_dir: string; // โฟลเดอร์โปรไฟล์ Chrome จริง เช่น "Profile 3" / "Default" (สำหรับสร้างไฟล์เปิด Chrome)
  invoice_url: string;
  notes: string;
  active: boolean;
  type: SubType;
  account_email: string;
  card_last4: string;
  pending_cancel: boolean;
  want_to_buy: boolean;
  created_at?: string;
  updated_at?: string;
};

/** ค่าที่รับจากฟอร์ม (ยังไม่มี id ตอนสร้าง) */
export type SubInput = Omit<Subscription, "id" | "created_at" | "updated_at">;

export type SubSettings = {
  exchange_rate: number; // THB ต่อ 1 USD
  eur_rate: number;      // THB ต่อ 1 EUR
  display_currency: Currency;
};

export type SubInvoice = {
  id: string;
  subscription_id: string;
  month: string;      // "YYYY-MM"
  file_name: string;
  file_path: string;
  uploaded_at: string;
  url?: string | null; // signed url (เติมจาก API)
};

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "รายเดือน",
  yearly: "รายปี",
  "one-time": "จ่ายครั้งเดียว",
};

export const TYPE_LABEL: Record<SubType, string> = {
  work: "งาน",
  personal: "ส่วนตัว",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  THB: "฿",
  USD: "$",
  EUR: "€",
};

/** แปลงเป็นบาทตามสกุลเงินของรายการ */
export function toTHB(cost: number, currency: Currency, s: Pick<SubSettings, "exchange_rate" | "eur_rate">): number {
  if (currency === "USD") return cost * (s.exchange_rate || 0);
  if (currency === "EUR") return cost * (s.eur_rate || 0);
  return cost;
}

/** ค่าใช้จ่าย "ต่อเดือน" ในหน่วยบาท (yearly หาร 12, one-time ไม่นับเป็นค่าประจำ) */
export function monthlyTHB(sub: Subscription, s: SubSettings): number {
  const base = toTHB(Number(sub.cost) || 0, sub.currency, s);
  if (sub.billing_cycle === "monthly") return base;
  if (sub.billing_cycle === "yearly") return base / 12;
  return 0;
}

/** ค่าใช้จ่าย "ต่อปี" ในหน่วยบาท */
export function yearlyTHB(sub: Subscription, s: SubSettings): number {
  const base = toTHB(Number(sub.cost) || 0, sub.currency, s);
  if (sub.billing_cycle === "monthly") return base * 12;
  if (sub.billing_cycle === "yearly") return base;
  return 0;
}

/** parse "YYYY-MM-DD" เป็น Date แบบ local (กัน timezone เลื่อนวัน) */
function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function startOfToday(): Date { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** จำนวนวันจากวันนี้ถึงวันที่ (บวก=อีกกี่วัน, ลบ=เลยมาแล้ว, null=ไม่มีวันที่) */
export function daysUntil(dateStr: string | null | undefined): number | null {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
}

/**
 * "รอบต่ออายุถัดไป" (ISO วันที่) — เลื่อนวันตามรอบบิลให้เป็นวันในอนาคตที่ใกล้ที่สุด
 * - monthly: วันเดิมของทุกเดือน (วันไม่พอในเดือนสั้น → ปัดเป็นวันสุดท้าย)
 * - yearly:  เดือน/วันเดิมของทุกปี
 * - one-time: คงวันที่เดิม (จ่ายครั้งเดียว)
 * ใช้ทั้งการ์ดสรุป, ตาราง, ปฏิทิน และการแจ้งเตือน (ให้ตรงกันหมด)
 */
export function nextRenewal(sub: Pick<Subscription, "billing_date" | "billing_cycle">): string | null {
  const base = parseLocalDate(sub.billing_date);
  if (!base) return null;
  if (sub.billing_cycle === "one-time") return isoLocal(base);
  const today = startOfToday();
  const anchorDay = base.getDate();

  const clampDay = (y: number, mIndex: number, day: number) => {
    const dim = new Date(y, mIndex + 1, 0).getDate(); // จำนวนวันในเดือน
    const d = new Date(y, mIndex, Math.min(day, dim)); d.setHours(0, 0, 0, 0); return d;
  };

  if (sub.billing_cycle === "monthly") {
    for (let add = 0; add < 13; add++) {
      const cand = clampDay(today.getFullYear(), today.getMonth() + add, anchorDay);
      if (cand.getTime() >= today.getTime()) return isoLocal(cand);
    }
  } else { // yearly
    const anchorMonth = base.getMonth();
    for (let add = 0; add < 2; add++) {
      const cand = clampDay(today.getFullYear() + add, anchorMonth, anchorDay);
      if (cand.getTime() >= today.getTime()) return isoLocal(cand);
    }
  }
  return isoLocal(base);
}

/** เกณฑ์วันสำหรับแจ้งเตือน (cron วิ่งวันละครั้ง → แต่ละเกณฑ์เด้งครั้งเดียว ไม่ต้อง dedupe) */
export const RENEWAL_THRESHOLDS = [7, 3, 1, 0, -1];

/** ป้ายสถานะแบบข้อความ (ใช้ filter/group/แสดง) — รวม active/pending_cancel/want_to_buy เป็นค่าเดียว */
export function subStatusLabel(s: Pick<Subscription, "active" | "pending_cancel" | "want_to_buy">): string {
  if (s.want_to_buy) return "อยากซื้อ";
  if (!s.active && s.pending_cancel) return "ยกเลิกแล้ว";
  if (!s.active) return "ปิด";
  if (s.pending_cancel) return "กำลังยกเลิก";
  return "ใช้งาน";
}

/** ฟอร์แมตราคาตามสกุลเงินของรายการ เช่น "$20.00" / "฿571.38" */
export function fmtCost(cost: number, currency: Currency): string {
  return `${CURRENCY_SYMBOL[currency] ?? ""}${Number(cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ฟอร์แมตบาท (ปัดเศษ) เช่น "฿1,700" */
export function fmtBaht(v: number, digits = 0): string {
  return `฿${Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** map ค่าจาก input → row สำหรับเขียน DB — บังคับ ?? '' กันชน NOT NULL */
export function toSubRow(input: Partial<SubInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = String(input.name).trim();
  if (input.category !== undefined) row.category = input.category || "Other";
  if (input.billing_cycle !== undefined) row.billing_cycle = input.billing_cycle;
  if (input.cost !== undefined) row.cost = Number(input.cost) || 0;
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.billing_date !== undefined) row.billing_date = input.billing_date || null; // date คงเป็น null ได้
  if (input.chrome_profile !== undefined) row.chrome_profile = input.chrome_profile ?? "";
  if (input.chrome_profile_url !== undefined) row.chrome_profile_url = input.chrome_profile_url ?? "";
  if (input.chrome_profile_dir !== undefined) row.chrome_profile_dir = input.chrome_profile_dir ?? "";
  if (input.invoice_url !== undefined) row.invoice_url = input.invoice_url ?? "";
  if (input.notes !== undefined) row.notes = input.notes ?? "";
  if (input.active !== undefined) row.active = !!input.active;
  if (input.type !== undefined) row.type = input.type;
  if (input.account_email !== undefined) row.account_email = input.account_email ?? "";
  if (input.card_last4 !== undefined) row.card_last4 = input.card_last4 ?? "";
  if (input.pending_cancel !== undefined) row.pending_cancel = !!input.pending_cancel;
  if (input.want_to_buy !== undefined) row.want_to_buy = !!input.want_to_buy;
  return row;
}

const CYCLES: BillingCycle[] = ["monthly", "yearly", "one-time"];
const CURRENCIES: Currency[] = ["THB", "USD", "EUR"];
const TYPES: SubType[] = ["work", "personal"];

/** ตรวจ input ก่อนบันทึก — คืน error string หรือ null ถ้าผ่าน */
export function validateSubInput(input: Partial<SubInput>, isCreate: boolean): string | null {
  if (isCreate || input.name !== undefined) {
    if (!input.name || !String(input.name).trim()) return "กรุณาใส่ชื่อรายการ";
  }
  if (input.cost !== undefined && (isNaN(Number(input.cost)) || Number(input.cost) < 0)) return "ราคาต้องเป็นตัวเลขไม่ติดลบ";
  if (input.billing_cycle !== undefined && !CYCLES.includes(input.billing_cycle)) return "รอบบิลไม่ถูกต้อง";
  if (input.currency !== undefined && !CURRENCIES.includes(input.currency)) return "สกุลเงินไม่ถูกต้อง";
  if (input.type !== undefined && !TYPES.includes(input.type)) return "ประเภทไม่ถูกต้อง";
  return null;
}

/**
 * เครดิตการจ่าย (Purchase Credit Term) — ของกลาง
 * เก็บที่ partners_v2.purchase_credit_term เป็น text: immediate | eom | days:N | months:N | monthday:N
 * ใช้คำนวณ "วันครบกำหนดจ่าย" จากวันที่ซื้อ (order_date) ในปฏิทินจัดซื้อโหมดจ่ายเงิน
 *
 * กติกา (ตามที่เจ้าของเลือก):
 *  - สิ้นเดือน (eom)      = สิ้นเดือน "ที่ซื้อ"
 *  - ทุกวันที่ X (monthday)      = วันที่ X ของ "เดือนที่ซื้อ" ถ้ายังไม่เลย · เลยแล้ว → เดือนถัดไป
 *  - ทุกวันที่ X (monthday_next) = วันที่ X ของ "เดือนถัดไป" เสมอ (ซื้อเดือนนี้ จ่ายเดือนหน้า)
 */
export type CreditTerm =
  | { type: "immediate" }
  | { type: "eom" }
  | { type: "days"; value: number }
  | { type: "months"; value: number }
  | { type: "monthday"; value: number }
  | { type: "monthday_next"; value: number };

export function parseCreditTerm(s: string | null | undefined): CreditTerm | null {
  if (!s) return null;
  const [t, v] = String(s).split(":");
  const n = Number(v);
  switch (t) {
    case "immediate": return { type: "immediate" };
    case "eom":       return { type: "eom" };
    case "days":      return isFinite(n) && n > 0 ? { type: "days", value: Math.round(n) } : null;
    case "months":    return isFinite(n) && n > 0 ? { type: "months", value: Math.round(n) } : null;
    case "monthday":  return isFinite(n) && n >= 1 && n <= 31 ? { type: "monthday", value: Math.round(n) } : null;
    case "monthday_next": return isFinite(n) && n >= 1 && n <= 31 ? { type: "monthday_next", value: Math.round(n) } : null;
    default:          return null;
  }
}

/** ข้อความไทยอ่านง่าย เช่น "15 วัน", "ทุกวันที่ 5", "สิ้นเดือน" */
export function formatCreditTerm(s: string | null | undefined): string {
  const t = parseCreditTerm(s);
  if (!t) return "—";
  switch (t.type) {
    case "immediate": return "ต้องชำระเลย";
    case "eom":       return "สิ้นเดือน";
    case "days":      return `${t.value} วัน`;
    case "months":    return `${t.value} เดือน`;
    case "monthday":  return `ทุกวันที่ ${t.value}`;
    case "monthday_next": return `ทุกวันที่ ${t.value} (เดือนถัดไป)`;
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();   // m = 0-based

/** วันครบกำหนดจ่าย ("YYYY-MM-DD") จากวันซื้อ + เครดิต · null ถ้าคำนวณไม่ได้ */
export function computeDueDate(orderDate: string | null | undefined, termStr: string | null | undefined): string | null {
  const term = parseCreditTerm(termStr);
  if (!term || !orderDate) return null;
  const d = new Date(String(orderDate).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  switch (term.type) {
    case "immediate":
      return fmt(d);
    case "days": {
      const r = new Date(d); r.setDate(r.getDate() + term.value); return fmt(r);
    }
    case "months": {
      const day = d.getDate();
      const r = new Date(d.getFullYear(), d.getMonth(), 1);   // เลี่ยง overflow วันที่
      r.setMonth(r.getMonth() + term.value);
      r.setDate(Math.min(day, lastDayOfMonth(r.getFullYear(), r.getMonth())));
      return fmt(r);
    }
    case "eom":
      return fmt(new Date(d.getFullYear(), d.getMonth(), lastDayOfMonth(d.getFullYear(), d.getMonth())));
    case "monthday": {
      let y = d.getFullYear(), m = d.getMonth();
      if (d.getDate() > term.value) { m += 1; if (m > 11) { m = 0; y += 1; } }   // เลยวันที่แล้ว → เดือนถัดไป
      const dd = Math.min(term.value, lastDayOfMonth(y, m));                      // clamp เช่น 31 ในก.พ.
      return fmt(new Date(y, m, dd));
    }
    case "monthday_next": {
      let y = d.getFullYear(), m = d.getMonth() + 1;   // เดือนถัดไปเสมอ (ไม่สนว่าวันซื้อเลยวันที่ X หรือยัง)
      if (m > 11) { m = 0; y += 1; }
      const dd = Math.min(term.value, lastDayOfMonth(y, m));
      return fmt(new Date(y, m, dd));
    }
  }
}

// ────────────────────────────────────────────────────────────────
// ระยะเวลาส่งของ (Lead Time) ต่อร้าน — partners_v2.purchase_lead_time
// รูปแบบ: "N" = N วันนับจากวันสั่ง · "N|after_pay" = N วันนับจากวันชำระเงิน
// ────────────────────────────────────────────────────────────────
export type LeadTime = { days: number; afterPayment: boolean };

export function parseLeadTime(s: string | null | undefined): LeadTime | null {
  if (!s) return null;
  const [d, flag] = String(s).split("|");
  const n = Number(d);
  if (!isFinite(n) || n < 0) return null;
  return { days: Math.round(n), afterPayment: (flag ?? "").trim() === "after_pay" };
}

export function formatLeadTime(s: string | null | undefined): string {
  const t = parseLeadTime(s);
  if (!t) return "—";
  return `${t.days} วัน${t.afterPayment ? " (หลังชำระเงิน)" : ""}`;
}

/** วันของเข้า = วันตั้งต้น + lead time · baseDate เลือกเองตาม afterPayment (วันสั่ง หรือ วันจ่าย) */
export function computeArrivalDate(baseDate: string | null | undefined, leadStr: string | null | undefined): string | null {
  const t = parseLeadTime(leadStr);
  if (!t || !baseDate) return null;
  const d = new Date(String(baseDate).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + t.days);
  return fmt(d);
}

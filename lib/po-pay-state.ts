/**
 * ของกลาง: สถานะจ่ายเงินของใบสั่งซื้อ (สีป้าย) — ใช้ทุกหน้า: รับเข้า · รับสินค้าเข้า · รายการ PO · ป๊อปใบสั่งซื้อ
 * เจ้าของสั่ง 2026-11-04 (แผนภาพ flow จัดซื้อ ขั้น 2):
 *   ร้านไม่มีเครดิต: ยังไม่จ่าย = แดง · จ่ายแล้ว = เขียว
 *   ร้านมีเครดิต:   สั่งแล้ว (ค้างจ่าย) = ส้ม · จ่ายแล้ว = เขียว
 *   + เพิ่ม: ลงบิลแล้ว รอโอน (ผูกบิลแอปโอนเงินจีน china_bill_id) = เหลือง · เลยกำหนดจ่าย (ร้านเครดิต) = แดงเข้ม
 * "มีเครดิต" = ร้านตั้ง purchase_credit_term ที่ไม่ใช่ "จ่ายทันที" (lib/credit-term) · หรือใบตั้งวันครบกำหนดเอง · หรือร้าน "ส่งก่อนจ่าย"
 * ร้านที่ไม่ตั้งเครดิต = นับเป็นไม่มีเครดิต
 * ไฟล์ pure — ทดสอบได้ lib/__tests__/po-pay-state.test.ts · สี (Tailwind) อยู่ที่ components/po-pay-chip
 * ก่อนแก้กติกา: npm run where-used -- purchasing
 */
import { computeDueDate, parseCreditTerm } from "@/lib/credit-term";

export type PoPayStateKey = "paid" | "billed" | "credit_due" | "overdue" | "unpaid";

export type PoPayInput = {
  payment_status?: string | null;
  paid_date?: string | null;
  /** ผูกบิลแอปโอนเงินจีนแล้ว (ลงบิลแล้ว รอโอน) */
  china_bill_id?: string | null;
  /** เครดิตการจ่ายของร้าน (partners_v2.purchase_credit_term) */
  credit_term?: string | null;
  /** ร้าน "ส่งก่อนจ่าย" (partners_v2.ship_before_pay) — ได้ของก่อนค่อยจ่าย = แบบเครดิต */
  ship_before_pay?: boolean | null;
  order_date?: string | null;
  /** วันครบกำหนดจ่ายที่ตั้งเองในใบ (ชนะเครดิตร้าน) */
  payment_due_date?: string | null;
};

export type PoPayState = {
  state: PoPayStateKey;
  label: string;
  /** วันครบกำหนดจ่าย (YYYY-MM-DD) — มีเฉพาะร้านเครดิต */
  due: string | null;
  /** เลยกำหนดกี่วัน (overdue เท่านั้น) */
  overdue_days: number | null;
};

const thShort = (d: string) => new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10) + "T00:00:00Z") - Date.parse(from.slice(0, 10) + "T00:00:00Z")) / 86400000);
/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export const todayBkk = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** ร้านนี้ "มีเครดิต" ไหม (ตั้งเครดิตที่ไม่ใช่จ่ายทันที) */
export function hasCredit(term: string | null | undefined): boolean {
  const t = parseCreditTerm(term);
  return !!t && t.type !== "immediate";
}

export function poPayState(i: PoPayInput, today: string = todayBkk()): PoPayState {
  if (String(i.payment_status ?? "").toLowerCase() === "paid") {
    return { state: "paid", label: `จ่ายแล้ว${i.paid_date ? ` ${thShort(i.paid_date)}` : ""}`, due: null, overdue_days: null };
  }
  if (i.china_bill_id) return { state: "billed", label: "ลงบิลแล้ว รอโอน", due: null, overdue_days: null };
  const credit = hasCredit(i.credit_term);
  const due = i.payment_due_date?.slice(0, 10) || (credit ? computeDueDate(i.order_date, i.credit_term) : null);
  if (due) {
    const late = dayDiff(due, today);
    if (late > 0) return { state: "overdue", label: `เลยกำหนดจ่าย ${late} วัน`, due, overdue_days: late };
    return { state: "credit_due", label: `สั่งแล้ว (ค้างจ่าย) · ครบ ${thShort(due)}`, due, overdue_days: null };
  }
  if (credit || i.ship_before_pay) return { state: "credit_due", label: i.ship_before_pay && !credit ? "ส่งก่อนจ่าย (ค้างจ่าย)" : "สั่งแล้ว (ค้างจ่าย)", due: null, overdue_days: null };
  return { state: "unpaid", label: "ยังไม่จ่ายเงิน", due: null, overdue_days: null };
}

/** ชิปกรอง: ยังไม่จ่าย (แดง+เลยกำหนด) / รอโอน / ค้างจ่าย (เครดิต) / จ่ายแล้ว */
export const PO_PAY_FILTERS: { key: "unpaid" | "billed" | "credit" | "paid"; label: string; states: PoPayStateKey[] }[] = [
  { key: "unpaid", label: "ยังไม่จ่าย", states: ["unpaid", "overdue"] },
  { key: "billed", label: "ลงบิลแล้ว รอโอน", states: ["billed"] },
  { key: "credit", label: "ค้างจ่าย (เครดิต)", states: ["credit_due"] },
  { key: "paid", label: "จ่ายแล้ว", states: ["paid"] },
];

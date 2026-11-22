/**
 * ไลน์บริษัท รอบ 3 — หน้าเล็กในไลน์ของพนักงาน: เงินเดือน · ใบเตือน · งานเหมาของฉัน (กติกาล้วน ใช้ได้ทั้งหน้าเว็บ/เซิร์ฟเวอร์)
 * ตัวดึงข้อมูล: lib/line-self-view-server.ts · หน้า: app/a/self-view.tsx (?me=payslip|warning|piecework) · คู่มือ docs/line-company-oa.md
 *
 * กติกา:
 *   - ตัวเงินไม่พิมพ์ในแชต — เปิดหน้าเล็กที่เช็กตัวตนจาก LINE ใหม่ทุกครั้ง
 *   - ผูกด้วยรหัส+เบอร์ ต้องรอ HR ยืนยันตัวตนก่อนเห็นอะไรทั้ง 3 หน้า
 *   - สลิปเห็นเฉพาะงวดที่ HR กด "เปิดให้ดูในไลน์" · หน้าตาตัวเลขตามสลิปกระดาษ (ไม่โชว์เงินเดือน · ยอดสุทธิเข้ารหัส)
 */
import {
  encodePayslipNetPay, payslipDisplayMoneyItems, roundPayslipNetPay, visiblePayslipItems,
} from "@/lib/payroll-payslip-print";

export type LineSelfPage = "payslip" | "warning" | "piecework";
export const LINE_SELF_PAGES: LineSelfPage[] = ["payslip", "warning", "piecework"];
export const isLineSelfPage = (v: unknown): v is LineSelfPage => typeof v === "string" && (LINE_SELF_PAGES as string[]).includes(v);

export const LINE_SELF_TITLE: Record<LineSelfPage, string> = {
  payslip: "เงินเดือนของฉัน",
  warning: "ใบเตือนของฉัน",
  piecework: "งานเหมาของฉัน",
};

/** สถานะที่หน้าเล็กต้องรู้ก่อนโชว์ข้อมูล */
export type LineSelfGate = "ok" | "not_linked" | "blocked" | "wait_hr";
export const LINE_SELF_GATE_TEXT: Record<Exclude<LineSelfGate, "ok">, { title: string; body: string }> = {
  not_linked: { title: "ไลน์นี้ยังไม่ได้ผูกกับรหัสพนักงาน", body: "สแกน QR พนักงานที่ติดในโรงงาน หรือขอบัตร QR จากฝ่ายบุคคล แล้วค่อยเปิดหน้านี้ใหม่" },
  blocked: { title: "ไลน์นี้ถูกระงับการดูข้อมูล", body: "ติดต่อฝ่ายบุคคล" },
  wait_hr: { title: "รอฝ่ายบุคคลยืนยันตัวตน", body: "ผูกไลน์เรียบร้อยแล้ว เพื่อความปลอดภัย ฝ่ายบุคคลต้องกดยืนยันว่าเป็นคุณจริงก่อน จึงจะเห็นเงินเดือน ใบเตือน และงานเหมา" },
};

// ---------------------------------------------------------------- สลิป

export type SelfSlipSummary = { id: string; payslip_no: string; period_name: string; start_date: string | null; end_date: string | null };
export type SelfMoneyRow = { label: string; amount: number };
export type SelfSlipDetail = SelfSlipSummary & {
  lang: "th" | "en";
  earnings: SelfMoneyRow[];
  earnings_total: number;
  deductions: SelfMoneyRow[];
  deduction_total: number;
  /** ยอดสุทธิ — ไทย = รหัสตัวอักษรแบบสลิปกระดาษ · อังกฤษ = ตัวเลข */
  net_display: string;
  net_is_code: boolean;
  work_days: number | null;
};

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * ตัวเลขบนสลิปในไลน์ = กติกาเดียวกับสลิปกระดาษ (app/payroll/payslips/print/content.tsx · เจ้าของยืนยัน 2026-08-31)
 *   ไม่โชว์บรรทัดเงินเดือน · รวมรายได้ = ผลรวมบรรทัดที่เห็น · รวมหัก = ยอดจริง · ยอดสุทธิไทยเข้ารหัส
 */
export function selfSlipDetail(base: SelfSlipSummary, input: { line: Record<string, unknown>; total_deduction: unknown; net_pay: unknown; lang: "th" | "en" }): SelfSlipDetail {
  const { lang, line } = input;
  const items = payslipDisplayMoneyItems(line);
  const rows = (xs: ReturnType<typeof visiblePayslipItems>) => xs.map((x) => ({ label: lang === "en" ? x.en : x.th, amount: x.amount }));
  const earnings = visiblePayslipItems(items.earnings);
  const net = roundPayslipNetPay(input.net_pay).rounded;
  const days = num(line.work_days || line.attendance_days);
  return {
    ...base,
    lang,
    earnings: rows(earnings),
    earnings_total: r2(earnings.reduce((a, x) => a + x.amount, 0)),
    deductions: rows(visiblePayslipItems(items.deductions)),
    deduction_total: r2(num(input.total_deduction)),
    net_display: lang === "en" ? net.toLocaleString("en-US") : encodePayslipNetPay(net),
    net_is_code: lang !== "en",
    work_days: days > 0 ? days : null,
  };
}

// ---------------------------------------------------------------- ใบเตือน

export type SelfWarning = { id: string; warning_date: string | null; title: string; detail: string; severity: string; active: boolean };

// ---------------------------------------------------------------- งานเหมา

export type SelfWorkOrder = {
  id: string; wo_no: string; product: string; stage: string; uom: string;
  qty: number; received_qty: number; status: string; dispatch_date: string | null; due_date: string | null;
  /** ฉันส่งไปแล้วกี่ชิ้น + ค่าแรงที่ลงแล้ว (จากรอบส่งงาน) */
  my_sent_qty: number; my_wage: number;
  /** ทำร่วมกี่คน (1 = ทำคนเดียว) */
  people: number;
};
export type SelfSubmission = { wo_id: string; craftsman_id: string | null; qty: number; wage: number | null; submitted_at: string | null };

/** สถานะใบจ่ายงาน → คำไทย */
export const WO_STATUS_TEXT: Record<string, string> = { dispatched: "กำลังทำ", done: "ส่งครบแล้ว", cancelled: "ยกเลิก" };

/**
 * รวมรอบส่งงานเป็นของฉันต่อใบ — นับเฉพาะรอบที่ลงชื่อฉัน · รอบที่ไม่ได้ลงชื่อใคร นับให้เฉพาะใบที่ฉันทำคนเดียว
 * (ใบทำร่วมหลายคนที่ไม่ได้แยกชื่อ ระบบไม่เดาว่าเป็นของใคร)
 */
export function mySubmissionTotals(employeeId: string, people: Map<string, number>, subs: SelfSubmission[]): Map<string, { qty: number; wage: number }> {
  const out = new Map<string, { qty: number; wage: number }>();
  for (const s of subs) {
    const mine = s.craftsman_id ? s.craftsman_id === employeeId : (people.get(s.wo_id) ?? 1) <= 1;
    if (!mine) continue;
    const cur = out.get(s.wo_id) ?? { qty: 0, wage: 0 };
    cur.qty += num(s.qty);
    cur.wage = r2(cur.wage + num(s.wage));
    out.set(s.wo_id, cur);
  }
  return out;
}

/** ค่าแรงที่ลงแล้วเดือนนี้ (ตามวันส่งงาน · เวลาไทย) */
export function wageThisMonth(employeeId: string, people: Map<string, number>, subs: SelfSubmission[], now = new Date()): number {
  const th = new Date(now.getTime() + 7 * 3600 * 1000);
  const ym = `${th.getUTCFullYear()}-${String(th.getUTCMonth() + 1).padStart(2, "0")}`;
  const sameMonth = subs.filter((s) => (s.submitted_at ?? "").slice(0, 7) === ym);
  let sum = 0;
  for (const v of mySubmissionTotals(employeeId, people, sameMonth).values()) sum += v.wage;
  return r2(sum);
}

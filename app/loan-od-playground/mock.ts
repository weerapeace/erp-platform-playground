// Loan & OD Playground — mock data (ไม่ต่อฐานข้อมูลจริง)
import type {
  LoanLifecycle, DrawdownStatus, RepaymentHealth, AccountingStatus,
  PaymentStatus, ODLifecycle,
} from "./workflow";

export const THB = (n: number) =>
  "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ---------------- Loan Contract ----------------
export type LoanType =
  | "term" | "revolving" | "leasing" | "director" | "vehicle" | "machine" | "short_term";

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  term: "เงินกู้มีกำหนด (Term)",
  revolving: "เงินกู้หมุนเวียน (Revolving)",
  leasing: "ลีสซิ่ง",
  director: "เงินกู้กรรมการ",
  vehicle: "สินเชื่อรถยนต์",
  machine: "เงินกู้ซื้อเครื่องจักร",
  short_term: "เงินกู้ระยะสั้น",
};

export type LoanContract = {
  id: string;
  loan_code: string;
  loan_name: string;
  lender: string;
  loan_type: LoanType;
  contract_no: string;
  company: string;
  start_date: string;
  end_date: string;
  approved_limit: number;
  contracted_principal: number;
  interest_rate: number;
  interest_rate_type: "fixed" | "floating";
  interest_rate_reference: string;
  repayment_method: string;
  payment_frequency: string;
  responsible: string;
  // 4-layer status
  lifecycle_status: LoanLifecycle;
  drawdown_status: DrawdownStatus;
  repayment_health: RepaymentHealth;
  accounting_status: AccountingStatus;
  // computed (ไม่ให้กรอกมือ)
  total_drawn_amount: number;
  principal_paid_amount: number;
  outstanding_principal: number;
  next_due_date: string;
  next_due_amount: number;
  created_by: string;
  created_at: string;
};

export const MOCK_LOANS: LoanContract[] = [
  {
    id: "L1", loan_code: "LOAN-2026-0001", loan_name: "เงินกู้ซื้อเครื่องจักรฉีดพลาสติก",
    lender: "ธนาคารกสิกรไทย", loan_type: "machine", contract_no: "KBANK-CT-77120", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    start_date: "2025-01-15", end_date: "2030-01-15",
    approved_limit: 5000000, contracted_principal: 5000000,
    interest_rate: 6.75, interest_rate_type: "floating", interest_rate_reference: "MLR - 1.50%",
    repayment_method: "งวดเท่ากัน (Equal Installment)", payment_frequency: "รายเดือน",
    responsible: "สมหญิง (การเงิน)",
    lifecycle_status: "active", drawdown_status: "fully_drawn", repayment_health: "current", accounting_status: "exported",
    total_drawn_amount: 5000000, principal_paid_amount: 1800000, outstanding_principal: 3200000,
    next_due_date: "2026-07-15", next_due_amount: 92500,
    created_by: "สมหญิง", created_at: "15 ม.ค. 2025",
  },
  {
    id: "L2", loan_code: "LOAN-2026-0002", loan_name: "วงเงินหมุนเวียนเพื่อการค้า",
    lender: "ธนาคารไทยพาณิชย์", loan_type: "revolving", contract_no: "SCB-RV-40912", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    start_date: "2025-06-01", end_date: "2026-06-01",
    approved_limit: 3000000, contracted_principal: 3000000,
    interest_rate: 7.25, interest_rate_type: "floating", interest_rate_reference: "MOR",
    repayment_method: "จ่ายดอกเบี้ยอย่างเดียว (Interest Only)", payment_frequency: "รายเดือน",
    responsible: "สมหญิง (การเงิน)",
    lifecycle_status: "active", drawdown_status: "partially_drawn", repayment_health: "due", accounting_status: "ready",
    total_drawn_amount: 1500000, principal_paid_amount: 0, outstanding_principal: 1500000,
    next_due_date: "2026-07-12", next_due_amount: 9062,
    created_by: "สมหญิง", created_at: "1 มิ.ย. 2025",
  },
  {
    id: "L3", loan_code: "LOAN-2026-0003", loan_name: "สินเชื่อรถกระบะส่งของ (Isuzu)",
    lender: "ธนาคารกรุงศรีอยุธยา", loan_type: "vehicle", contract_no: "BAY-HP-11238", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    start_date: "2024-03-10", end_date: "2029-03-10",
    approved_limit: 1200000, contracted_principal: 1200000,
    interest_rate: 3.25, interest_rate_type: "fixed", interest_rate_reference: "",
    repayment_method: "เงินต้นเท่ากัน (Equal Principal)", payment_frequency: "รายเดือน",
    responsible: "อนุชา (บัญชี)",
    lifecycle_status: "active", drawdown_status: "fully_drawn", repayment_health: "overdue", accounting_status: "ready",
    total_drawn_amount: 1200000, principal_paid_amount: 720000, outstanding_principal: 480000,
    next_due_date: "2026-06-10", next_due_amount: 21500,
    created_by: "อนุชา", created_at: "10 มี.ค. 2024",
  },
  {
    id: "L4", loan_code: "LOAN-2026-0004", loan_name: "เงินกู้กรรมการ (เสริมสภาพคล่อง)",
    lender: "กรรมการ — คุณวีระ", loan_type: "director", contract_no: "DIR-2025-02", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    start_date: "2025-09-01", end_date: "2027-09-01",
    approved_limit: 800000, contracted_principal: 800000,
    interest_rate: 4.00, interest_rate_type: "fixed", interest_rate_reference: "",
    repayment_method: "กำหนดเอง (Custom)", payment_frequency: "รายไตรมาส",
    responsible: "สมหญิง (การเงิน)",
    lifecycle_status: "active", drawdown_status: "fully_drawn", repayment_health: "current", accounting_status: "not_ready",
    total_drawn_amount: 800000, principal_paid_amount: 200000, outstanding_principal: 600000,
    next_due_date: "2026-09-01", next_due_amount: 100000,
    created_by: "สมหญิง", created_at: "1 ก.ย. 2025",
  },
  {
    id: "L5", loan_code: "LOAN-2026-0005", loan_name: "เงินกู้ระยะสั้นตุนวัตถุดิบ",
    lender: "ธนาคารกสิกรไทย", loan_type: "short_term", contract_no: "(รออนุมัติ)", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    start_date: "2026-07-20", end_date: "2027-01-20",
    approved_limit: 1000000, contracted_principal: 1000000,
    interest_rate: 6.50, interest_rate_type: "fixed", interest_rate_reference: "",
    repayment_method: "งวดเท่ากัน (Equal Installment)", payment_frequency: "รายเดือน",
    responsible: "สมหญิง (การเงิน)",
    lifecycle_status: "pending_approval", drawdown_status: "not_drawn", repayment_health: "current", accounting_status: "not_ready",
    total_drawn_amount: 0, principal_paid_amount: 0, outstanding_principal: 0,
    next_due_date: "—", next_due_amount: 0,
    created_by: "สมหญิง", created_at: "8 ก.ค. 2026",
  },
];

// ---------------- Repayment Schedule (ของ LOAN-2026-0001) ----------------
export type Installment = {
  no: number; due_date: string;
  opening_principal: number; principal_due: number; interest_due: number;
  total_due: number; total_paid: number; closing_principal: number;
  status: "paid" | "partial" | "unpaid" | "overdue";
};

export const MOCK_SCHEDULE: Installment[] = [
  { no: 18, due_date: "2026-06-15", opening_principal: 3292500, principal_due: 74000, interest_due: 18516, total_due: 92516, total_paid: 92516, closing_principal: 3218500, status: "paid" },
  { no: 19, due_date: "2026-07-15", opening_principal: 3218500, principal_due: 74400, interest_due: 18104, total_due: 92504, total_paid: 0, closing_principal: 3144100, status: "unpaid" },
  { no: 20, due_date: "2026-08-15", opening_principal: 3144100, principal_due: 74820, interest_due: 17685, total_due: 92505, total_paid: 0, closing_principal: 3069280, status: "unpaid" },
  { no: 21, due_date: "2026-09-15", opening_principal: 3069280, principal_due: 75240, interest_due: 17264, total_due: 92504, total_paid: 0, closing_principal: 2994040, status: "unpaid" },
  { no: 22, due_date: "2026-10-15", opening_principal: 2994040, principal_due: 75663, interest_due: 16841, total_due: 92504, total_paid: 0, closing_principal: 2918377, status: "unpaid" },
];

// ---------------- Payments + Allocation (ของ LOAN-2026-0001) ----------------
export type PaymentAllocationRow = {
  installment_no: number;
  principal: number; interest: number; fee: number; penalty: number;
};

export type Payment = {
  id: string; payment_no: string; loan_code: string; loan_name: string;
  payment_date: string; paid_from: string; total_paid: number; withholding_tax: number;
  reference_no: string; status: PaymentStatus; verified_by: string;
  allocations: PaymentAllocationRow[];
};

export const MOCK_PAYMENTS: Payment[] = [
  {
    id: "P1", payment_no: "LPAY-2026-0031", loan_code: "LOAN-2026-0001", loan_name: "เงินกู้ซื้อเครื่องจักรฉีดพลาสติก",
    payment_date: "2026-06-15", paid_from: "KBANK 123-4-56789-0", total_paid: 92516, withholding_tax: 0,
    reference_no: "TRF-0615-8842", status: "verified", verified_by: "อนุชา (บัญชี)",
    allocations: [{ installment_no: 18, principal: 74000, interest: 18516, fee: 0, penalty: 0 }],
  },
  {
    id: "P2", payment_no: "LPAY-2026-0030", loan_code: "LOAN-2026-0003", loan_name: "สินเชื่อรถกระบะส่งของ (Isuzu)",
    payment_date: "2026-05-10", paid_from: "SCB 987-6-54321-0", total_paid: 21500, withholding_tax: 0,
    reference_no: "TRF-0510-2210", status: "verified", verified_by: "อนุชา (บัญชี)",
    allocations: [{ installment_no: 27, principal: 20000, interest: 1500, fee: 0, penalty: 0 }],
  },
  {
    id: "P3", payment_no: "LPAY-2026-0032", loan_code: "LOAN-2026-0002", loan_name: "วงเงินหมุนเวียนเพื่อการค้า",
    payment_date: "2026-07-12", paid_from: "KBANK 123-4-56789-0", total_paid: 9062, withholding_tax: 0,
    reference_no: "", status: "submitted", verified_by: "",
    allocations: [{ installment_no: 13, principal: 0, interest: 9062, fee: 0, penalty: 0 }],
  },
  {
    id: "P4", payment_no: "LPAY-2026-0029", loan_code: "LOAN-2026-0001", loan_name: "เงินกู้ซื้อเครื่องจักรฉีดพลาสติก",
    payment_date: "2026-05-15", paid_from: "KBANK 123-4-56789-0", total_paid: 92520, withholding_tax: 0,
    reference_no: "TRF-0515-7781", status: "reversed", verified_by: "อนุชา (บัญชี)",
    allocations: [{ installment_no: 17, principal: 73600, interest: 18920, fee: 0, penalty: 0 }],
  },
];

// ---------------- OD Facility ----------------
export type ODFacility = {
  id: string; od_code: string; lender: string; bank_account: string; company: string;
  limit_amount: number; interest_rate: number; interest_rate_reference: string;
  start_date: string; review_date: string; expiry_date: string; responsible: string;
  lifecycle_status: ODLifecycle;
  // computed
  current_used_amount: number; available_limit: number; utilization_percent: number;
  highest_used_this_month: number; estimated_interest_this_month: number; continuous_usage_days: number;
};

export const MOCK_OD: ODFacility[] = [
  {
    id: "OD1", od_code: "OD-2026-01", lender: "ธนาคารกสิกรไทย", bank_account: "KBANK 123-4-56789-0 (เดินสะพัด)", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    limit_amount: 2000000, interest_rate: 8.10, interest_rate_reference: "MOR + 0.75%",
    start_date: "2025-01-01", review_date: "2026-01-01", expiry_date: "2026-12-31", responsible: "สมหญิง (การเงิน)",
    lifecycle_status: "active",
    current_used_amount: 1650000, available_limit: 350000, utilization_percent: 82.5,
    highest_used_this_month: 1820000, estimated_interest_this_month: 11350, continuous_usage_days: 42,
  },
  {
    id: "OD2", od_code: "OD-2026-02", lender: "ธนาคารไทยพาณิชย์", bank_account: "SCB 987-6-54321-0 (เดินสะพัด)", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    limit_amount: 1000000, interest_rate: 7.90, interest_rate_reference: "MOR + 0.55%",
    start_date: "2025-03-01", review_date: "2026-03-01", expiry_date: "2027-03-01", responsible: "อนุชา (บัญชี)",
    lifecycle_status: "active",
    current_used_amount: 300000, available_limit: 700000, utilization_percent: 30.0,
    highest_used_this_month: 520000, estimated_interest_this_month: 2140, continuous_usage_days: 8,
  },
  {
    id: "OD3", od_code: "OD-2026-03", lender: "ธนาคารกรุงเทพ", bank_account: "BBL 111-2-33333-0 (เดินสะพัด)", company: "บริษัท พิกซี่ดัสตี้ จำกัด",
    limit_amount: 500000, interest_rate: 8.50, interest_rate_reference: "MOR + 1.15%",
    start_date: "2024-08-01", review_date: "2026-08-01", expiry_date: "2026-08-01", responsible: "สมหญิง (การเงิน)",
    lifecycle_status: "active",
    current_used_amount: 498000, available_limit: 2000, utilization_percent: 99.6,
    highest_used_this_month: 500000, estimated_interest_this_month: 3480, continuous_usage_days: 61,
  },
];

// ---------------- Statement Import preview (ของ OD-2026-01) ----------------
export type StatementRow = {
  date: string; description: string; money_in: number; money_out: number; balance: number;
  flag: "ok" | "duplicate" | "warning";
};

export const MOCK_STATEMENT_ROWS: StatementRow[] = [
  { date: "2026-07-01", description: "ยอดยกมา", money_in: 0, money_out: 0, balance: -1520000, flag: "ok" },
  { date: "2026-07-02", description: "รับโอน — ลูกค้า A", money_in: 350000, money_out: 0, balance: -1170000, flag: "ok" },
  { date: "2026-07-03", description: "จ่ายซัพพลายเออร์ B", money_in: 0, money_out: 480000, balance: -1650000, flag: "ok" },
  { date: "2026-07-04", description: "ค่าธรรมเนียมโอน", money_in: 0, money_out: 200, balance: -1650200, flag: "warning" },
  { date: "2026-07-04", description: "ค่าธรรมเนียมโอน", money_in: 0, money_out: 200, balance: -1650200, flag: "duplicate" },
  { date: "2026-07-05", description: "รับโอน — ลูกค้า C", money_in: 120000, money_out: 0, balance: -1530200, flag: "ok" },
];

// ---------------- Interest Reconciliation (ของ OD-2026-01) ----------------
export type ReconRow = {
  month: string; estimated: number; actual: number | null; diff: number | null;
  diff_pct: number | null; status: "accepted" | "need_review" | "waiting";
};

export const MOCK_RECON: ReconRow[] = [
  { month: "2026-04", estimated: 10820, actual: 10800, diff: -20, diff_pct: -0.18, status: "accepted" },
  { month: "2026-05", estimated: 11040, actual: 11350, diff: 310, diff_pct: 2.81, status: "need_review" },
  { month: "2026-06", estimated: 11200, actual: 11180, diff: -20, diff_pct: -0.18, status: "accepted" },
  { month: "2026-07", estimated: 11350, actual: null, diff: null, diff_pct: null, status: "waiting" },
];

// ---------------- Collateral ----------------
export type Collateral = {
  code: string; type: string; owner: string; appraised_value: number; pledged_amount: number;
  document_expiry: string; linked_to: string;
};

export const MOCK_COLLATERAL: Collateral[] = [
  { code: "COL-0001", type: "ที่ดินพร้อมสิ่งปลูกสร้าง", owner: "บริษัท พิกซี่ดัสตี้ จำกัด", appraised_value: 8500000, pledged_amount: 5000000, document_expiry: "—", linked_to: "LOAN-2026-0001" },
  { code: "COL-0002", type: "เครื่องจักร", owner: "บริษัท พิกซี่ดัสตี้ จำกัด", appraised_value: 3200000, pledged_amount: 2000000, document_expiry: "—", linked_to: "OD-2026-01" },
  { code: "COL-0003", type: "ค้ำประกันส่วนบุคคล (กรรมการ)", owner: "คุณวีระ", appraised_value: 0, pledged_amount: 3000000, document_expiry: "2027-09-01", linked_to: "LOAN-2026-0002, OD-2026-01" },
];

// ---------------- Alerts (สำหรับ Dashboard) ----------------
export type Alert = {
  id: string; level: "info" | "warning" | "danger"; icon: string; title: string; detail: string; link: string;
};

export const MOCK_ALERTS: Alert[] = [
  { id: "A1", level: "danger",  icon: "⚠️", title: "เกินกำหนดชำระ 1 รายการ", detail: "LOAN-2026-0003 งวด 28 ครบกำหนด 10 มิ.ย. 2026 — เกินมา 31 วัน", link: "LOAN-2026-0003" },
  { id: "A2", level: "danger",  icon: "🔴", title: "OD ใช้เกิน 95%", detail: "OD-2026-03 ใช้ไป 99.6% (เหลือวงเงิน ฿2,000)", link: "OD-2026-03" },
  { id: "A3", level: "warning", icon: "🟠", title: "OD ใช้เกิน 70%", detail: "OD-2026-01 ใช้ไป 82.5% ต่อเนื่อง 42 วัน", link: "OD-2026-01" },
  { id: "A4", level: "warning", icon: "🔔", title: "ใกล้ครบกำหนดใน 3 วัน", detail: "LOAN-2026-0002 งวดดอกเบี้ย ครบกำหนด 12 ก.ค. 2026", link: "LOAN-2026-0002" },
  { id: "A5", level: "warning", icon: "📊", title: "ดอกเบี้ยจริงต่างจากประมาณการ", detail: "OD-2026-01 เดือน พ.ค. ต่าง +฿310 (2.81%) — ต้องตรวจสอบ", link: "OD-2026-01" },
  { id: "A6", level: "info",    icon: "⌛", title: "วงเงินใกล้หมดอายุ", detail: "OD-2026-03 หมดอายุ/ทบทวน 1 ส.ค. 2026 (อีก 21 วัน)", link: "OD-2026-03" },
  { id: "A7", level: "info",    icon: "📄", title: "รอตรวจสอบ/อนุมัติ", detail: "มี Payment 1 รายการ และสัญญา 1 ฉบับรออนุมัติ", link: "" },
];

// ---------------- Dashboard summary (คำนวณจากรายการต้นทาง) ----------------
export const DASHBOARD_AS_OF = "11 ก.ค. 2026";

export function loanSummary() {
  const active = MOCK_LOANS.filter((l) => l.lifecycle_status === "active");
  const outstanding = active.reduce((s, l) => s + l.outstanding_principal, 0);
  const dueThisMonth = MOCK_LOANS
    .filter((l) => l.next_due_date.startsWith("2026-07"))
    .reduce((s, l) => s + l.next_due_amount, 0);
  const overdueAmount = MOCK_LOANS
    .filter((l) => l.repayment_health === "overdue")
    .reduce((s, l) => s + l.next_due_amount, 0);
  return { outstanding, dueThisMonth, overdueAmount, activeCount: active.length };
}

export function odSummary() {
  const active = MOCK_OD.filter((o) => o.lifecycle_status === "active");
  const totalLimit = active.reduce((s, o) => s + o.limit_amount, 0);
  const totalUsed = active.reduce((s, o) => s + o.current_used_amount, 0);
  return { totalLimit, totalUsed, available: totalLimit - totalUsed, count: active.length };
}

"use client";

/**
 * การจ่ายเงินกู้ (Loan Payments) — Phase 1d
 * URL: /loan-payments · ตาราง loan_payments
 * ปุ่ม "+ บันทึกการจ่าย" → ตัดยอดเข้าดอกเบี้ย/เงินต้นตามงวด (rebuild) + อัปเดตเงินต้นคงเหลือในสัญญา
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { RecordPaymentModal } from "./record-modal";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS: Record<string, [string, string]> = {
  draft:     ["ร่าง", "bg-slate-100 text-slate-600 border-slate-200"],
  submitted: ["ส่งตรวจสอบ", "bg-amber-50 text-amber-700 border-amber-200"],
  verified:  ["ยืนยันแล้ว", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  cancelled: ["ยกเลิก", "bg-slate-50 text-slate-400 border-slate-200"],
  reversed:  ["กลับรายการ", "bg-purple-50 text-purple-700 border-purple-200"],
};
const money = (v: unknown) => {
  const n = Number(v);
  return n > 0 ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "loan-payments",
  moduleKey:   "loan-payments",
  tableId:     "loan-payments",
  title:       "การจ่ายเงินกู้",
  description: "บันทึกการจ่ายแต่ละครั้ง — ระบบตัดยอดเข้าดอกเบี้ย/เงินต้นตามงวดให้อัตโนมัติ",
  icon:        "💸",
  formLayout:  "sections",
  activeField: "is_active",
  exportEntityType: "loan_payments",
  permissions: {
    view:   "loan_payments.view",
    create: "loan_payments.create",
    edit:   "loan_payments.edit",
  },
  customCreate: {
    label: "+ บันทึกการจ่าย",
    render: ({ open, onClose, onCreated }) => (
      <RecordPaymentModal open={open} onClose={onClose} onCreated={onCreated} />
    ),
  },
  cellRenderers: {
    total_paid: money,
    withholding_tax: money,
    status: (v) => {
      const m = STATUS[String(v ?? "")];
      return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span> : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
  },
};

export default function LoanPaymentsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

"use client";

/**
 * งวดผ่อนชำระ (Loan Installments) — Phase 1c (ดูอย่างเดียว)
 * URL: /loan-installments · ตาราง loan_installments
 * งวดถูกสร้างจาก "ตารางผ่อน" (generate) — กรองดูตามสัญญาได้
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const PAY_STATUS: Record<string, [string, string]> = {
  unpaid:  ["ยังไม่จ่าย", "bg-slate-100 text-slate-500 border-slate-200"],
  partial: ["จ่ายบางส่วน", "bg-amber-50 text-amber-700 border-amber-200"],
  paid:    ["จ่ายครบ", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  overdue: ["เกินกำหนด", "bg-red-50 text-red-700 border-red-200"],
};
const money = (v: unknown) => {
  const n = Number(v);
  return n !== 0 ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "loan-installments",
  moduleKey:   "loan-installments",
  tableId:     "loan-installments",
  title:       "งวดผ่อนชำระ",
  description: "รายละเอียดงวดผ่อนทั้งหมด (สร้างจากตารางผ่อน) — กรองดูตามสัญญาได้",
  icon:        "🧾",
  activeField: "is_active",
  exportEntityType: "loan_installments",
  readOnly:    true,
  defaultShowAllColumns: false,
  permissions: {
    view:   "loan_installments.view",
    create: "loan_installments.view",
    edit:   "loan_installments.view",
  },
  cellRenderers: {
    principal_due: money,
    interest_due: money,
    total_due: money,
    closing_principal: money,
    payment_status: (v) => {
      const m = PAY_STATUS[String(v ?? "")];
      return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span> : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
  },
};

export default function LoanInstallmentsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

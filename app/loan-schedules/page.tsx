"use client";

/**
 * ตารางผ่อน (Repayment Schedule Versions) — Phase 1c
 * URL: /loan-schedules · ตาราง loan_schedule_versions
 * ปุ่ม "+ สร้างตารางผ่อน" = generate อัตโนมัติ (3 วิธี) → เวอร์ชันเดิมกลายเป็น superseded (ไม่ทับ)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { GenerateScheduleModal } from "./generate-modal";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const METHOD: Record<string, string> = {
  equal_installment: "งวดเท่ากัน", equal_principal: "เงินต้นเท่ากัน",
  interest_only: "ดอกเบี้ยอย่างเดียว", custom: "กำหนดเอง",
};
const STATUS: Record<string, [string, string]> = {
  draft:      ["ร่าง", "bg-slate-100 text-slate-600 border-slate-200"],
  active:     ["ใช้อยู่", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  superseded: ["เก่า (ถูกแทนที่)", "bg-slate-50 text-slate-400 border-slate-200"],
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "loan-schedule-versions",
  moduleKey:   "loan-schedule-versions",
  tableId:     "loan-schedule-versions",
  title:       "ตารางผ่อน",
  description: "ตารางผ่อนชำระของแต่ละสัญญา — เก็บเป็นเวอร์ชัน ไม่ทับของเก่า",
  icon:        "📅",
  formLayout:  "sections",
  activeField: "is_active",
  exportEntityType: "loan_schedule_versions",
  permissions: {
    view:   "loan_schedules.view",
    create: "loan_schedules.create",
    edit:   "loan_schedules.edit",
  },
  customCreate: {
    label: "+ สร้างตารางผ่อน",
    render: ({ open, onClose, onCreated }) => (
      <GenerateScheduleModal open={open} onClose={onClose} onCreated={onCreated} />
    ),
  },
  cellRenderers: {
    version_no: (v) => <span className="font-mono text-xs text-slate-600">v{String(v ?? "")}</span>,
    calculation_method: (v) => <span className="text-sm text-slate-600">{METHOD[String(v ?? "")] ?? String(v ?? "—")}</span>,
    total_due: (v) => {
      const n = Number(v);
      return n > 0 ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-300">—</span>;
    },
    status: (v) => {
      const m = STATUS[String(v ?? "")];
      return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span> : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
  },
};

export default function LoanSchedulesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

"use client";

/**
 * การเบิกเงินกู้ (Loan Drawdowns) — Master Data v2 (Phase 1b)
 * URL: /loan-drawdowns · ตาราง loan_drawdowns
 * เบิกที่ "ยืนยันแล้ว (confirmed)" → trigger คิดยอดเบิกสะสม/เงินต้นคงเหลือใน loan_contracts อัตโนมัติ
 * ยอดรับสุทธิ (net) = ยอดเบิก − ค่าธรรมเนียม (คิดโดย trigger)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS: Record<string, [string, string]> = {
  draft:     ["ร่าง", "bg-slate-100 text-slate-600 border-slate-200"],
  submitted: ["ส่งตรวจสอบ", "bg-amber-50 text-amber-700 border-amber-200"],
  verified:  ["ตรวจแล้ว", "bg-blue-50 text-blue-700 border-blue-200"],
  confirmed: ["ยืนยันแล้ว", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  cancelled: ["ยกเลิก", "bg-slate-50 text-slate-400 border-slate-200"],
  reversed:  ["กลับรายการ", "bg-purple-50 text-purple-700 border-purple-200"],
};
const money = (v: unknown) => {
  const n = Number(v);
  return n > 0
    ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span>
    : <span className="text-xs text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "loan-drawdowns",
  moduleKey:   "loan-drawdowns",
  tableId:     "loan-drawdowns",
  title:       "การเบิกเงินกู้",
  description: "บันทึกการเบิกเงินแต่ละครั้ง — เมื่อยืนยันแล้ว ระบบคิดยอดเบิกสะสม/เงินต้นคงเหลือในสัญญาให้อัตโนมัติ",
  icon:        "💵",
  formLayout:  "sections",
  activeField: "is_active",
  exportEntityType: "loan_drawdowns",
  permissions: {
    view:   "loan_drawdowns.view",
    create: "loan_drawdowns.create",
    edit:   "loan_drawdowns.edit",
  },
  createDefaults: { status: "confirmed" },
  cellRenderers: {
    status: (v) => {
      const m = STATUS[String(v ?? "")];
      return m
        ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span>
        : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
    gross_amount: money,
    fee_amount: money,
    net_received_amount: money,
  },
};

export default function LoanDrawdownsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

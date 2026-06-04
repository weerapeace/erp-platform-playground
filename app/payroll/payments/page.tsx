"use client";

/** Payroll module — รอบจ่ายเงิน (Phase 3) — อ่านอย่างเดียว (payment_batches 6) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { statusBadge, PAY_STATUS } from "@/components/payroll/cells";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const BATCH_TYPE: Record<string, string> = { bank: "โอนธนาคาร", cash: "เงินสด", mid_month: "กลางเดือน", advance: "เบิกล่วงหน้า" };

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/view/", apiPath: "payment-batches", tableId: "payroll-payments",
  title: "รอบจ่ายเงิน (Payroll)", icon: "🏦",
  description: "รอบจ่ายเงิน 6 รอบ — อ่านอย่างเดียว",
  readOnly: true, hideActiveStatus: true, pageLimit: 1000, exportEntityType: "payment_batch",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: ["batch_no", "period_name"],
  fields: [
    { key: "batch_no",     label: "เลขที่รอบ", type: "text", colSize: 160 },
    { key: "period_name",  label: "งวด",       type: "text", colSize: 170 },
    { key: "batch_type",   label: "ประเภท",    type: "text", colSize: 120, cellRender: (v) => <span className="text-sm">{BATCH_TYPE[String(v)] ?? String(v)}</span> },
    { key: "payment_date", label: "วันจ่าย",   type: "text", colSize: 120 },
    { key: "status",       label: "สถานะ",     type: "text", colSize: 110, cellRender: statusBadge(PAY_STATUS) },
    { key: "note",         label: "หมายเหตุ",  type: "text", colSize: 200 },
  ],
};

export default function PayrollPaymentsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

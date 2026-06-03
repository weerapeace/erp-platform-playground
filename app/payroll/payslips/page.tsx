"use client";

/** Payroll module — สลิปเงินเดือน (Phase 3) — อ่านอย่างเดียว (payroll_payslips 133) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { money, statusBadge, PAY_STATUS } from "@/components/payroll/cells";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/view/", apiPath: "payslips", tableId: "payroll-payslips",
  title: "สลิปเงินเดือน (Payroll)", icon: "🧾",
  description: "สลิปที่ออกแล้ว 133 ใบ — อ่านอย่างเดียว",
  readOnly: true, pageLimit: 1000, exportEntityType: "payroll_payslip",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: ["payslip_no", "employee_name", "period_name"],
  fields: [
    { key: "payslip_no",    label: "เลขที่สลิป", type: "text", colSize: 150 },
    { key: "employee_name", label: "พนักงาน",   type: "text", colSize: 200 },
    { key: "period_name",   label: "งวด",        type: "text", colSize: 170 },
    { key: "gross_pay",     label: "รายได้รวม",  type: "number", colSize: 120, cellRender: money },
    { key: "total_deduction", label: "หักรวม",   type: "number", colSize: 110, cellRender: money },
    { key: "net_pay",       label: "สุทธิ",      type: "number", colSize: 120, cellRender: money },
    { key: "slip_type",     label: "ประเภท",     type: "text", colSize: 100 },
    { key: "status",        label: "สถานะ",      type: "text", colSize: 100, cellRender: statusBadge(PAY_STATUS) },
  ],
};

export default function PayrollPayslipsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

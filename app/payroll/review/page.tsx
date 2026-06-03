"use client";

/**
 * Payroll module — ตรวจสอบเงินเดือน (Phase 3) — อ่านอย่างเดียว
 * แสดงผลคำนวณจาก payroll_lines (2,644) ที่แอปเดิมคำนวณไว้ — ไม่แก้ตรงนี้
 * serverMode: ดึงทีละหน้า (ตารางใหญ่)
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { money, statusBadge, PAY_STATUS } from "@/components/payroll/cells";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/view/", apiPath: "payroll-lines", tableId: "payroll-review",
  title: "ตรวจสอบเงินเดือน (Payroll)", icon: "✅",
  description: "ผลคำนวณเงินเดือน 2,644 รายการ — อ่านอย่างเดียว (การคำนวณยังทำที่แอปเดิม)",
  readOnly: true, serverMode: true, exportEntityType: "payroll_line",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: [],
  fields: [
    { key: "employee_name", label: "พนักงาน",  type: "text", colSize: 200, sortable: false },
    { key: "period_name",   label: "งวด",       type: "text", colSize: 170, sortable: false },
    { key: "base_salary",   label: "เงินเดือน", type: "number", colSize: 110, cellRender: money },
    { key: "gross_pay",     label: "รายได้รวม", type: "number", colSize: 120, cellRender: money },
    { key: "total_deduction", label: "หักรวม",  type: "number", colSize: 110, cellRender: money },
    { key: "social_security_employee", label: "ปกส.", type: "number", colSize: 100, cellRender: money },
    { key: "withholding_tax", label: "ภาษี",    type: "number", colSize: 100, cellRender: money },
    { key: "net_pay",       label: "สุทธิ",     type: "number", colSize: 120, cellRender: money },
    { key: "status",        label: "สถานะ",     type: "text", colSize: 100, cellRender: statusBadge(PAY_STATUS) },
  ],
};

export default function PayrollReviewPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

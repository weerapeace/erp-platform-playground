"use client";

/** Payroll module — เวลาเข้าออก (Phase 3) — อ่านอย่างเดียว (attendance_entries 242) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { money, statusBadge, PAY_STATUS } from "@/components/payroll/cells";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const ENTRY_TYPE: Record<string, string> = { attendance: "มาทำงาน", absence: "ขาด", late: "สาย", leave: "ลา", overtime: "OT" };

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/view/", apiPath: "attendance", tableId: "payroll-attendance",
  title: "เวลาเข้าออก (Payroll)", icon: "⏰",
  description: "บันทึกเวลาเข้าออก 242 รายการ — อ่านอย่างเดียว",
  readOnly: true, pageLimit: 1000, exportEntityType: "attendance_entry",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: ["employee_name", "period_name"],
  fields: [
    { key: "employee_name", label: "พนักงาน",  type: "text", colSize: 200 },
    { key: "work_date",     label: "วันที่",    type: "text", colSize: 110 },
    { key: "entry_type",    label: "ประเภท",    type: "text", colSize: 100, cellRender: (v) => <span className="text-sm">{ENTRY_TYPE[String(v)] ?? String(v)}</span> },
    { key: "regular_hours", label: "ชม.ปกติ",   type: "number", colSize: 90 },
    { key: "late_minutes",  label: "สาย(นาที)", type: "number", colSize: 90 },
    { key: "late_deduction", label: "หักสาย",   type: "number", colSize: 100, cellRender: money },
    { key: "absence_hours", label: "ขาด(ชม.)",  type: "number", colSize: 90 },
    { key: "status",        label: "สถานะ",     type: "text", colSize: 100, cellRender: statusBadge(PAY_STATUS) },
    { key: "source_type",   label: "ที่มา",     type: "text", colSize: 100 },
  ],
};

export default function PayrollAttendancePage() {
  return <MasterCRUDPage config={CONFIG} />;
}

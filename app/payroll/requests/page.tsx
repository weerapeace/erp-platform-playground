"use client";

/** Payroll module — คำขอจากพนักงาน (Phase 4) — อ่านอย่างเดียว (employee_portal_requests) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { statusBadge, PAY_STATUS } from "@/components/payroll/cells";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const REQ_TYPE: Record<string, string> = { profile_edit: "ขอแก้ข้อมูล", medical: "ใบรับรองแพทย์", leave: "ขอลา" };

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/view/", apiPath: "requests", tableId: "payroll-requests",
  title: "คำขอจากพนักงาน (Payroll)", icon: "📨",
  description: "คำขอที่พนักงานส่งผ่าน LINE portal — อ่านอย่างเดียว (อนุมัติทำที่แอปเดิม)",
  readOnly: true, pageLimit: 1000, exportEntityType: "employee_portal_request",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: ["employee_name"],
  fields: [
    { key: "employee_name", label: "พนักงาน",   type: "text", colSize: 200 },
    { key: "request_type",  label: "ประเภทคำขอ", type: "text", colSize: 130, cellRender: (v) => <span className="text-sm">{REQ_TYPE[String(v)] ?? String(v)}</span> },
    { key: "target_field",  label: "ฟิลด์",      type: "text", colSize: 130 },
    { key: "old_value",     label: "ค่าเดิม",    type: "text", colSize: 150 },
    { key: "new_value",     label: "ค่าใหม่",    type: "text", colSize: 150 },
    { key: "status",        label: "สถานะ",      type: "text", colSize: 110, cellRender: statusBadge(PAY_STATUS) },
  ],
};

export default function PayrollRequestsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

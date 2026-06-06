"use client";

/** Payroll — ใบเตือนพนักงาน — โชว์ badge ในบอร์ดพนักงาน */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const SEV: Record<string, { th: string; cls: string }> = {
  low: { th: "เบา", cls: "bg-slate-100 text-slate-600" },
  medium: { th: "ปานกลาง", cls: "bg-amber-100 text-amber-700" },
  high: { th: "รุนแรง", cls: "bg-red-100 text-red-700" },
};
const STATUS = ["active", "revoked"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "warnings", tableId: "payroll-warnings",
  moduleKey: "payroll-warnings",
  title: "ใบเตือนพนักงาน (Payroll)", icon: "⚠️",
  description: "บันทึกใบเตือน — จำนวนใบเตือนที่ active จะโชว์เป็น badge แดงบนการ์ดในบอร์ดพนักงาน",
  uniqueKey: "id", activeField: "active", exportEntityType: "employee_warning",
  searchKeys: ["title"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  cellRenderers: {
    severity: (v) => { const s = SEV[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" }; return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>; },
  },
  fields: [
    { key: "employee_id",  label: "พนักงาน",     type: "text", colSize: 200, groupKey: "core", order: 10 },
    { key: "warning_date", label: "วันที่เตือน",  type: "date", colSize: 130, required: true, groupKey: "core", order: 20 },
    { key: "title",        label: "เรื่อง",       type: "text", colSize: 260, required: true, formSpan: 2, groupKey: "core", order: 30 },
    { key: "severity",     label: "ระดับ",        type: "select", colSize: 110, options: ["low", "medium", "high"], filterable: true, groupKey: "core", order: 40 },
    { key: "detail",       label: "รายละเอียด",   type: "textarea", formSpan: 2, groupKey: "core", order: 50 },
    { key: "status",       label: "สถานะ",        type: "select", colSize: 110, options: STATUS, filterable: true, groupKey: "core", order: 60 },
  ],
};

export default function PayrollWarningsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

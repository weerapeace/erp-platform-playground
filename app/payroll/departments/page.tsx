"use client";

/**
 * Payroll module — แผนก (Phase 2 / master data) — ของจริง
 * ต่อ departments ผ่าน /api/payroll/master/departments
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS = ["active", "inactive"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "departments", tableId: "payroll-departments",
  title: "แผนก (Payroll)", icon: "🗂️",
  description: "แผนกจริง — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey: "code", activeField: "active", exportEntityType: "payroll_department",
  searchKeys: ["code", "name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "code",          label: "รหัส",      type: "text", colSize: 100, groupKey: "core", order: 10 },
    { key: "name",          label: "ชื่อแผนก",  type: "text", colSize: 200, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "display_order", label: "ลำดับ",     type: "number", colSize: 80, groupKey: "core", order: 30 },
    { key: "status",        label: "สถานะ",     type: "select", colSize: 100, options: STATUS, filterable: true, groupKey: "core", order: 40 },
    { key: "note",          label: "หมายเหตุ",  type: "textarea", formSpan: 2, groupKey: "core", order: 50 },
  ],
};

export default function PayrollDepartmentsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

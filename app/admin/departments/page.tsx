"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const CONFIG: MasterCRUDConfig = {
  apiPath:     "departments",
  tableId:     "admin-departments",
  title:       "แผนก",
  icon:        "🏢",
  description: "Department master — ใช้ใน Approval Rules / Org chart",
  exportEntityType: "erp_playground_department",
  searchKeys:  ["code", "name", "manager_name"],
  permissions: { view: "departments.view", create: "departments.create", edit: "departments.edit" },
  fields: [
    { key: "code",         label: "รหัสแผนก",   type: "text", colSize: 110, placeholder: "DEP-PRO" },
    { key: "name",         label: "ชื่อแผนก",   type: "text", colSize: 200, required: true, formSpan: 2 },
    { key: "manager_name", label: "ผู้จัดการ",   type: "text", colSize: 180 },
    { key: "parent_code",  label: "สังกัด (parent)", type: "text", colSize: 120 },
    { key: "note",         label: "หมายเหตุ",   type: "textarea", formSpan: 2 },
  ],
};

export default function AdminDepartmentsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

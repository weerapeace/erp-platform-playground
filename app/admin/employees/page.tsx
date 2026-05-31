"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const CONFIG: MasterCRUDConfig = {
  apiPath:     "employees",
  tableId:     "admin-employees",
  title:       "พนักงาน",
  icon:        "👥",
  description: "Employee master — ใช้ใน HR / PR / Approval",
  exportEntityType: "erp_playground_employee",
  searchKeys:  ["code", "name", "email", "department"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  fields: [
    { key: "code",       label: "รหัสพนักงาน", type: "text", colSize: 110, placeholder: "EMP-001" },
    { key: "name",       label: "ชื่อ-นามสกุล", type: "text", colSize: 200, required: true, formSpan: 2 },
    { key: "position",   label: "ตำแหน่ง",      type: "text", colSize: 160 },
    { key: "department", label: "แผนก",          type: "text", colSize: 140 },
    { key: "email",      label: "อีเมล",          type: "text", colSize: 200, formSpan: 2, validations: ["email"] },
    { key: "phone",      label: "เบอร์โทร",      type: "text", colSize: 130, validations: ["phone_th"] },
    { key: "note",       label: "หมายเหตุ",     type: "textarea", formSpan: 2 },
  ],
};

export default function AdminEmployeesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

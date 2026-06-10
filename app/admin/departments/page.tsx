"use client";

/**
 * แผนก (Department master) — ตารางเดียว `departments`
 * รวมจากเดิมที่มี 2 ที่ (admin = ข้อมูลตัวอย่าง erp_playground_departments + payroll)
 * ตอนนี้ใช้ตาราง departments ตัวจริง (เดียวกับบอร์ดจ่ายงาน + Payroll + พนักงาน)
 */
import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const STATUS = ["active", "inactive"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "departments", tableId: "departments",
  moduleKey: "payroll-departments",
  title: "แผนก", icon: "🏢",
  description: "Department master — ใช้ในบอร์ดจ่ายงาน / Payroll / Approval Rules",
  uniqueKey: "code", activeField: "active", exportEntityType: "payroll_department",
  searchKeys: ["code", "name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "code",          label: "รหัส",      type: "text", colSize: 100, groupKey: "core", order: 10, placeholder: "ASM" },
    { key: "name",          label: "ชื่อแผนก",  type: "text", colSize: 200, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "display_order", label: "ลำดับ",     type: "number", colSize: 80, groupKey: "core", order: 30 },
    { key: "status",        label: "สถานะ",     type: "select", colSize: 100, options: STATUS, filterable: true, groupKey: "core", order: 40 },
    { key: "note",          label: "หมายเหตุ",  type: "textarea", formSpan: 2, groupKey: "core", order: 50 },
  ],
};

export default function AdminDepartmentsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

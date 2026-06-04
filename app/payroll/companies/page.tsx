"use client";

/**
 * Payroll module — บริษัท (Phase 2 / master data) — ของจริง 2 บริษัท
 * ต่อ companies ผ่าน /api/payroll/master/companies
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS = ["active", "inactive"];

// นำร่อง Field Registry: moduleKey → MasterCRUDPage โหลด field จากทะเบียนกลาง
// (erp_module_fields ของ payroll-companies) → เปิดปุ่ม "⚙ ปรับแต่ง / แต่งฟอร์ม" ให้เจ้าของแก้เองได้
// ยังต่อข้อมูลผ่าน /api/payroll/master/companies เหมือนเดิม (registry แค่ให้ field config)
const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "companies", tableId: "payroll-companies",
  moduleKey: "payroll-companies",
  title: "บริษัท (Payroll)", icon: "🏢",
  description: "บริษัทจริง — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey: "company_code", activeField: "active", exportEntityType: "payroll_company",
  searchKeys: ["company_code", "name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  // fields[] = fallback ถ้าโหลดทะเบียนไม่ได้ (registry override เมื่อโหลดสำเร็จ)
  fields: [
    { key: "company_code", label: "รหัส",     type: "text", colSize: 100, groupKey: "core", order: 10 },
    { key: "name",         label: "ชื่อบริษัท", type: "text", colSize: 220, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "tax_id",       label: "เลขผู้เสียภาษี", type: "text", colSize: 140, groupKey: "core", order: 30 },
    { key: "address",      label: "ที่อยู่",   type: "textarea", formSpan: 2, groupKey: "core", order: 40 },
    { key: "status",       label: "สถานะ",     type: "select", colSize: 100, options: STATUS, filterable: true, groupKey: "core", order: 50 },
    { key: "note",         label: "หมายเหตุ",  type: "textarea", formSpan: 2, groupKey: "core", order: 60 },
  ],
};

export default function PayrollCompaniesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

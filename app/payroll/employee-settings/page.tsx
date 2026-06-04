"use client";

/**
 * Payroll module — ตั้งค่าเงินเดือนรายคน (employee_payroll_settings)
 * คุมการคำนวณ: ประกันสังคม/ภาษี/OT/รายชิ้น/เบี้ยขยัน/เบิกล่วงหน้า (เหมือนแท็บ "เงินเดือน" แอปเก่า)
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const fmtBaht = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span> : <span className="text-slate-300">—</span>;
};
const yesNo = (v: unknown) => v === true
  ? <span className="text-emerald-600 text-xs font-medium">✓ เปิด</span>
  : <span className="text-slate-300 text-xs">✕ ปิด</span>;

// ของพิเศษหน้าตั้งค่า — registry mode merge ตาม field key
const settingsCellRenderers: NonNullable<MasterCRUDConfig["cellRenderers"]> = {
  tax_calculation_method: (v) => <span className="text-sm">{v === "manual" ? "กรอกเอง" : v === "progressive" ? "ขั้นบันได" : String(v)}</span>,
  social_security_employee_amount: fmtBaht,
  social_security_employer_amount: fmtBaht,
  max_advance_amount: fmtBaht,
  default_mid_month_advance_amount: fmtBaht,
  social_security_enabled: yesNo,
  withholding_tax_enabled: yesNo,
  overtime_enabled: yesNo,
  piece_rate_enabled: yesNo,
  attendance_bonus_enabled: yesNo,
  advance_payment_allowed: yesNo,
};

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/core/", apiPath: "settings", tableId: "payroll-employee-settings",
  moduleKey: "payroll-employee-settings",
  title: "ตั้งค่าเงินเดือนรายคน (Payroll)", icon: "⚙️",
  description: "ตั้งค่าการคำนวณต่อพนักงาน 76 รายการ — ประกันสังคม/ภาษี/OT ฯลฯ (คุมเครื่องคำนวณ)",
  uniqueKey: "employee_name", activeField: "active", exportEntityType: "payroll_setting",
  searchKeys: ["employee_name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  cellRenderers: settingsCellRenderers,
  fields: [
    { key: "employee_name", label: "พนักงาน", type: "text", colSize: 200, readonly: true, groupKey: "core", order: 10 },
    { key: "employee_code", label: "รหัสพนักงาน (ตอนสร้างใหม่)", type: "text", colSize: 0, hideInForm: false, groupKey: "core", order: 12,
      helpText: "ใช้เฉพาะตอนสร้างใหม่ — ระบุรหัสพนักงาน" },
    { key: "payroll_group_id", label: "กลุ่มเงินเดือน", type: "text", colSize: 120, groupKey: "core", order: 20 },
    { key: "tax_calculation_method", label: "วิธีคำนวณภาษี", type: "select", colSize: 120, options: ["manual", "progressive"], groupKey: "core", order: 30,
      cellRender: (v) => <span className="text-sm">{v === "manual" ? "กรอกเอง" : v === "progressive" ? "ขั้นบันได" : String(v)}</span> },
    // ยอดเงิน
    { key: "social_security_employee_amount", label: "หักประกันสังคม", type: "number", colSize: 120, groupKey: "amount", order: 40, cellRender: fmtBaht },
    { key: "social_security_employer_amount", label: "นายจ้างสมทบ", type: "number", colSize: 120, groupKey: "amount", order: 42, cellRender: fmtBaht },
    { key: "withholding_tax_rate", label: "อัตราภาษี (%)", type: "number", colSize: 100, groupKey: "amount", order: 44 },
    { key: "max_advance_amount", label: "เบิกล่วงหน้าสูงสุด", type: "number", colSize: 130, groupKey: "amount", order: 46, cellRender: fmtBaht },
    { key: "default_mid_month_advance_amount", label: "ยอดเบิกกลางเดือน", type: "number", colSize: 130, groupKey: "amount", order: 48, cellRender: fmtBaht },
    // เปิด/ปิด
    { key: "social_security_enabled", label: "ประกันสังคม", type: "boolean", colSize: 100, groupKey: "เปิด/ปิด", order: 60, cellRender: yesNo },
    { key: "withholding_tax_enabled", label: "ภาษีหัก ณ ที่จ่าย", type: "boolean", colSize: 120, groupKey: "เปิด/ปิด", order: 62, cellRender: yesNo },
    { key: "overtime_enabled", label: "คำนวณ OT", type: "boolean", colSize: 90, groupKey: "เปิด/ปิด", order: 64, cellRender: yesNo },
    { key: "piece_rate_enabled", label: "รายชิ้น", type: "boolean", colSize: 80, groupKey: "เปิด/ปิด", order: 66, cellRender: yesNo },
    { key: "attendance_bonus_enabled", label: "เบี้ยขยัน", type: "boolean", colSize: 90, groupKey: "เปิด/ปิด", order: 68, cellRender: yesNo },
    { key: "advance_payment_allowed", label: "อนุญาตเบิกล่วงหน้า", type: "boolean", colSize: 130, groupKey: "เปิด/ปิด", order: 70, cellRender: yesNo },
  ],
};

export default function PayrollEmployeeSettingsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

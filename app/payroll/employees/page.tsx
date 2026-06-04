"use client";

/**
 * Payroll module — หน้าพนักงาน (Phase 1 — ของจริง)
 *
 * โมดูลหลักใหม่: ย้าย payroll มาใช้ของกลาง erp
 * — ใช้ Universal DataTable (master-crud) ตัวเดียวกับทุกหน้าใน erp
 * — แทน EmployeesView.jsx (2,009 บรรทัด) ของแอปเก่า ด้วย config object เดียว
 *
 * Data source: /api/payroll/employees → ตาราง employees จริง (78 คน)
 * ใน Supabase เดียวกับที่ payroll app ใช้อยู่ (cyivhke...) — ดู docs/migration-payroll-to-erp.md
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { relLink } from "@/components/payroll/cells";

// UI constants (กำหนดในหน้า — ไม่ import จาก db lib ที่มี service-role เพื่อกัน bundle รั่วเข้า client)
const DEPARTMENT_NAMES = ["ประกอบ", "ตัด/เตรียม", "ช่างเหมา"];
const EMPLOYMENT_STATUS = ["active", "inactive", "resigned", "suspended"];

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS_LABEL: Record<string, { th: string; cls: string }> = {
  active:    { th: "ใช้งาน",    cls: "bg-emerald-100 text-emerald-700" },
  inactive:  { th: "ไม่ใช้งาน", cls: "bg-slate-100 text-slate-600" },
  resigned:  { th: "ลาออก",     cls: "bg-red-100 text-red-700" },
  suspended: { th: "พักงาน",    cls: "bg-amber-100 text-amber-700" },
};

const fmtBaht = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0
    ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span>
    : <span className="text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/payroll/core/",
  apiPath:     "employees",
  tableId:     "payroll-employees",
  title:       "พนักงาน (Payroll)",
  icon:        "🪪",
  description: "ทะเบียนพนักงานจริง 78 คน — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey:   "employee_code",
  activeField: "active",
  exportEntityType: "payroll_employee",
  searchKeys:  ["employee_code", "first_name", "last_name", "nickname", "full_name", "phone", "scanner_employee_code"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "employee_code", label: "รหัส",        type: "text",   colSize: 100, placeholder: "อัตโนมัติ", groupKey: "core", order: 10 },
    { key: "first_name",    label: "ชื่อ",         type: "text",   colSize: 130, required: true, groupKey: "core", order: 20 },
    { key: "last_name",     label: "นามสกุล",      type: "text",   colSize: 130, groupKey: "core", order: 30 },
    { key: "nickname",      label: "ชื่อเล่น",     type: "text",   colSize: 90,  groupKey: "core", order: 40 },
    { key: "department_name", label: "แผนก",       type: "select", colSize: 120, options: DEPARTMENT_NAMES, filterable: true, groupKey: "core", order: 50,
      helpText: "เลือกแผนก — ระบบจะผูกกับ department_id ให้อัตโนมัติ" },
    { key: "employment_status", label: "สถานะ",    type: "select", colSize: 110, options: EMPLOYMENT_STATUS, filterable: true, groupKey: "core", order: 60,
      cellRender: (v) => {
        const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
      } },
    { key: "start_date",    label: "วันเริ่มงาน",  type: "text",   colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "work", order: 70 },
    { key: "phone",         label: "เบอร์โทร",     type: "text",   colSize: 120, groupKey: "work", order: 80 },
    { key: "email",         label: "อีเมล",        type: "text",   colSize: 170, groupKey: "work", order: 90, validations: ["email"] },
    { key: "scanner_employee_code", label: "รหัสสแกน", type: "text", colSize: 90, groupKey: "work", order: 100,
      helpText: "รหัสที่ผูกกับเครื่องสแกนนิ้ว/หน้า (ZKTeco)" },
    { key: "payroll_register_base_salary", label: "เงินเดือนฐาน", type: "number", colSize: 120, groupKey: "pay", order: 110,
      helpText: "ข้อมูลอ่อนไหว — ควรจำกัดสิทธิ์การมองเห็น (Phase 4: field permission)",
      cellRender: fmtBaht },
    { key: "national_id",   label: "เลขบัตร ปชช.", type: "text",   colSize: 130, groupKey: "pay", order: 120, helpText: "ข้อมูลอ่อนไหว" },
    { key: "line_display_name", label: "LINE", type: "text", colSize: 110, readonly: true, groupKey: "work", order: 130,
      helpText: "ชื่อ LINE ที่พนักงานผูกผ่าน portal (แก้ไม่ได้)" },
    { key: "notes",         label: "หมายเหตุ",     type: "textarea", formSpan: 2, groupKey: "work", order: 140 },
    // เชื่อมความสัมพันธ์: กระโดดไปดูข้อมูลของพนักงานคนนี้ในหน้าอื่น (กรองอัตโนมัติ)
    { key: "id", label: "เชื่อมโยง", type: "text", colSize: 220, sortable: false, hideInForm: true, order: 150,
      cellRender: (v) => (
        <span className="flex gap-2">
          {relLink("/payroll/recurring", "employee_id", v, "🔁 ค่าประจำ")}
          {relLink("/payroll/review", "employee_id", v, "✅ เงินเดือน")}
          {relLink("/payroll/payslips", "employee_id", v, "🧾 สลิป")}
        </span>
      ) },
  ],
};

export default function PayrollEmployeesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

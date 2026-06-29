"use client";

/**
 * Payroll module — หน้าสัญญาจ้าง (Phase 2 — ของจริง)
 * ต่อตาราง employee_contracts จริง (78 สัญญา) ผ่านของกลาง master-crud
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { relLink } from "@/components/payroll/cells";
import { LookupSelect } from "@/components/lookup-select";
import { AutoWageInput } from "@/components/payroll/auto-wage-input";
import { ContractTemplateBar } from "@/components/payroll/contract-template-bar";

// UI constants (กำหนดในหน้า — ไม่ import จาก db lib ที่มี service-role เพื่อกัน bundle รั่วเข้า client)
const WAGE_TYPES = ["monthly", "daily", "hourly", "piece_rate", "mixed"];
const CONTRACT_TYPES = ["permanent", "regular_external", "daily", "contractor", "hourly"];
const CONTRACT_STATUS = ["active", "ended", "cancelled"];
const COMPANY_NAMES = ["ไอ.เอส.จี. เทรดดิ้ง", "หลุยส์ มอนตินี่"];

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS_LABEL: Record<string, { th: string; cls: string }> = {
  active:    { th: "ใช้งาน", cls: "bg-emerald-100 text-emerald-700" },
  ended:     { th: "สิ้นสุด", cls: "bg-slate-100 text-slate-600" },
  cancelled: { th: "ยกเลิก", cls: "bg-red-100 text-red-700" },
};
const WAGE_LABEL: Record<string, string> = {
  monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง", piece_rate: "รายชิ้น", mixed: "ผสม",
};
const CONTRACT_TYPE_LABEL: Record<string, { th: string; cls: string }> = {
  permanent: { th: "ประจำ", cls: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  regular_external: { th: "ประจำนอกระบบ", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  daily: { th: "รายวัน", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  contractor: { th: "งานเหมา", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  hourly: { th: "รายชั่วโมง", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  "fixed-term": { th: "สัญญามีกำหนดระยะเวลา", cls: "border-slate-200 bg-slate-50 text-slate-600" },
};
const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "เต็มเวลา",
  "full-time": "เต็มเวลา",
  part_time: "ไม่เต็มเวลา (พาร์ทไทม์)",
  contractor: "งานเหมา",
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtBaht = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0
    ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span>
    : <span className="text-slate-300">—</span>;
};

// ของพิเศษหน้าสัญญา — registry mode merge ตาม field key
const contractCellRenderers: NonNullable<MasterCRUDConfig["cellRenderers"]> = {
  contract_type: (v) => {
    const raw = String(v ?? "");
    const meta = CONTRACT_TYPE_LABEL[raw] ?? { th: raw || "—", cls: "border-slate-200 bg-slate-50 text-slate-600" };
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.th}</span>;
  },
  employment_type: (v) => {
    const raw = String(v ?? "");
    return <span className="text-sm">{EMPLOYMENT_TYPE_LABEL[raw] ?? raw ?? "—"}</span>;
  },
  wage_type: (v) => <span className="text-sm">{WAGE_LABEL[String(v)] ?? String(v)}</span>,
  base_salary: fmtBaht,
  daily_wage: fmtBaht,
  hourly_wage: fmtBaht,
  piece_rate_default: fmtBaht,
  payroll_register_base_salary: fmtBaht,
  status: (v) => {
    const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
  },
  employee_id: (_v, row) => (
    <span className="flex gap-2">
      {relLink("/payroll/recurring", "employee_id", row?.employee_id, "🔁 ค่าประจำ")}
      {relLink("/payroll/review", "employee_id", row?.employee_id, "✅ เงินเดือน")}
    </span>
  ),
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/payroll/core/",
  apiPath:     "contracts",
  tableId:     "payroll-contracts",
  moduleKey:   "payroll-contracts",
  title:       "สัญญาจ้าง (Payroll)",
  icon:        "📄",
  description: "สัญญาจ้างจริง 78 รายการ — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey:   "contract_no",
  activeField: "active",
  exportEntityType: "payroll_contract",
  searchKeys:  ["contract_no", "employee_name", "company_name", "contract_type"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  cellRenderers: contractCellRenderers,
  // สร้างใหม่: ตั้งค่าเริ่มต้น (เลขที่สัญญา ออกอัตโนมัติฝั่ง server)
  createDefaults: { status: "active", is_current: true, wage_type: "monthly", payment_cycle: "monthly", start_date: todayISO() },
  // แถบแม่แบบสัญญา (เฉพาะตอนสร้างใหม่) — เลือกแม่แบบเติมค่าทุกช่อง / บันทึกค่าปัจจุบันเป็นแม่แบบ
  createFormHeader: ({ form, updateForm }) => <ContractTemplateBar values={form} onApply={(vals) => updateForm(vals)} />,
  // custom field ในฟอร์ม (merge เข้า Registry) — m2o + auto-wage + เลขสัญญาอัตโนมัติ
  formRenderers: {
    // เลขที่สัญญา: ออกอัตโนมัติเมื่อบันทึก (สร้างใหม่) / อ่านอย่างเดียว (แก้ไข)
    contract_no: ({ value, recordId }) => (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">เลขที่สัญญา</span>
        <input
          type="text"
          readOnly
          value={recordId ? String(value ?? "") : ""}
          placeholder={recordId ? "" : "(ระบบออกเลขให้อัตโนมัติเมื่อบันทึก)"}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
        />
      </label>
    ),
    // ประเภทสัญญา / ประเภทการจ้าง = m2o (ดึงตัวเลือกจาก erp_lookups, เก็บ code, จัดการที่ /admin/lookups)
    contract_type: ({ value, onChange, disabled }) => (
      <LookupSelect type="contract_type" label="ประเภทสัญญา" value={String(value ?? "")} onChange={onChange} disabled={disabled} />
    ),
    employment_type: ({ value, onChange, disabled }) => (
      <LookupSelect type="employment_type" label="ประเภทการจ้าง" value={String(value ?? "")} onChange={onChange} disabled={disabled} />
    ),
    // บริษัท / ตารางเวลาทำงาน / นโยบายการลา / นโยบาย OT = m2o (จัดการตัวเลือกที่ /admin/lookups)
    company_name: ({ value, onChange, disabled }) => (
      <LookupSelect type="company" label="บริษัท" value={String(value ?? "")} onChange={onChange} disabled={disabled} />
    ),
    work_schedule_id: ({ value, onChange, disabled }) => (
      <LookupSelect type="work_schedule" label="ตารางเวลาทำงาน" value={String(value ?? "")} onChange={onChange} disabled={disabled} />
    ),
    leave_policy_id: ({ value, onChange, disabled }) => (
      <LookupSelect type="leave_policy" label="นโยบายการลา" value={String(value ?? "")} onChange={onChange} disabled={disabled} />
    ),
    overtime_policy_id: ({ value, onChange, disabled }) => (
      <LookupSelect type="overtime_policy" label="นโยบาย OT" value={String(value ?? "")} onChange={onChange} disabled={disabled} />
    ),
    // ค่าจ้างรายวัน/รายชม. = คำนวณจากเงินเดือนอัตโนมัติ (÷26 วัน, ÷8 ชม.)
    daily_wage: (ctx) => <AutoWageInput {...ctx} kind="daily" label="ค่าจ้างรายวัน" />,
    hourly_wage: (ctx) => <AutoWageInput {...ctx} kind="hourly" label="ค่าจ้างรายชั่วโมง" />,
  },
  fields: [
    { key: "contract_no",   label: "เลขที่สัญญา", type: "text", colSize: 150, groupKey: "core", order: 10 },
    { key: "employee_name", label: "พนักงาน",     type: "text", colSize: 200, readonly: true, groupKey: "core", order: 20,
      helpText: "สร้างใหม่: กรอก employee_code ของพนักงานที่มีอยู่" },
    { key: "employee_code", label: "รหัสพนักงาน (ตอนสร้างใหม่)", type: "text", colSize: 0, hideInForm: false, groupKey: "core", order: 25,
      helpText: "ใช้เฉพาะตอนสร้างสัญญาใหม่ — ระบุรหัสพนักงานที่จะผูก" },
    { key: "company_name",  label: "บริษัท",       type: "select", colSize: 140, options: COMPANY_NAMES, filterable: true, groupKey: "core", order: 30 },
    { key: "contract_type", label: "ประเภทสัญญา", type: "select", colSize: 150, options: CONTRACT_TYPES, filterable: true, groupKey: "core", order: 40,
      cellRender: (v) => {
        const raw = String(v ?? "");
        const meta = CONTRACT_TYPE_LABEL[raw] ?? { th: raw || "—", cls: "border-slate-200 bg-slate-50 text-slate-600" };
        return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.th}</span>;
      } },
    { key: "employment_type", label: "ประเภทการจ้าง", type: "text", colSize: 120, groupKey: "core", order: 42 },
    { key: "wage_type",     label: "ประเภทค่าจ้าง", type: "select", colSize: 110, options: WAGE_TYPES, filterable: true, groupKey: "pay", order: 50,
      cellRender: (v) => <span className="text-sm">{WAGE_LABEL[String(v)] ?? String(v)}</span> },
    { key: "base_salary",   label: "เงินเดือน",   type: "number", colSize: 110, groupKey: "pay", order: 60, cellRender: fmtBaht },
    { key: "daily_wage",    label: "ค่าจ้างรายวัน", type: "number", colSize: 100, groupKey: "pay", order: 70, cellRender: fmtBaht },
    { key: "hourly_wage",   label: "ค่าจ้างรายชม.", type: "number", colSize: 100, groupKey: "pay", order: 80, cellRender: fmtBaht },
    { key: "piece_rate_default", label: "ค่าจ้างรายชิ้น", type: "number", colSize: 100, groupKey: "pay", order: 85, cellRender: fmtBaht },
    { key: "payroll_register_base_salary", label: "ฐานทะเบียนเงินเดือน", type: "number", colSize: 130, groupKey: "pay", order: 95, cellRender: fmtBaht },
    { key: "payment_cycle", label: "รอบจ่าย",     type: "text", colSize: 90, groupKey: "pay", order: 90 },
    { key: "start_date",    label: "เริ่มสัญญา",  type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "term", order: 100 },
    { key: "end_date",      label: "สิ้นสุด",     type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "term", order: 110 },
    { key: "is_current",    label: "สัญญาปัจจุบัน", type: "boolean", colSize: 90, groupKey: "term", order: 120 },
    { key: "status",        label: "สถานะ",       type: "select", colSize: 100, options: CONTRACT_STATUS, filterable: true, groupKey: "term", order: 130,
      cellRender: (v) => {
        const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
      } },
    // นโยบาย / การส่งออก
    { key: "work_time_profile_name", label: "เวลาทำงาน (โปรไฟล์)", type: "text", colSize: 160, readonly: true, groupKey: "นโยบาย/ส่งออก", order: 198,
      helpText: "โปรไฟล์เวลาเข้า-ออก (แก้ที่หน้าโปรไฟล์เวลาทำงาน)" },
    { key: "work_schedule_id",   label: "ตารางเวลาทำงาน", type: "text", colSize: 130, groupKey: "นโยบาย/ส่งออก", order: 200 },
    { key: "overtime_policy_id", label: "นโยบาย OT",      type: "text", colSize: 120, groupKey: "นโยบาย/ส่งออก", order: 202 },
    { key: "leave_policy_id",    label: "นโยบายการลา",    type: "text", colSize: 120, groupKey: "นโยบาย/ส่งออก", order: 204 },
    { key: "attendance_scan_exempt", label: "ยกเว้นสแกนเวลา", type: "boolean", colSize: 100, groupKey: "นโยบาย/ส่งออก", order: 206 },
    { key: "include_pnd3_export", label: "รวมใน ภ.ง.ด.3", type: "boolean", colSize: 110, groupKey: "นโยบาย/ส่งออก", order: 208 },
    { key: "include_payroll_register_export", label: "รวมในทะเบียนเงินเดือน", type: "boolean", colSize: 130, groupKey: "นโยบาย/ส่งออก", order: 210 },
    // เชื่อมความสัมพันธ์: เปิดดูค่าประจำ/เงินเดือนของพนักงานในสัญญานี้ (ผูกผ่าน employee_id)
    { key: "employee_id", label: "เชื่อมโยง", type: "text", colSize: 190, sortable: false, hideInForm: true, order: 140,
      cellRender: (_v, row) => (
        <span className="flex gap-2">
          {relLink("/payroll/recurring", "employee_id", row?.employee_id, "🔁 ค่าประจำ")}
          {relLink("/payroll/review", "employee_id", row?.employee_id, "✅ เงินเดือน")}
        </span>
      ) },
  ],
};

export default function PayrollContractsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

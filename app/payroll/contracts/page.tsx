"use client";

/**
 * Payroll module — หน้าสัญญาจ้าง (Phase 2 — ของจริง)
 * ต่อตาราง employee_contracts จริง (78 สัญญา) ผ่านของกลาง master-crud
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { relLink } from "@/components/payroll/cells";

// UI constants (กำหนดในหน้า — ไม่ import จาก db lib ที่มี service-role เพื่อกัน bundle รั่วเข้า client)
const WAGE_TYPES = ["monthly", "daily", "hourly", "piece_rate", "mixed"];
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
const fmtBaht = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0
    ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span>
    : <span className="text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/payroll/",
  apiPath:     "contracts",
  tableId:     "payroll-contracts",
  title:       "สัญญาจ้าง (Payroll)",
  icon:        "📄",
  description: "สัญญาจ้างจริง 78 รายการ — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey:   "contract_no",
  activeField: "active",
  exportEntityType: "payroll_contract",
  searchKeys:  ["contract_no", "employee_name", "company_name", "contract_type"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "contract_no",   label: "เลขที่สัญญา", type: "text", colSize: 150, groupKey: "core", order: 10 },
    { key: "employee_name", label: "พนักงาน",     type: "text", colSize: 200, readonly: true, groupKey: "core", order: 20,
      helpText: "สร้างใหม่: กรอก employee_code ของพนักงานที่มีอยู่" },
    { key: "employee_code", label: "รหัสพนักงาน (ตอนสร้างใหม่)", type: "text", colSize: 0, hideInForm: false, groupKey: "core", order: 25,
      helpText: "ใช้เฉพาะตอนสร้างสัญญาใหม่ — ระบุรหัสพนักงานที่จะผูก" },
    { key: "company_name",  label: "บริษัท",       type: "select", colSize: 140, options: COMPANY_NAMES, filterable: true, groupKey: "core", order: 30 },
    { key: "contract_type", label: "ประเภทสัญญา", type: "text", colSize: 120, groupKey: "core", order: 40 },
    { key: "wage_type",     label: "ประเภทค่าจ้าง", type: "select", colSize: 110, options: WAGE_TYPES, filterable: true, groupKey: "pay", order: 50,
      cellRender: (v) => <span className="text-sm">{WAGE_LABEL[String(v)] ?? String(v)}</span> },
    { key: "base_salary",   label: "เงินเดือน",   type: "number", colSize: 110, groupKey: "pay", order: 60, cellRender: fmtBaht },
    { key: "daily_wage",    label: "ค่าจ้างรายวัน", type: "number", colSize: 100, groupKey: "pay", order: 70, cellRender: fmtBaht },
    { key: "hourly_wage",   label: "ค่าจ้างรายชม.", type: "number", colSize: 100, groupKey: "pay", order: 80, cellRender: fmtBaht },
    { key: "payment_cycle", label: "รอบจ่าย",     type: "text", colSize: 90, groupKey: "pay", order: 90 },
    { key: "start_date",    label: "เริ่มสัญญา",  type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "term", order: 100 },
    { key: "end_date",      label: "สิ้นสุด",     type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "term", order: 110 },
    { key: "is_current",    label: "สัญญาปัจจุบัน", type: "boolean", colSize: 90, groupKey: "term", order: 120 },
    { key: "status",        label: "สถานะ",       type: "select", colSize: 100, options: CONTRACT_STATUS, filterable: true, groupKey: "term", order: 130,
      cellRender: (v) => {
        const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
      } },
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

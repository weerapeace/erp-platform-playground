"use client";

/** Payroll module — เงินประจำ (Phase 3) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { money, statusBadge, PAY_STATUS } from "@/components/payroll/cells";
import { ContractBindCell } from "@/components/payroll/contract-bind-cell";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const ITEM_TYPE: Record<string, string> = { earning: "เงินเพิ่ม", deduction: "เงินหัก" };
const DURATION: Record<string, string> = { unlimited: "ไม่จำกัด", until_amount: "จนกว่าจะครบยอด" };

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/", apiPath: "recurring", tableId: "payroll-recurring",
  title: "เงินประจำ (Payroll)", icon: "🔁",
  description: "รายการเงินเพิ่ม/หักประจำ ตั้งครั้งเดียวแล้วระบบดึงเข้าแต่ละงวดอัตโนมัติ",
  hideActiveStatus: false, allowPermanentDelete: false, pageLimit: 1000, exportEntityType: "recurring_pay_item",
  permissions: { view: "employees.view", create: "employees.edit", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: ["employee_name", "contract_no", "item_name"],
  createDefaults: { item_type: "earning", duration_type: "unlimited", calculation_method: "fixed", status: "active" },
  fields: [
    { key: "employee_id", label: "พนักงาน", type: "relation", colSize: 220, required: true, formSpan: 2, filterable: true,
      relationConfig: { target_table: "employees", target_label_field: "first_name", target_search_fields: ["employee_code", "first_name", "last_name", "nickname"], secondary_label_field: "employee_code" },
      cellRender: (_v, row) => <span className="text-sm text-slate-800">{String(row?.employee_name || row?.employee_id || "-")}</span> },
    // ผูกสัญญา (แก้ได้เฉพาะ field นี้ — เลือกสัญญาของพนักงานคนนั้น)
    { key: "contract_id", label: "สัญญา", type: "relation", colSize: 150, sortable: false,
      relationConfig: { target_table: "employee_contracts", target_label_field: "contract_no", target_search_fields: ["contract_no"], secondary_label_field: "status", depends_on: { parent_field: "employee_id", filter_column: "employee_id" } },
      cellRender: (_v, row) => (
        <ContractBindCell
          recurringId={String(row?.id ?? "")}
          employeeId={String(row?.employee_id ?? "")}
          contractId={(row?.contract_id as string) ?? null}
          contractNo={(row?.contract_no as string) ?? null}
        />
      ) },
    { key: "item_name",        label: "รายการ",     type: "text", colSize: 160, required: true, formSpan: 2 },
    { key: "item_type",        label: "ประเภท",     type: "select", colSize: 90, options: ["earning", "deduction"], required: true, cellRender: (v) => <span className="text-sm">{ITEM_TYPE[String(v)] ?? String(v)}</span> },
    { key: "amount_per_period", label: "ยอด/งวด",   type: "number", colSize: 110, required: true, cellRender: money },
    { key: "duration_type",    label: "ระยะเวลา",   type: "select", colSize: 120, options: ["unlimited", "until_amount"], cellRender: (v) => <span className="text-sm">{DURATION[String(v)] ?? String(v)}</span> },
    { key: "target_total_amount", label: "ยอดรวมที่ต้องครบ", type: "number", colSize: 140, cellRender: money },
    { key: "calculation_method", label: "วิธีคิด", type: "select", colSize: 100, options: ["fixed", "days_rate", "times_rate", "units_rate"], hideInForm: false },
    { key: "quantity_default", label: "จำนวน", type: "number", colSize: 90 },
    { key: "rate_default", label: "อัตรา", type: "number", colSize: 90 },
    { key: "start_date",       label: "เริ่ม",      type: "date", colSize: 110, required: true },
    { key: "end_date",         label: "สิ้นสุด",    type: "text", colSize: 110 },
    { key: "status",           label: "สถานะ",      type: "select", colSize: 100, options: ["active", "paused", "completed", "cancelled"], cellRender: statusBadge(PAY_STATUS) },
  ],
};

export default function PayrollRecurringPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

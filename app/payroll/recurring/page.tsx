"use client";

/** Payroll module — เงินประจำ (Phase 3) — อ่านอย่างเดียว (employee_recurring_pay_items 17) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { money, statusBadge, PAY_STATUS } from "@/components/payroll/cells";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const ITEM_TYPE: Record<string, string> = { earning: "เงินเพิ่ม", deduction: "เงินหัก" };
const DURATION: Record<string, string> = { permanent: "ถาวร", single_period: "งวดเดียว", multi_period: "หลายงวด" };

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/view/", apiPath: "recurring", tableId: "payroll-recurring",
  title: "เงินประจำ (Payroll)", icon: "🔁",
  description: "รายการเงินเพิ่ม/หักประจำ 17 รายการ — อ่านอย่างเดียว",
  readOnly: true, pageLimit: 1000, exportEntityType: "recurring_pay_item",
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true, searchKeys: ["employee_name", "item_name"],
  fields: [
    { key: "employee_name",    label: "พนักงาน",    type: "text", colSize: 200 },
    { key: "item_name",        label: "รายการ",     type: "text", colSize: 160 },
    { key: "item_type",        label: "ประเภท",     type: "text", colSize: 90, cellRender: (v) => <span className="text-sm">{ITEM_TYPE[String(v)] ?? String(v)}</span> },
    { key: "amount_per_period", label: "ยอด/งวด",   type: "number", colSize: 110, cellRender: money },
    { key: "duration_type",    label: "ระยะเวลา",   type: "text", colSize: 100, cellRender: (v) => <span className="text-sm">{DURATION[String(v)] ?? String(v)}</span> },
    { key: "start_date",       label: "เริ่ม",      type: "text", colSize: 110 },
    { key: "end_date",         label: "สิ้นสุด",    type: "text", colSize: 110 },
    { key: "status",           label: "สถานะ",      type: "text", colSize: 100, cellRender: statusBadge(PAY_STATUS) },
  ],
};

export default function PayrollRecurringPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

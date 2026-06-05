"use client";

/** Payroll master — ศูนย์ต้นทุน (cost_centers) — ใช้เลือกในฟอร์มพนักงาน (relation) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS = ["active", "inactive"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "cost-centers", tableId: "payroll-cost-centers",
  moduleKey: "payroll-cost-centers",
  title: "ศูนย์ต้นทุน (Payroll)", icon: "🏦",
  description: "ศูนย์ต้นทุน — master สำหรับเลือกในหน้าพนักงาน",
  uniqueKey: "code", activeField: "active", exportEntityType: "payroll_cost_center",
  searchKeys: ["code", "name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "code",          label: "รหัส",   type: "text", colSize: 120, groupKey: "core", order: 10 },
    { key: "name",          label: "ชื่อ",   type: "text", colSize: 240, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "display_order", label: "ลำดับ",  type: "number", colSize: 90, groupKey: "core", order: 30 },
    { key: "status",        label: "สถานะ",  type: "select", colSize: 110, options: STATUS, filterable: true, groupKey: "core", order: 40 },
  ],
};

export default function PayrollCostCentersPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

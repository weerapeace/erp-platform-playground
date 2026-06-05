"use client";

/** Payroll master — ตำแหน่งงาน (positions) — ใช้เลือกในฟอร์มพนักงาน (relation) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS = ["active", "inactive"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "positions", tableId: "payroll-positions",
  moduleKey: "payroll-positions",
  title: "ตำแหน่งงาน (Payroll)", icon: "🏷️",
  description: "ตำแหน่งงาน — master สำหรับเลือกในหน้าพนักงาน",
  uniqueKey: "code", activeField: "active", exportEntityType: "payroll_position",
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

export default function PayrollPositionsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

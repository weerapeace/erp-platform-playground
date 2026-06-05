"use client";

/** Payroll master — วันหยุดพิเศษ (คลังนักขัตฤกษ์) — ดึงไปใส่งวดได้ */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS = ["active", "inactive"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "public-holidays", tableId: "payroll-public-holidays",
  moduleKey: "payroll-public-holidays",
  title: "วันหยุดพิเศษ (Payroll)", icon: "🎌",
  description: "คลังวันหยุดนักขัตฤกษ์/พิเศษ เช่น วันปีใหม่ สงกรานต์ — ตั้งครั้งเดียว ดึงไปใส่งวดได้",
  uniqueKey: "holiday_date", activeField: "active", exportEntityType: "payroll_holiday",
  searchKeys: ["holiday_name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "holiday_date", label: "วันที่",     type: "date", colSize: 130, required: true, groupKey: "core", order: 10 },
    { key: "holiday_name", label: "ชื่อวันหยุด", type: "text", colSize: 240, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "status",       label: "สถานะ",      type: "select", colSize: 110, options: STATUS, filterable: true, groupKey: "core", order: 30 },
    { key: "note",         label: "หมายเหตุ",   type: "textarea", formSpan: 2, groupKey: "core", order: 40 },
  ],
};

export default function PayrollPublicHolidaysPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

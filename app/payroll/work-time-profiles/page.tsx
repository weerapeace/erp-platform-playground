"use client";

/** Payroll module — โปรไฟล์เวลาทำงาน (Phase 2 / master) — ของจริง 2 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS = ["active", "inactive"];

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "work-time-profiles", tableId: "payroll-wtp",
  moduleKey: "payroll-wtp",
  title: "โปรไฟล์เวลาทำงาน (Payroll)", icon: "🕐",
  description: "กติกาเวลาเข้า-ออกงาน — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey: "profile_code", activeField: "active", exportEntityType: "work_time_profile",
  searchKeys: ["profile_code", "profile_name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "profile_code", label: "รหัส",       type: "text", colSize: 100, groupKey: "core", order: 10 },
    { key: "profile_name", label: "ชื่อโปรไฟล์", type: "text", colSize: 180, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "morning_check_in_cutoff", label: "เข้าเช้า ก่อน", type: "text", colSize: 110, placeholder: "08:00", groupKey: "time", order: 30 },
    { key: "noon_check_in_cutoff",    label: "เข้าบ่าย ก่อน", type: "text", colSize: 110, placeholder: "13:00", groupKey: "time", order: 40 },
    { key: "checkout_required_at",    label: "ออกงาน",        type: "text", colSize: 100, placeholder: "17:00", groupKey: "time", order: 50 },
    { key: "early_checkout_grace_minutes", label: "ผ่อนผัน(นาที)", type: "number", colSize: 100, groupKey: "time", order: 60 },
    { key: "sort_order",   label: "ลำดับ",      type: "number", colSize: 80, groupKey: "core", order: 70 },
    { key: "status",       label: "สถานะ",      type: "select", colSize: 100, options: STATUS, filterable: true, groupKey: "core", order: 80 },
    { key: "note",         label: "หมายเหตุ",   type: "textarea", formSpan: 2, groupKey: "core", order: 90 },
  ],
};

export default function PayrollWorkTimeProfilesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

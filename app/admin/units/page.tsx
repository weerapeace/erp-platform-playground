"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const CONFIG: MasterCRUDConfig = {
  apiPath:     "units",
  tableId:     "admin-units",
  title:       "หน่วยนับ (UoM)",
  icon:        "📏",
  description: "Unit of Measure — ใช้ใน Product / Stock",
  exportEntityType: "erp_playground_unit",
  searchKeys:  ["code", "name", "symbol"],
  permissions: { view: "units.view", create: "units.create", edit: "units.create" },
  fields: [
    { key: "code",     label: "รหัส",      type: "text", colSize: 100, placeholder: "KG" },
    { key: "name",     label: "ชื่อ",       type: "text", colSize: 160, required: true },
    { key: "symbol",   label: "สัญลักษณ์", type: "text", colSize: 100, placeholder: "kg, ชิ้น" },
    { key: "category", label: "หมวด",      type: "select", colSize: 140,
      options: ["count","weight","volume","length","area"], required: true },
  ],
};

export default function AdminUnitsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

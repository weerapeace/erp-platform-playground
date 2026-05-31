"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const CONFIG: MasterCRUDConfig = {
  apiPath:     "warehouses",
  tableId:     "admin-warehouses",
  title:       "คลังสินค้า",
  icon:        "🏭",
  description: "Warehouse master — ใช้ใน Stock movement",
  exportEntityType: "erp_playground_warehouse",
  searchKeys:  ["code", "name", "branch"],
  permissions: { view: "warehouses.view", create: "warehouses.create", edit: "warehouses.edit" },
  fields: [
    { key: "code",         label: "รหัส",       type: "text", colSize: 110, placeholder: "WH-BKK" },
    { key: "name",         label: "ชื่อคลัง",   type: "text", colSize: 240, required: true, formSpan: 2 },
    { key: "branch",       label: "สาขา",       type: "text", colSize: 160 },
    { key: "manager_name", label: "ผู้จัดการ",  type: "text", colSize: 160 },
    { key: "address",      label: "ที่อยู่",      type: "textarea", formSpan: 2 },
    { key: "note",         label: "หมายเหตุ",   type: "textarea", formSpan: 2 },
  ],
};

export default function AdminWarehousesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

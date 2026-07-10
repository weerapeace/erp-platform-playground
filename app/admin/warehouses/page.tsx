"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

// ป้ายประเภทโซน (kind) — โชว์ในตารางให้อ่านง่าย
const KIND_LABEL: Record<string, string> = {
  raw: "🟠 วัตถุดิบ", wip: "🔵 ระหว่างผลิต", fg: "🟢 สินค้าสำเร็จ",
  scrap: "🔴 ของเสีย/ซ่อม", sales: "🏬 คลังขาย", general: "📦 ทั่วไป",
};

const CONFIG: MasterCRUDConfig = {
  apiPath:     "warehouses",
  tableId:     "admin-warehouses",
  title:       "คลังสินค้า",
  icon:        "🏭",
  description: "Warehouse master — ใช้ใน Stock movement · ประเภทโซน = RAW/WIP/FG/ของเสีย/คลังขาย",
  exportEntityType: "erp_playground_warehouse",
  searchKeys:  ["code", "name", "branch"],
  permissions: { view: "warehouses.view", create: "warehouses.create", edit: "warehouses.edit" },
  fields: [
    { key: "code",         label: "รหัส",       type: "text", colSize: 110, placeholder: "WH-BKK" },
    { key: "name",         label: "ชื่อคลัง",   type: "text", colSize: 240, required: true, formSpan: 2 },
    { key: "kind",         label: "ประเภทโซน",  type: "select", colSize: 140, options: ["raw", "wip", "fg", "scrap", "sales", "general"] },
    { key: "branch",       label: "สาขา",       type: "text", colSize: 160 },
    { key: "manager_name", label: "ผู้จัดการ",  type: "text", colSize: 160 },
    { key: "address",      label: "ที่อยู่",      type: "textarea", formSpan: 2 },
    { key: "note",         label: "หมายเหตุ",   type: "textarea", formSpan: 2 },
  ],
  cellRenderers: {
    kind: (v) => <span className="text-xs">{KIND_LABEL[String(v ?? "")] ?? String(v ?? "—")}</span>,
  },
};

export default function AdminWarehousesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

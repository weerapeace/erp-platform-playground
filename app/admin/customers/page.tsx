"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const CONFIG: MasterCRUDConfig = {
  apiPath:     "customers",
  tableId:     "admin-customers",
  title:       "ลูกค้า",
  icon:        "🧑‍💼",
  description: "Customer master — ใช้ใน Sales Order / Invoice",
  exportEntityType: "erp_playground_customer",
  searchKeys:  ["code", "name", "contact_phone"],
  permissions: { view: "customers.view", create: "customers.create", edit: "customers.edit" },
  fields: [
    { key: "code",          label: "รหัสลูกค้า",  type: "text", colSize: 110, placeholder: "CUS-001" },
    { key: "name",          label: "ชื่อลูกค้า",    type: "text", colSize: 260, required: true, formSpan: 2 },
    { key: "category",      label: "หมวดหมู่",    type: "text", colSize: 140, placeholder: "โรงงาน / ค้าปลีก" },
    { key: "contact_name",  label: "ผู้ติดต่อ",    type: "text", colSize: 140 },
    { key: "contact_phone", label: "เบอร์โทร",     type: "text", colSize: 130, validations: ["phone_th"] },
    { key: "contact_email", label: "อีเมล",         type: "text", colSize: 180, validations: ["email"] },
    { key: "tax_id",        label: "เลขผู้เสียภาษี", type: "text", formSpan: 2, validations: ["tax_id_th"] },
    { key: "payment_terms", label: "เงื่อนไขชำระ", type: "text", placeholder: "CASH / NET 30" },
    { key: "address",       label: "ที่อยู่",        type: "textarea", formSpan: 2 },
    { key: "note",          label: "หมายเหตุ",     type: "textarea", formSpan: 2 },
  ],
};

export default function AdminCustomersPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

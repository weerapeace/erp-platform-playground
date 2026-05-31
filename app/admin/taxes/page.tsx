"use client";

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const TAX_TYPE_COLOR: Record<string, string> = {
  VAT:    "bg-blue-50 text-blue-700",
  WHT:    "bg-purple-50 text-purple-700",
  EXCISE: "bg-amber-50 text-amber-700",
  OTHER:  "bg-slate-100 text-slate-600",
};

const CONFIG: MasterCRUDConfig = {
  apiPath:     "taxes",
  tableId:     "admin-taxes",
  title:       "ภาษี",
  icon:        "💰",
  description: "Tax master — ใช้ใน Sales Order / Invoice / PO",
  exportEntityType: "erp_playground_tax",
  searchKeys:  ["code", "name", "tax_type"],
  permissions: { view: "taxes.view", create: "taxes.create", edit: "taxes.create" },
  fields: [
    { key: "code", label: "รหัส", type: "text", colSize: 100, placeholder: "VAT7" },
    { key: "name", label: "ชื่อ",   type: "text", colSize: 200, required: true, formSpan: 2 },
    { key: "tax_type", label: "ประเภท", type: "select", colSize: 100,
      options: ["VAT","WHT","EXCISE","OTHER"], required: true,
      cellRender: (v) => (
        <span className={`text-xs px-2 py-0.5 rounded ${TAX_TYPE_COLOR[v as string] ?? "bg-slate-100"}`}>{String(v)}</span>
      ),
    },
    { key: "rate", label: "อัตรา %", type: "number", colSize: 100, required: true,
      cellRender: (v) => v == null ? "—" : `${Number(v)}%`,
    },
    { key: "included", label: "รวมในราคา", type: "boolean", colSize: 100,
      cellRender: (v) => v ? "✓ รวม" : "— แยก",
    },
    { key: "account_code", label: "รหัสบัญชี (เผื่อ accounting)", type: "text" },
    { key: "note", label: "หมายเหตุ", type: "textarea", formSpan: 2 },
  ],
};

export default function AdminTaxesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

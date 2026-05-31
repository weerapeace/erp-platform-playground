"use client";

/**
 * Master Data v2 — Parent SKUs (Product Templates)
 *
 * URL: /master/parent-skus
 *
 * ใช้ MasterCRUDPage (ของกลาง) → ได้ครบ:
 *   - DataTable + Saved Views + Column Manager + Bulk Edit + Export
 *   - Create/Edit modal + Validation
 *   - Row actions (edit / archive / restore)
 *   - Permission check + Audit log
 *
 * API: /api/master-v2/parent-skus (generic v2 REST)
 */

import { MasterCRUDPage, type MasterCRUDConfig } from "@/components/master-crud";

const FAMILY_LABEL: Record<string, string> = {
  general: "🏷️ ทั่วไป",
  bag:     "👜 กระเป๋า",
  belt:    "🎀 เข็มขัด",
  jewelry: "💎 จิวเวลรี",
  spare:   "🔧 อะไหล่",
};

const CONFIG: MasterCRUDConfig = {
  apiBase:         "/api/master-v2/",
  apiPath:         "parent-skus",
  tableId:         "master-parent-skus-v2",
  title:           "Parent SKUs",
  description:     "ข้อมูลแม่ของสินค้า (Product Templates) — แต่ละ Parent มี SKU variants ภายใต้",
  icon:            "📦",
  activeField:     "is_active",
  exportEntityType: "parent_skus_v2",
  searchKeys:      ["code", "name_th", "name_en", "sku_name"],
  // ผู้มีสิทธิ์ดูสินค้าเดิม (products.view) ใช้ได้กับ parent_skus_v2 ด้วย
  permissions: {
    view:   "products.view",
    create: "products.create",
    edit:   "products.edit",
  },
  fields: [
    // ---- ข้อมูลหลัก ----
    {
      key: "code", label: "Code", type: "text", colSize: 130,
      required: true, placeholder: "เช่น WL44, BMG12",
      filterable: true, sortable: true,
    },
    {
      key: "product_family", label: "หมวด", type: "select", colSize: 110,
      options: ["general", "bag", "belt", "jewelry", "spare"],
      filterable: true, filterType: "select",
      bulkEditable: true,
      cellRender: (v) => {
        const s = (v as string) ?? "general";
        return (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
            {FAMILY_LABEL[s] ?? s}
          </span>
        );
      },
    },
    {
      key: "name_th", label: "ชื่อสินค้า (ไทย)", type: "text", colSize: 260,
      required: true, formSpan: 2,
      filterable: true, sortable: true,
    },
    {
      key: "name_en", label: "ชื่อสินค้า (English)", type: "text", formSpan: 2,
    },
    {
      key: "sku_name", label: "ชื่อย่อ (Marketing)", type: "text", colSize: 160,
      filterable: true,
    },

    // ---- ความสัมพันธ์ (read-only ใน Phase 1; picker จะมาใน Phase 2) ----
    {
      key: "brand_name", label: "Brand", type: "text", colSize: 140,
      hideInForm: true, filterable: true,
      cellRender: (v) => v ? <span className="text-sm text-slate-700">{v as string}</span> : <span className="text-xs text-slate-300">—</span>,
    },
    {
      key: "collection_name", label: "Collection", type: "text", colSize: 160,
      hideInForm: true, filterable: true,
      cellRender: (v) => v ? <span className="text-sm text-slate-600">{v as string}</span> : <span className="text-xs text-slate-300">—</span>,
    },

    // ---- คำอธิบาย ----
    { key: "introduction", label: "บทนำ",      type: "textarea", formSpan: 2 },
    { key: "description",  label: "คำอธิบาย",  type: "textarea", formSpan: 2 },

    // ---- ขนาด/น้ำหนัก ----
    { key: "size_summary", label: "ขนาด (สรุป)", type: "text", colSize: 130 },
    { key: "weight_g",     label: "น้ำหนัก (กรัม)", type: "number" },
    { key: "custom_size",  label: "Custom size",   type: "text" },

    // ---- ราคา ----
    {
      key: "sale_price", label: "ราคาขาย", type: "number", colSize: 110,
      filterable: true, filterType: "number", sortable: true, bulkEditable: true,
      cellRender: (v) => {
        const n = v as number | null;
        return n != null && n > 0
          ? <span className="text-sm tabular-nums font-medium text-slate-800">฿{Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          : <span className="text-xs text-slate-300">—</span>;
      },
    },
    { key: "final_price", label: "ราคาสุทธิ",   type: "number", bulkEditable: true },
    { key: "fake_price",  label: "ราคาเปรียบเทียบ", type: "number", bulkEditable: true },

    // ---- รายละเอียดสินค้า ----
    { key: "materials", label: "วัสดุ",   type: "text", formSpan: 2, bulkEditable: true },
    { key: "warranty",  label: "Warranty", type: "text", colSize: 130, bulkEditable: true },

    // ---- Marketplace URLs ----
    { key: "shopee_url", label: "Shopee URL", type: "text", formSpan: 2 },
    { key: "lazada_url", label: "Lazada URL", type: "text", formSpan: 2 },
    { key: "tiktok_url", label: "TikTok URL", type: "text", formSpan: 2 },
  ],
};

export default function ParentSKUsV2Page() {
  return <MasterCRUDPage config={CONFIG} />;
}

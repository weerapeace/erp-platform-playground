"use client";

/**
 * Master Data v2 — Parent SKUs (Product Templates)
 *
 * URL: /master/parent-skus
 *
 * ⭐ ใช้ Field Registry แบบ dynamic (Sprint 2):
 * - field list, labels, visibility, filter, sort, search → จาก /admin/schema-sync
 * - เพิ่มฟิลด์ใหม่ใน Supabase → กด Sync ใน /admin/schema-sync → user เห็นทันที (ไม่ต้อง deploy)
 *
 * เหลือเฉพาะ:
 * - cellRenderers (custom formatting เช่น สี/icon)
 * - permissions
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
  apiBase:     "/api/master-v2/",
  apiPath:     "parent-skus",
  moduleKey:   "parent-skus-v2",
  tableId:     "master-parent-skus-v2",
  title:       "Parent SKUs",
  description: "Product Templates — จัดการ visible/filter/search/required ที่ /admin/schema-sync",
  icon:        "📦",
  activeField: "is_active",
  exportEntityType: "parent_skus_v2",
  permissions: {
    view:   "products.view",
    create: "products.create",
    edit:   "products.edit",
  },
  // custom renderers — Field Registry กำหนด visibility, แต่ format การแสดงผลกำหนดที่นี่
  cellRenderers: {
    product_family: (v) => {
      const s = (v as string) ?? "general";
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
          {FAMILY_LABEL[s] ?? s}
        </span>
      );
    },
    code: (v) => {
      const code = String(v ?? "");
      const isDup = code.includes("_DUP_");
      return (
        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isDup ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}
              title={isDup ? "ซ้ำ — ต้องตรวจสอบ" : undefined}>
          {code}
        </span>
      );
    },
    sale_price:  fmtPrice,
    final_price: fmtPrice,
    fake_price:  fmtPrice,
  },
};

function fmtPrice(v: unknown) {
  const n = v as number | null;
  return n != null && Number(n) > 0
    ? <span className="text-sm tabular-nums font-medium text-slate-800">฿{Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
    : <span className="text-xs text-slate-300">—</span>;
}

export default function ParentSKUsV2Page() {
  return <MasterCRUDPage config={CONFIG} />;
}

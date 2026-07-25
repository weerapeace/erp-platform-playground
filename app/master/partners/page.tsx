"use client";

/**
 * Master Data v2 — Partners (Customers + Suppliers)
 *
 * URL: /master/partners
 * Field config: /admin/schema-sync (เลือก module: Partners)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { formatCreditTerm } from "@/lib/credit-term";

// F20: client-only render — กัน Worker 1102 (SSR component หนัก)
const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "partners",
  moduleKey:   "partners-v2",
  tableId:     "master-partners-v2",
  title:       "Partners",
  description: "ลูกค้า + ผู้จำหน่าย (Customers + Suppliers) — จัดการ field ที่ /admin/schema-sync",
  icon:        "🤝",
  activeField: "is_active",
  exportEntityType: "partners_v2",
  permissions: {
    view:   "customers.view",
    create: "customers.create",
    edit:   "customers.edit",
  },
  cellRenderers: {
    is_customer: (v) => v
      ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">ลูกค้า</span>
      : <span className="text-xs text-slate-300">—</span>,
    is_supplier: (v) => v
      ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">ซัพพลายเออร์</span>
      : <span className="text-xs text-slate-300">—</span>,
    credit_limit: (v) => {
      const n = v as number | null;
      return n != null && Number(n) > 0
        ? <span className="text-sm tabular-nums text-slate-700">฿{Number(n).toLocaleString("th-TH")}</span>
        : <span className="text-xs text-slate-300">—</span>;
    },
    // เครดิตการจ่าย → ข้อความไทยอ่านง่ายในตาราง
    purchase_credit_term: (v) => {
      const s = formatCreditTerm(v as string | null);
      return s === "—" ? <span className="text-xs text-slate-300">—</span>
        : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">💳 {s}</span>;
    },
  },
  // ตัวเลือกเครดิตการจ่ายในฟอร์มร้าน (ปฏิทินจัดซื้อเอาไปคำนวณวันจ่ายอัตโนมัติ)
  formRenderers: {
    purchase_credit_term: ({ value, onChange, disabled }) => (
      <PurchaseCreditTermInput value={(value as string) || null} onChange={onChange} disabled={disabled} />
    ),
  },
};

export default function PartnersV2Page() {
  return <MasterCRUDPage config={CONFIG} />;
}

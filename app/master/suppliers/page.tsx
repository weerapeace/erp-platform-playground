"use client";

/**
 * Master Data v2 — Suppliers (มุมมองกรองของ partners_v2 ที่ is_supplier=true)
 *
 * URL: /master/suppliers
 * ใช้ตารางกลาง + ตาราง partners_v2 ตัวเดียวกับ Customers (ไม่สร้างตารางใหม่)
 * Field config: /admin/schema-sync (เลือก module: Partners)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "partners",
  moduleKey:   "partners-v2",
  tableId:     "master-suppliers-v2",
  title:       "ผู้ขาย / ซัพพลายเออร์ (Suppliers)",
  description: "เฉพาะคู่ค้าที่เป็นผู้ขาย — ข้อมูลตารางเดียวกับ Customers (กดสร้างใหม่จะตั้งเป็นผู้ขายให้อัตโนมัติ)",
  icon:        "🏢",
  activeField: "is_active",
  exportEntityType: "partners_v2",
  // มุมมองกรองตายตัว: เห็นเฉพาะ is_supplier=true
  baseFilter:     { is_supplier: { type: "boolean", value: "true" } },
  createDefaults: { is_supplier: true },
  permissions: {
    view:   "customers.view",
    create: "customers.create",
    edit:   "customers.edit",
  },
  cellRenderers: {
    is_customer: (v) => v
      ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">เป็นลูกค้าด้วย</span>
      : <span className="text-xs text-slate-300">—</span>,
    supplier_lead_time_days: (v) => {
      const n = v as number | null;
      return n != null && Number(n) > 0
        ? <span className="text-sm tabular-nums text-slate-700">{Number(n)} วัน</span>
        : <span className="text-xs text-slate-300">—</span>;
    },
  },
};

export default function SuppliersV2Page() {
  return <MasterCRUDPage config={CONFIG} />;
}

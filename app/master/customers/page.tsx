"use client";

/**
 * Master Data v2 — Customers (มุมมองกรองของ partners_v2 ที่ is_customer=true)
 *
 * URL: /master/customers
 * ใช้ตารางกลาง + ตาราง partners_v2 ตัวเดียวกับ Suppliers (ไม่สร้างตารางใหม่)
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
  tableId:     "master-customers-v2",
  title:       "ลูกค้า (Customers)",
  description: "เฉพาะคู่ค้าที่เป็นลูกค้า — ข้อมูลตารางเดียวกับ Suppliers (กดสร้างใหม่จะตั้งเป็นลูกค้าให้อัตโนมัติ)",
  icon:        "🧑‍💼",
  activeField: "is_active",
  exportEntityType: "partners_v2",
  // มุมมองกรองตายตัว: เห็นเฉพาะ is_customer=true
  baseFilter:     { is_customer: { type: "boolean", value: "true" } },
  createDefaults: { is_customer: true },
  permissions: {
    view:   "customers.view",
    create: "customers.create",
    edit:   "customers.edit",
  },
  cellRenderers: {
    is_supplier: (v) => v
      ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">เป็นซัพด้วย</span>
      : <span className="text-xs text-slate-300">—</span>,
    credit_limit: (v) => {
      const n = v as number | null;
      return n != null && Number(n) > 0
        ? <span className="text-sm tabular-nums text-slate-700">฿{Number(n).toLocaleString("th-TH")}</span>
        : <span className="text-xs text-slate-300">—</span>;
    },
  },
};

export default function CustomersV2Page() {
  return <MasterCRUDPage config={CONFIG} />;
}

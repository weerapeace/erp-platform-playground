"use client";

/** Phase 2 — Units / UoM (หน่วยนับทั้งหมด, sync จาก Odoo) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/master-v2/", apiPath: "uoms", moduleKey: "uoms",
  tableId: "master-uoms", title: "Units (UoM)", icon: "📏",
  description: "หน่วยนับทั้งหมด (sync จาก Odoo) — ใช้คู่กับ UoM Conversions",
  activeField: "active", pageLimit: 500,
  permissions: { view: "products.view", create: "products.create", edit: "products.edit" },
  cellRenderers: {
    uom_type: (v) => v ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600">{String(v)}</span> : <span className="text-slate-300">—</span>,
  },
};

export default function UomsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

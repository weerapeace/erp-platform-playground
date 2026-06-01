"use client";

/** Phase 2 — UoM Conversions (ตารางแปลงหน่วย) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/master-v2/", apiPath: "uom-conversions", moduleKey: "uom-conversions",
  tableId: "master-uom-conversions", title: "UoM Conversions", icon: "🔄",
  description: "ตารางแปลงหน่วย — เช่น 1 pack = 100 pcs (ใช้ตอนซื้อ/เก็บ/ใช้ผลิตคนละหน่วย)",
  activeField: "is_active", pageLimit: 500,
  permissions: { view: "products.view", create: "products.create", edit: "products.edit" },
  cellRenderers: {
    from_uom: (v) => <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{String(v ?? "")}</span>,
    to_uom:   (v) => <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{String(v ?? "")}</span>,
    factor: (v) => <span className="text-sm tabular-nums font-medium text-slate-800">× {Number(v ?? 0).toLocaleString("th-TH")}</span>,
  },
};

export default function UomConversionsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

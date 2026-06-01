"use client";

/** Phase 2 — Material Slots (ช่องหน้าที่วัตถุดิบใน BOM) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const RESOLVE_LABEL: Record<string, string> = {
  fixed_sku: "SKU ตายตัว", by_product_color: "ตามสีสินค้า", by_hardware_color: "ตามสีอะไหล่",
  by_size_matrix: "ตามไซส์", manual_select: "เลือกเอง", material_set: "ชุดวัสดุ",
  sub_bom: "Sub-BOM", formula: "สูตรคำนวณ",
};

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/master-v2/", apiPath: "material-slots", moduleKey: "material-slots",
  tableId: "master-material-slots", title: "Material Slots", icon: "🧩",
  description: "ช่องหน้าที่วัตถุดิบใน BOM (เช่น MAIN_LEATHER) — ใช้สูตรเดียวกับสินค้าหลายสี/ไซส์",
  activeField: "is_active", pageLimit: 500,
  permissions: { view: "products.view", create: "products.create", edit: "products.edit" },
  cellRenderers: {
    slot_code: (v) => <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{String(v ?? "")}</span>,
    resolve_method: (v) => {
      const s = String(v ?? "");
      return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700">{RESOLVE_LABEL[s] ?? s}</span>;
    },
    slot_group: (v) => v ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700">{String(v)}</span> : <span className="text-slate-300">—</span>,
  },
};

export default function MaterialSlotsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

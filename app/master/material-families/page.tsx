"use client";

/** Phase 2 — Material Families (กลุ่มวัตถุดิบ ไม่มี stock) */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/master-v2/", apiPath: "material-families", moduleKey: "material-families",
  tableId: "master-material-families", title: "Material Families", icon: "🧵",
  description: "กลุ่มวัตถุดิบ (เช่น Canvas 12oz) — ใช้จัดหมวด+เลือกใน BOM Template แต่ไม่มี stock จริง (stock อยู่ที่ SKU)",
  activeField: "is_active", pageLimit: 500,
  permissions: { view: "products.view", create: "products.create", edit: "products.edit" },
  cellRenderers: {
    family_code: (v) => <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{String(v ?? "")}</span>,
    material_category: (v) => v ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700">{String(v)}</span> : <span className="text-slate-300">—</span>,
  },
};

export default function MaterialFamiliesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

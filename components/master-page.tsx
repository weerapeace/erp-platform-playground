"use client";

/**
 * MasterPage — helper สร้างหน้า Master/Operation แบบ skeleton อย่างรวดเร็ว
 * (Phase 2–9 big-picture) — ห่อ dynamic import + MasterCRUDConfig ในตัว
 *
 * ทุกหน้าใช้ Universal DataTable + Field Registry เหมือนกัน (ของกลางตาม CLAUDE.md)
 * ssr:false กัน Worker 1102
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

export type MasterPageProps = {
  apiPath:      string;
  moduleKey:    string;
  title:        string;
  icon?:        string;
  description?: string;
  /** field ที่ใช้ active/archive (default is_active) */
  activeField?: string;
  /** cell renderers เพิ่มเติม (badge ฯลฯ) */
  cellRenderers?: MasterCRUDConfig["cellRenderers"];
  /** กลุ่ม A: โชว์ทุก column เป็น default (default true สำหรับหน้า skeleton) */
  showAllColumns?: boolean;
};

export function MasterPage({
  apiPath, moduleKey, title, icon, description, activeField = "is_active",
  cellRenderers, showAllColumns = true,
}: MasterPageProps) {
  const config: MasterCRUDConfig = {
    apiBase: "/api/master-v2/",
    apiPath,
    moduleKey,
    tableId: `master-${moduleKey}`,
    title,
    icon,
    description,
    activeField,
    pageLimit: 500,
    permissions: { view: "products.view", create: "products.create", edit: "products.edit" },
    cellRenderers,
    defaultShowAllColumns: showAllColumns,
  };
  return <MasterCRUDPage config={config} />;
}

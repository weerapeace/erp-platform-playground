"use client";

/**
 * Logic Registry — ทะเบียนกฎธุรกิจทั้งหมด (LR3)
 *
 * URL: /master/logic
 *
 * แหล่งข้อมูล: erp_logic_registry (กระจกเงาของ docs/LOGIC_MEMORY_SIMPLE.md)
 * ใช้ Universal DataTable + Field Registry เหมือน Master Data อื่น
 * → ค้นหา / กรองตามหมวด / ติ๊กสถานะการพัฒนา (impl_status) ได้เลย
 *
 * F20: client-only render (ssr:false) กัน Worker 1102
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CAT_LABEL: Record<string, string> = {
  A: "A · Core/Governance", B: "B · Product/SKU", C: "C · Material/UoM",
  D: "D · BOM", E: "E · Inventory", F: "F · Cutting", G: "G · Manufacturing",
  H: "H · QC", I: "I · Sales/Purchase", J: "J · OEM", K: "K · Marketplace",
  L: "L · Costing", M: "M · HR/Payroll", N: "N · Data/Security", O: "O · Report/SOP",
};

const IMPL: Record<string, { label: string; cls: string }> = {
  not_started: { label: "ยังไม่เริ่ม", cls: "bg-slate-100 text-slate-500" },
  in_progress: { label: "กำลังทำ",   cls: "bg-amber-50 text-amber-700" },
  done:        { label: "เสร็จแล้ว",  cls: "bg-emerald-50 text-emerald-700" },
};

const LOGIC_STATUS: Record<string, { label: string; cls: string }> = {
  draft:      { label: "ร่าง",      cls: "bg-slate-100 text-slate-500" },
  approved:   { label: "อนุมัติ",   cls: "bg-blue-50 text-blue-700" },
  active:     { label: "ใช้งาน",    cls: "bg-emerald-50 text-emerald-700" },
  deprecated: { label: "ยกเลิก",    cls: "bg-red-50 text-red-600" },
};

function badge(map: Record<string, { label: string; cls: string }>) {
  return (v: unknown) => {
    const s = String(v ?? "");
    const o = map[s];
    return o
      ? <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${o.cls}`}>{o.label}</span>
      : <span className="text-xs text-slate-300">—</span>;
  };
}

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "logic",
  moduleKey:   "logic-registry",
  tableId:     "master-logic-registry",
  title:       "Logic Registry",
  description: "ทะเบียนกฎธุรกิจทั้งหมด — ค้นหา/กรองตามหมวด และติ๊กสถานะการพัฒนาได้ (จาก LOGIC_MEMORY_SIMPLE.md)",
  icon:        "📚",
  activeField: "is_active",
  // 146 rules → client mode (โหลดครบรวดเดียว, filter/view/card ใช้ได้)
  pageLimit:   500,
  permissions: {
    view:   "products.view",
    create: "products.create",
    edit:   "products.edit",
  },
  cellRenderers: {
    logic_id: (v) => (
      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{String(v ?? "")}</span>
    ),
    category: (v) => {
      const s = String(v ?? "");
      return <span className="text-xs text-slate-600" title={CAT_LABEL[s] ?? s}>{CAT_LABEL[s] ?? s}</span>;
    },
    impl_status:  badge(IMPL),
    logic_status: badge(LOGIC_STATUS),
  },
};

export default function LogicRegistryPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

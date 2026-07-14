"use client";

/**
 * วงเงิน OD (OD Facilities) — Phase 2
 * URL: /od-facilities · ตาราง od_facilities
 * ปุ่ม "นำเข้า Statement" → คิดยอดใช้รายวัน + utilization ให้อัตโนมัติ
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { ODImportButton } from "./import-modal";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS: Record<string, [string, string]> = {
  draft:            ["ร่าง", "bg-slate-100 text-slate-600 border-slate-200"],
  pending_approval: ["รออนุมัติ", "bg-amber-50 text-amber-700 border-amber-200"],
  active:           ["ใช้งานอยู่", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  suspended:        ["ระงับ", "bg-amber-50 text-amber-700 border-amber-200"],
  expired:          ["หมดอายุ", "bg-red-50 text-red-700 border-red-200"],
  closing_review:   ["ตรวจปิด", "bg-purple-50 text-purple-700 border-purple-200"],
  closed:           ["ปิดแล้ว", "bg-slate-50 text-slate-400 border-slate-200"],
};
const money = (v: unknown) => {
  const n = Number(v);
  return n > 0 ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "od-facilities",
  moduleKey:   "od-facilities",
  tableId:     "od-facilities",
  title:       "วงเงิน OD",
  description: "วงเงินเบิกเกินบัญชี — ยอดใช้/utilization คิดจาก Statement ที่นำเข้า",
  icon:        "🏦",
  formLayout:  "sections",
  defaultShowAllColumns: false,
  activeField: "is_active",
  exportEntityType: "od_facilities",
  permissions: {
    view:   "od_facilities.view",
    create: "od_facilities.create",
    edit:   "od_facilities.edit",
  },
  headerActions: () => <ODImportButton />,
  cellRenderers: {
    limit_amount: money,
    current_used_amount: money,
    available_limit: money,
    utilization_percent: (v) => {
      const pct = Number(v) || 0;
      const color = pct >= 85 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : pct >= 50 ? "bg-blue-500" : "bg-emerald-500";
      const txt = pct >= 85 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-slate-500";
      return (
        <div className="w-32">
          <div className="flex justify-between text-[11px] mb-0.5"><span className={`tabular-nums font-medium ${txt}`}>{pct}%</span></div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>
      );
    },
    lifecycle_status: (v) => {
      const m = STATUS[String(v ?? "")];
      return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span> : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
  },
};

export default function ODFacilitiesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

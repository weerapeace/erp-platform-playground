"use client";

/**
 * กระทบยอดดอกเบี้ย OD (Interest Reconciliation) — Phase 2c
 * URL: /od-interest-recon · ตาราง od_interest_reconciliations
 * เทียบประมาณการ (จาก daily balance) vs ที่ธนาคารหักจริง (owner กรอกช่อง "ธนาคารหักจริง")
 * ต่างเกิน 100 บาท หรือ 1% = ต้องตรวจสอบ · ยอมรับส่วนต่างใหญ่ต้องใส่ "เหตุผล"
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { ReconBuildButton } from "./build-button";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS: Record<string, [string, string]> = {
  waiting:     ["รอ Statement", "bg-slate-100 text-slate-500 border-slate-200"],
  accepted:    ["ยอมรับส่วนต่าง", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  need_review: ["ต้องตรวจสอบ", "bg-red-50 text-red-700 border-red-200"],
};
const money = (v: unknown) => {
  if (v == null) return <span className="text-xs text-slate-300">—</span>;
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return <span className={`text-sm tabular-nums ${Math.abs(n) > 100 ? "text-red-600 font-medium" : "text-slate-700"}`}>{sign}฿{n.toLocaleString("th-TH")}</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "od-interest-recon",
  moduleKey:   "od-interest-recon",
  tableId:     "od-interest-recon",
  title:       "กระทบยอดดอกเบี้ย OD",
  description: "เทียบดอกเบี้ยประมาณการ vs ที่ธนาคารหักจริง — กรอกช่อง 'ธนาคารหักจริง' แล้วระบบเทียบให้",
  icon:        "📈",
  formLayout:  "sections",
  activeField: "is_active",
  exportEntityType: "od_interest_reconciliations",
  permissions: {
    view:   "od_interest.view",
    create: "od_interest.reconcile",
    edit:   "od_interest.reconcile",
  },
  headerActions: () => <ReconBuildButton />,
  cellRenderers: {
    estimated: (v) => <span className="text-sm tabular-nums text-slate-700">฿{Number(v).toLocaleString("th-TH")}</span>,
    actual: (v) => v == null ? <span className="text-xs text-slate-300">— ยังไม่กรอก</span> : <span className="text-sm tabular-nums text-slate-700">฿{Number(v).toLocaleString("th-TH")}</span>,
    difference: money,
    diff_pct: (v) => {
      if (v == null) return <span className="text-xs text-slate-300">—</span>;
      const n = Number(v);
      return <span className={`text-sm tabular-nums ${Math.abs(n) > 1 ? "text-red-600" : "text-slate-500"}`}>{n > 0 ? "+" : ""}{n}%</span>;
    },
    status: (v) => {
      const m = STATUS[String(v ?? "")];
      return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span> : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
  },
};

export default function ODInterestReconPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

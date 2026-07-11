"use client";

/**
 * รายการเดินบัญชี OD (OD Transactions) — Phase 2 (ดูอย่างเดียว)
 * URL: /od-transactions · ตาราง od_transactions (จาก Statement ที่นำเข้า)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const money = (tone: "in" | "out" | "bal") => (v: unknown) => {
  const n = Number(v);
  if (n === 0) return <span className="text-xs text-slate-300">—</span>;
  const cls = tone === "in" ? "text-emerald-600" : tone === "out" ? "text-red-600" : n < 0 ? "text-red-600 font-medium" : "text-slate-700";
  return <span className={`text-sm tabular-nums ${cls}`}>฿{n.toLocaleString("th-TH")}</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "od-transactions",
  moduleKey:   "od-transactions",
  tableId:     "od-transactions",
  title:       "รายการเดินบัญชี OD",
  description: "รายการเดินบัญชีจาก Statement — กรองตามวงเงินได้",
  icon:        "🧾",
  activeField: "is_active",
  exportEntityType: "od_transactions",
  readOnly:    true,
  permissions: {
    view:   "od_transactions.view",
    create: "od_transactions.view",
    edit:   "od_transactions.view",
  },
  cellRenderers: {
    money_in: money("in"),
    money_out: money("out"),
    balance_after: money("bal"),
  },
};

export default function ODTransactionsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

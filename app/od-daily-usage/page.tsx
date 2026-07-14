"use client";

/**
 * ยอดใช้ OD รายวัน (Daily Balance) — Phase 2 (ดูอย่างเดียว)
 * URL: /od-daily-usage · ตาราง od_daily_balances (สร้างจาก Statement)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const money = (v: unknown) => {
  const n = Number(v);
  return n !== 0 ? <span className={`text-sm tabular-nums ${n < 0 ? "text-red-600" : "text-slate-700"}`}>฿{n.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "od-daily-balances",
  moduleKey:   "od-daily-balances",
  tableId:     "od-daily-balances",
  title:       "ยอดใช้ OD รายวัน",
  description: "ยอดใช้วงเงิน + ดอกเบี้ยประมาณการรายวัน (คำนวณจาก Statement) — กรองตามวงเงินได้",
  icon:        "📅",
  activeField: "is_active",
  exportEntityType: "od_daily_balances",
  readOnly:    true,
  defaultShowAllColumns: false,
  permissions: {
    view:   "od_daily.view",
    create: "od_daily.view",
    edit:   "od_daily.view",
  },
  cellRenderers: {
    closing_bank_balance: money,
    od_used_amount: money,
    available_limit: money,
    estimated_interest: money,
  },
};

export default function ODDailyUsagePage() {
  return <MasterCRUDPage config={CONFIG} />;
}

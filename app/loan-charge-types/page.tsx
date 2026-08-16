"use client";

/**
 * ประเภทรายการจ่าย (เงินกู้) — ตั้งค่ารายการที่แต่ละธนาคารเก็บเงิน
 * URL: /loan-charge-types · ตาราง loan_charge_types
 *
 * ที่มา: "บางธนาคารมีรายการไม่เหมือนกัน" — แทนที่จะ hardcode ในโค้ด
 * เจ้าของเพิ่ม/แก้เองได้จากหน้านี้ แล้วจะไปโผล่ในป๊อป "บันทึกการจ่ายเงินกู้" ทันที
 * (เว้นช่องธนาคารว่าง = ใช้ได้กับทุกสัญญา)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const BUCKET: Record<string, [string, string]> = {
  principal: ["เงินต้น", "bg-blue-50 text-blue-700 border-blue-200"],
  interest:  ["ดอกเบี้ย", "bg-amber-50 text-amber-700 border-amber-200"],
  penalty:   ["ดอกเบี้ยผิดนัดชำระ", "bg-red-50 text-red-700 border-red-200"],
  fee:       ["ค่าธรรมเนียม", "bg-violet-50 text-violet-700 border-violet-200"],
  other:     ["อื่น ๆ (ไม่ตัดเข้างวด)", "bg-slate-100 text-slate-500 border-slate-200"],
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "loan-charge-types",
  moduleKey:   "loan-charge-types",
  tableId:     "loan-charge-types",
  title:       "ประเภทรายการจ่าย",
  description: "รายการที่ธนาคารเก็บเงินนอกจากเงินต้น/ดอกเบี้ย เช่น ค่าอากรแสตมป์ ค่าเบี้ยประกัน — เพิ่มไว้ที่นี่แล้วจะเลือกใช้ได้ในป๊อปบันทึกการจ่าย",
  icon:        "⚙️",
  formLayout:  "sections",
  activeField: "is_active",
  exportEntityType: "loan_charge_types",
  defaultShowAllColumns: false,
  permissions: {
    view:   "loan_payments.view",
    create: "loan_payments.create",
    edit:   "loan_payments.edit",
  },
  createDefaults: { bucket: "fee", sort_order: 100, is_active: true },
  cellRenderers: {
    bucket: (v) => {
      const m = BUCKET[String(v ?? "")];
      return m
        ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${m[1]}`}>{m[0]}</span>
        : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
    lender_name: (v) => {
      const s = String(v ?? "").trim();
      return s
        ? <span className="text-sm text-slate-700">{s}</span>
        : <span className="text-xs text-emerald-600">ทุกธนาคาร</span>;
    },
  },
};

export default function LoanChargeTypesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

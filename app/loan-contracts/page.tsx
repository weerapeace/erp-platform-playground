"use client";

/**
 * สัญญาเงินกู้ (Loan Contracts) — Master Data v2 (Phase 1a)
 * URL: /loan-contracts · ตาราง loan_contracts · จัดการ field ที่ /admin/schema-sync (โมดูล: สัญญาเงินกู้)
 * ใช้ของกลาง MasterCRUDPage → ตาราง/ฟอร์ม/ค้นหา/สิทธิ์/ประวัติ/Export ครบ · เลขรันอัตโนมัติจาก trigger
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

// ---- ป้ายชื่อ (แสดงผลภาษาไทย จากค่าที่เก็บเป็นอังกฤษ) ----
const LOAN_TYPE: Record<string, string> = {
  term: "เงินกู้มีกำหนด", revolving: "หมุนเวียน", leasing: "ลีสซิ่ง", director: "กรรมการ",
  vehicle: "สินเชื่อรถ", machine: "ซื้อเครื่องจักร", short_term: "ระยะสั้น",
};
const chip = (label: string, cls: string) =>
  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>{label}</span>;

const LIFECYCLE: Record<string, [string, string]> = {
  draft: ["ร่าง", "bg-slate-100 text-slate-600 border-slate-200"],
  pending_approval: ["รออนุมัติ", "bg-amber-50 text-amber-700 border-amber-200"],
  approved: ["อนุมัติแล้ว", "bg-blue-50 text-blue-700 border-blue-200"],
  active: ["ใช้งานอยู่", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  closing_review: ["กำลังตรวจปิด", "bg-purple-50 text-purple-700 border-purple-200"],
  closed: ["ปิดแล้ว", "bg-slate-50 text-slate-400 border-slate-200"],
  cancelled: ["ยกเลิก", "bg-red-50 text-red-700 border-red-200"],
  restructuring: ["ปรับโครงสร้าง", "bg-purple-50 text-purple-700 border-purple-200"],
};
const HEALTH: Record<string, [string, string]> = {
  current: ["ปกติ", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  due: ["ใกล้ครบกำหนด", "bg-amber-50 text-amber-700 border-amber-200"],
  overdue: ["เกินกำหนด", "bg-red-50 text-red-700 border-red-200"],
  defaulted: ["ผิดนัดชำระ", "bg-red-50 text-red-700 border-red-200"],
};
const money = (v: unknown) => {
  const n = Number(v);
  return n > 0
    ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span>
    : <span className="text-xs text-slate-300">—</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "loan-contracts",
  moduleKey:   "loan-contracts",
  tableId:     "loan-contracts",
  title:       "สัญญาเงินกู้",
  description: "ทะเบียนเงินกู้ทั้งหมด — จัดการ field ที่ /admin/schema-sync (โมดูล: สัญญาเงินกู้)",
  icon:        "📄",
  formLayout:  "sections",
  defaultShowAllColumns: false,
  activeField: "is_active",
  exportEntityType: "loan_contracts",
  permissions: {
    view:   "loan_contracts.view",
    create: "loan_contracts.create",
    edit:   "loan_contracts.edit",
  },
  mediaGallery: {
    entityType: "loan_contract",
    title: "เอกสารสัญญา",
    description: "แนบไฟล์สัญญา / หนังสืออนุมัติ / สลิปการจ่าย (PDF หรือรูป)",
    maxItems: 20,
    maxSizeBytes: 10 * 1024 * 1024,
    imageOnly: false,
    layout: "grid",
  },
  cellRenderers: {
    loan_type: (v) => {
      const k = String(v ?? "");
      return LOAN_TYPE[k] ? <span className="text-sm text-slate-600">{LOAN_TYPE[k]}</span> : <span className="text-xs text-slate-300">—</span>;
    },
    lifecycle_status: (v) => {
      const m = LIFECYCLE[String(v ?? "")];
      return m ? chip(m[0], m[1]) : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
    repayment_health: (v) => {
      const m = HEALTH[String(v ?? "")];
      return m ? chip(m[0], m[1]) : <span className="text-xs text-slate-300">{String(v ?? "—")}</span>;
    },
    contracted_principal: money,
    approved_limit: money,
    interest_rate: (v) => {
      const n = Number(v);
      return <span className="text-sm tabular-nums text-slate-600">{n.toFixed(2)}%</span>;
    },
  },
};

export default function LoanContractsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

"use client";

/**
 * สัญญาเงินกู้ (Loan Contracts) — Master Data v2 (Phase 1a)
 * URL: /loan-contracts · ตาราง loan_contracts · จัดการ field ที่ /admin/schema-sync (โมดูล: สัญญาเงินกู้)
 * ใช้ของกลาง MasterCRUDPage → ตาราง/ฟอร์ม/ค้นหา/สิทธิ์/ประวัติ/Export ครบ · เลขรันอัตโนมัติจาก trigger
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { LoanProgressActions } from "./progress-actions";
import { LoanPaymentsSection } from "./payments-section";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

// ---- ป้ายชื่อ (แสดงผลภาษาไทย จากค่าที่เก็บเป็นอังกฤษ) ----
// ประเภทเงินกู้ / ชนิดอัตรา / วิธีผ่อน ฯลฯ ใช้ป้ายไทยจากทะเบียน field (options.labels)
// แก้ชื่อป้ายได้เองที่ปุ่ม 🎨 แต่งฟอร์ม → เลือกฟิลด์ → "ตัวเลือก (select)" — ไม่ต้องแก้โค้ด
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
  // ปุ่มในหมวด "ความคืบหน้าการผ่อน" — ลงตารางผ่อน/บันทึกการจ่ายได้จากในหน้าสัญญาเลย (ของกลาง sectionActions)
  sectionActions: {
    progress: ({ recordId, form, refresh }) => (
      <LoanProgressActions
        recordId={recordId}
        totalInstallments={Number(form.total_installment_count ?? 0)}
        onDone={refresh}
      />
    ),
  },
  // แผง "รายการการจ่ายเงินกู้" ท้ายหน้ารายละเอียดสัญญา (ของกลาง recordSections)
  // โชว์ทุกใบจ่ายของสัญญานี้ + แยกเงินต้น/ดอกเบี้ย/ดอกผิดนัด/ค่าธรรมเนียม/อื่น ๆ + ยอดรวม
  recordSections: [
    {
      key: "loan-payments",
      title: "💸 รายการการจ่ายเงินกู้",
      render: ({ recordId }) => <LoanPaymentsSection contractId={recordId} />,
    },
  ],
  cellRenderers: {
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
    total_paid_amount: money,
    next_due_amount: money,
    interest_rate: (v) => {
      const n = Number(v);
      return <span className="text-sm tabular-nums text-slate-600">{n.toFixed(2)}%</span>;
    },
    // ผ่อนไปกี่งวด — โชว์ "x / y งวด" + แถบความคืบหน้า (อ่านง่ายกว่าเลขเดี่ยว)
    paid_installment_count: (v, row) => {
      const paid  = Number(v ?? 0);
      const total = Number(row?.total_installment_count ?? 0);
      if (!total) return <span className="text-xs text-slate-300">ยังไม่มีตารางผ่อน</span>;
      const pct = Math.min(100, Math.round((paid / total) * 100));
      return (
        <span className="inline-flex items-center gap-2">
          <span className="text-sm tabular-nums text-slate-700">{paid} / {total} งวด</span>
          <span className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
        </span>
      );
    },
    payment_due_day: (v) => {
      const n = Number(v ?? 0);
      return n >= 1 && n <= 31
        ? <span className="text-sm text-slate-700">ทุกวันที่ {n}</span>
        : <span className="text-xs text-slate-300">—</span>;
    },
  },
};

export default function LoanContractsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

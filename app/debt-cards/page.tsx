"use client";

/**
 * บัตรเครดิต & วงเงินหมุนเวียน (debt_cards) — หนี้แบบเบา
 * URL: /debt-cards · ตาราง debt_cards · จัดการ field ที่ /admin/schema-sync (โมดูล: บัตรเครดิต & วงเงินหมุนเวียน)
 *
 * แนวคิด: ไม่มีตารางผ่อน/ใบเบิก — 1 แถว = 1 บัตร เก็บ "ยอดตามใบแจ้งยอดล่าสุด + วันครบกำหนด + จ่ายแล้วเท่าไหร่"
 * ทุกเดือนแก้ยอด/วันตามใบใหม่ · โผล่ที่หน้าหนี้ธนาคาร (/bank-debts) และกระดานเงินสด (การ์ด 🔒 วันครบกำหนด)
 * ใช้ของกลาง MasterCRUDPage ทั้งหมด (ตาราง/ฟอร์ม/ตัวเลือกธนาคาร/บริษัท/ประวัติ)
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const chip = (label: string, cls: string) =>
  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>{label}</span>;

const STATUS: Record<string, [string, string]> = {
  unpaid:  ["ยังไม่จ่าย",   "bg-amber-50 text-amber-700 border-amber-200"],
  partial: ["จ่ายบางส่วน", "bg-blue-50 text-blue-700 border-blue-200"],
  paid:    ["จ่ายแล้ว",     "bg-emerald-50 text-emerald-700 border-emerald-200"],
};
const money = (v: unknown) => {
  const n = Number(v);
  return n > 0
    ? <span className="text-sm tabular-nums text-slate-700">฿{n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
    : <span className="text-xs text-slate-300">—</span>;
};
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "debt-cards",
  moduleKey:   "debt-cards",
  tableId:     "debt-cards",
  title:       "บัตรเครดิต & วงเงินหมุนเวียน",
  description: "หนี้แบบเบา — ทุกเดือนแก้ 'ยอดที่ต้องชำระ' และ 'ครบกำหนด' ตามใบแจ้งยอด · จ่ายแล้วกรอกช่อง 'จ่ายแล้ว' ระบบตั้งสถานะให้เอง",
  icon:        "💳",
  formLayout:  "sections",
  defaultShowAllColumns: false,
  activeField: "is_active",
  exportEntityType: "debt_cards",
  permissions: {
    view:   "loan_contracts.view",
    create: "loan_contracts.create",
    edit:   "loan_contracts.edit",
  },
  mediaGallery: {
    entityType: "debt_card",
    title: "ใบแจ้งยอด",
    description: "แนบใบแจ้งยอดบัตร / สลิปที่จ่าย (PDF หรือรูป)",
    maxItems: 24,
    maxSizeBytes: 10 * 1024 * 1024,
    imageOnly: false,
    layout: "grid",
  },
  cellRenderers: {
    status: (v, row) => {
      const m = STATUS[String(v ?? "")];
      const due = String(row?.due_date ?? "");
      const overdue = String(v) !== "paid" && due && due < todayISO();
      return (
        <span className="inline-flex gap-1">
          {m ? chip(m[0], m[1]) : <span className="text-xs text-slate-300">—</span>}
          {overdue && chip("เกินกำหนด", "bg-red-50 text-red-700 border-red-200")}
        </span>
      );
    },
    statement_balance: money,
    minimum_due: money,
    paid_amount: money,
    credit_limit: money,
  },
};

export default function DebtCardsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}

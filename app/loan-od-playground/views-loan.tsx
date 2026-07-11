"use client";
// Loan & OD Playground — Loan side views (Dashboard, Loans, Payments)
import React, { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import {
  ERPForm, ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea,
} from "@/components/form";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { StatusChip, ToneChip, CardBox, Field, MockNote } from "./ui";
import {
  LOAN_LIFECYCLE, DRAWDOWN_STATUS, REPAYMENT_HEALTH, ACCOUNTING_STATUS, PAYMENT_STATUS,
  utilizationTone, type StatusTone,
} from "./workflow";
import {
  THB, LOAN_TYPE_LABEL,
  MOCK_LOANS, MOCK_OD, MOCK_SCHEDULE, MOCK_PAYMENTS, MOCK_ALERTS, DASHBOARD_AS_OF,
  loanSummary, odSummary,
  type LoanContract, type Payment,
} from "./mock";

// ============================================================
// DASHBOARD
// ============================================================
export function DashboardView({ onGoto }: { onGoto: (section: string) => void }) {
  const ln = loanSummary();
  const od = odSummary();

  const cards = [
    { label: "เงินต้นเงินกู้คงเหลือ", value: THB(ln.outstanding), sub: `${ln.activeCount} สัญญาที่ใช้งานอยู่`, tone: "text-slate-900" },
    { label: "วงเงิน OD ทั้งหมด", value: THB(od.totalLimit), sub: `${od.count} วงเงิน Active`, tone: "text-slate-900" },
    { label: "OD ใช้ไปแล้ว", value: THB(od.totalUsed), sub: `เหลือวงเงิน ${THB(od.available)}`, tone: "text-amber-600" },
    { label: "ต้องจ่ายเดือนนี้", value: THB(ln.dueThisMonth), sub: "ก.ค. 2026", tone: "text-blue-700" },
    { label: "ยอดเกินกำหนด", value: THB(ln.overdueAmount), sub: "ต้องติดตามด่วน", tone: ln.overdueAmount > 0 ? "text-red-600" : "text-slate-900" },
    { label: "รายการถัดไป", value: "LOAN-2026-0002", sub: "ครบกำหนด 12 ก.ค. 2026", tone: "text-slate-900", small: true },
  ];

  const alertTone = { info: "border-blue-200 bg-blue-50", warning: "border-amber-200 bg-amber-50", danger: "border-red-200 bg-red-50" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">ภาพรวมหนี้และวงเงิน</h2>
          <p className="text-xs text-slate-500 mt-0.5">สรุปเงินกู้และ OD ทั้งหมดของบริษัท</p>
        </div>
        <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
          ข้อมูล ณ วันที่ {DASHBOARD_AS_OF}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`mt-1.5 font-bold ${c.small ? "text-base font-mono" : "text-2xl"} ${c.tone}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Alerts */}
        <CardBox title="⚡ การแจ้งเตือน" description="เรียงตามระดับความเสี่ยง — คลิกเพื่อไปที่รายการ">
          <div className="space-y-2">
            {MOCK_ALERTS.map((a) => (
              <div key={a.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${alertTone[a.level]}`}>
                <span className="text-base mt-0.5">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{a.detail}</p>
                </div>
                {a.link && <span className="font-mono text-[10px] text-slate-500 bg-white/70 rounded px-1.5 py-0.5 whitespace-nowrap">{a.link}</span>}
              </div>
            ))}
          </div>
        </CardBox>

        {/* Widgets */}
        <div className="space-y-5">
          <CardBox title="💰 เงินที่ต้องเตรียมจ่าย" description="รวมเงินกู้ + ประมาณดอกเบี้ย OD">
            <div className="grid grid-cols-2 gap-3">
              {[
                { d: "ภายใน 7 วัน", v: 9062, tone: "text-blue-700" },
                { d: "ภายใน 15 วัน", v: 101566, tone: "text-blue-700" },
                { d: "ภายใน 30 วัน", v: 205070, tone: "text-amber-600" },
                { d: "ภายใน 90 วัน", v: 512430, tone: "text-slate-900" },
              ].map((x) => (
                <div key={x.d} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3">
                  <p className="text-xs text-slate-500">{x.d}</p>
                  <p className={`text-lg font-bold mt-0.5 ${x.tone}`}>{THB(x.v)}</p>
                </div>
              ))}
            </div>
          </CardBox>

          <CardBox title="📈 การใช้วงเงิน OD" description="เทียบวงเงินกับยอดใช้ล่าสุด">
            <div className="space-y-3">
              {odSummaryBars()}
            </div>
            <button onClick={() => onGoto("od")} className="mt-3 text-xs text-blue-600 hover:underline">
              ดูรายละเอียด OD ทั้งหมด →
            </button>
          </CardBox>
        </div>
      </div>

      <MockNote>
        นี่คือ <b>หน้าตาตัวอย่าง (mock)</b> — ตัวเลขทั้งหมดเป็นข้อมูลสมมติ ยังไม่ต่อฐานข้อมูลจริง
        เจ้าของโปรเจกต์ดูคำ/ปุ่ม/ลำดับข้อมูล แล้วบอกจุดที่อยากปรับได้เลยครับ
      </MockNote>
    </div>
  );
}

function odSummaryBars() {
  return MOCK_OD.map((o) => {
    const tone = utilizationTone(o.utilization_percent);
    const barColor: Record<StatusTone, string> = { danger: "bg-red-500", warning: "bg-amber-500", info: "bg-blue-500", success: "bg-emerald-500", neutral: "bg-slate-400", purple: "bg-purple-500", muted: "bg-slate-300" };
    return (
      <div key={o.od_code}>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-mono text-slate-600">{o.od_code}</span>
          <span className="text-slate-500">{o.utilization_percent}% · {THB(o.current_used_amount)} / {THB(o.limit_amount)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${barColor[tone]}`} style={{ width: `${Math.min(o.utilization_percent, 100)}%` }} />
        </div>
      </div>
    );
  });
}

// ============================================================
// LOAN SECTION (list / detail / create)
// ============================================================
export function LoanSection() {
  const [view, setView] = useState<"list" | "detail" | "create">("list");
  const [selected, setSelected] = useState<LoanContract | null>(null);

  const open = (loan: LoanContract) => { setSelected(loan); setView("detail"); };

  if (view === "detail" && selected) return <LoanDetail loan={selected} onBack={() => setView("list")} />;
  if (view === "create") return <LoanForm onBack={() => setView("list")} />;
  return <LoanList onOpen={open} onCreate={() => setView("create")} />;
}

const LOAN_COLUMNS: ColumnDef<LoanContract>[] = [
  {
    id: "loan_code", accessorKey: "loan_code", header: "รหัส", size: 140,
    cell: ({ getValue }) => <span className="font-mono text-xs font-bold text-slate-700">{getValue() as string}</span>,
  },
  {
    id: "loan_name", accessorKey: "loan_name", header: "ชื่อสัญญา", size: 240,
    cell: ({ getValue, row }) => (
      <div>
        <p className="text-sm font-medium text-slate-800 line-clamp-1">{getValue() as string}</p>
        <p className="text-[11px] text-slate-400">{LOAN_TYPE_LABEL[row.original.loan_type]}</p>
      </div>
    ),
  },
  {
    id: "lender", accessorKey: "lender", header: "ผู้ให้กู้", size: 150,
    meta: { filterable: true },
    cell: ({ getValue }) => <span className="text-xs text-slate-600">{getValue() as string}</span>,
  },
  {
    id: "outstanding_principal", accessorKey: "outstanding_principal", header: "เงินต้นคงเหลือ", size: 130,
    meta: { filterable: true, filterType: "number" },
    cell: ({ getValue }) => <span className="text-sm font-semibold text-slate-800 tabular-nums">{THB(getValue() as number)}</span>,
  },
  {
    id: "interest_rate", accessorKey: "interest_rate", header: "ดอกเบี้ย", size: 90,
    cell: ({ getValue }) => <span className="text-sm text-slate-600 tabular-nums">{(getValue() as number).toFixed(2)}%</span>,
  },
  {
    id: "lifecycle_status", accessorKey: "lifecycle_status", header: "สถานะสัญญา", size: 120, enableSorting: false,
    meta: { filterable: true, filterOptions: Object.entries(LOAN_LIFECYCLE).map(([v, m]) => ({ value: v, label: m.label })) },
    cell: ({ getValue }) => <StatusChip meta={LOAN_LIFECYCLE[getValue() as keyof typeof LOAN_LIFECYCLE]} size="xs" />,
  },
  {
    id: "repayment_health", accessorKey: "repayment_health", header: "การชำระ", size: 115, enableSorting: false,
    meta: { filterable: true, filterOptions: Object.entries(REPAYMENT_HEALTH).map(([v, m]) => ({ value: v, label: m.label })) },
    cell: ({ getValue }) => <StatusChip meta={REPAYMENT_HEALTH[getValue() as keyof typeof REPAYMENT_HEALTH]} size="xs" />,
  },
  {
    id: "next_due_date", accessorKey: "next_due_date", header: "ครบกำหนดถัดไป", size: 120,
    cell: ({ getValue, row }) => (
      <div>
        <p className="text-xs text-slate-700">{getValue() as string}</p>
        {row.original.next_due_amount > 0 && <p className="text-[11px] text-slate-400 tabular-nums">{THB(row.original.next_due_amount)}</p>}
      </div>
    ),
  },
];

const LOAN_VIEWS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "active", label: "ใช้งานอยู่", filter: (r: Record<string, unknown>) => r.lifecycle_status === "active" },
  { id: "overdue", label: "เกินกำหนด", filter: (r: Record<string, unknown>) => r.repayment_health === "overdue" },
  { id: "waiting", label: "รออนุมัติ", filter: (r: Record<string, unknown>) => r.lifecycle_status === "pending_approval" },
  { id: "acc_not_ready", label: "ยังไม่พร้อมส่งบัญชี", filter: (r: Record<string, unknown>) => r.accounting_status === "not_ready" },
];

function LoanList({ onOpen, onCreate }: { onOpen: (l: LoanContract) => void; onCreate: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">สัญญาเงินกู้ (Loan Contracts)</h2>
          <p className="text-xs text-slate-500 mt-0.5">รายการทั้งหมด — ใช้ Universal DataTable + Saved Views</p>
        </div>
        <button onClick={onCreate} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          + สร้างสัญญาเงินกู้
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <DataTable<LoanContract>
          data={MOCK_LOANS}
          columns={LOAN_COLUMNS}
          title="สัญญาเงินกู้"
          description="ทะเบียนเงินกู้ทั้งหมด (ข้อมูล mock)"
          searchPlaceholder="ค้นหาจากรหัส / ชื่อสัญญา / ผู้ให้กู้..."
          searchableKeys={["loan_code", "loan_name", "lender", "contract_no"]}
          views={LOAN_VIEWS}
          rowActions={[
            { label: "ดูรายละเอียด", onClick: (row) => onOpen(row) },
            { label: "แก้ไข", onClick: (row) => alert(`(mock) แก้ไข ${row.loan_code}`) },
            { label: "ส่งออก (Export)", onClick: (row) => alert(`(mock) Export ${row.loan_code}`) },
          ]}
          bulkActions={[
            { label: "เปลี่ยนผู้รับผิดชอบ", onClick: (rows) => alert(`(mock) เปลี่ยนผู้รับผิดชอบ ${rows.length} รายการ`) },
            { label: "Export ที่เลือก", onClick: (rows) => alert(`(mock) Export ${rows.length} รายการ`) },
          ]}
          onRowClick={(row) => onOpen(row)}
        />
      </div>
    </div>
  );
}

// ---------- Loan Detail ----------
function LoanDetail({ loan, onBack }: { loan: LoanContract; onBack: () => void }) {
  const paidPct = loan.contracted_principal > 0
    ? Math.round((loan.principal_paid_amount / loan.total_drawn_amount || 0) * 100) : 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">← กลับรายการ</button>

      {/* Header + 4-layer status */}
      <CardBox>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-700">{loan.loan_code}</span>
              <span className="text-xs text-slate-400">· {loan.contract_no}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{loan.loan_name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{LOAN_TYPE_LABEL[loan.loan_type]} · {loan.lender}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusChip meta={LOAN_LIFECYCLE[loan.lifecycle_status]} />
            <StatusChip meta={DRAWDOWN_STATUS[loan.drawdown_status]} />
            <StatusChip meta={REPAYMENT_HEALTH[loan.repayment_health]} />
            <StatusChip meta={ACCOUNTING_STATUS[loan.accounting_status]} />
          </div>
        </div>

        {/* progress */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>ชำระเงินต้นแล้ว {THB(loan.principal_paid_amount)} จาก {THB(loan.total_drawn_amount)}</span>
            <span>{paidPct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      </CardBox>

      {/* Key figures */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "วงเงินอนุมัติ", v: THB(loan.approved_limit) },
          { l: "เบิกสะสม", v: THB(loan.total_drawn_amount) },
          { l: "เงินต้นคงเหลือ", v: THB(loan.outstanding_principal), strong: true },
          { l: "ครบกำหนดถัดไป", v: loan.next_due_date === "—" ? "—" : `${loan.next_due_date}`, sub: loan.next_due_amount > 0 ? THB(loan.next_due_amount) : "" },
        ].map((x) => (
          <div key={x.l} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5">
            <p className="text-xs text-slate-500">{x.l}</p>
            <p className={`mt-1 ${x.strong ? "text-lg font-bold text-slate-900" : "text-sm font-semibold text-slate-800"} tabular-nums`}>{x.v}</p>
            {x.sub && <p className="text-[11px] text-slate-400 tabular-nums">{x.sub}</p>}
          </div>
        ))}
      </div>

      {/* Contract terms */}
      <CardBox title="เงื่อนไขสัญญา">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="อัตราดอกเบี้ย" value={`${loan.interest_rate.toFixed(2)}% (${loan.interest_rate_type === "fixed" ? "คงที่" : "ลอยตัว"})`} />
          <Field label="อ้างอิง" value={loan.interest_rate_reference || "—"} />
          <Field label="วิธีผ่อน" value={loan.repayment_method} />
          <Field label="ความถี่จ่าย" value={loan.payment_frequency} />
          <Field label="วันเริ่มสัญญา" value={loan.start_date} />
          <Field label="วันสิ้นสุด" value={loan.end_date} />
          <Field label="ผู้รับผิดชอบ" value={loan.responsible} />
          <Field label="บริษัท" value={loan.company} />
        </div>
      </CardBox>

      {/* Repayment schedule */}
      <CardBox title="ตารางผ่อนชำระ (Active Version)" description="เวอร์ชันที่มีผลปัจจุบัน — ห้ามแก้ทับ ต้องสร้าง Version ใหม่"
        right={<button onClick={() => alert("(mock) สร้าง Schedule Version ใหม่ — ต้องระบุเหตุผล + ผู้อนุมัติ")} className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">+ สร้างเวอร์ชันใหม่</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left py-2 font-medium">งวด</th>
                <th className="text-left py-2 font-medium">ครบกำหนด</th>
                <th className="text-right py-2 font-medium">เงินต้น</th>
                <th className="text-right py-2 font-medium">ดอกเบี้ย</th>
                <th className="text-right py-2 font-medium">รวมงวด</th>
                <th className="text-right py-2 font-medium">จ่ายแล้ว</th>
                <th className="text-center py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_SCHEDULE.map((s) => {
                const meta = {
                  paid: { label: "จ่ายครบ", tone: "success" as const, icon: "✅" },
                  partial: { label: "จ่ายบางส่วน", tone: "warning" as const, icon: "◐" },
                  unpaid: { label: "ยังไม่จ่าย", tone: "neutral" as const, icon: "○" },
                  overdue: { label: "เกินกำหนด", tone: "danger" as const, icon: "⚠️" },
                }[s.status];
                return (
                  <tr key={s.no} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700">{s.no}</td>
                    <td className="py-2 text-slate-600">{s.due_date}</td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{THB(s.principal_due)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{THB(s.interest_due)}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-slate-800">{THB(s.total_due)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{s.total_paid > 0 ? THB(s.total_paid) : "—"}</td>
                    <td className="py-2 text-center"><ToneChip tone={meta.tone}>{meta.icon} {meta.label}</ToneChip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBox>

      {/* Journal preview */}
      <CardBox title="🧾 ตัวอย่างลงบัญชี (Journal Preview)" description="ตัวอย่างก่อนส่งบัญชี — ยังไม่ถือว่า Post แล้ว">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 font-mono text-xs text-slate-700 space-y-1">
          <p className="text-slate-400">// รับเงินกู้ (Drawdown)</p>
          <div className="flex justify-between"><span>Dr. เงินฝากธนาคาร (Bank)</span><span className="tabular-nums">5,000,000.00</span></div>
          <div className="flex justify-between pl-6"><span>Cr. เงินกู้ยืม (Loan Payable)</span><span className="tabular-nums">5,000,000.00</span></div>
          <p className="text-slate-400 mt-3">// จ่ายงวด 18 (เงินต้น + ดอกเบี้ย)</p>
          <div className="flex justify-between"><span>Dr. เงินกู้ยืม (Loan Payable)</span><span className="tabular-nums">74,000.00</span></div>
          <div className="flex justify-between"><span>Dr. ดอกเบี้ยจ่าย (Interest Expense)</span><span className="tabular-nums">18,516.00</span></div>
          <div className="flex justify-between pl-6"><span>Cr. เงินฝากธนาคาร (Bank)</span><span className="tabular-nums">92,516.00</span></div>
        </div>
      </CardBox>

      {/* Activity / audit */}
      <CardBox title="📋 ประวัติการทำรายการ (Audit Log)">
        <div className="space-y-3">
          {[
            { who: "อนุชา (บัญชี)", act: "ยืนยันการจ่าย งวด 18", when: "15 มิ.ย. 2026, 14:20" },
            { who: "สมหญิง (การเงิน)", act: "บันทึกการจ่าย LPAY-2026-0031", when: "15 มิ.ย. 2026, 11:05" },
            { who: "คุณวีระ (Owner)", act: "อนุมัติสัญญา + Activate", when: "15 ม.ค. 2025, 09:30" },
            { who: "สมหญิง (การเงิน)", act: "สร้างสัญญาเงินกู้", when: "14 ม.ค. 2025, 16:40" },
          ].map((e, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-slate-700"><b>{e.who}</b> — {e.act}</p>
                <p className="text-xs text-slate-400">{e.when}</p>
              </div>
            </div>
          ))}
        </div>
      </CardBox>
    </div>
  );
}

// ---------- Loan create form (mock) ----------
function LoanForm({ onBack }: { onBack: () => void }) {
  const [f, setF] = useState({
    loan_name: "", lender: "", loan_type: "term", contract_no: "",
    contracted_principal: "", interest_rate: "", interest_rate_type: "floating",
    start_date: "", end_date: "", repayment_method: "equal_installment", payment_frequency: "monthly",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => { setF((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((p) => ({ ...p, [k]: "" })); };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.loan_name.trim()) e.loan_name = "กรุณาระบุชื่อสัญญา";
    if (!f.lender.trim()) e.lender = "กรุณาระบุผู้ให้กู้";
    if (!f.contracted_principal) e.contracted_principal = "กรุณาระบุเงินต้น";
    if (!f.interest_rate) e.interest_rate = "กรุณาระบุอัตราดอกเบี้ย";
    if (!f.start_date) e.start_date = "กรุณาระบุวันเริ่มสัญญา";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); alert("(mock) บันทึกสัญญาเป็นร่าง (Draft) แล้ว — จริง ๆ จะเข้า Workflow รออนุมัติ"); onBack(); }, 1000);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">← กลับ</button>
        <h2 className="text-lg font-bold text-slate-900">สร้างสัญญาเงินกู้ใหม่</h2>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-mono">DRAFT</span>
      </div>

      <MockNote>
        รหัสสัญญา (loan_code) จะออกอัตโนมัติจาก <b>Numbering กลาง</b> ตอนบันทึก · ยอดคงเหลือ/เบิกสะสมเป็นค่าคำนวณ ไม่กรอกมือ
      </MockNote>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <ERPForm onSubmit={submit} onCancel={onBack} loading={loading} submitText="บันทึกสัญญา (ร่าง)" cancelText="ยกเลิก" isDirty={!!f.loan_name}>
          <ERPFormSection title="ข้อมูลสัญญา" columns={2}>
            <ERPFormField label="ชื่อสัญญา" required error={errors.loan_name} span={2}>
              <ERPInput value={f.loan_name} onChange={(e) => set("loan_name", e.target.value)} placeholder="เช่น เงินกู้ซื้อเครื่องจักร" error={!!errors.loan_name} />
            </ERPFormField>
            <ERPFormField label="ผู้ให้กู้ (Lender)" required error={errors.lender} hint="จริง ๆ จะใช้ Partner Picker กลาง">
              <ERPInput value={f.lender} onChange={(e) => set("lender", e.target.value)} placeholder="เช่น ธนาคารกสิกรไทย" error={!!errors.lender} />
            </ERPFormField>
            <ERPFormField label="ประเภทเงินกู้" required>
              <ERPSelect value={f.loan_type} onChange={(e) => set("loan_type", e.target.value)}
                options={Object.entries(LOAN_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            </ERPFormField>
            <ERPFormField label="เลขที่สัญญา (ของธนาคาร)">
              <ERPInput value={f.contract_no} onChange={(e) => set("contract_no", e.target.value)} placeholder="เลขอ้างอิงจากผู้ให้กู้" />
            </ERPFormField>
          </ERPFormSection>

          <div className="border-t border-slate-100 my-6" />
          <ERPFormSection title="เงินต้นและดอกเบี้ย" columns={2}>
            <ERPFormField label="เงินต้นตามสัญญา (บาท)" required error={errors.contracted_principal}>
              <ERPInput type="number" value={f.contracted_principal} onChange={(e) => set("contracted_principal", e.target.value)} placeholder="0.00" error={!!errors.contracted_principal} />
            </ERPFormField>
            <ERPFormField label="อัตราดอกเบี้ย (%)" required error={errors.interest_rate}>
              <ERPInput type="number" value={f.interest_rate} onChange={(e) => set("interest_rate", e.target.value)} placeholder="เช่น 6.75" error={!!errors.interest_rate} />
            </ERPFormField>
            <ERPFormField label="ชนิดอัตรา">
              <ERPSelect value={f.interest_rate_type} onChange={(e) => set("interest_rate_type", e.target.value)}
                options={[{ value: "fixed", label: "คงที่ (Fixed)" }, { value: "floating", label: "ลอยตัว (Floating)" }]} />
            </ERPFormField>
            <ERPFormField label="วิธีผ่อน">
              <ERPSelect value={f.repayment_method} onChange={(e) => set("repayment_method", e.target.value)}
                options={[
                  { value: "equal_installment", label: "งวดเท่ากัน" },
                  { value: "equal_principal", label: "เงินต้นเท่ากัน" },
                  { value: "interest_only", label: "จ่ายดอกเบี้ยอย่างเดียว" },
                  { value: "custom", label: "กำหนดเอง" },
                ]} />
            </ERPFormField>
          </ERPFormSection>

          <div className="border-t border-slate-100 my-6" />
          <ERPFormSection title="ระยะเวลา" columns={2}>
            <ERPFormField label="วันเริ่มสัญญา" required error={errors.start_date}>
              <ERPInput type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} error={!!errors.start_date} />
            </ERPFormField>
            <ERPFormField label="วันสิ้นสุด">
              <ERPInput type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </ERPFormField>
            <ERPFormField label="หมายเหตุ" span={2}>
              <ERPTextarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="วัตถุประสงค์ / เงื่อนไขพิเศษ" />
            </ERPFormField>
          </ERPFormSection>
        </ERPForm>
      </div>
    </div>
  );
}

// ============================================================
// PAYMENT SECTION (list + allocation drawer + reverse)
// ============================================================
export function PaymentSection() {
  const [openPayment, setOpenPayment] = useState<Payment | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">การจ่ายและตัดยอด (Payments)</h2>
        <p className="text-xs text-slate-500 mt-0.5">ยอดจ่ายถูกแยกเป็น เงินต้น / ดอกเบี้ย / ค่าธรรมเนียม / ค่าปรับ ผ่าน Allocation</p>
      </div>

      <MockNote>
        Payment ที่ <b>ยืนยันแล้ว (Verified)</b> แก้ตรง ๆ ไม่ได้ — ต้องกด <b>กลับรายการ (Reverse)</b> แล้วสร้างใหม่ และระบบผูก Audit Log ให้อัตโนมัติ
      </MockNote>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <DataTable<Payment>
          data={MOCK_PAYMENTS}
          columns={PAYMENT_COLUMNS}
          title="รายการจ่ายเงินกู้"
          description="ข้อมูล mock"
          searchPlaceholder="ค้นหาเลขที่จ่าย / สัญญา / อ้างอิง..."
          searchableKeys={["payment_no", "loan_code", "loan_name", "reference_no"]}
          views={[
            { id: "all", label: "ทั้งหมด" },
            { id: "submitted", label: "รอตรวจสอบ", filter: (r: Record<string, unknown>) => r.status === "submitted" },
            { id: "verified", label: "ยืนยันแล้ว", filter: (r: Record<string, unknown>) => r.status === "verified" },
            { id: "reversed", label: "กลับรายการ", filter: (r: Record<string, unknown>) => r.status === "reversed" },
          ]}
          rowActions={[
            { label: "ดูการตัดยอด (Allocation)", onClick: (row) => setOpenPayment(row) },
            { label: "กลับรายการ (Reverse)", onClick: (row) => setReverseTarget(row), variant: "danger" },
          ]}
          onRowClick={(row) => setOpenPayment(row)}
        />
      </div>

      {/* Allocation drawer */}
      <Drawer open={!!openPayment} onClose={() => setOpenPayment(null)} title={openPayment ? `การตัดยอด — ${openPayment.payment_no}` : ""} size="lg">
        {openPayment && <PaymentAllocation payment={openPayment} onReverse={() => { setReverseTarget(openPayment); setOpenPayment(null); }} />}
      </Drawer>

      {/* Reverse confirm */}
      <ConfirmDialog
        open={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        onConfirm={() => { alert(`(mock) กลับรายการ ${reverseTarget?.payment_no} แล้ว — สร้างรายการ Reversal + Audit Log`); setReverseTarget(null); }}
        title="ยืนยันการกลับรายการ (Reverse Payment)"
        variant="danger"
        confirmText="ยืนยันกลับรายการ"
        cancelText="ยกเลิก"
        message={reverseTarget ? `ต้องการกลับรายการ ${reverseTarget.payment_no} (${THB(reverseTarget.total_paid)}) หรือไม่?\n\nระบบจะสร้างรายการกลับ (Reversal) และคืนยอดค้างในงวดที่ตัดไป — การกระทำนี้ต้องมีสิทธิ์และถูกบันทึกใน Audit Log` : ""}
      />
    </div>
  );
}

const PAYMENT_COLUMNS: ColumnDef<Payment>[] = [
  { id: "payment_no", accessorKey: "payment_no", header: "เลขที่จ่าย", size: 140,
    cell: ({ getValue }) => <span className="font-mono text-xs font-bold text-slate-700">{getValue() as string}</span> },
  { id: "loan_code", accessorKey: "loan_code", header: "สัญญา", size: 150,
    cell: ({ getValue, row }) => <div><p className="font-mono text-xs text-slate-600">{getValue() as string}</p><p className="text-[11px] text-slate-400 line-clamp-1">{row.original.loan_name}</p></div> },
  { id: "payment_date", accessorKey: "payment_date", header: "วันที่จ่าย", size: 100,
    cell: ({ getValue }) => <span className="text-xs text-slate-600">{getValue() as string}</span> },
  { id: "total_paid", accessorKey: "total_paid", header: "ยอดจ่าย", size: 110,
    meta: { filterable: true, filterType: "number" },
    cell: ({ getValue }) => <span className="text-sm font-semibold text-slate-800 tabular-nums">{THB(getValue() as number)}</span> },
  { id: "paid_from", accessorKey: "paid_from", header: "จ่ายจากบัญชี", size: 160,
    cell: ({ getValue }) => <span className="text-xs text-slate-500 font-mono">{getValue() as string}</span> },
  { id: "status", accessorKey: "status", header: "สถานะ", size: 120, enableSorting: false,
    meta: { filterable: true, filterOptions: Object.entries(PAYMENT_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
    cell: ({ getValue }) => <StatusChip meta={PAYMENT_STATUS[getValue() as keyof typeof PAYMENT_STATUS]} size="xs" /> },
];

function PaymentAllocation({ payment, onReverse }: { payment: Payment; onReverse: () => void }) {
  const sum = payment.allocations.reduce(
    (a, r) => ({ p: a.p + r.principal, i: a.i + r.interest, f: a.f + r.fee, pen: a.pen + r.penalty }),
    { p: 0, i: 0, f: 0, pen: 0 }
  );
  const allocated = sum.p + sum.i + sum.f + sum.pen;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="สัญญา" value={<span className="font-mono">{payment.loan_code}</span>} />
        <Field label="สถานะ" value={<StatusChip meta={PAYMENT_STATUS[payment.status]} size="xs" />} />
        <Field label="วันที่จ่าย" value={payment.payment_date} />
        <Field label="จ่ายจาก" value={<span className="font-mono text-xs">{payment.paid_from}</span>} />
        <Field label="ยอดจ่ายรวม" value={<span className="font-bold">{THB(payment.total_paid)}</span>} mono />
        <Field label="อ้างอิง" value={payment.reference_no || "—"} />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">การตัดยอดตามงวด (ลำดับ: ค่าปรับ → ค่าธรรมเนียม → ดอกเบี้ย → เงินต้น)</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-500">
                <th className="text-left px-3 py-2 font-medium">งวด</th>
                <th className="text-right px-3 py-2 font-medium">เงินต้น</th>
                <th className="text-right px-3 py-2 font-medium">ดอกเบี้ย</th>
                <th className="text-right px-3 py-2 font-medium">ค่าธรรมเนียม</th>
                <th className="text-right px-3 py-2 font-medium">ค่าปรับ</th>
                <th className="text-right px-3 py-2 font-medium">รวม</th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((r) => (
                <tr key={r.installment_no} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">งวด {r.installment_no}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{THB(r.principal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{THB(r.interest)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.fee ? THB(r.fee) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.penalty ? THB(r.penalty) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{THB(r.principal + r.interest + r.fee + r.penalty)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr className="text-xs font-semibold text-slate-700">
                <td className="px-3 py-2">รวม</td>
                <td className="px-3 py-2 text-right tabular-nums">{THB(sum.p)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{THB(sum.i)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{THB(sum.f)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{THB(sum.pen)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{THB(allocated)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={`text-xs mt-2 ${allocated === payment.total_paid ? "text-emerald-600" : "text-red-600"}`}>
          {allocated === payment.total_paid ? "✓ ผลรวม Allocation ตรงกับยอดจ่าย" : "⚠ ผลรวม Allocation ไม่ตรงกับยอดจ่าย"}
        </p>
      </div>

      {payment.status === "verified" && (
        <div className="pt-3 border-t border-slate-100">
          <button onClick={onReverse} className="h-9 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
            ↩️ กลับรายการ (Reverse)
          </button>
          <p className="text-xs text-slate-400 mt-1.5">รายการที่ยืนยันแล้วแก้ตรงไม่ได้ ต้องกลับรายการเท่านั้น</p>
        </div>
      )}
    </div>
  );
}

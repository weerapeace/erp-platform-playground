"use client";

/**
 * Dashboard เงินกู้ (Phase 1e) — อ่านจาก RPC loan_dashboard (สรุปจากรายการต้นทาง)
 * URL: /loan-dashboard
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type DueRow = { loan_code: string; loan_name: string; installment_no: number; due_date: string; amount: number };
type Dash = {
  as_of: string;
  summary: { active_count: number; contract_count: number; total_outstanding: number; total_drawn: number; total_paid: number };
  due_30: number; overdue_amount: number;
  overdue: DueRow[]; due_soon: DueRow[];
};

const THB = (n: number) => "฿" + Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default function LoanDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setErr("");
    apiFetch("/api/loan-dashboard")
      .then((r) => r.json())
      .then((j) => { if (j?.error) setErr(j.error); else setD(j.data as Dash); })
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cards = d ? [
    { label: "เงินต้นคงเหลือรวม", value: THB(d.summary.total_outstanding), sub: `${d.summary.active_count} สัญญาที่ใช้งานอยู่`, tone: "text-slate-900" },
    { label: "เบิกสะสมรวม", value: THB(d.summary.total_drawn), sub: `${d.summary.contract_count} สัญญาทั้งหมด`, tone: "text-slate-900" },
    { label: "ชำระเงินต้นสะสม", value: THB(d.summary.total_paid), sub: "รวมทุกสัญญา", tone: "text-emerald-600" },
    { label: "ต้องจ่ายใน 30 วัน", value: THB(d.due_30), sub: "งวดที่ใกล้ครบกำหนด", tone: "text-blue-700" },
    { label: "ยอดเกินกำหนด", value: THB(d.overdue_amount), sub: `${d.overdue.length} งวดค้างชำระ`, tone: d.overdue_amount > 0 ? "text-red-600" : "text-slate-900" },
  ] : [];

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-6 md:px-8 py-5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📊 Dashboard เงินกู้</h1>
          <p className="text-slate-500 mt-1 text-sm">ภาพรวมหนี้ทั้งหมด — คำนวณจากรายการจริง</p>
        </div>
        {d && <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">ข้อมูล ณ {d.as_of}</span>}
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6">
        {loading && <div className="text-center text-slate-400 py-10">กำลังโหลดข้อมูล...</div>}
        {err && (
          <div className="text-center py-10">
            <p className="text-red-600 font-medium">⚠️ {err}</p>
            <button onClick={load} className="mt-3 h-9 px-4 text-sm text-white bg-blue-600 rounded-lg">ลองใหม่</button>
          </div>
        )}

        {d && !loading && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {cards.map((c) => (
                <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className={`mt-1.5 text-2xl font-bold ${c.tone}`}>{c.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
                </div>
              ))}
              <Link href="/loan-contracts" className="bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 p-4 flex flex-col justify-center transition-colors">
                <p className="text-sm font-semibold text-blue-700">ไปที่สัญญาเงินกู้ →</p>
                <p className="text-xs text-blue-500 mt-1">ดู/สร้าง/แก้สัญญาทั้งหมด</p>
              </Link>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <DueCard title="⚠️ เกินกำหนดชำระ" rows={d.overdue} tone="red" emptyText="ไม่มีงวดเกินกำหนด 🎉" />
              <DueCard title="🔔 ใกล้ครบกำหนด (30 วัน)" rows={d.due_soon} tone="amber" emptyText="ไม่มีงวดใกล้ครบกำหนด" />
            </div>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}

function DueCard({ title, rows, tone, emptyText }: { title: string; rows: DueRow[]; tone: "red" | "amber"; emptyText: string }) {
  const border = tone === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  const amt = tone === "red" ? "text-red-600" : "text-amber-600";
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{rows.length} รายการ</p>
      </div>
      <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
        {rows.length === 0 && <p className="text-center text-sm text-slate-400 py-6">{emptyText}</p>}
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${border}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{r.loan_name}</p>
              <p className="text-[11px] text-slate-500 font-mono">{r.loan_code} · งวด {r.installment_no} · {r.due_date}</p>
            </div>
            <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${amt}`}>{THB(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

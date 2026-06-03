"use client";

/**
 * Payroll module — ภาพรวม (Dashboard) / Phase 4
 * สรุปตัวเลขจาก /api/payroll/dashboard + ลิงก์ไปแต่ละหน้า
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Summary = {
  employeesTotal: number; employeesActive: number; contractsActive: number;
  periodsTotal: number; payslips: number; paymentBatches: number;
  payrollLines: number; requestsPending: number;
  latestPeriod: { period_name: string; status: string; start_date: string } | null;
};

const CARDS: { key: keyof Summary; label: string; icon: string; href: string; tone: string }[] = [
  { key: "employeesActive", label: "พนักงาน (ใช้งาน)", icon: "🪪", href: "/payroll/employees", tone: "text-emerald-600" },
  { key: "contractsActive", label: "สัญญาจ้าง (active)", icon: "📄", href: "/payroll/contracts", tone: "text-blue-600" },
  { key: "periodsTotal",    label: "งวดเงินเดือน",     icon: "🗓️", href: "/payroll/periods",   tone: "text-purple-600" },
  { key: "payrollLines",    label: "บรรทัดเงินเดือน",   icon: "✅", href: "/payroll/review",     tone: "text-amber-600" },
  { key: "payslips",        label: "สลิป",             icon: "🧾", href: "/payroll/payslips",   tone: "text-sky-600" },
  { key: "paymentBatches",  label: "รอบจ่ายเงิน",      icon: "🏦", href: "/payroll/payments",   tone: "text-indigo-600" },
];

export default function PayrollDashboardPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/payroll/dashboard").then((r) => r.json()).then((j) => {
      if (j.error) setErr(j.error); else setS(j.data as Summary);
    }).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">💰 ภาพรวมเงินเดือน</h1>
      <p className="text-sm text-slate-500 mb-6">สรุปข้อมูลจริงจากระบบ — โมดูล Payroll (ใช้ของกลาง erp)</p>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">เกิดข้อผิดพลาด: {err}</div>}
      {!s && !err && <div className="text-slate-400 py-10 text-center">กำลังโหลด...</div>}

      {s && (
        <>
          {s.latestPeriod && (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 mb-6 flex items-center gap-3">
              <span className="text-2xl">🗓️</span>
              <div>
                <div className="text-xs text-slate-400">งวดล่าสุด</div>
                <div className="font-semibold text-slate-800">{s.latestPeriod.period_name}</div>
              </div>
              <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{s.latestPeriod.status}</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {CARDS.map((c) => (
              <a key={c.key} href={c.href}
                 className="rounded-xl border border-slate-200 bg-white px-5 py-4 hover:shadow-md hover:border-slate-300 transition">
                <div className="text-2xl mb-1">{c.icon}</div>
                <div className={`text-2xl font-bold tabular-nums ${c.tone}`}>{Number(s[c.key]).toLocaleString("th-TH")}</div>
                <div className="text-sm text-slate-500 mt-0.5">{c.label}</div>
              </a>
            ))}
          </div>

          {s.requestsPending > 0 && (
            <a href="/payroll/requests" className="mt-4 block rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800 hover:shadow">
              📨 มีคำขอจากพนักงานรอดำเนินการ {s.requestsPending} รายการ →
            </a>
          )}

          <p className="text-xs text-slate-400 mt-6">
            หมายเหตุ: หน้าตรวจสอบเงินเดือน/สลิป/จ่ายเงิน เป็นแบบ <b>อ่านอย่างเดียว</b> —
            การคำนวณยังทำที่แอปเดิมจนกว่าจะเทียบยอดเสร็จ
          </p>
        </>
      )}
    </div>
  );
}

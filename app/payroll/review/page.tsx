"use client";

/**
 * Payroll module — ตรวจสอบเงินเดือน (Phase 3) — อ่านอย่างเดียว
 * เลือกงวด → ดูยอดรวมทั้งงวด (จำนวนคน/รายได้/หัก/ปกส./ภาษี/สุทธิ) + รายคน ของรอบคำนวณล่าสุด
 * ยอดรวมคิดจากทั้งงวดที่ server (ไม่ใช่แค่หน้าปัจจุบัน)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

type Period = { id: string; period_name: string; status: string };
type Run = { id: string; run_no: number; calculated_at: string | null };
type Totals = { count: number; gross_pay: number; total_deduction: number; social_security_employee: number; withholding_tax: number; net_pay: number };
type IssueCounts = { negative_net: number; high_deduction: number; missing_base: number; zero_work_days: number; has_recurring: number };
type Line = {
  id: string; employee_code: string; employee_name: string; base_salary: number; gross_pay: number;
  total_deduction: number; social_security_employee: number; withholding_tax: number; net_pay: number;
  attendance_days: number; attendance_hours: number; recurring_earning_amount: number; recurring_deduction_amount: number;
  late_deduction: number; absence_deduction: number; unpaid_leave_deduction: number; overtime_amount: number; other_deduction: number;
  status: string; issue_flags?: string[];
};
type FilterMode = "all" | "negative" | "high_deduction" | "missing_base" | "zero_days" | "recurring";

const baht = (v: unknown) => v == null ? "—" : `฿${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
const STATUS_TH: Record<string, { th: string; cls: string }> = {
  draft: { th: "ร่าง", cls: "bg-slate-100 text-slate-600" },
  review: { th: "รอตรวจ", cls: "bg-amber-100 text-amber-700" },
  approved: { th: "อนุมัติ", cls: "bg-blue-100 text-blue-700" },
  locked: { th: "ล็อกแล้ว", cls: "bg-purple-100 text-purple-700" },
  paid: { th: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { th: "ยกเลิก", cls: "bg-red-100 text-red-700" },
  held: { th: "พักไว้", cls: "bg-orange-100 text-orange-700" },
};
const badge = (s: string) => {
  const m = STATUS_TH[s] ?? { th: s, cls: "bg-slate-100 text-slate-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.th}</span>;
};

export default function PayrollReviewPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [runId, setRunId] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [periodStatus, setPeriodStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [issueCounts, setIssueCounts] = useState<IssueCounts | null>(null);

  useEffect(() => {
    apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json())
      .then((j) => { const ps = (j.data ?? []) as Period[]; setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id); }).catch(() => {});
  }, []);

  const load = useCallback(async (pid: string, rid?: string) => {
    if (!pid) return;
    setLoading(true); setErr(null);
    try {
      const url = `/api/payroll/period-summary?period_id=${encodeURIComponent(pid)}${rid ? `&run_id=${encodeURIComponent(rid)}` : ""}`;
      const j = await apiFetch(url).then((r) => r.json());
      if (j.error) { setErr(j.error); setTotals(null); setLines([]); }
      else {
        setTotals(j.totals); setIssueCounts(j.issue_counts ?? null); setLines(j.data as Line[]); setRuns(j.runs as Run[]);
        setRunId(j.run?.id ?? ""); setPeriodStatus(j.period_status ?? "");
      }
    } catch { setErr("โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (periodId) load(periodId); }, [periodId, load]);

  const shown = lines
    .filter((l) => q.trim() ? `${l.employee_code} ${l.employee_name}`.toLowerCase().includes(q.trim().toLowerCase()) : true)
    .filter((l) => {
      if (filterMode === "negative") return l.net_pay < 0;
      if (filterMode === "high_deduction") return l.gross_pay > 0 && l.total_deduction / l.gross_pay >= 0.5;
      if (filterMode === "missing_base") return l.base_salary <= 0 && l.gross_pay <= 0;
      if (filterMode === "zero_days") return l.attendance_days <= 0;
      if (filterMode === "recurring") return l.recurring_earning_amount > 0 || l.recurring_deduction_amount > 0;
      return true;
    });

  function exportCsv() {
    const head = ["รหัส", "พนักงาน", "เงินเดือน", "วันทำงาน", "รายได้รวม", "หักรวม", "ปกส.", "ภาษี", "สุทธิ", "สถานะ"];
    const rows = shown.map((l) => [l.employee_code, l.employee_name, l.base_salary, l.attendance_days, l.gross_pay, l.total_deduction, l.social_security_employee, l.withholding_tax, l.net_pay, l.status]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `payroll-${periods.find((p) => p.id === periodId)?.period_name ?? "review"}.csv`; a.click();
  }

  const curPeriod = periods.find((p) => p.id === periodId);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800">✅ ตรวจสอบเงินเดือน</h1>
      <p className="text-sm text-slate-500 mb-4">เลือกงวดเพื่อดูผลคำนวณ + ยอดรวมทั้งงวด (อ่านอย่างเดียว) — คำนวณ/บันทึกทำที่หน้า “คำนวณงวด”</p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1">งวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[240px]">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
        </div>
        {runs.length > 1 && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">รอบคำนวณ</label>
            <select value={runId} onChange={(e) => { setRunId(e.target.value); load(periodId, e.target.value); }}
              className="h-10 px-3 border border-slate-300 rounded-lg text-sm">
              {runs.map((r) => <option key={r.id} value={r.id}>รอบที่ {r.run_no}{r.calculated_at ? ` · ${new Date(r.calculated_at).toLocaleDateString("th-TH")}` : ""}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1">ค้นหาพนักงาน</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัส / ชื่อ"
            className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm" />
        </div>
        <button onClick={exportCsv} disabled={!lines.length}
          className="h-10 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">⬇ Export CSV</button>
        {curPeriod && <span className="h-10 flex items-center">{badge(periodStatus || curPeriod.status)}</span>}
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <Card label="จำนวนคน" value={totals.count.toLocaleString("th-TH")} cls="bg-slate-50 text-slate-700 border-slate-200" />
          <Card label="รายได้รวม" value={baht(totals.gross_pay)} cls="bg-blue-50 text-blue-700 border-blue-200" />
          <Card label="หักรวม" value={baht(totals.total_deduction)} cls="bg-amber-50 text-amber-700 border-amber-200" />
          <Card label="ประกันสังคม" value={baht(totals.social_security_employee)} cls="bg-slate-50 text-slate-700 border-slate-200" />
          <Card label="ภาษี" value={baht(totals.withholding_tax)} cls="bg-slate-50 text-slate-700 border-slate-200" />
          <Card label="จ่ายสุทธิ" value={baht(totals.net_pay)} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
        </div>
      )}

      {issueCounts && (
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterChip active={filterMode === "all"} onClick={() => setFilterMode("all")} label={`ทั้งหมด ${lines.length}`} />
          <FilterChip active={filterMode === "negative"} onClick={() => setFilterMode("negative")} label={`สุทธิติดลบ ${issueCounts.negative_net}`} tone="red" />
          <FilterChip active={filterMode === "high_deduction"} onClick={() => setFilterMode("high_deduction")} label={`หักเกิน 50% ${issueCounts.high_deduction}`} tone="amber" />
          <FilterChip active={filterMode === "missing_base"} onClick={() => setFilterMode("missing_base")} label={`ไม่มีฐานเงิน ${issueCounts.missing_base}`} tone="slate" />
          <FilterChip active={filterMode === "zero_days"} onClick={() => setFilterMode("zero_days")} label={`วันทำงาน 0 ${issueCounts.zero_work_days}`} tone="slate" />
          <FilterChip active={filterMode === "recurring"} onClick={() => setFilterMode("recurring")} label={`มีเงินประจำ ${issueCounts.has_recurring}`} tone="emerald" />
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">รหัส</th>
                <th className="text-left px-3 py-2">พนักงาน</th>
                <th className="text-right px-3 py-2">เงินเดือน</th>
                <th className="text-right px-3 py-2">วันทำงาน</th>
                <th className="text-right px-3 py-2">ประจำ +/-</th>
                <th className="text-right px-3 py-2">สาย/ขาด/ลา</th>
                <th className="text-right px-3 py-2">OT</th>
                <th className="text-right px-3 py-2">รายได้รวม</th>
                <th className="text-right px-3 py-2">หักรวม</th>
                <th className="text-right px-3 py-2">ปกส.</th>
                <th className="text-right px-3 py-2">ภาษี</th>
                <th className="text-right px-3 py-2">สุทธิ</th>
                <th className="text-center px-3 py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{l.employee_code}</td>
                  <td className="px-3 py-2">{l.employee_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(l.base_salary)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{l.attendance_days || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="text-emerald-700">{l.recurring_earning_amount ? baht(l.recurring_earning_amount) : "—"}</span>
                    {l.recurring_deduction_amount ? <span className="block text-red-600">-{baht(l.recurring_deduction_amount).replace("฿", "")}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">
                    {l.late_deduction + l.absence_deduction + l.unpaid_leave_deduction ? baht(l.late_deduction + l.absence_deduction + l.unpaid_leave_deduction) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{l.overtime_amount ? baht(l.overtime_amount) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(l.gross_pay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{baht(l.total_deduction)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{baht(l.social_security_employee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{baht(l.withholding_tax)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(l.net_pay)}</td>
                  <td className="px-3 py-2 text-center">{badge(l.status)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-10 text-center text-slate-400 text-sm">
                  {lines.length === 0 ? "งวดนี้ยังไม่มีผลคำนวณ — ไปที่หน้า “คำนวณงวด” เพื่อคำนวณและบันทึก" : "ไม่พบพนักงานที่ค้นหา"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, cls }: { label: string; value: React.ReactNode; cls: string }) {
  return <div className={`rounded-xl border px-4 py-3 ${cls}`}><div className="text-lg font-bold tabular-nums truncate">{value}</div><div className="text-xs opacity-80">{label}</div></div>;
}

function FilterChip({ active, onClick, label, tone = "blue" }: { active: boolean; onClick: () => void; label: string; tone?: "blue" | "red" | "amber" | "slate" | "emerald" }) {
  const on = {
    blue: "border-blue-300 bg-blue-50 text-blue-700",
    red: "border-red-300 bg-red-50 text-red-700",
    amber: "border-amber-300 bg-amber-50 text-amber-700",
    slate: "border-slate-300 bg-slate-50 text-slate-700",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-700",
  }[tone];
  return <button onClick={onClick} className={`h-8 px-3 rounded-lg border text-xs font-medium ${active ? on : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>{label}</button>;
}

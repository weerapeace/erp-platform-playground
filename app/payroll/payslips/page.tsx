"use client";

/**
 * Payroll module — สลิปเงินเดือน (Phase 3) — อ่านอย่างเดียว
 * เลือกงวด → ดูสลิปของงวดนั้น + ยอดรวม (จำนวนใบ/รายได้/หัก/สุทธิ)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

type Period = { id: string; period_name: string; status: string };
type Totals = { count: number; gross_pay: number; total_deduction: number; net_pay: number };
type Slip = {
  id: string; payslip_no: string; employee_code: string; employee_name: string; slip_type: string;
  gross_pay: number; total_deduction: number; net_pay: number; status: string; issued_at: string | null;
};

const baht = (v: unknown) => v == null ? "—" : `฿${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
const SLIP_TYPE_TH: Record<string, string> = { month_end: "สิ้นเดือน", mid_month: "กลางเดือน", special: "พิเศษ", bonus: "โบนัส" };
const STATUS_TH: Record<string, { th: string; cls: string }> = {
  draft: { th: "ร่าง", cls: "bg-slate-100 text-slate-600" },
  issued: { th: "ออกแล้ว", cls: "bg-blue-100 text-blue-700" },
  review: { th: "รอตรวจ", cls: "bg-amber-100 text-amber-700" },
  approved: { th: "อนุมัติ", cls: "bg-blue-100 text-blue-700" },
  paid: { th: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { th: "ยกเลิก", cls: "bg-red-100 text-red-700" },
};
const badge = (s: string) => {
  const m = STATUS_TH[s] ?? { th: s, cls: "bg-slate-100 text-slate-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.th}</span>;
};

export default function PayrollPayslipsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [periodStatus, setPeriodStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json())
      .then((j) => { const ps = (j.data ?? []) as Period[]; setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id); }).catch(() => {});
  }, []);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/payslip-summary?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) { setErr(j.error); setTotals(null); setSlips([]); }
      else { setTotals(j.totals); setSlips(j.data as Slip[]); setPeriodStatus(j.period_status ?? ""); }
    } catch { setErr("โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (periodId) load(periodId); }, [periodId, load]);

  const shown = q.trim()
    ? slips.filter((s) => `${s.payslip_no} ${s.employee_code} ${s.employee_name}`.toLowerCase().includes(q.trim().toLowerCase()))
    : slips;

  function exportCsv() {
    const head = ["เลขที่สลิป", "รหัส", "พนักงาน", "ประเภท", "รายได้รวม", "หักรวม", "สุทธิ", "สถานะ"];
    const rows = shown.map((s) => [s.payslip_no, s.employee_code, s.employee_name, SLIP_TYPE_TH[s.slip_type] ?? s.slip_type, s.gross_pay, s.total_deduction, s.net_pay, s.status]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `payslips-${periods.find((p) => p.id === periodId)?.period_name ?? "slip"}.csv`; a.click();
  }

  async function generate() {
    if (!periodId) return;
    const p = periods.find((x) => x.id === periodId);
    if (!confirm(`ออกสลิปงวด "${p?.period_name ?? ""}" จากผลคำนวณล่าสุด?\n\n(สลิปที่มีอยู่จะถูกอัปเดต ไม่สร้างซ้ำ)`)) return;
    setBusy(true); setErr(null); setGenMsg(null);
    try {
      const j = await apiFetch("/api/payroll/payslips/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period_id: periodId }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        setGenMsg(`✅ ออกสลิปสำเร็จ — ใหม่ ${j.data.created} · อัปเดต ${j.data.updated}${j.data.failed?.length ? ` · พลาด ${j.data.failed.length}` : ""} (รอบที่ ${j.data.run_no})`);
        await load(periodId);
      }
    } catch { setErr("ออกสลิปไม่สำเร็จ"); } finally { setBusy(false); }
  }

  const curPeriod = periods.find((p) => p.id === periodId);
  const canGenerate = curPeriod && curPeriod.status !== "cancelled";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800">🧾 สลิปเงินเดือน</h1>
      <p className="text-sm text-slate-500 mb-4">เลือกงวด → ดูสลิป + ยอดรวม หรือกด “ออกสลิปจากผลคำนวณ” เพื่อสร้างสลิปจากรอบคำนวณล่าสุด</p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1">งวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[240px]">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1">ค้นหา</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขสลิป / รหัส / ชื่อ"
            className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm" />
        </div>
        <button onClick={generate} disabled={busy || !canGenerate}
          className="h-10 px-4 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-40" title="สร้างสลิปจากผลคำนวณล่าสุดของงวด">
          {busy ? "กำลังออก..." : "🧾 ออกสลิปจากผลคำนวณ"}</button>
        <button onClick={exportCsv} disabled={!slips.length}
          className="h-10 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">⬇ Export CSV</button>
        {curPeriod && <span className="h-10 flex items-center">{badge(periodStatus || curPeriod.status)}</span>}
      </div>

      {genMsg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3">{genMsg}</div>}
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card label="จำนวนสลิป" value={totals.count.toLocaleString("th-TH")} cls="bg-slate-50 text-slate-700 border-slate-200" />
          <Card label="รายได้รวม" value={baht(totals.gross_pay)} cls="bg-blue-50 text-blue-700 border-blue-200" />
          <Card label="หักรวม" value={baht(totals.total_deduction)} cls="bg-amber-50 text-amber-700 border-amber-200" />
          <Card label="จ่ายสุทธิ" value={baht(totals.net_pay)} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">เลขที่สลิป</th>
                <th className="text-left px-3 py-2">พนักงาน</th>
                <th className="text-left px-3 py-2">ประเภท</th>
                <th className="text-right px-3 py-2">รายได้รวม</th>
                <th className="text-right px-3 py-2">หักรวม</th>
                <th className="text-right px-3 py-2">สุทธิ</th>
                <th className="text-center px-3 py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{s.payslip_no}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-400">{s.employee_code}</span> {s.employee_name}</td>
                  <td className="px-3 py-2 text-slate-500">{SLIP_TYPE_TH[s.slip_type] ?? s.slip_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(s.gross_pay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{baht(s.total_deduction)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(s.net_pay)}</td>
                  <td className="px-3 py-2 text-center">{badge(s.status)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400 text-sm">
                  {slips.length === 0 ? "งวดนี้ยังไม่มีสลิป" : "ไม่พบสลิปที่ค้นหา"}
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

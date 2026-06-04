"use client";

/**
 * Payroll module — คำนวณงวด (พรีวิว/เทียบ) Phase 3 — อ่านอย่างเดียว
 * เลือกงวด → รันเครื่องคำนวณเต็มจาก raw input → เทียบกับ payroll_lines เดิม (ยังไม่เขียนจริง)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Period = { id: string; period_name: string; status: string };
type Row = { id: string; employee_name: string; gross_new: number; gross_old: number | null; net_new: number; net_old: number | null; diff_net: number | null; status: string; ok: boolean };
type Summary = { total: number; match: number; diff: number; fresh: number };

const baht = (v: unknown) => v == null ? "—" : `฿${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

export default function PayrollCalcRunPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);

  useEffect(() => {
    apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json())
      .then((j) => { const ps = (j.data ?? []) as Period[]; setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id); }).catch(() => {});
  }, []);

  async function run() {
    if (!periodId) return;
    setLoading(true); setErr(null); setRows(null); setSummary(null);
    try {
      const j = await apiFetch(`/api/payroll/calc-run?period_id=${encodeURIComponent(periodId)}`).then((r) => r.json());
      if (j.error) setErr(j.error); else { setRows(j.data as Row[]); setSummary(j.summary as Summary); }
    } catch { setErr("คำนวณไม่ได้"); }
    finally { setLoading(false); }
  }

  const shown = rows ? (onlyDiff ? rows.filter((r) => r.status === "ต่าง") : rows) : [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800">🧮 คำนวณเงินเดือน (พรีวิว/เทียบ)</h1>
      <p className="text-sm text-slate-500 mb-4">รันเครื่องคำนวณเต็มจากข้อมูลดิบ (เวลา/ลา/OT/ปรับยอด/ค่าประจำ) แล้วเทียบกับยอดเดิม — <b>ยังไม่เขียนข้อมูลจริง</b></p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1">เลือกงวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[260px]">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
        </div>
        <button onClick={run} disabled={loading || !periodId}
          className="h-10 px-5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "กำลังคำนวณ..." : "▶ คำนวณ + เทียบ"}
        </button>
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}

      {summary && (
        <>
          <div className="flex flex-wrap gap-3 mb-3">
            <Card label="พนักงาน" value={summary.total} cls="bg-slate-50 text-slate-700 border-slate-200" />
            <Card label="✅ ตรงของเดิม" value={summary.match} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
            <Card label="❌ ต่าง" value={summary.diff} cls={summary.diff ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-400 border-slate-200"} />
            <Card label="🆕 ใหม่" value={summary.fresh} cls="bg-blue-50 text-blue-700 border-blue-200" />
          </div>
          {summary.diff === 0 && summary.total > 0 && (
            <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3 inline-block">
              🎉 คำนวณใหม่ตรงกับของเดิมทุกคน — เครื่องคำนวณพร้อมใช้
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> แสดงเฉพาะที่ต่าง
          </label>
        </>
      )}

      {rows && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">พนักงาน</th>
                <th className="text-right px-3 py-2">รายได้ (ใหม่)</th>
                <th className="text-right px-3 py-2">สุทธิ (ใหม่)</th>
                <th className="text-right px-3 py-2">สุทธิ (เดิม)</th>
                <th className="text-right px-3 py-2">ส่วนต่าง</th>
                <th className="text-center px-3 py-2">ผล</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{r.employee_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(r.gross_new)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(r.net_new)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{baht(r.net_old)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.diff_net ? "text-red-600 font-semibold" : "text-slate-300"}`}>{r.diff_net ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === "ตรง" ? "bg-emerald-100 text-emerald-700" : r.status === "ต่าง" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400 text-sm">— ไม่มีรายการ —</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-4">หมายเหตุ: หน้านี้คำนวณเพื่อ <b>เทียบ/พรีวิว</b> เท่านั้น ยังไม่เขียน payroll_lines จริง — เมื่อยอดตรงครบ ค่อยทำปุ่ม "บันทึกผลคำนวณ" ในขั้นถัดไป</p>
    </div>
  );
}

function Card({ label, value, cls }: { label: string; value: React.ReactNode; cls: string }) {
  return <div className={`rounded-xl border px-5 py-3 ${cls}`}><div className="text-2xl font-bold tabular-nums">{value}</div><div className="text-xs opacity-80">{label}</div></div>;
}

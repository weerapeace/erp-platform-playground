"use client";

/**
 * Payroll module — คำนวณงวด (พรีวิว/เทียบ) Phase 3 — อ่านอย่างเดียว
 * เลือกงวด → รันเครื่องคำนวณเต็มจาก raw input → เทียบกับ payroll_lines เดิม (ยังไม่เขียนจริง)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Period = { id: string; period_name: string; status: string };
type Row = { id: string; employee_name: string; gross_new: number; gross_old: number | null; net_new: number; net_old: number | null; diff_net: number | null; status: string; ok: boolean };
type ColumnDiff = { column: string; count: number };
type Summary = { total: number; match: number; diff: number; fresh: number; columnDiffs: ColumnDiff[] };

// แปลชื่อคอลัมน์เป็นไทยสำหรับหน้าผลเทียบ
const COL_TH: Record<string, string> = {
  base_salary: "เงินเดือนฐาน", daily_wage_amount: "ค่าจ้างรายวัน", hourly_wage_amount: "ค่าจ้างรายชม.",
  piece_rate_amount: "ค่าจ้างรายชิ้น", overtime_amount: "OT", allowance_amount: "เงินเพิ่ม",
  bonus_amount: "โบนัส", commission_amount: "คอมมิชชั่น", late_deduction: "หักมาสาย",
  absence_deduction: "หักขาดงาน", unpaid_leave_deduction: "หักลาไม่รับเงิน", advance_deduction: "หักเบิกล่วงหน้า",
  damage_deduction: "หักค่าเสียหาย", social_security_employee: "ประกันสังคม(ลูกจ้าง)",
  social_security_employer: "ประกันสังคม(นายจ้าง)", withholding_tax: "ภาษีหัก ณ ที่จ่าย",
  other_deduction: "หักอื่นๆ", mid_month_paid: "จ่ายกลางเดือน", gross_pay: "รายได้รวm",
  total_deduction: "หักรวม", net_pay: "สุทธิ", recurring_earning_amount: "ค่าประจำ(เพิ่ม)",
  recurring_deduction_amount: "ค่าประจำ(หัก)", remaining_to_pay: "คงเหลือจ่าย",
  attendance_days: "วันทำงาน", attendance_hours: "ชม.ทำงาน", company_cost_total: "ต้นทุนบริษัท",
};

const baht = (v: unknown) => v == null ? "—" : `฿${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

export default function PayrollCalcRunPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  // Phase 3 — บันทึกจริง
  const [editable, setEditable] = useState(false);
  const [allMatch, setAllMatch] = useState(false);
  const [colsCompared, setColsCompared] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json())
      .then((j) => { const ps = (j.data ?? []) as Period[]; setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id); }).catch(() => {});
  }, []);

  async function run() {
    if (!periodId) return;
    setLoading(true); setErr(null); setRows(null); setSummary(null); setSaveMsg(null);
    try {
      const j = await apiFetch(`/api/payroll/calc-run?period_id=${encodeURIComponent(periodId)}`).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        setRows(j.data as Row[]); setSummary(j.summary as Summary);
        setEditable(!!j.editable); setAllMatch(!!j.all_columns_match); setColsCompared(Number(j.columns_compared ?? 0));
      }
    } catch { setErr("คำนวณไม่ได้"); }
    finally { setLoading(false); }
  }

  async function save() {
    if (!periodId) return;
    const period = periods.find((p) => p.id === periodId);
    if (!confirm(`ยืนยันบันทึกผลคำนวณงวด "${period?.period_name ?? ""}" ลงระบบ?\n\nระบบจะสร้าง "รอบคำนวณใหม่" (ไม่ลบของเดิม) — ทำได้เฉพาะงวดที่ยังไม่ล็อก`)) return;
    setSaving(true); setErr(null); setSaveMsg(null);
    try {
      const j = await apiFetch("/api/payroll/calc-save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        setSaveMsg(`✅ บันทึกสำเร็จ — รอบคำนวณที่ ${j.data.run_no}, ${j.data.line_count} บรรทัด`);
        await run();   // คำนวณ+เทียบใหม่ (ตอนนี้จะตรงกับที่เพิ่งบันทึก)
      }
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
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
          {/* ผลเทียบทีละคอลัมน์ */}
          {summary.columnDiffs && summary.columnDiffs.length > 0 ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm mb-3">
              <div className="font-medium text-red-700 mb-1">⚠️ มีคอลัมน์ที่ยังไม่ตรงของเดิม (เทียบ {colsCompared} คอลัมน์):</div>
              <div className="flex flex-wrap gap-2">
                {summary.columnDiffs.map((c) => (
                  <span key={c.column} className="px-2 py-0.5 rounded-full bg-white border border-red-200 text-red-700 text-xs">
                    {COL_TH[c.column] ?? c.column}: ต่าง {c.count} คน
                  </span>
                ))}
              </div>
            </div>
          ) : allMatch ? (
            <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3 inline-block">
              🎉 คำนวณใหม่ตรงกับของเดิม <b>ครบทุกช่อง</b> ({colsCompared} คอลัมน์, {summary.match} คน) — เครื่องคำนวณพร้อมบันทึก
            </div>
          ) : summary.total > 0 ? (
            <div className="rounded-lg bg-blue-50 text-blue-700 px-4 py-2 text-sm mb-3 inline-block">
              🆕 งวดนี้ยังไม่มีของเดิมให้เทียบ ({summary.fresh} คนใหม่) — ตรวจยอดด้วยตาก่อนบันทึกได้
            </div>
          ) : null}

          {/* ปุ่มบันทึกจริง — ปลอดภัย: เปิดเฉพาะงวดแก้ได้ และยอดตรงครบ (หรือเป็นงวดใหม่ทั้งหมด) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <b>บันทึกผลคำนวณลงระบบ</b> — สร้างรอบคำนวณใหม่ ไม่ลบของเดิม
                {!editable && <span className="text-red-600"> · งวดนี้ถูกล็อก/จ่ายแล้ว บันทึกไม่ได้</span>}
                {editable && summary.diff > 0 && <span className="text-amber-600"> · ยังมีช่องไม่ตรง — แก้ให้ตรงก่อนค่อยบันทึก</span>}
              </div>
              <button onClick={save} disabled={saving || !editable || summary.diff > 0 || summary.total === 0}
                className="h-10 px-5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? "กำลังบันทึก..." : "💾 บันทึกผลคำนวณ"}
              </button>
            </div>
          </div>
          {saveMsg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3">{saveMsg}</div>}

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
      <p className="text-xs text-slate-400 mt-4">หมายเหตุ: กด <b>คำนวณ + เทียบ</b> เพื่อตรวจยอดทุกช่องกับของเดิมก่อน เมื่อตรงครบ (หรือเป็นงวดใหม่) ปุ่ม <b>บันทึกผลคำนวณ</b> จะเปิดให้เขียนลงระบบ — สร้างรอบคำนวณใหม่ ไม่ลบของเดิม และบันทึกได้เฉพาะงวดที่ยังไม่ล็อก/จ่าย</p>
    </div>
  );
}

function Card({ label, value, cls }: { label: string; value: React.ReactNode; cls: string }) {
  return <div className={`rounded-xl border px-5 py-3 ${cls}`}><div className="text-2xl font-bold tabular-nums">{value}</div><div className="text-xs opacity-80">{label}</div></div>;
}

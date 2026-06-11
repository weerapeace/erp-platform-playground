"use client";

/**
 * Payroll module — คำนวณงวด (พรีวิว/เทียบ) Phase 3 — อ่านอย่างเดียว
 * เลือกงวด → รันเครื่องคำนวณเต็มจาก raw input → เทียบกับ payroll_lines เดิม (ยังไม่เขียนจริง)
 */
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { shouldAutoRunPayrollCalc } from "@/lib/payroll-flow";
import { PeriodHolidaysPanel } from "@/components/payroll/period-holidays-panel";
import { usePayrollPeriod } from "@/components/payroll/payroll-period-context";

type Row = { id: string; employee_name: string; gross_new: number; gross_old: number | null; net_new: number; net_old: number | null; diff_net: number | null; status: string; ok: boolean };
type ColumnDiff = { column: string; count: number };
type Summary = { total: number; match: number; diff: number; fresh: number; columnDiffs: ColumnDiff[] };
type ValidationIssue = {
  level: "error" | "warning";
  code: string;
  title: string;
  detail: string;
  count?: number;
  fix?: { label: string; href: string };
};
type Validation = {
  ready: boolean;
  summary: { errors: number; warnings: number; active_employees: number; active_contracts: number; recurring_items: number };
  issues: ValidationIssue[];
};

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
  attendance_days: "วันจ่ายจริง", attendance_hours: "ชม.จ่ายจริง", company_cost_total: "ต้นทุนบริษัท",
};

const baht = (v: unknown) => v == null ? "—" : `฿${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

// สถานะงวด — ชื่อไทย + สี + เส้นทางที่อนุญาต (ตรงกับ API period-status)
const STATUS_TH: Record<string, string> = {
  draft: "ร่าง", calculating: "กำลังคำนวณ", review: "รอตรวจ", approved: "อนุมัติแล้ว",
  locked: "ล็อกแล้ว", synced_to_odoo: "ซิงก์ Odoo", paid: "จ่ายแล้ว", cancelled: "ยกเลิก",
};
const STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", review: "bg-amber-100 text-amber-700", approved: "bg-blue-100 text-blue-700",
  locked: "bg-purple-100 text-purple-700", paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-700",
};
const TRANSITIONS: Record<string, string[]> = {
  draft: ["review", "cancelled"], review: ["approved", "draft", "cancelled"],
  approved: ["locked", "review", "cancelled"], locked: ["paid", "approved"], paid: [], cancelled: ["draft"],
};
// ป้ายปุ่มตามปลายทาง + บริบท (from→to)
const BTN_LABEL = (from: string, to: string): { label: string; cls: string } => {
  if (to === "review") return from === "draft" ? { label: "📤 ส่งตรวจ", cls: "bg-amber-600 hover:bg-amber-700" } : { label: "↩ ถอยเป็นรอตรวจ", cls: "bg-slate-500 hover:bg-slate-600" };
  if (to === "approved") return from === "locked" ? { label: "🔓 ปลดล็อก", cls: "bg-slate-500 hover:bg-slate-600" } : { label: "✔ อนุมัติ", cls: "bg-blue-600 hover:bg-blue-700" };
  if (to === "locked") return { label: "🔒 ล็อกงวด", cls: "bg-purple-600 hover:bg-purple-700" };
  if (to === "paid") return { label: "💵 จ่ายแล้ว", cls: "bg-emerald-600 hover:bg-emerald-700" };
  if (to === "draft") return { label: "↩ ตีกลับเป็นร่าง", cls: "bg-slate-500 hover:bg-slate-600" };
  if (to === "cancelled") return { label: "✕ ยกเลิกงวด", cls: "bg-red-600 hover:bg-red-700" };
  return { label: to, cls: "bg-slate-500" };
};

export default function PayrollCalcRunPage() {
  const { periods, periodId, selectedPeriod: curPeriod, setPeriodId, refreshPeriods } = usePayrollPeriod();
  const autoRunDoneRef = useRef(false);
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
  const [progress, setProgress] = useState<string | null>(null);   // Phase 2 — สถานะคำนวณเบื้องหลัง
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);

  const loadValidation = useCallback(async (pid: string) => {
    if (!pid) { setValidation(null); return null; }
    setValidationLoading(true);
    try {
      const j = await apiFetch(`/api/payroll/validation?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) { setValidation(null); return null; }
      setValidation(j.data as Validation);
      return j.data as Validation;
    } catch {
      setValidation(null);
      return null;
    } finally {
      setValidationLoading(false);
    }
  }, []);

  useEffect(() => { if (periodId) void loadValidation(periodId); }, [periodId, loadValidation]);

  async function changeStatus(toStatus: string) {
    if (!periodId || !curPeriod) return;
    if (!confirm(`เปลี่ยนสถานะงวด "${curPeriod.period_name}"\nจาก "${STATUS_TH[curPeriod.status] ?? curPeriod.status}" → "${STATUS_TH[toStatus] ?? toStatus}" ?`)) return;
    setErr(null); setSaveMsg(null);
    try {
      const j = await apiFetch("/api/payroll/period-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, to_status: toStatus }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else { setSaveMsg(`✅ เปลี่ยนสถานะงวดเป็น "${STATUS_TH[toStatus] ?? toStatus}" แล้ว`); await refreshPeriods(); await run(); }
    } catch { setErr("เปลี่ยนสถานะไม่สำเร็จ"); }
  }

  // Phase 2 — คำนวณแบบเบื้องหลัง: สร้าง job → poll สถานะ → แสดงผลเมื่อเสร็จ (ไม่บล็อกหน้าจอ/ไม่ timeout)
  async function run(options?: { keepSaveMsg?: boolean }) {
    if (!periodId) return;
    const v = await loadValidation(periodId);
    if (v && !v.ready) { setErr("งวดยังไม่พร้อมคำนวณ กรุณาแก้รายการ error ในกล่องตรวจความพร้อมก่อน"); return; }
    setLoading(true); setErr(null); setRows(null); setSummary(null);
    if (!options?.keepSaveMsg) setSaveMsg(null);
    setProgress("กำลังส่งงานคำนวณ…");
    try {
      const enq = await apiFetch("/api/payroll/calc-enqueue", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period_id: periodId }),
      }).then((r) => r.json());
      if (enq.validation) setValidation(enq.validation as Validation);
      if (enq.error || !enq.job_id) { setErr(enq.error ?? "สร้างงานไม่สำเร็จ"); setProgress(null); setLoading(false); return; }
      const jobId = enq.job_id as string;
      setProgress("กำลังคำนวณเบื้องหลัง… (อาจใช้เวลาสักครู่)");
      const started = Date.now();
      while (Date.now() - started < 5 * 60 * 1000) {   // กันค้างเกิน 5 นาที
        await new Promise((res) => setTimeout(res, 1500));
        const job = await apiFetch(`/api/jobs/${jobId}`).then((r) => r.json()).then((j) => j.data).catch(() => null);
        if (!job) continue;
        if (job.status === "done") {
          const res = (job.result ?? {}) as { data?: Row[]; summary?: Summary; editable?: boolean; all_columns_match?: boolean; columns_compared?: number };
          setRows((res.data ?? []) as Row[]); setSummary((res.summary ?? null) as Summary | null);
          setEditable(!!res.editable); setAllMatch(!!res.all_columns_match); setColsCompared(Number(res.columns_compared ?? 0));
          setProgress(null); setLoading(false); return;
        }
        if (job.status === "error") { setErr(job.error ?? "คำนวณไม่สำเร็จ"); setProgress(null); setLoading(false); return; }
        if (job.progress_total > 0) setProgress(`กำลังคำนวณ… ${job.progress_done}/${job.progress_total} คน`);
      }
      setErr("คำนวณนานเกินไป — ลองใหม่"); setProgress(null); setLoading(false);
    } catch { setErr("คำนวณไม่ได้"); setProgress(null); setLoading(false); }
  }

  async function save() {
    if (!periodId) return;
    const v = await loadValidation(periodId);
    if (v && !v.ready) { setErr("งวดยังไม่พร้อมบันทึกผลคำนวณ กรุณาแก้รายการ error ในกล่องตรวจความพร้อมก่อน"); return; }
    const period = periods.find((p) => p.id === periodId);
    if (!confirm(`ยืนยันบันทึกผลคำนวณงวด "${period?.period_name ?? ""}" ลงระบบ?\n\nระบบจะสร้าง "รอบคำนวณใหม่" (ไม่ลบของเดิม) — ทำได้เฉพาะงวดที่ยังไม่ล็อก`)) return;
    setSaving(true); setErr(null); setSaveMsg(null);
    try {
      const j = await apiFetch("/api/payroll/calc-save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId }),
      }).then((r) => r.json());
      if (j.validation) setValidation(j.validation as Validation);
      if (j.error) setErr(j.error);
      else {
        setSaveMsg(`✅ บันทึกสำเร็จ — รอบคำนวณที่ ${j.data.run_no}, ${j.data.line_count} บรรทัด`);
        await run({ keepSaveMsg: true });   // คำนวณ+เทียบใหม่ (ตอนนี้จะตรงกับที่เพิ่งบันทึก)
      }
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  const shown = rows ? (onlyDiff ? rows.filter((r) => r.status === "ต่าง") : rows) : [];

  useEffect(() => {
    if (autoRunDoneRef.current || !periodId || typeof window === "undefined") return;
    if (!shouldAutoRunPayrollCalc(window.location.search)) return;
    autoRunDoneRef.current = true;
    void run();
  }, [periodId]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800">🧮 คำนวณงวด</h1>
      <p className="text-sm text-slate-500 mb-4">รันเครื่องคำนวณเต็มจากข้อมูลดิบ (เวลา/ลา/OT/ปรับยอด/ค่าประจำ) แล้วแสดงรายการให้ตรวจ ก่อนกดบันทึกผลคำนวณจริง</p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1">เลือกงวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[260px]">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
        </div>
        <button onClick={() => void run()} disabled={loading || !periodId || validationLoading || validation?.ready === false}
          className="h-10 px-5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "กำลังคำนวณ..." : "▶ คำนวณ + เทียบ"}
        </button>
        {progress && (
          <span className="flex items-center gap-2 text-sm text-blue-700">
            <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {progress}
          </span>
        )}
      </div>

      <ValidationPanel validation={validation} loading={validationLoading} />

      {/* สถานะงวด + เปลี่ยนสถานะ (workflow) */}
      {curPeriod && (
        <div className="flex flex-wrap items-center gap-2 mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span className="text-sm text-slate-500">สถานะงวด:</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[curPeriod.status] ?? "bg-slate-100 text-slate-600"}`}>
            {STATUS_TH[curPeriod.status] ?? curPeriod.status}
          </span>
          <span className="text-slate-300 mx-1">→</span>
          {(TRANSITIONS[curPeriod.status] ?? []).length === 0 ? (
            <span className="text-xs text-slate-400">สิ้นสุดเส้นทางแล้ว</span>
          ) : (
            (TRANSITIONS[curPeriod.status] ?? []).map((to) => {
              const b = BTN_LABEL(curPeriod.status, to);
              return (
                <button key={to} onClick={() => changeStatus(to)}
                  className={`h-8 px-3 text-white rounded-lg text-xs font-medium ${b.cls}`}>{b.label}</button>
              );
            })
          )}
        </div>
      )}

      {curPeriod && <PeriodHolidaysPanel periodId={periodId} editable={["draft", "review"].includes(curPeriod.status)} onChanged={run} />}

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}

      {!rows && !loading && !progress && !err && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-800 mb-4">
          <div className="font-semibold">ยังไม่ได้คำนวณงวดนี้ในหน้านี้</div>
          <div className="mt-1 text-blue-700">กด “คำนวณ + เทียบ” เพื่อให้ระบบสร้างรายการพนักงานออกมาให้ตรวจ ก่อนกดบันทึกผลคำนวณ</div>
        </div>
      )}

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
          {saveMsg && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3">
              <span>{saveMsg}</span>
              <Link href={`/payroll/review?period_id=${encodeURIComponent(periodId)}`} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                ไปตรวจยอดเงินเดือน
              </Link>
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
      <p className="text-xs text-slate-400 mt-4">หมายเหตุ: กด <b>คำนวณ + เทียบ</b> เพื่อตรวจยอดทุกช่องกับของเดิมก่อน เมื่อตรงครบ (หรือเป็นงวดใหม่) ปุ่ม <b>บันทึกผลคำนวณ</b> จะเปิดให้เขียนลงระบบ — สร้างรอบคำนวณใหม่ ไม่ลบของเดิม และบันทึกได้เฉพาะงวดที่ยังไม่ล็อก/จ่าย</p>
    </div>
  );
}

function ValidationPanel({ validation, loading }: { validation: Validation | null; loading: boolean }) {
  if (loading) return <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 mb-5">กำลังตรวจความพร้อมงวด...</div>;
  if (!validation) return null;
  const errors = validation.issues.filter((i) => i.level === "error");
  const warnings = validation.issues.filter((i) => i.level === "warning");
  return (
    <div className={`rounded-xl border px-4 py-3 mb-5 ${errors.length ? "border-red-200 bg-red-50" : warnings.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={`text-sm font-semibold ${errors.length ? "text-red-800" : warnings.length ? "text-amber-800" : "text-emerald-800"}`}>
            {errors.length ? "ยังไม่พร้อมคำนวณ" : warnings.length ? "พร้อมคำนวณ แต่มีคำเตือน" : "พร้อมคำนวณ"}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            พนักงาน active {validation.summary.active_employees} คน · สัญญาที่ใช้คำนวณ {validation.summary.active_contracts} รายการ · เงินประจำ {validation.summary.recurring_items} รายการ
          </div>
        </div>
        <div className="text-xs font-medium">
          <span className="text-red-700">{validation.summary.errors} error</span>
          <span className="text-slate-300 mx-2">·</span>
          <span className="text-amber-700">{validation.summary.warnings} warning</span>
        </div>
      </div>
      {validation.issues.length > 0 && (
        <div className="mt-3 grid gap-2">
          {validation.issues.slice(0, 8).map((it) => (
            <div key={it.code} className="rounded-lg bg-white/70 border border-white px-3 py-2">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${it.level === "error" ? "text-red-700" : "text-amber-700"}`}>
                    {it.level === "error" ? "ต้องแก้" : "ควรดู"}: {it.title}{it.count != null ? ` (${it.count})` : ""}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{it.detail}</div>
                </div>
                {it.fix && (
                  <a
                    href={it.fix.href}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      it.level === "error"
                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    {it.fix.label}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, cls }: { label: string; value: React.ReactNode; cls: string }) {
  return <div className={`rounded-xl border px-5 py-3 ${cls}`}><div className="text-2xl font-bold tabular-nums">{value}</div><div className="text-xs opacity-80">{label}</div></div>;
}

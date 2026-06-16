"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { usePayrollPeriod } from "@/components/payroll/payroll-period-context";
import { apiFetch } from "@/lib/api";
import { paymentLineGroup, type PaymentLineGroup } from "@/lib/payroll-payments";

type Batch = {
  id: string;
  batch_no: string;
  batch_type: string;
  payment_date: string | null;
  status: string;
  note: string | null;
  period_name: string;
  line_count: number;
  paid_count: number;
  paid_amount: number;
  latest_calc_run_no?: number | null;
  latest_calc_line_count?: number;
  latest_calc_net_pay?: number;
};

type BatchLine = {
  id?: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  identity_no?: string;
  bank_name: string;
  bank_account_name?: string;
  bank_account_no: string;
  contract_type?: string | null;
  wage_type?: string | null;
  payslip_no?: string;
  base_salary?: number | null;
  mid_month_paid?: number | null;
  month_end_pay?: number | null;
  transfer_net_pay?: number | null;
  overtime_amount?: number | null;
  cash_pay?: number | null;
  social_security?: number | null;
  balance?: number | null;
  net_before_rounding?: number | null;
  rounding_adjustment?: number | null;
  paid_amount: number;
  status?: string;
  selected?: boolean;
  line_note?: string | null;
  source?: string;
  previous_paid_amount?: number | null;
  delta_amount?: number | null;
  compare_status?: "same" | "changed" | "new" | "missing_this_month";
  persist_default?: boolean;
  suggested_amount?: number;
  default_paid_amount?: number | null;
};

type Detail = { batch: Batch; lines: BatchLine[] };
type Preview = { batch_type: string; existing_count?: number; lines: BatchLine[]; candidates?: BatchLine[]; totals: { line_count: number; paid_amount: number } };
type PaymentReportColumn = "employee" | "bank" | "account_name" | "account_no" | "amount" | "status";

const BATCH_TYPE: Record<string, string> = { month_end: "สิ้นเดือน", mid_month: "กลางเดือน", special: "พิเศษ", bank: "โอนธนาคาร", cash: "เงินสด" };
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-slate-100 text-slate-600" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-blue-100 text-blue-700" },
  paid: { label: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "ยกเลิก", cls: "bg-red-100 text-red-700" },
};
const COMPARE_STATUS: Record<string, { label: string; cls: string }> = {
  same: { label: "เหมือนเดือนก่อน", cls: "bg-emerald-50 text-emerald-700" },
  changed: { label: "ยอดเปลี่ยน", cls: "bg-amber-50 text-amber-700" },
  new: { label: "คนใหม่", cls: "bg-blue-50 text-blue-700" },
  missing_this_month: { label: "เดือนก่อนมี", cls: "bg-red-50 text-red-700" },
};

const today = () => new Date().toISOString().slice(0, 10);
const baht = (value: unknown) => `฿${(Number(value) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dashBaht = (value: unknown) => Math.abs(Number(value) || 0) > 0.004 ? baht(value) : "-";
const signedBaht = (value: unknown) => {
  const amount = Number(value) || 0;
  if (Math.abs(amount) < 0.004) return baht(0);
  return `${amount > 0 ? "+" : "-"}${baht(Math.abs(amount))}`;
};
const badge = (status: string) => {
  const meta = STATUS[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>;
};
const compareBadge = (status?: string | null) => {
  if (!status) return <span className="text-xs text-slate-400">-</span>;
  const meta = COMPARE_STATUS[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>;
};
const compareAmounts = (currentAmount: unknown, previousAmount: unknown): Pick<BatchLine, "previous_paid_amount" | "delta_amount" | "compare_status"> => {
  const hasPrevious = previousAmount !== null && previousAmount !== undefined && previousAmount !== "";
  const current = Math.round((Number(currentAmount) || 0) * 100) / 100;
  if (!hasPrevious) return { previous_paid_amount: null, delta_amount: null, compare_status: "new" };
  const previous = Math.round((Number(previousAmount) || 0) * 100) / 100;
  const delta = Math.round((current - previous) * 100) / 100;
  if (current <= 0 && previous > 0) return { previous_paid_amount: previous, delta_amount: delta, compare_status: "missing_this_month" };
  return { previous_paid_amount: previous, delta_amount: delta, compare_status: Math.abs(delta) < 0.005 ? "same" : "changed" };
};
const defaultPaidAmount = (line: BatchLine): number => Number(line.default_paid_amount ?? 0) || 0;
const paymentLineAmount = (line: BatchLine): number => Number(line.paid_amount) || 0;
const paymentTabLabel: Record<PaymentLineGroup, string> = {
  regular: "พนักงานประจำ",
  other: "ประจำนอกระบบ / รายวัน / ช่างเหมา",
};
const paymentReportColumns: Array<{ key: PaymentReportColumn; label: string }> = [
  { key: "employee", label: "พนักงาน" },
  { key: "bank", label: "ธนาคาร" },
  { key: "account_name", label: "ชื่อบัญชี" },
  { key: "account_no", label: "เลขที่บัญชี" },
  { key: "amount", label: "ยอดจ่าย" },
  { key: "status", label: "สถานะ" },
];

export default function PayrollPaymentsPage() {
  const { periods, periodId, selectedPeriod, setPeriodId, refreshPeriods } = usePayrollPeriod();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [paymentTab, setPaymentTab] = useState<PaymentLineGroup>("regular");
  const [hideZeroPaymentLines, setHideZeroPaymentLines] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [paymentReportVisibleColumns, setPaymentReportVisibleColumns] = useState<Record<PaymentReportColumn, boolean>>({
    employee: true,
    bank: true,
    account_name: true,
    account_no: true,
    amount: true,
    status: true,
  });
  const [copiedAccountNos, setCopiedAccountNos] = useState<Set<string>>(() => new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [batchType, setBatchType] = useState<"month_end" | "mid_month" | "special">("month_end");
  const [paymentDate, setPaymentDate] = useState(today());
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createLines, setCreateLines] = useState<BatchLine[]>([]);
  const [createSearch, setCreateSearch] = useState("");
  const [createFilter, setCreateFilter] = useState<"all" | "selected" | "changed" | "missing_bank" | "missing_this_month">("all");
  const [createSort, setCreateSort] = useState<"code" | "name" | "bank" | "amount" | "previous" | "delta">("code");
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addAmount, setAddAmount] = useState(0);
  const [addMode, setAddMode] = useState<"temporary" | "default">("temporary");

  const loadBatches = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    setErr(null);
    try {
      const json = await apiFetch(`/api/payroll/payment-batches?period_id=${encodeURIComponent(pid)}`).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      const rows = (json.data ?? []) as Batch[];
      setBatches(rows);
      setSelectedBatchId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
      if (!rows.length) setDetail(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดรอบจ่ายไม่สำเร็จ");
      setBatches([]);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    setDetailLoading(true);
    setErr(null);
    try {
      const json = await apiFetch(`/api/payroll/payment-batches/${encodeURIComponent(id)}`).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setDetail(json.data as Detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดรายละเอียดรอบจ่ายไม่สำเร็จ");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    if (!periodId || !createOpen) return;
    setPreviewLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ period_id: periodId, batch_type: batchType, preview: "1" });
      const json = await apiFetch(`/api/payroll/payment-batches?${qs.toString()}`).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      const data = json.data as Preview;
      setPreview(data);
      setCreateLines((data.lines ?? []).map((line) => {
        const fallbackDefault = line.source === "settings" ? Number(line.paid_amount) || 0 : 0;
        const defaultAmount = Number(line.default_paid_amount ?? fallbackDefault) || 0;
        return { ...line, selected: line.selected !== false, default_paid_amount: defaultAmount > 0 ? defaultAmount : line.default_paid_amount };
      }));
    } catch (e) {
      setPreview(null);
      setCreateLines([]);
      setErr(e instanceof Error ? e.message : "โหลด preview รอบจ่ายไม่สำเร็จ");
    } finally {
      setPreviewLoading(false);
    }
  }, [batchType, createOpen, periodId]);

  useEffect(() => { if (periodId) void loadBatches(periodId); }, [periodId, loadBatches]);
  useEffect(() => { if (selectedBatchId) void loadDetail(selectedBatchId); }, [selectedBatchId, loadDetail]);
  useEffect(() => { void loadPreview(); }, [loadPreview]);
  useEffect(() => { setCopiedAccountNos(new Set()); }, [detail?.batch.id]);

  const summary = useMemo(() => {
    const total = batches.reduce((sum, batch) => sum + (Number(batch.paid_amount) || 0), 0);
    return {
      count: batches.length,
      draft: batches.filter((batch) => batch.status === "draft").length,
      approved: batches.filter((batch) => batch.status === "approved").length,
      paid: batches.filter((batch) => batch.status === "paid").length,
      total,
    };
  }, [batches]);

  const selectedCreateLines = createLines.filter((line) => line.selected !== false);
  const selectedCreateTotal = selectedCreateLines.reduce((sum, line) => sum + (Number(line.paid_amount) || 0), 0);
  const candidateOptions = useMemo(() => {
    const existing = new Set(createLines.map((line) => line.employee_id));
    return (preview?.candidates ?? [])
      .filter((line) => line.employee_id && !existing.has(line.employee_id))
      .sort((a, b) => `${a.employee_code} ${a.employee_name}`.localeCompare(`${b.employee_code} ${b.employee_name}`, "th"));
  }, [createLines, preview?.candidates]);
  const selectedCandidate = candidateOptions.find((line) => line.employee_id === addEmployeeId) ?? null;
  const visibleCreateLines = useMemo(() => {
    const q = createSearch.trim().toLowerCase();
    const rows = createLines.filter((line) => {
      if (q) {
        const haystack = [line.employee_code, line.employee_name, line.identity_no, line.bank_name, line.bank_account_no, line.payslip_no].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (createFilter === "selected" && line.selected === false) return false;
      if (createFilter === "changed" && ["same", "missing_this_month"].includes(String(line.compare_status ?? ""))) return false;
      if (createFilter === "missing_bank" && line.bank_account_no) return false;
      if (createFilter === "missing_this_month" && line.compare_status !== "missing_this_month") return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (createSort === "name") return String(a.employee_name ?? "").localeCompare(String(b.employee_name ?? ""), "th");
      if (createSort === "bank") return String(a.bank_name ?? "").localeCompare(String(b.bank_name ?? ""), "th");
      if (createSort === "amount") return (Number(b.paid_amount) || 0) - (Number(a.paid_amount) || 0);
      if (createSort === "previous") return (Number(b.previous_paid_amount) || 0) - (Number(a.previous_paid_amount) || 0);
      if (createSort === "delta") return Math.abs(Number(b.delta_amount) || 0) - Math.abs(Number(a.delta_amount) || 0);
      return String(a.employee_code ?? "").localeCompare(String(b.employee_code ?? ""), "th");
    });
  }, [createFilter, createLines, createSearch, createSort]);

  function openCreate(type: "month_end" | "mid_month" = "month_end") {
    setBatchType(type);
    setPaymentDate(String((selectedPeriod as Record<string, unknown> | null)?.payment_date ?? today()));
    setNote("");
    setPreview(null);
    setCreateLines([]);
    setCreateSearch("");
    setCreateFilter("all");
    setCreateSort("code");
    setAddEmployeeId("");
    setAddAmount(0);
    setAddMode("temporary");
    setCreateOpen(true);
    setMsg(null);
    setErr(null);
  }

  function updateCreateLine(employeeId: string, patch: Partial<BatchLine>) {
    setCreateLines((rows) => rows.map((row) => row.employee_id === employeeId ? { ...row, ...patch } : row));
  }

  function setVisibleCreateLinesSelected(selected: boolean) {
    const visibleIds = new Set(visibleCreateLines.map((line) => line.employee_id));
    setCreateLines((rows) => rows.map((row) => visibleIds.has(row.employee_id) ? { ...row, selected } : row));
  }

  function usePreviousAmounts() {
    setCreateLines((rows) => rows.map((row) => {
      if (row.previous_paid_amount == null || Number(row.previous_paid_amount) <= 0) return row;
      const amount = Number(row.previous_paid_amount) || 0;
      return { ...row, paid_amount: amount, selected: true, ...compareAmounts(amount, row.previous_paid_amount) };
    }));
  }

  function clearZeroAmounts() {
    setCreateLines((rows) => rows.map((row) => (Number(row.paid_amount) || 0) <= 0 ? { ...row, selected: false } : row));
  }

  function addEmployeeToCreateLines() {
    if (!selectedCandidate) return;
    const amount = Number(addAmount) > 0 ? Number(addAmount) : Number(selectedCandidate.suggested_amount ?? selectedCandidate.previous_paid_amount ?? 0) || 0;
    const noteText = addMode === "default" ? "เพิ่มเป็นค่าเริ่มต้นกลางเดือน" : "เพิ่มชั่วคราวเฉพาะรอบนี้";
    setCreateLines((rows) => [
      ...rows,
      {
        ...selectedCandidate,
        paid_amount: amount,
        selected: true,
        persist_default: addMode === "default",
        source: addMode === "default" ? "manual_default" : "manual_temporary",
        line_note: noteText,
        ...compareAmounts(amount, selectedCandidate.previous_paid_amount),
      },
    ]);
    setAddEmployeeId("");
    setAddAmount(0);
    setAddMode("temporary");
  }

  async function createBatch() {
    if (!periodId) return;
    setBusy("create");
    setErr(null);
    setMsg(null);
    try {
      const lines = createLines.map((line) => ({
        employee_id: line.employee_id,
        paid_amount: line.paid_amount,
        selected: line.selected !== false,
        note: line.line_note ?? null,
        persist_default: line.persist_default === true,
      }));
      const json = await apiFetch("/api/payroll/payment-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, batch_type: batchType, payment_date: paymentDate, note, lines }),
      }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setMsg(`สร้างรอบจ่ายสำเร็จ ${json.data.line_count} รายการ ยอดรวม ${baht(json.data.paid_amount)}`);
      setCreateOpen(false);
      await loadBatches(periodId);
      if (json.data.batch?.id) setSelectedBatchId(json.data.batch.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างรอบจ่ายไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function batchAction(action: "approve" | "cancel" | "mark-paid") {
    if (!detail) return;
    const textMap = { approve: "อนุมัติรอบจ่ายนี้?", cancel: "ยกเลิกรอบจ่ายนี้?", "mark-paid": "ยืนยันว่าจ่ายรอบนี้แล้ว?" };
    if (!confirm(textMap[action])) return;
    setBusy(action);
    setErr(null);
    setMsg(null);
    try {
      const endpoint = action === "mark-paid" ? "mark-paid" : action;
      const json = await apiFetch(`/api/payroll/payment-batches/${encodeURIComponent(detail.batch.id)}/${endpoint}`, { method: "POST" }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setMsg(action === "approve" ? "อนุมัติรอบจ่ายแล้ว" : action === "cancel" ? "ยกเลิกรอบจ่ายแล้ว" : "บันทึกว่าจ่ายแล้ว");
      await Promise.all([loadBatches(periodId), loadDetail(detail.batch.id), refreshPeriods()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function deleteBatch() {
    if (!detail) return;
    if (!confirm(`ลบรอบจ่าย "${detail.batch.batch_no}" ถาวร? (ลบได้เฉพาะรอบที่ยกเลิกแล้ว)`)) return;
    setBusy("delete");
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch(`/api/payroll/payment-batches/${encodeURIComponent(detail.batch.id)}`, { method: "DELETE" }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setMsg("ลบรอบจ่ายแล้ว");
      setDetail(null);
      await Promise.all([loadBatches(periodId), refreshPeriods()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบรอบจ่ายไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function markPeriodPaid() {
    if (!periodId) return;
    if (!confirm("ยืนยันปิดงวดนี้เป็นจ่ายแล้ว? ระบบจะตรวจว่ามีชุดจ่ายที่จ่ายแล้วและสลิปจ่ายครบก่อนปิดงวด")) return;
    setBusy("period-paid");
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch("/api/payroll/period-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, to_status: "paid", actor: "payroll-payments" }),
      }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setMsg("ปิดงวดเป็นจ่ายแล้วเรียบร้อย");
      await Promise.all([loadBatches(periodId), selectedBatchId ? loadDetail(selectedBatchId) : Promise.resolve(), refreshPeriods()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปิดงวดไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  const detailTotal = detail?.lines.reduce((sum, line) => sum + (Number(line.paid_amount) || 0), 0) ?? 0;
  const latestCalcNet = Number(detail?.batch.latest_calc_net_pay ?? 0) || 0;
  const latestCalcLineCount = Number(detail?.batch.latest_calc_line_count ?? 0) || 0;
  const latestCalcRunNo = detail?.batch.latest_calc_run_no ?? null;
  const detailCalcDiff = Math.round((detailTotal - latestCalcNet) * 100) / 100;
  const detailCalcDiffClass = Math.abs(detailCalcDiff) < 0.005 ? "text-emerald-700" : detailCalcDiff > 0 ? "text-amber-700" : "text-red-700";
  const periodStatus = String((selectedPeriod as Record<string, unknown> | null)?.status ?? "");
  const detailLinesForReport = useMemo(() => {
    const rows = detail?.lines ?? [];
    const payableRows = hideZeroPaymentLines ? rows.filter((line) => Math.abs(paymentLineAmount(line)) > 0.004) : rows;
    return {
      regular: payableRows.filter((line) => paymentLineGroup(line) === "regular"),
      other: payableRows.filter((line) => paymentLineGroup(line) === "other"),
    };
  }, [detail?.lines, hideZeroPaymentLines]);
  const activePaymentLines = detailLinesForReport[paymentTab];
  const paymentTabCounts = {
    regular: detailLinesForReport.regular.length,
    other: detailLinesForReport.other.length,
  };
  const paymentTabTotals = {
    regular: detailLinesForReport.regular.reduce((sum, line) => sum + paymentLineAmount(line), 0),
    other: detailLinesForReport.other.reduce((sum, line) => sum + paymentLineAmount(line), 0),
  };
  const visiblePaymentReportColumns = paymentReportColumns.filter((column) => paymentReportVisibleColumns[column.key]);

  async function copyAccountNo(accountNo: string) {
    const value = accountNo.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedAccountNos((current) => new Set(current).add(value));
      setMsg("คัดลอกเลขบัญชีแล้ว");
    } catch {
      setErr("คัดลอกเลขบัญชีไม่สำเร็จ");
    }
  }

  function togglePaymentReportColumn(column: PaymentReportColumn, checked: boolean) {
    setPaymentReportVisibleColumns((current) => {
      const next = { ...current, [column]: checked };
      if (!Object.values(next).some(Boolean)) return current;
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">รอบจ่ายเงิน Payroll</h1>
          <p className="text-sm text-slate-500">จัดการสิ้นเดือน กลางเดือน export ไฟล์ธนาคาร และบันทึกสถานะจ่ายเงิน</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {periodStatus !== "paid" && (
            <button onClick={markPeriodPaid} disabled={!periodId || busy === "period-paid"}
              className="h-10 rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
              {busy === "period-paid" ? "กำลังปิดงวด..." : "ปิดงวดเป็นจ่ายแล้ว"}
            </button>
          )}
        <button onClick={() => openCreate("month_end")} disabled={!periodId}
          className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
          สร้างรอบจ่าย
        </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[320px_1fr]">
        <div>
          <label className="mb-1 block text-xs text-slate-500">งวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
            {periods.map((period) => <option key={period.id} value={period.id}>{period.period_name} ({period.status})</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryBox label="รอบจ่าย" value={summary.count.toLocaleString("th-TH")} />
          <SummaryBox label="ร่าง/อนุมัติ" value={`${summary.draft}/${summary.approved}`} />
          <SummaryBox label="จ่ายแล้ว" value={summary.paid.toLocaleString("th-TH")} />
          <SummaryBox label="ยอดรวม" value={baht(summary.total)} strong />
        </div>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</div>}
      {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-800">รอบจ่ายในงวดนี้</div>
            <div className="text-xs text-slate-500">{loading ? "กำลังโหลด..." : `${batches.length.toLocaleString("th-TH")} รอบจ่าย`}</div>
          </div>
          <button onClick={() => openCreate("mid_month")} className="h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
            สร้างกลางเดือน
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {batches.map((batch) => (
            <button key={batch.id} onClick={() => setSelectedBatchId(batch.id)}
              className={`rounded-lg border p-4 text-left transition ${selectedBatchId === batch.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{BATCH_TYPE[batch.batch_type] ?? batch.batch_type} - {batch.batch_no}</div>
                  <div className="mt-1 text-xs text-slate-500">{batch.payment_date ?? "-"} · {batch.line_count} คน · {baht(batch.paid_amount)}</div>
                </div>
                {badge(batch.status)}
              </div>
            </button>
          ))}
          {!loading && batches.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">ยังไม่มีรอบจ่ายในงวดนี้</div>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        {!detail && <div className="p-10 text-center text-sm text-slate-400">{detailLoading ? "กำลังโหลดรายละเอียด..." : "เลือกรอบจ่ายเพื่อดูรายการ"}</div>}
        {detail && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <div className="font-semibold text-slate-900">{BATCH_TYPE[detail.batch.batch_type] ?? detail.batch.batch_type} - {detail.batch.batch_no}</div>
                <div className="text-xs text-slate-500">{detail.batch.period_name} · {detail.lines.length} รายการ · ยอดรวม {baht(detailTotal)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {badge(detail.batch.status)}
                <a href={`/api/payroll/payment-batches/${encodeURIComponent(detail.batch.id)}/export`} className="h-9 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Export CSV</a>
                <button type="button" onClick={() => setReportOpen(true)} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">ปรับ Report</button>
                {detail.batch.status === "draft" && <button onClick={() => batchAction("approve")} disabled={busy === "approve"} className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">อนุมัติ</button>}
                {detail.batch.status === "approved" && <button onClick={() => batchAction("mark-paid")} disabled={busy === "mark-paid"} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">{detail.batch.batch_type === "month_end" ? "จ่ายแล้ว + ปิดงวด" : "จ่ายแล้ว"}</button>}
                {detail.batch.status !== "paid" && detail.batch.status !== "cancelled" && <button onClick={() => batchAction("cancel")} disabled={busy === "cancel"} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">ยกเลิก</button>}
                {detail.batch.status === "cancelled" && <button onClick={deleteBatch} disabled={busy === "delete"} className="h-9 rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">🗑 ลบรอบจ่าย</button>}
              </div>
            </div>
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 md:grid-cols-4">
              <SummaryBox label="ยอดสุทธิรอบคำนวณล่าสุด" value={latestCalcRunNo ? `${baht(latestCalcNet)} (รอบ #${latestCalcRunNo})` : "ยังไม่พบรอบคำนวณ"} />
              <SummaryBox label="จำนวนคนจากรอบคำนวณ" value={`${latestCalcLineCount.toLocaleString("th-TH")} คน`} />
              <SummaryBox label="ยอดจ่ายในรอบนี้" value={baht(detailTotal)} strong />
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs text-slate-500">ส่วนต่างจากยอดคำนวณ</div>
                <div className={`mt-1 font-bold ${detailCalcDiffClass}`}>{signedBaht(detailCalcDiff)}</div>
              </div>
            </div>
            {Math.abs(detailCalcDiff) >= 0.005 && (
              <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                ยอดจ่ายรอบนี้ยังไม่เท่ากับยอดสุทธิจากรอบคำนวณล่าสุด ใช้จุดนี้เช็คก่อน Export CSV หรือบันทึกจ่ายแล้ว
              </div>
            )}
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {(["regular", "other"] as PaymentLineGroup[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPaymentTab(tab)}
                      className={`rounded-md px-3 py-2 text-xs font-semibold transition ${paymentTab === tab ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}
                    >
                      {paymentTabLabel[tab]} ({paymentTabCounts[tab].toLocaleString("th-TH")}) · {baht(paymentTabTotals[tab])}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={hideZeroPaymentLines} onChange={(event) => setHideZeroPaymentLines(event.target.checked)} />
                    ซ่อนยอด 0
                  </label>
                  <button type="button" onClick={() => setCopiedAccountNos(new Set())} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Reset คัดลอกแล้ว
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                แสดงเฉพาะรายการของ tab ที่เลือก · Export CSV เดิมยังผ่าน API กลางและมี audit log
              </div>
            </div>
            <PaymentLinesTable
              lines={activePaymentLines}
              columns={visiblePaymentReportColumns}
              copiedAccountNos={copiedAccountNos}
              onCopyAccount={copyAccountNo}
            />
          </>
        )}
      </section>

      <ERPModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        size="md"
        title="ปรับ Report รอบจ่าย"
        description="เลือก column ที่ต้องการแสดงในตารางรอบจ่าย หน้านี้เป็นการตั้งค่าหน้าจอ ไม่เปลี่ยนข้อมูลจริง"
        footer={
          <div className="flex w-full justify-end">
            <button onClick={() => setReportOpen(false)} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">เสร็จ</button>
          </div>
        }
      >
        <div className="space-y-3">
          {paymentReportColumns.map((column) => (
            <label key={column.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="font-medium text-slate-700">{column.label}</span>
              <input
                type="checkbox"
                checked={paymentReportVisibleColumns[column.key]}
                onChange={(event) => togglePaymentReportColumn(column.key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </ERPModal>

      <ERPModal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        size="xl"
        title="สร้างรอบจ่าย"
        description="ตรวจรายคนก่อนบันทึกร่าง รอบกลางเดือนจะแก้ยอดรายคนได้ก่อนสร้าง"
        hasUnsavedChanges={createLines.length > 0 && !busy}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">เลือก {selectedCreateLines.length.toLocaleString("th-TH")} คน · รวม {baht(selectedCreateTotal)}</div>
            <div className="flex gap-2">
              <button onClick={() => setCreateOpen(false)} disabled={!!busy} className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">ยกเลิก</button>
              <button onClick={createBatch} disabled={busy === "create" || selectedCreateLines.length === 0} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                {busy === "create" ? "กำลังสร้าง..." : "สร้างร่าง"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_180px_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">ประเภทชุดจ่าย</span>
              <select value={batchType} onChange={(e) => setBatchType(e.target.value as "month_end" | "mid_month" | "special")} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                <option value="month_end">สิ้นเดือน</option>
                <option value="mid_month">กลางเดือน</option>
                <option value="special">พิเศษ</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">วันที่จ่าย</span>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">หมายเหตุ</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น รอบกลางเดือนประจำงวดนี้" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </label>
          </div>

          {preview?.existing_count ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">งวดนี้มีรอบประเภทนี้อยู่แล้ว ระบบจะกันไม่ให้สร้างซ้ำถ้ายังไม่ยกเลิก</div> : null}
          {batchType !== "month_end" && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="mb-2">
                <div className="text-sm font-semibold text-emerald-900">เพิ่มพนักงานเข้ารอบจ่าย</div>
                <div className="text-xs text-emerald-700">เลือก “ชั่วคราว” เพื่อใช้แค่รอบนี้ หรือ “บันทึกเป็นค่าเริ่มต้น” เพื่อให้เดือนถัดไปติดมาด้วย</div>
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_120px_170px_auto]">
                <select value={addEmployeeId} onChange={(e) => {
                  const employeeId = e.target.value;
                  const employee = candidateOptions.find((line) => line.employee_id === employeeId);
                  setAddEmployeeId(employeeId);
                  setAddAmount(Number(employee?.suggested_amount ?? employee?.previous_paid_amount ?? 0) || 0);
                }} className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm">
                  <option value="">เลือกพนักงานที่ยังไม่อยู่ในรายการ</option>
                  {candidateOptions.map((line) => (
                    <option key={line.employee_id} value={line.employee_id}>
                      {line.employee_code || "-"} - {line.employee_name || "-"} {line.previous_paid_amount ? `(เดือนก่อน ${baht(line.previous_paid_amount)})` : ""}
                    </option>
                  ))}
                </select>
                <input type="number" min={0} step="0.01" value={addAmount} onChange={(e) => setAddAmount(Number(e.target.value) || 0)} className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-right text-sm" placeholder="ยอดจ่าย" />
                <select value={addMode} onChange={(e) => setAddMode(e.target.value as "temporary" | "default")} className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm">
                  <option value="temporary">เพิ่มชั่วคราว</option>
                  <option value="default">บันทึกเป็นค่าเริ่มต้น</option>
                </select>
                <button type="button" onClick={addEmployeeToCreateLines} disabled={!selectedCandidate} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                  เพิ่ม
                </button>
              </div>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_150px_auto]">
            <input value={createSearch} onChange={(e) => setCreateSearch(e.target.value)} placeholder="ค้นหารหัส / ชื่อ / เลขบัตร / ธนาคาร" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
            <select value={createFilter} onChange={(e) => setCreateFilter(e.target.value as typeof createFilter)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
              <option value="all">ทั้งหมด</option>
              <option value="selected">ที่เลือก</option>
              <option value="changed">ยอดเปลี่ยน/คนใหม่</option>
              <option value="missing_this_month">เดือนก่อนมี</option>
              <option value="missing_bank">ไม่มีบัญชี</option>
            </select>
            <select value={createSort} onChange={(e) => setCreateSort(e.target.value as typeof createSort)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
              <option value="code">เรียงตามรหัส</option>
              <option value="name">เรียงตามชื่อ</option>
              <option value="bank">เรียงตามธนาคาร</option>
              <option value="amount">ยอดจ่ายมากก่อน</option>
              <option value="previous">ยอดเดือนก่อนมากก่อน</option>
              <option value="delta">ส่วนต่างมากก่อน</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setVisibleCreateLinesSelected(true)} className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">เลือกที่เห็น</button>
              <button type="button" onClick={() => setVisibleCreateLinesSelected(false)} className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">ไม่เลือกที่เห็น</button>
              {batchType !== "month_end" && <button type="button" onClick={usePreviousAmounts} className="h-10 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100">ใช้ยอดเดือนก่อน</button>}
              {batchType !== "month_end" && <button type="button" onClick={clearZeroAmounts} className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">ตัดยอด 0</button>}
            </div>
          </div>
          {previewLoading ? <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">กำลังโหลด preview...</div> : (
            <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1320px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-12 px-3 py-2 text-left">
                      <input type="checkbox" checked={visibleCreateLines.length > 0 && visibleCreateLines.every((line) => line.selected !== false)} onChange={(e) => setVisibleCreateLinesSelected(e.target.checked)} />
                    </th>
                    <th className="px-3 py-2 text-left">พนักงาน</th>
                    <th className="px-3 py-2 text-left">เลขบัตรประชาชน</th>
                    <th className="px-3 py-2 text-right">ฐานทะเบียน</th>
                    <th className="px-3 py-2 text-right">เงินเดือน 16</th>
                    <th className="px-3 py-2 text-right">เงินเดือน 31</th>
                    <th className="px-3 py-2 text-right">OT 31</th>
                    <th className="px-3 py-2 text-right">เงินสด</th>
                    <th className="px-3 py-2 text-right">ปกส. 5%</th>
                    <th className="px-3 py-2 text-right">ยอดคงเหลือ</th>
                    <th className="px-3 py-2 text-right">ยอดจ่ายจริง</th>
                    <th className="px-3 py-2 text-left">หมายเหตุรายคน</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCreateLines.map((line) => (
                    <tr key={line.employee_id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={line.selected !== false} onChange={(e) => updateCreateLine(line.employee_id, { selected: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{line.employee_name || "-"}</div>
                        <div className="font-mono text-xs text-slate-400">{line.employee_code || "-"}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{line.identity_no || "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{dashBaht(line.base_salary)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{dashBaht(line.mid_month_paid)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{dashBaht(line.month_end_pay)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{dashBaht(line.overtime_amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">{dashBaht(line.cash_pay)}</td>
                      <td className="px-3 py-2 text-right tabular-nums bg-yellow-100">{dashBaht(line.social_security)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{dashBaht(line.balance)}</td>
                      <td className="px-3 py-2 text-right">
                        {batchType === "month_end" ? (
                          <span className="font-semibold tabular-nums">{baht(line.paid_amount)}</span>
                        ) : (
                          <div className="inline-flex flex-col items-end gap-1">
                            <input type="number" min={0} step="0.01" value={Number(line.paid_amount) || 0} onChange={(e) => {
                              const amount = Number(e.target.value) || 0;
                              updateCreateLine(line.employee_id, { paid_amount: amount, ...compareAmounts(amount, line.previous_paid_amount) });
                            }} className="h-9 w-28 rounded-lg border border-slate-300 px-2 text-right text-sm" />
                            {defaultPaidAmount(line) > 0 && <span className="text-[11px] leading-none text-slate-400">ค่าเริ่มต้น {baht(defaultPaidAmount(line))}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input value={line.line_note ?? ""} onChange={(e) => updateCreateLine(line.employee_id, { line_note: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                      </td>
                    </tr>
                  ))}
                  {!visibleCreateLines.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-sm text-slate-400">ไม่มีรายการสำหรับสร้างรอบจ่ายนี้</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ERPModal>
    </div>
  );
}

function SummaryBox({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 font-bold ${strong ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function PaymentLinesTable({
  lines,
  columns,
  copiedAccountNos,
  onCopyAccount,
}: {
  lines: BatchLine[];
  columns: Array<{ key: PaymentReportColumn; label: string }>;
  copiedAccountNos: Set<string>;
  onCopyAccount: (accountNo: string) => void;
}) {
  const colSpan = Math.max(columns.length, 1);
  const headerAlign = (column: PaymentReportColumn) => {
    if (column === "amount") return "text-right";
    if (column === "status") return "text-center";
    return "text-left";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-3 py-2 ${headerAlign(column.key)}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id ?? line.employee_id} className="border-t border-slate-100 hover:bg-slate-50">
              {columns.map((column) => {
                if (column.key === "employee") {
                  return (
                    <td key={column.key} className="px-3 py-2">
                      <div className="font-medium text-slate-800">{line.employee_name || "-"}</div>
                      <div className="font-mono text-xs text-slate-400">{line.employee_code || "-"}</div>
                    </td>
                  );
                }

                if (column.key === "bank") {
                  return <td key={column.key} className="px-3 py-2">{line.bank_name || "-"}</td>;
                }

                if (column.key === "account_name") {
                  return <td key={column.key} className="px-3 py-2">{line.bank_account_name || line.employee_name || "-"}</td>;
                }

                if (column.key === "account_no") {
                  const accountNo = line.bank_account_no || "";
                  const copied = accountNo ? copiedAccountNos.has(accountNo) : false;

                  return (
                    <td key={column.key} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-600">{accountNo || "-"}</span>
                        {accountNo && (
                          <button
                            type="button"
                            onClick={() => onCopyAccount(accountNo)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
                              copied
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {copied ? "คัดลอกแล้ว" : "Copy"}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                }

                if (column.key === "amount") {
                  return <td key={column.key} className="px-3 py-2 text-right font-semibold tabular-nums">{baht(line.paid_amount)}</td>;
                }

                return <td key={column.key} className="px-3 py-2 text-center">{badge(line.status ?? "draft")}</td>;
              })}
            </tr>
          ))}
          {!lines.length && <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-400">ไม่มีรายการใน tab นี้</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">พนักงาน</th>
            <th className="px-3 py-2 text-left">ธนาคาร</th>
            <th className="px-3 py-2 text-left">ชื่อบัญชี</th>
            <th className="px-3 py-2 text-left">เลขที่บัญชี</th>
            <th className="px-3 py-2 text-right">ยอดจ่าย</th>
            <th className="px-3 py-2 text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id ?? line.employee_id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{line.employee_name || "-"}</div>
                <div className="font-mono text-xs text-slate-400">{line.employee_code || "-"}</div>
              </td>
              <td className="px-3 py-2">{line.bank_name || "-"}</td>
              <td className="px-3 py-2">{line.bank_account_name || line.employee_name || "-"}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{line.bank_account_no || "-"}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{baht(line.paid_amount)}</td>
              <td className="px-3 py-2 text-center">{badge(line.status ?? "draft")}</td>
            </tr>
          ))}
          {!lines.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">รอบจ่ายนี้ยังไม่มีรายการ</td></tr>}
        </tbody>
      </table>
    </div>
  );
}


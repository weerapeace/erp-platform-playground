"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAttendanceImportPreview,
  buildAttendanceManualEntryPayloads,
  type AttendanceImportContract,
  type AttendanceImportStatus,
  type AttendancePreviewRow,
} from "@/lib/payroll-attendance-import";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { isPayrollContractor, shouldReceivePaidPeriodHoliday } from "@/lib/payroll-attendance-rules";

type PayrollImportRow = {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  scanner_employee_code?: string | null;
  contract_type?: string | null;
  employment_type?: string | null;
  wage_type?: string | null;
  work_schedule_id?: string | null;
  attendance_scan_exempt?: boolean | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
};

type PayrollImportPeriod = {
  id?: string;
  default_hours_per_day?: number | null;
  holidays?: { holiday_date?: string | null }[];
};

type DuplicateMode = "skip" | "replace" | "error";
type ReviewDecision = "absence" | "skip" | "normal";

type AttendanceDraftRow = {
  id: string;
  row_key?: string | null;
  employee_id?: string | null;
  work_date?: string | null;
  scanner_code?: string | null;
  mapped_scanner_code?: string | null;
  employee_label?: string | null;
  raw_scans?: string[] | null;
  result_payload?: Record<string, unknown> | null;
  manual_payloads?: Record<string, unknown>[] | null;
  status?: string | null;
  note?: string | null;
  source_lines?: string[] | null;
  sort_order?: number | null;
};

type AttendanceDraftBatch = {
  id: string;
  payroll_period_id: string;
  source_filename?: string | null;
  source_text?: string | null;
  duplicate_mode?: DuplicateMode | string | null;
  status?: string | null;
  rows?: AttendanceDraftRow[];
};

type DisplayImportRow = {
  id: string;
  rowKey: string;
  date: string;
  scannerCode: string;
  employeeId?: string | null;
  employeeLabel: string;
  rawScans: string[];
  result: string;
  status: string;
  note: string;
  payloadCount: number;
  canCommit: boolean;
  canSelect: boolean;
};

const SAMPLE_TEXT = "scanner_code,date,scans\n1,2026-05-04,07:41 12:51 17:04\n2,04/05/2026,07:55 12:49 16:40";

const SCHEDULES: Record<string, number[]> = {
  office_5d: [1, 2, 3, 4, 5],
  factory_6d: [1, 2, 3, 4, 5, 6],
  shift_a: [1, 2, 3, 4, 5, 6],
  shift_b: [1, 2, 3, 4, 5, 6],
  part_time_weekend: [0, 6],
};

function scheduleWeekdays(id: unknown): number[] {
  return SCHEDULES[String(id)] ?? SCHEDULES.factory_6d;
}

function isScheduledWorkDate(date: string, contract: AttendanceImportContract): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return true;
  return scheduleWeekdays(contract.work_schedule_id).includes(d.getUTCDay());
}

function employeeShortName(row?: AttendancePreviewRow["employee"]): string {
  if (!row) return "-";
  return [row.employee_code, row.nickname || row.first_name].filter(Boolean).join(" · ") || row.id || "-";
}

function minutesText(minutes: number): string {
  const value = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(value / 60);
  const m = value % 60;
  return [h ? `${h} ชม.` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ") || "0 นาที";
}

function resultText(row: AttendancePreviewRow): string {
  const result = row.result;
  const parts = [
    result.totalLateMinutes ? `สาย ${minutesText(result.totalLateMinutes)}` : "",
    result.earlyOutMinutes ? `ออกก่อน ${minutesText(result.earlyOutMinutes)}` : "",
    result.absent ? "ขาดงาน" : "",
  ].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  if (row.importStatus === "skipped") return "ข้าม";
  return "ปกติ";
}

function statusLabel(status: string): string {
  return {
    ready: "พร้อม",
    approved: "พร้อม",
    normal: "ปกติ",
    review: "ต้องตรวจ",
    needs_review: "ต้องตรวจ",
    unmapped: "ยังไม่ผูกพนักงาน",
    blocked: "ติดปัญหา",
    skipped: "ข้าม",
    committed: "บันทึกจริงแล้ว",
    error: "ผิดพลาด",
  }[status] ?? status;
}

function statusClass(status: string): string {
  if (["ready", "approved", "normal", "reviewed", "committed"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "needs_review" || status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "skipped") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-red-200 bg-red-50 text-red-700";
}

function isReviewStatus(status: string): boolean {
  return status === "needs_review" || status === "review";
}

function isCommitReadyStatus(status: string): boolean {
  return ["ready", "approved", "normal"].includes(status);
}

function decisionNote(decision: ReviewDecision): string {
  if (decision === "absence") return "ยืนยันเป็นขาดงาน";
  if (decision === "normal") return "บันทึกเป็นปกติ ไม่หัก";
  return "ข้าม ไม่หัก";
}

function decisionStatus(decision: ReviewDecision): string {
  if (decision === "absence") return "ready";
  if (decision === "normal") return "normal";
  return "skipped";
}

function absencePayload(input: { employeeId?: string | null; workDate?: string | null; scannerCode?: string | null; rawScans?: string[] | null; hoursPerDay?: number | null }) {
  if (!input.employeeId || !input.workDate) return [];
  return [{
    employee_id: input.employeeId,
    work_date: input.workDate,
    status: "approved" as const,
    note: [
      "Confirmed from attendance import review",
      `scanner=${input.scannerCode || "-"}`,
      `raw=${(input.rawScans || []).join(" ") || "-"}`,
    ].join(" | "),
    entry_type: "absence" as const,
    absence_hours: input.hoursPerDay || 8,
    minutes: 0,
    late_minutes: 0,
  }];
}

function flagText(flags: string[]): string {
  const labels: Record<string, string> = {
    late_morning: "สายช่วงเช้า",
    late_noon: "สายหลังพัก",
    early_checkout: "ออกก่อน",
    absent: "ขาด",
    no_scans_on_workday: "ไม่มีสแกนในวันทำงาน",
    missing_morning_scan: "ไม่มีสแกนเช้า",
    missing_noon_scan: "ไม่มีสแกนเที่ยง",
    missing_final_checkout: "ไม่มีสแกนออก",
    manual_review_required: "ต้องตรวจเอง",
    attendance_scan_exempt: "ยกเว้นสแกน",
    outside_contract_period: "นอกช่วงสัญญา",
    piecework_contract_skipped: "งานเหมาไม่ต้องลงเวลา",
    unmapped_scanner_employee_code: "รหัสสแกนยังไม่ผูกพนักงาน",
    duplicate_scanner_employee_code: "รหัสสแกนซ้ำ",
    holiday_skipped: "วันหยุด/วันไม่ทำงาน",
  };
  return flags.map((flag) => labels[flag] || flag).join(" · ");
}

async function decodeImportFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const labels = ["utf-8", "windows-874", "tis-620"];
  const decoded = labels
    .map((label) => {
      try {
        const text = new TextDecoder(label).decode(buffer);
        return { text, replacementCount: (text.match(/\uFFFD/g) || []).length };
      } catch {
        return null;
      }
    })
    .filter((item): item is { text: string; replacementCount: number } => Boolean(item))
    .sort((left, right) => left.replacementCount - right.replacementCount);
  return decoded[0]?.text || file.text();
}

export function AttendanceImportPreview({
  editable,
  period,
  rows,
  onCommitted,
}: {
  editable: boolean;
  period: PayrollImportPeriod | null;
  rows: PayrollImportRow[];
  onCommitted?: () => void;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AttendanceImportStatus | "committed" | "error">("all");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<AttendanceDraftBatch | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  const rowsByEmployeeId = useMemo(() => new Map(rows.map((row) => [row.employee_id, row])), [rows]);
  const holidaySet = useMemo(() => new Set((period?.holidays || []).map((h) => h.holiday_date).filter(Boolean) as string[]), [period]);
  const preview = useMemo(() => buildAttendanceImportPreview({
    activePeriod: { id: period?.id, default_hours_per_day: period?.default_hours_per_day },
    employees: rows.map((row) => ({
      id: row.employee_id,
      employee_code: row.employee_code,
      first_name: row.employee_name,
      nickname: row.employee_name,
      scanner_employee_code: row.scanner_employee_code,
    })),
    text,
    contractForEmployee: (employee) => {
      const row = rowsByEmployeeId.get(String(employee.id));
      return {
        work_schedule_id: row?.work_schedule_id,
        attendance_scan_exempt: row?.attendance_scan_exempt,
        contract_type: row?.contract_type,
        employment_type: row?.employment_type,
        wage_type: row?.wage_type,
        start_date: row?.contract_start_date,
        end_date: row?.contract_end_date,
      };
    },
    scheduleStatusFor: (date, contract) => {
      if (isPayrollContractor(contract)) return "piecework_contract";
      if (holidaySet.has(date)) return shouldReceivePaidPeriodHoliday(contract) ? "paid_holiday" : "day_off";
      return isScheduledWorkDate(date, contract) ? "workday" : "day_off";
    },
  }), [holidaySet, period?.default_hours_per_day, period?.id, rows, rowsByEmployeeId, text]);

  const previewDisplayRows: DisplayImportRow[] = useMemo(() => preview.rows.map((row) => {
    const decision = reviewDecisions[row.rowKey];
    const manualPayloads = decision === "absence"
      ? absencePayload({ employeeId: row.employee?.id, workDate: row.date, scannerCode: row.scannerCode, rawScans: row.result.rawScans, hoursPerDay: period?.default_hours_per_day })
      : decision ? [] : buildAttendanceManualEntryPayloads(row, { default_hours_per_day: period?.default_hours_per_day });
    const status = decision ? decisionStatus(decision) : row.importStatus;
    return {
      id: row.rowKey,
      rowKey: row.rowKey,
      date: row.date,
      scannerCode: row.scannerCode,
      employeeId: row.employee?.id || null,
      employeeLabel: employeeShortName(row.employee),
      rawScans: row.result.rawScans,
      result: decision === "normal" ? "ปกติ" : decision === "skip" ? "ข้าม" : resultText(row),
      status,
      note: decision ? decisionNote(decision) : flagText(row.result.flags) || "-",
      payloadCount: manualPayloads.length,
      canCommit: false,
      canSelect: isReviewStatus(status),
    };
  }), [period?.default_hours_per_day, preview.rows, reviewDecisions]);

  const draftDisplayRows: DisplayImportRow[] = useMemo(() => (draft?.rows || []).map((row) => {
    const payloads = Array.isArray(row.manual_payloads) ? row.manual_payloads : [];
    const result = (row.result_payload || {}) as Record<string, unknown>;
    const flags = Array.isArray(result.flags) ? result.flags.map(String) : [];
    const status = String(row.status || "blocked");
    return {
      id: row.id,
      rowKey: String(row.row_key || row.id),
      date: String(row.work_date || ""),
      scannerCode: String(row.scanner_code || ""),
      employeeId: String(row.employee_id || "") || null,
      employeeLabel: String(row.employee_label || row.employee_id || "-"),
      rawScans: Array.isArray(row.raw_scans) ? row.raw_scans : [],
      result: payloads.length ? `${payloads.length} รายการ` : status === "normal" ? "ปกติ" : "-",
      status,
      note: row.note || flagText(flags) || "-",
      payloadCount: payloads.length,
      canCommit: isCommitReadyStatus(status),
      canSelect: isReviewStatus(status) || isCommitReadyStatus(status),
    };
  }), [draft?.rows]);

  const displayRows = draft ? draftDisplayRows : previewDisplayRows;

  const filteredRows = displayRows
    .filter((row) => filter === "all" || row.status === filter || (filter === "needs_review" && row.status === "review"))
    .filter((row) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [
        row.date,
        row.scannerCode,
        row.employeeLabel,
        row.rawScans.join(" "),
        row.result,
        row.note,
      ].join(" ").toLowerCase().includes(q);
    });

  const payloadCount = displayRows.reduce((sum, row) => sum + row.payloadCount, 0);
  const canCommitCount = draftDisplayRows.filter((row) => row.canCommit).length;
  const selectedReadyCount = draftDisplayRows.filter((row) => row.canCommit && selectedIds.has(row.id)).length;
  const reviewCount = displayRows.filter((row) => isReviewStatus(row.status)).length;
  const readyCount = displayRows.filter((row) => isCommitReadyStatus(row.status)).length;
  const blockedCount = displayRows.filter((row) => ["unmapped", "blocked"].includes(row.status)).length;
  const selectedReviewCount = displayRows.filter((row) => selectedIds.has(row.id) && isReviewStatus(row.status)).length;
  const selectableFilteredRows = filteredRows.filter((row) => row.canSelect && row.status !== "committed");
  const selectedSelectableCount = selectableFilteredRows.filter((row) => selectedIds.has(row.id)).length;

  const loadDraft = useCallback(async () => {
    if (!period?.id) {
      setDraft(null);
      return;
    }
    setDraftLoading(true);
    try {
      const list = await apiFetch(`/api/payroll/attendance-import-batches?period_id=${encodeURIComponent(period.id)}`).then((res) => res.json());
      if (list.error) throw new Error(list.error);
      const latest = ((list.data || []) as AttendanceDraftBatch[]).find((item) => String(item.status || "draft") === "draft");
      if (!latest?.id) {
        setDraft(null);
        setSelectedIds(new Set());
        return;
      }
      const detail = await apiFetch(`/api/payroll/attendance-import-batches/${latest.id}`).then((res) => res.json());
      if (detail.error) throw new Error(detail.error);
      const next = detail.data as AttendanceDraftBatch;
      setDraft(next);
      setText(String(next.source_text || ""));
      setReviewDecisions({});
      setDuplicateMode((next.duplicate_mode === "replace" || next.duplicate_mode === "error") ? next.duplicate_mode : "skip");
      setSelectedIds(new Set((next.rows || []).filter((row) => ["ready", "approved", "normal"].includes(String(row.status))).map((row) => row.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลด draft import ไม่สำเร็จ");
    } finally {
      setDraftLoading(false);
    }
  }, [period?.id]);

  useEffect(() => { void loadDraft(); }, [loadDraft]);

  const readFile = async (file?: File | null) => {
    if (!file) return;
    const fileText = await decodeImportFile(file);
    setDraft(null);
    setSelectedIds(new Set());
    setReviewDecisions({});
    setText((current) => current.trim() ? `${current.trimEnd()}\n${fileText.trim()}` : fileText.trim());
    setMessage(file.name.toLowerCase().endsWith(".pdf")
      ? "อ่าน PDF แบบ text แล้ว ถ้า preview ไม่ขึ้น ให้ export/copy text จากรายงานเครื่องสแกนเป็น TXT/CSV"
      : `อ่านไฟล์ ${file.name} แล้ว`);
  };

  const draftRowsFromPreview = () => preview.rows.map((row, index) => {
    const decision = reviewDecisions[row.rowKey];
    const manualPayloads = decision === "absence"
      ? absencePayload({ employeeId: row.employee?.id, workDate: row.date, scannerCode: row.scannerCode, rawScans: row.result.rawScans, hoursPerDay: period?.default_hours_per_day })
      : decision ? [] : buildAttendanceManualEntryPayloads(row, { default_hours_per_day: period?.default_hours_per_day });
    return {
      row_key: row.rowKey,
      employee_id: row.employee?.id || null,
      work_date: row.date,
      scanner_code: row.scannerCode || null,
      mapped_scanner_code: row.scannerCode || null,
      employee_label: employeeShortName(row.employee),
      raw_scans: row.result.rawScans,
      result_payload: row.result,
      manual_payloads: manualPayloads,
      status: decision ? decisionStatus(decision) : row.importStatus === "needs_review" ? "review" : row.importStatus,
      note: decision ? decisionNote(decision) : flagText(row.result.flags) || null,
      source_lines: row.sourceLines,
      sort_order: index,
    };
  });

  const draftRowsFromDraftRows = (sourceRows: AttendanceDraftRow[] = []) => sourceRows.map((row, index) => ({
    row_key: String(row.row_key || row.id || index),
    employee_id: row.employee_id || null,
    work_date: String(row.work_date || ""),
    scanner_code: row.scanner_code || null,
    mapped_scanner_code: row.mapped_scanner_code || row.scanner_code || null,
    employee_label: row.employee_label || null,
    raw_scans: Array.isArray(row.raw_scans) ? row.raw_scans : [],
    result_payload: row.result_payload || {},
    manual_payloads: Array.isArray(row.manual_payloads) ? row.manual_payloads : [],
    status: String(row.status || "blocked"),
    note: row.note || null,
    source_lines: Array.isArray(row.source_lines) ? row.source_lines : [],
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
  }));

  const persistDraftRows = async (sourceRows: AttendanceDraftRow[], successText: string) => {
    if (!draft?.id || !period?.id) return;
    const res = await apiFetch("/api/payroll/attendance-import-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batch_id: draft.id,
        payroll_period_id: period.id,
        source_text: text,
        duplicate_mode: duplicateMode,
        rows: draftRowsFromDraftRows(sourceRows),
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || "อัปเดต draft ไม่สำเร็จ");
    const next = json.data as AttendanceDraftBatch;
    setDraft(next);
    setSelectedIds(new Set((next.rows || []).filter((row) => isCommitReadyStatus(String(row.status))).map((row) => row.id)));
    setMessage(successText);
  };

  const saveDraft = async () => {
    if (!editable) return;
    if (!period?.id) { setMessage("ต้องเลือกงวดก่อน"); return; }
    if (displayRows.length === 0) { setMessage("ยังไม่มีรายการให้บันทึก draft"); return; }
    setBusy(true);
    setMessage("");
    try {
      const res = await apiFetch("/api/payroll/attendance-import-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: draft?.id || null,
          payroll_period_id: period.id,
          source_text: text,
          duplicate_mode: duplicateMode,
          rows: draft ? draftRowsFromDraftRows(draft.rows || []) : draftRowsFromPreview(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "บันทึก draft ไม่สำเร็จ");
      const next = json.data as AttendanceDraftBatch;
      setDraft(next);
      setReviewDecisions({});
      setSelectedIds(new Set((next.rows || []).filter((row) => ["ready", "approved", "normal"].includes(String(row.status))).map((row) => row.id)));
      setMessage(`บันทึก draft แล้ว ${next.rows?.length || 0} รายการ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก draft ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const clearDraft = async () => {
    if (draft?.id) {
      if (!confirm("ลบ draft import นี้? ข้อมูลจริงที่บันทึกไปแล้วจะไม่ถูกลบ")) return;
      setBusy(true);
      try {
        const res = await apiFetch(`/api/payroll/attendance-import-batches/${draft.id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || "ลบ draft ไม่สำเร็จ");
        setDraft(null);
        setSelectedIds(new Set());
        setMessage("ลบ draft แล้ว");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "ลบ draft ไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
      return;
    }
    setText("");
    setSelectedIds(new Set());
    setReviewDecisions({});
    setMessage("ล้าง preview แล้ว");
    fileRef.current?.form?.reset();
  };

  const commitSelected = async () => {
    if (!draft?.id) { setMessage("ต้องบันทึก draft ก่อน"); return; }
    const rowIds = draftDisplayRows.filter((row) => row.canCommit && selectedIds.has(row.id)).map((row) => row.id);
    if (rowIds.length === 0) { setMessage("เลือกรายการที่พร้อมก่อน"); return; }
    setBusy(true);
    setMessage("");
    try {
      const res = await apiFetch(`/api/payroll/attendance-import-batches/${draft.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row_ids: rowIds, duplicate_mode: duplicateMode }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "บันทึกจริงไม่สำเร็จ");
      const result = json.data as { inserted?: number; skipped?: number; failed?: number; errors?: string[] };
      setMessage(`บันทึกจริงแล้ว ${result.inserted || 0} รายการ · ข้าม ${result.skipped || 0} · ผิดพลาด ${result.failed || 0}${result.errors?.length ? ` (${result.errors.join(" / ")})` : ""}`);
      onCommitted?.();
      await loadDraft();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกจริงไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const applyReviewDecision = async (decision: ReviewDecision) => {
    if (selectedReviewCount === 0) {
      setMessage("เลือกรายการที่ต้องตรวจก่อน");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (draft) {
        const selected = selectedIds;
        const nextRows = (draft.rows || []).map((row) => {
          const status = String(row.status || "");
          if (!selected.has(row.id) || !isReviewStatus(status)) return row;
          const payloads = decision === "absence"
            ? absencePayload({
                employeeId: row.employee_id,
                workDate: row.work_date,
                scannerCode: row.scanner_code,
                rawScans: row.raw_scans,
                hoursPerDay: period?.default_hours_per_day,
              })
            : [];
          return {
            ...row,
            status: decisionStatus(decision),
            manual_payloads: payloads,
            note: decisionNote(decision),
          };
        });
        await persistDraftRows(nextRows, `${decisionNote(decision)} แล้ว ${selectedReviewCount} รายการ`);
      } else {
        setReviewDecisions((current) => {
          const next = { ...current };
          for (const row of previewDisplayRows) {
            if (selectedIds.has(row.id) && isReviewStatus(row.status)) next[row.id] = decision;
          }
          return next;
        });
        setSelectedIds(new Set());
        setMessage(`${decisionNote(decision)} แล้ว ${selectedReviewCount} รายการ กดบันทึก draft เพื่อเก็บผลนี้`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "จัดการรายการต้องตรวจไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-800">นำเข้าเวลาจากเครื่องสแกน</div>
            <div className="mt-1 text-xs text-slate-500">
              Preview → บันทึกเป็น draft → เลือกรายการพร้อมแล้วบันทึกจริงเข้าหน้าคำนวณ
            </div>
          </div>
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${draft ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            {draftLoading ? "กำลังโหลด draft" : draft ? "มี draft import" : "ยังเป็น preview"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-500">
            ไฟล์รายงาน / CSV / TXT
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf"
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              onChange={(event) => {
                void readFile(event.target.files?.[0] || null);
                event.target.value = "";
              }}
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            วางข้อความจากเครื่องสแกน
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={SAMPLE_TEXT}
              rows={12}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-slate-400"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setText(SAMPLE_TEXT)}
              disabled={busy}
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              ใส่ตัวอย่าง
            </button>
            <button
              type="button"
              onClick={() => void clearDraft()}
              disabled={busy}
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {draft ? "ลบ draft" : "ล้าง"}
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={!editable || busy || displayRows.length === 0}
              className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              {draft ? "อัปเดต draft" : "บันทึก draft"}
            </button>
          </div>
          <label className="block text-xs font-medium text-slate-500">
            ถ้ามีรายการเดิมพนักงาน+วันเดียวกัน
            <select
              value={duplicateMode}
              onChange={(event) => setDuplicateMode(event.target.value as DuplicateMode)}
              disabled={busy}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="skip">ข้ามรายการเดิม</option>
              <option value="replace">แทนรายการเดิมทั้งวัน</option>
              <option value="error">หยุดและแจ้งเตือน</option>
            </select>
          </label>
          {draft && (
            <button
              type="button"
              onClick={() => void commitSelected()}
              disabled={!editable || busy || selectedReadyCount === 0}
              className="h-10 w-full rounded-lg bg-orange-600 px-3 text-sm font-semibold text-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              บันทึกจริงรายการที่เลือก ({selectedReadyCount})
            </button>
          )}
          {message && <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{message}</div>}
          {!editable && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">งวดนี้แก้ไม่ได้ จึงดู preview ได้อย่างเดียว</div>}
          {draft && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              รายการที่ต้องตรวจ/ยังไม่ผูก จะยังไม่ถูกบันทึกจริงอัตโนมัติ ให้แก้ข้อมูลก่อนเพื่อกันเงินเดือนผิด
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <SummaryBox label="ทั้งหมด" value={displayRows.length} />
            <SummaryBox label="พร้อม" value={draft ? canCommitCount : readyCount} tone="text-emerald-700" />
            <SummaryBox label="ต้องตรวจ" value={reviewCount} tone="text-amber-700" />
            <SummaryBox label="ยังไม่ผูก" value={blockedCount} tone="text-red-700" />
            <SummaryBox label="รายการที่จะสร้าง" value={payloadCount} tone="text-slate-800" />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", "ทั้งหมด"],
              ["ready", "พร้อม"],
              ["needs_review", "ต้องตรวจ"],
              ["unmapped", "ยังไม่ผูก"],
              ["skipped", "ข้าม"],
              ["committed", "บันทึกแล้ว"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as "all" | AttendanceImportStatus | "committed")}
                className={`h-9 rounded-lg border px-3 text-xs font-medium ${filter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาวันที่ / รหัสสแกน / ชื่อ / เวลา"
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
            <div className="mr-auto text-xs font-medium text-amber-800">
              เลือกแล้ว {selectedIds.size.toLocaleString("th-TH")} รายการ
              {selectedReviewCount > 0 && <span className="ml-1">· ต้องตรวจ {selectedReviewCount.toLocaleString("th-TH")}</span>}
            </div>
            <button
              type="button"
              onClick={() => void applyReviewDecision("absence")}
              disabled={!editable || busy || selectedReviewCount === 0}
              className="h-8 rounded-lg border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:text-slate-300"
            >
              ยืนยันเป็นขาดงาน
            </button>
            <button
              type="button"
              onClick={() => void applyReviewDecision("skip")}
              disabled={!editable || busy || selectedReviewCount === 0}
              className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
            >
              ข้าม ไม่หัก
            </button>
            <button
              type="button"
              onClick={() => void applyReviewDecision("normal")}
              disabled={!editable || busy || selectedReviewCount === 0}
              className="h-8 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300"
            >
              บันทึกเป็นปกติ
            </button>
          </div>

          <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectableFilteredRows.length > 0 && selectedSelectableCount === selectableFilteredRows.length}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          for (const row of selectableFilteredRows) {
                            if (checked) next.add(row.id);
                            else next.delete(row.id);
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">วันที่</th>
                  <th className="px-3 py-2 text-left">รหัสสแกน</th>
                  <th className="px-3 py-2 text-left">พนักงาน</th>
                  <th className="px-3 py-2 text-left">เวลา Scan</th>
                  <th className="px-3 py-2 text-left">ผล</th>
                  <th className="px-3 py-2 text-left">สถานะ</th>
                  <th className="px-3 py-2 text-left">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.rowKey} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        disabled={!row.canSelect || row.status === "committed"}
                        onChange={(event) => toggleSelected(row.id, event.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.scannerCode || "-"}</td>
                    <td className="px-3 py-2">{row.employeeLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.rawScans.join(" ") || "-"}</td>
                    <td className="px-3 py-2">{row.result}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{row.note}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                      {text.trim() || draft ? "ไม่พบรายการตามเงื่อนไข" : "วางข้อความหรือเลือกไฟล์ เพื่อดู preview ก่อน"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, tone = "text-slate-700" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value.toLocaleString("th-TH")}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildAttendanceImportPreview,
  buildAttendanceManualEntryPayloads,
  calculateAttendanceDay,
  type AttendanceImportContract,
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
// การตัดสินจากป๊อปอัป "ตรวจ/แก้" รายแถว: นอกจาก absence/skip/normal ยังแก้เวลาเอง (recompute) หรือ ราชการ ได้
type RowDecision = ReviewDecision | { kind: "official" | "recompute"; scans?: string[]; note?: string; earlyLeaveMinutes?: number };

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

type ManualEditInfo = { before: string[]; after: string[]; label: string };

type DisplayImportRow = {
  id: string;
  rowKey: string;
  date: string;
  scannerCode: string;
  scannerName?: string;       // ชื่อตามเครื่องสแกน (โชว์ตอนยังไม่ผูก)
  employeeId?: string | null;
  employeeLabel: string;
  rawScans: string[];
  result: string;
  status: string;
  note: string;
  payloadCount: number;
  canCommit: boolean;
  canSelect: boolean;
  manualEdit?: ManualEditInfo;   // ถ้าถูกแก้มือผ่านป๊อปอัป/ปุ่มเหมา — เก็บ เดิม→ใหม่ ไว้โชว์
};

type SortKey = "date" | "scannerCode" | "employeeLabel" | "rawScans" | "result" | "status";

// ตัวกรองแบบ "กลุ่ม" (ใช้ทั้งการ์ดสรุปและแถบแท็บ) — กดพร้อม=รวม ready/approved/normal ฯลฯ
function matchesFilter(row: DisplayImportRow, filter: string): boolean {
  switch (filter) {
    case "all": return true;
    case "ready": return ["ready", "approved", "normal"].includes(row.status);
    case "needs_review": return row.status === "needs_review" || row.status === "review";
    case "unmapped": return ["unmapped", "blocked"].includes(row.status);
    case "skipped": return row.status === "skipped";
    case "committed": return row.status === "committed";
    case "willCreate": return row.payloadCount > 0;
    case "abnormal": return row.result !== "ปกติ" && row.result !== "ข้าม" && row.result !== "-" && row.status !== "committed";
    case "edited": return !!row.manualEdit;
    default: return row.status === filter;
  }
}

// สรุปการแก้มือ 1 แถว (เดิม→ใหม่) — ใช้โชว์ป้าย "แก้มือ" + เก็บลง draft (result_payload.manual_edit)
function manualEditInfo(previewRow: AttendancePreviewRow, decision: RowDecision | undefined): ManualEditInfo | null {
  if (!decision) return null;
  const before = previewRow.result.rawScans;
  if (decision === "absence") return { before, after: before, label: "ยืนยันขาดงาน" };
  if (decision === "skip") return { before, after: before, label: "ข้าม ไม่หัก" };
  if (decision === "normal") return { before, after: before, label: "ตั้งเป็นปกติ" };
  if (decision.kind === "official") return { before, after: cleanTimes(decision.scans ?? before), label: "ราชการ" };
  return { before, after: cleanTimes(decision.scans ?? before), label: "แก้เวลา" };
}

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

function cleanTimes(times: (string | undefined | null)[]): string[] {
  return times.map((t) => String(t || "").trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
}

// คำนวณผล/รายการที่จะสร้าง/สถานะ/หมายเหตุ ของ 1 แถว ตาม decision — reuse ตัวคำนวณตัวเดียวกับ preview (เลขไม่เพี้ยน)
function outcomeFor(previewRow: AttendancePreviewRow, decision: RowDecision | undefined, hoursPerDay?: number | null): {
  status: string; payloads: Record<string, unknown>[]; note: string; rawScans: string[];
} {
  const baseRaw = previewRow.result.rawScans;
  if (!decision) {
    return {
      status: previewRow.importStatus === "needs_review" ? "review" : previewRow.importStatus,
      payloads: buildAttendanceManualEntryPayloads(previewRow, { default_hours_per_day: hoursPerDay }),
      note: flagText(previewRow.result.flags) || "-",
      rawScans: baseRaw,
    };
  }
  if (decision === "absence") {
    return { status: "ready", payloads: absencePayload({ employeeId: previewRow.employee?.id, workDate: previewRow.date, scannerCode: previewRow.scannerCode, rawScans: baseRaw, hoursPerDay }), note: "ยืนยันเป็นขาดงาน", rawScans: baseRaw };
  }
  if (decision === "skip") return { status: "skipped", payloads: [], note: "ข้าม ไม่หัก", rawScans: baseRaw };
  if (decision === "normal") return { status: "normal", payloads: [], note: "บันทึกเป็นปกติ ไม่หัก", rawScans: baseRaw };
  if (decision.kind === "official") {
    return { status: "normal", payloads: [], note: decision.note?.trim() || "ราชการ (มาทำงาน ไม่หัก)", rawScans: cleanTimes(decision.scans ?? baseRaw) };
  }
  // recompute: แก้เวลาเอง → คำนวณสาย/ออกก่อน/ขาด ใหม่ด้วยกฎเดิมของแถวนั้น
  const scans = cleanTimes(decision.scans ?? baseRaw);
  const recomputed = calculateAttendanceDay({ rawScans: scans, scheduleStatus: previewRow.scheduleStatus }, previewRow.ruleConfig);
  // ถ้ากรอก "ออกก่อน" เอง → ใช้ค่านั้นแทนที่ระบบคำนวณ
  const finalResult = decision.earlyLeaveMinutes != null
    ? { ...recomputed, earlyOutMinutes: Math.max(0, Math.round(decision.earlyLeaveMinutes)) }
    : recomputed;
  const payloads = buildAttendanceManualEntryPayloads(
    { ...previewRow, rawScans: scans, result: { ...finalResult, importStatus: finalResult.importStatus } },
    { default_hours_per_day: hoursPerDay },
  );
  const summary = finalResult.totalLateMinutes ? `สาย ${minutesText(finalResult.totalLateMinutes)}`
    : finalResult.earlyOutMinutes ? `ออกก่อน ${minutesText(finalResult.earlyOutMinutes)}`
    : finalResult.absent ? "ขาด" : "ปกติ";
  return { status: "ready", payloads, note: `${decision.note?.trim() ? decision.note.trim() + " · " : ""}ตรวจแล้ว (${summary})`, rawScans: scans };
}

// สรุปผล (สาย/ออกก่อน/ขาด/ปกติ) สำหรับโชว์ "ผลเดิม → ผลใหม่" ในป๊อปอัป — แสดงเป็น ชม./นาที
function resultSummary(r?: { totalLateMinutes?: number; earlyOutMinutes?: number; absent?: boolean } | null): string {
  if (!r) return "-";
  const parts: string[] = [];
  if (r.absent) parts.push("ขาด");
  if (r.totalLateMinutes) parts.push(`สาย ${minutesText(r.totalLateMinutes)}`);
  if (r.earlyOutMinutes) parts.push(`ออกก่อน ${minutesText(r.earlyOutMinutes)}`);
  return parts.length ? parts.join(" / ") : "ปกติ";
}

// สรุป "ผล" จากรายการที่จะสร้าง (manual_payloads) → คอลัมน์ "ผล" โชว์ ขาด/สาย/ออกก่อน กี่ ชม./นาที (แทน "N รายการ")
function summaryFromPayloads(payloads: Record<string, unknown>[]): string {
  let late = 0, early = 0, absent = false;
  for (const p of payloads) {
    const t = String(p.entry_type || "");
    if (t === "absence") absent = true;
    else if (t === "late") late += Number(p.late_minutes ?? p.minutes ?? 0) || 0;
    else if (t === "early_leave") early += Number(p.minutes ?? 0) || 0;
  }
  return resultSummary({ totalLateMinutes: late, earlyOutMinutes: early, absent });
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
  const [filter, setFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<AttendanceDraftBatch | null>(null);
  const [drafts, setDrafts] = useState<AttendanceDraftBatch[]>([]);   // draft ทั้งหมดของงวดนี้ (เลือกดู/สลับได้)
  const [draftName, setDraftName] = useState("");                      // ชื่อ draft (ตั้งเอง) = source_filename
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, RowDecision>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);   // กดหัวคอลัมน์เพื่อเรียง
  const [editRow, setEditRow] = useState<DisplayImportRow | null>(null);                   // แถวที่กำลังเปิดป๊อปอัปตรวจ/แก้
  const [pendingMatches, setPendingMatches] = useState<Record<string, string>>({});        // รหัสสแกน → employee_id ที่จะจับคู่
  const [matchSaving, setMatchSaving] = useState(false);
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

  const previewByKey = useMemo(() => new Map(preview.rows.map((r) => [r.rowKey, r])), [preview.rows]);

  const previewDisplayRows: DisplayImportRow[] = useMemo(() => preview.rows.map((row) => {
    const decision = reviewDecisions[row.rowKey];
    const o = outcomeFor(row, decision, period?.default_hours_per_day);
    const result = typeof decision === "object"
      ? (o.payloads.length ? summaryFromPayloads(o.payloads) : "ปกติ")
      : decision === "normal" ? "ปกติ" : decision === "skip" ? "ข้าม" : decision === "absence" ? "ขาดงาน" : resultText(row);
    return {
      id: row.rowKey,
      rowKey: row.rowKey,
      date: row.date,
      scannerCode: row.scannerCode,
      scannerName: row.scannerName,
      employeeId: row.employee?.id || null,
      employeeLabel: employeeShortName(row.employee),
      rawScans: o.rawScans,
      result,
      status: o.status,
      note: o.note,
      payloadCount: o.payloads.length,
      canCommit: false,
      canSelect: isReviewStatus(o.status),
      manualEdit: manualEditInfo(row, decision) || undefined,
    };
  }), [period?.default_hours_per_day, preview.rows, reviewDecisions]);

  const draftDisplayRows: DisplayImportRow[] = useMemo(() => (draft?.rows || []).map((row) => {
    const payloads = Array.isArray(row.manual_payloads) ? row.manual_payloads : [];
    const result = (row.result_payload || {}) as Record<string, unknown>;
    const flags = Array.isArray(result.flags) ? result.flags.map(String) : [];
    const status = String(row.status || "blocked");
    const rowKey = String(row.row_key || row.id);
    return {
      id: row.id,
      rowKey,
      date: String(row.work_date || ""),
      scannerCode: String(row.scanner_code || ""),
      scannerName: previewByKey.get(rowKey)?.scannerName,
      employeeId: String(row.employee_id || "") || null,
      employeeLabel: String(row.employee_label || row.employee_id || "-"),
      rawScans: Array.isArray(row.raw_scans) ? row.raw_scans : [],
      result: payloads.length ? summaryFromPayloads(payloads) : status === "skipped" ? "ข้าม" : isCommitReadyStatus(status) ? "ปกติ" : "-",
      status,
      note: row.note || flagText(flags) || "-",
      payloadCount: payloads.length,
      canCommit: isCommitReadyStatus(status),
      canSelect: isReviewStatus(status) || isCommitReadyStatus(status),
      manualEdit: (result.manual_edit as ManualEditInfo | undefined) || undefined,
    };
  }), [draft?.rows, previewByKey]);

  const displayRows = draft ? draftDisplayRows : previewDisplayRows;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = displayRows
      .filter((row) => matchesFilter(row, filter))
      .filter((row) => !q || [row.date, row.scannerCode, row.scannerName, row.employeeLabel, row.rawScans.join(" "), row.result, row.note].join(" ").toLowerCase().includes(q));
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const val = (r: DisplayImportRow): string =>
        sort.key === "rawScans" ? r.rawScans.join(" ")
        : sort.key === "employeeLabel" ? r.employeeLabel
        : sort.key === "scannerCode" ? r.scannerCode
        : sort.key === "result" ? r.result
        : sort.key === "status" ? statusLabel(r.status)
        : r.date;
      out = [...out].sort((a, b) => val(a).localeCompare(val(b), "th", { numeric: true }) * dir);
    }
    return out;
  }, [displayRows, filter, query, sort]);

  const payloadCount = displayRows.reduce((sum, row) => sum + row.payloadCount, 0);
  const canCommitCount = draftDisplayRows.filter((row) => row.canCommit).length;
  const selectedReadyCount = draftDisplayRows.filter((row) => row.canCommit && selectedIds.has(row.id)).length;
  const reviewCount = displayRows.filter((row) => isReviewStatus(row.status)).length;
  const readyCount = displayRows.filter((row) => isCommitReadyStatus(row.status)).length;
  const blockedCount = displayRows.filter((row) => ["unmapped", "blocked"].includes(row.status)).length;
  const selectedReviewCount = displayRows.filter((row) => selectedIds.has(row.id) && isReviewStatus(row.status)).length;
  const selectableFilteredRows = filteredRows.filter((row) => row.canSelect && row.status !== "committed");
  const selectedSelectableCount = selectableFilteredRows.filter((row) => selectedIds.has(row.id)).length;

  // โหลด draft 1 ตัว (ตาม id) เข้าหน้าจอ
  const selectDraft = useCallback(async (id: string) => {
    setDraftLoading(true);
    try {
      const detail = await apiFetch(`/api/payroll/attendance-import-batches/${id}`).then((res) => res.json());
      if (detail.error) throw new Error(detail.error);
      const next = detail.data as AttendanceDraftBatch;
      setDraft(next);
      setText(String(next.source_text || ""));
      setDraftName(String(next.source_filename || ""));
      setReviewDecisions({});
      setDuplicateMode((next.duplicate_mode === "replace" || next.duplicate_mode === "error") ? next.duplicate_mode : "skip");
      setSelectedIds(new Set((next.rows || []).filter((row) => ["ready", "approved", "normal"].includes(String(row.status))).map((row) => row.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลด draft ไม่สำเร็จ");
    } finally {
      setDraftLoading(false);
    }
  }, []);

  // โหลดรายการ draft ทั้งหมดของงวด (ไว้ในแถบเลือก) + เปิดอันล่าสุดให้
  const loadDrafts = useCallback(async () => {
    if (!period?.id) { setDraft(null); setDrafts([]); return; }
    setDraftLoading(true);
    try {
      const list = await apiFetch(`/api/payroll/attendance-import-batches?period_id=${encodeURIComponent(period.id)}`).then((res) => res.json());
      if (list.error) throw new Error(list.error);
      const all = ((list.data || []) as AttendanceDraftBatch[]).filter((item) => String(item.status || "draft") === "draft");
      setDrafts(all);
      if (all[0]?.id) await selectDraft(all[0].id);
      else { setDraft(null); setDraftName(""); setSelectedIds(new Set()); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดรายการ draft ไม่สำเร็จ");
    } finally {
      setDraftLoading(false);
    }
  }, [period?.id, selectDraft]);

  useEffect(() => { void loadDrafts(); }, [loadDrafts]);

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
    const o = outcomeFor(row, decision, period?.default_hours_per_day);
    const edit = manualEditInfo(row, decision);
    return {
      row_key: row.rowKey,
      employee_id: row.employee?.id || null,
      work_date: row.date,
      scanner_code: row.scannerCode || null,
      mapped_scanner_code: row.scannerCode || null,
      employee_label: employeeShortName(row.employee),
      raw_scans: o.rawScans,
      result_payload: edit ? { ...row.result, manual_edit: edit } : row.result,
      manual_payloads: o.payloads,
      status: o.status,
      note: o.note,
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
        source_filename: draftName || null,
        source_text: text,
        duplicate_mode: duplicateMode,
        rows: draftRowsFromDraftRows(sourceRows),
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || "อัปเดต draft ไม่สำเร็จ");
    const next = json.data as AttendanceDraftBatch;
    setDraft(next);
    setDrafts((cur) => [next, ...cur.filter((d) => d.id !== next.id)]);
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
          source_filename: (draftName.trim() || `draft ${drafts.length + 1}`),
          source_text: text,
          duplicate_mode: duplicateMode,
          rows: draft ? draftRowsFromDraftRows(draft.rows || []) : draftRowsFromPreview(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "บันทึก draft ไม่สำเร็จ");
      const next = json.data as AttendanceDraftBatch;
      setDraft(next);
      setDraftName(String(next.source_filename || ""));
      setDrafts((cur) => [next, ...cur.filter((d) => d.id !== next.id)]);
      setReviewDecisions({});
      setSelectedIds(new Set((next.rows || []).filter((row) => ["ready", "approved", "normal"].includes(String(row.status))).map((row) => row.id)));
      setMessage(`บันทึก draft “${next.source_filename || ""}” แล้ว ${next.rows?.length || 0} รายการ`);
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
        setMessage("ลบ draft แล้ว");
        await loadDrafts();   // โหลดรายการใหม่ + เปิด draft อื่นที่เหลือ (ถ้ามี)
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

  // เริ่ม draft ใหม่ (ว่าง) — สำหรับนำเข้าอีกไฟล์ในงวดเดียวกัน
  const newDraft = () => {
    setDraft(null);
    setText("");
    setDraftName("");
    setReviewDecisions({});
    setSelectedIds(new Set());
    setMessage("เริ่ม draft ใหม่ — วางข้อมูล/อัปไฟล์ แล้วตั้งชื่อ + กดบันทึก draft");
  };

  const commitSelected = async () => {
    if (!draft?.id) { setMessage("ต้องบันทึก draft ก่อน"); return; }
    const rowIds = draftDisplayRows.filter((row) => row.canCommit && selectedIds.has(row.id)).map((row) => row.id);
    if (rowIds.length === 0) { setMessage("เลือกรายการที่พร้อมก่อน"); return; }
    if (!confirm(`ยืนยันบันทึกจริง ${rowIds.length} รายการเข้างวดนี้?\nลงแล้วจะไปอยู่หน้าคำนวณเงินเดือน (แก้ย้อนได้ที่หน้าคำนวณ)`)) return;
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
      await loadDrafts();
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
          const pr = previewByKey.get(String(row.row_key || row.id));
          const edit = (pr && manualEditInfo(pr, decision)) || { before: row.raw_scans ?? [], after: row.raw_scans ?? [], label: decisionNote(decision) };
          return {
            ...row,
            status: decisionStatus(decision),
            manual_payloads: payloads,
            note: decisionNote(decision),
            result_payload: { ...(row.result_payload || {}), manual_edit: edit },
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

  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur?.key === key ? (cur.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  // รายชื่อพนักงาน (จากงวดนี้) สำหรับ dropdown จับคู่รหัสสแกน
  const employeeOptions = useMemo(
    () => rows.map((r) => ({ id: r.employee_id, label: `${r.employee_code} · ${r.employee_name}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true })),
    [rows],
  );
  const pendingMatchCount = Object.values(pendingMatches).filter(Boolean).length;

  // บันทึกผลตรวจ/แก้ของ 1 แถว (จากป๊อปอัป) — รองรับทั้งโหมด preview และ draft
  const applyRowEdit = async (rowKey: string, decision: RowDecision) => {
    if (!editable) { setEditRow(null); return; }
    try {
      if (draft) {
        const pr = previewByKey.get(rowKey);
        const o = pr ? outcomeFor(pr, decision, period?.default_hours_per_day) : null;
        const edit = pr ? manualEditInfo(pr, decision) : null;
        if (o) {
          const nextRows = (draft.rows || []).map((r) =>
            String(r.row_key || r.id) !== rowKey ? r : { ...r, status: o.status, manual_payloads: o.payloads, note: o.note, raw_scans: o.rawScans, result_payload: { ...(r.result_payload || {}), manual_edit: edit ?? undefined } });
          setBusy(true);
          await persistDraftRows(nextRows, "บันทึกการตรวจแล้ว");
        }
      } else {
        setReviewDecisions((cur) => ({ ...cur, [rowKey]: decision }));
        setMessage("ตรวจแล้ว — กดบันทึก draft เพื่อเก็บผลนี้");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกการตรวจไม่สำเร็จ");
    } finally {
      setBusy(false);
      setEditRow(null);
    }
  };

  // จับคู่รหัสสแกน → พนักงาน (เขียนถาวรลง employees.scanner_employee_code) แล้วให้หน้าแม่โหลดใหม่ → ผูกอัตโนมัติ
  const saveMatches = async () => {
    const entries = Object.entries(pendingMatches).filter(([code, empId]) => code && empId);
    if (entries.length === 0) { setMessage("ยังไม่ได้เลือกพนักงานให้รหัสสแกนไหน"); return; }
    setMatchSaving(true);
    setMessage("");
    try {
      const edits = entries.map(([code, empId]) => ({ id: empId, changes: { scanner_employee_code: code } }));
      const res = await apiFetch("/api/master-v2/employees/bulk-update", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setPendingMatches({});
      setMessage(`จับคู่แล้ว ${entries.length} รหัส — กำลังโหลดข้อมูลพนักงานใหม่`);
      onCommitted?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "จับคู่พนักงานไม่สำเร็จ");
    } finally {
      setMatchSaving(false);
    }
  };

  const sortArrow = (key: SortKey) => (
    <span className="text-[9px] text-slate-300">{sort?.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
  );
  const sortTh = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-700">{label} {sortArrow(key)}</button>
    </th>
  );

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
          {/* draft ของงวดนี้ (มีได้หลายอัน เช่นหลายไฟล์/หลายเครื่อง) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">draft ของงวดนี้</span>
              <span className="text-[11px] text-slate-400">({drafts.length})</span>
              <button type="button" onClick={newDraft} disabled={busy}
                className="ml-auto h-7 rounded-lg border border-emerald-200 bg-white px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">＋ draft ใหม่</button>
            </div>
            {drafts.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={draft?.id || ""}
                  onChange={(event) => { const id = event.target.value; if (id) void selectDraft(id); else newDraft(); }}
                  disabled={busy}
                  className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="">— draft ใหม่ (ยังไม่บันทึก) —</option>
                  {drafts.map((d) => <option key={d.id} value={d.id}>{d.source_filename || "(ไม่มีชื่อ)"}</option>)}
                </select>
                {draft?.id && (
                  <button type="button" onClick={() => void clearDraft()} disabled={busy} title="ลบ draft นี้"
                    className="h-8 rounded-lg border border-rose-200 bg-white px-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">🗑</button>
                )}
              </div>
            )}
            <label className="block text-xs font-medium text-slate-500">
              ชื่อ draft (ตั้งเอง)
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="เช่น เครื่อง 1 รอบเช้า"
                className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
              />
            </label>
          </div>
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
            <SummaryBox label="ทั้งหมด" value={displayRows.length} active={filter === "all"} onClick={() => setFilter("all")} />
            <SummaryBox label="พร้อม" value={draft ? canCommitCount : readyCount} tone="text-emerald-700" active={filter === "ready"} onClick={() => setFilter("ready")} />
            <SummaryBox label="ต้องตรวจ" value={reviewCount} tone="text-amber-700" active={filter === "needs_review"} onClick={() => setFilter("needs_review")} />
            <SummaryBox label="ยังไม่ผูก" value={blockedCount} tone="text-red-700" active={filter === "unmapped"} onClick={() => setFilter("unmapped")} />
            <SummaryBox label="รายการที่จะสร้าง" value={payloadCount} tone="text-slate-800" active={filter === "willCreate"} onClick={() => setFilter("willCreate")} />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", "ทั้งหมด"],
              ["ready", "พร้อม"],
              ["needs_review", "ต้องตรวจ"],
              ["abnormal", "ไม่ปกติ"],
              ["unmapped", "ยังไม่ผูก"],
              ["edited", "แก้มือ"],
              ["skipped", "ข้าม"],
              ["committed", "บันทึกแล้ว"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
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

          {(blockedCount > 0 || pendingMatchCount > 0) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
              <div className="mr-auto text-xs font-medium text-red-700">
                รหัสสแกนยังไม่ผูกพนักงาน — เลือกพนักงานในคอลัมน์ “พนักงาน” แล้วกดบันทึกจับคู่ (จับครั้งเดียวใช้ตลอด)
                {pendingMatchCount > 0 && <span className="ml-1">· เลือกแล้ว {pendingMatchCount}</span>}
              </div>
              <button
                type="button"
                onClick={() => void saveMatches()}
                disabled={!editable || matchSaving || pendingMatchCount === 0}
                className="h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {matchSaving ? "กำลังบันทึก…" : `บันทึกจับคู่ (${pendingMatchCount})`}
              </button>
            </div>
          )}

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
                  {sortTh("date", "วันที่")}
                  {sortTh("scannerCode", "รหัสสแกน")}
                  {sortTh("employeeLabel", "พนักงาน")}
                  {sortTh("rawScans", "เวลา Scan")}
                  {sortTh("result", "ผล")}
                  {sortTh("status", "สถานะ")}
                  <th className="px-3 py-2 text-left">หมายเหตุ</th>
                  <th className="px-3 py-2 text-left">ตรวจ</th>
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
                    <td className="px-3 py-2">
                      {(row.status === "unmapped" || row.status === "blocked") ? (
                        <div className="space-y-1">
                          {row.scannerName && <div className="text-xs text-slate-500">เครื่อง: <span className="text-slate-700">{row.scannerName}</span></div>}
                          <select
                            value={pendingMatches[row.scannerCode] || ""}
                            onChange={(event) => setPendingMatches((cur) => ({ ...cur, [row.scannerCode]: event.target.value }))}
                            disabled={!editable}
                            className="h-7 w-44 max-w-full rounded border border-slate-200 bg-white px-1 text-xs"
                          >
                            <option value="">— จับคู่พนักงาน —</option>
                            {employeeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        </div>
                      ) : row.employeeLabel}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.rawScans.join(" ") || "-"}</td>
                    <td className="px-3 py-2">{row.result}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {row.manualEdit && (
                        <div className="mb-0.5">
                          <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">✏️ แก้มือ</span>
                          <span className="ml-1 text-[10px] text-slate-500">{row.manualEdit.label}</span>
                          {row.manualEdit.before.join(" ") !== row.manualEdit.after.join(" ") && (
                            <div className="font-mono text-[10px] text-slate-400">{row.manualEdit.before.join(" ") || "—"} → <span className="text-slate-600">{row.manualEdit.after.join(" ") || "—"}</span></div>
                          )}
                        </div>
                      )}
                      {row.note}
                    </td>
                    <td className="px-3 py-2">
                      {row.status !== "committed" && (
                        <button
                          type="button"
                          onClick={() => setEditRow(row)}
                          disabled={!editable}
                          className="h-7 whitespace-nowrap rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
                        >
                          ตรวจ/แก้
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                      {text.trim() || draft ? "ไม่พบรายการตามเงื่อนไข" : "วางข้อความหรือเลือกไฟล์ เพื่อดู preview ก่อน"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editRow && (
        <AttendanceReviewModal
          row={editRow}
          previewRow={previewByKey.get(editRow.rowKey)}
          onClose={() => setEditRow(null)}
          onApply={(decision) => void applyRowEdit(editRow.rowKey, decision)}
        />
      )}
    </div>
  );
}

function SummaryBox({ label, value, tone = "text-slate-700", active, onClick }: { label: string; value: number; tone?: string; active?: boolean; onClick?: () => void }) {
  const cls = `rounded-xl border px-3 py-2 text-left transition-colors ${active ? "border-slate-900 ring-1 ring-slate-900 bg-white" : "border-slate-200 bg-slate-50"} ${onClick ? "cursor-pointer hover:border-slate-400" : ""}`;
  const inner = (
    <>
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value.toLocaleString("th-TH")}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`w-full ${cls}`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

// ป๊อปอัป "ตรวจ/แก้รายการเวลา" รายแถว — แก้เวลา เข้า/พัก/ออก + ปุ่ม "ปกติ" เติมเวลามาตรฐาน
// + ขาดงาน/ราชการ (checkbox) + ออกก่อนเอง + โชว์ผลเดิม→ผลใหม่ + ยืนยันก่อนลง
function AttendanceReviewModal({ row, previewRow, onClose, onApply }: {
  row: DisplayImportRow;
  previewRow?: AttendancePreviewRow;
  onClose: () => void;
  onApply: (decision: RowDecision) => void;
}) {
  const result = previewRow?.result;
  const cfg = previewRow?.ruleConfig;
  // เวลามาตรฐาน "ไม่โดนหัก" ของคนนี้ (จากกฎเวลาในสัญญา) — ปุ่ม "ปกติ" จะเติมค่านี้
  const stdIn = cfg?.morningCheckInCutoff || "07:50";
  const stdNoon = cfg?.noonCheckInCutoff || "12:50";
  const stdOut = cfg?.checkoutRequiredAt || "17:00";

  const [morningIn, setMorningIn] = useState(result?.morningIn || row.rawScans[0] || "");
  const [noonIn, setNoonIn] = useState(result?.noonIn || "");
  const [finalOut, setFinalOut] = useState(result?.finalOut || (row.rawScans.length > 1 ? row.rawScans[row.rawScans.length - 1] : ""));
  const [official, setOfficial] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [earlyH, setEarlyH] = useState("");
  const [earlyM, setEarlyM] = useState("");
  const [note, setNote] = useState("");
  const flags = previewRow?.result.flags ?? [];
  const lockTimes = absent || official;   // ขาดงาน/ราชการ → ไม่ต้องกรอกเวลา

  const earlyOverride = (() => {
    const total = (parseInt(earlyH || "0", 10) || 0) * 60 + (parseInt(earlyM || "0", 10) || 0);
    return total > 0 ? total : undefined;
  })();

  // ผลใหม่ (คำนวณสดตามที่กรอก) → โชว์เทียบกับผลเดิม
  const newResult = useMemo(() => {
    if (absent) return { absent: true, totalLateMinutes: 0, earlyOutMinutes: 0 };
    if (official) return { absent: false, totalLateMinutes: 0, earlyOutMinutes: 0 };
    if (!previewRow) return null;
    const r = calculateAttendanceDay({ rawScans: cleanTimes([morningIn, noonIn, finalOut]), scheduleStatus: previewRow.scheduleStatus }, previewRow.ruleConfig);
    return { absent: r.absent, totalLateMinutes: r.totalLateMinutes, earlyOutMinutes: earlyOverride ?? r.earlyOutMinutes };
  }, [absent, official, previewRow, morningIn, noonIn, finalOut, earlyOverride]);

  const saveMain = () => {
    if (absent) { if (confirm("ยืนยันบันทึกเป็น “ขาดงาน”?")) onApply("absence"); return; }
    if (official) { onApply({ kind: "official", scans: [morningIn, noonIn, finalOut], note }); return; }
    onApply({ kind: "recompute", scans: [morningIn, noonIn, finalOut], note, earlyLeaveMinutes: earlyOverride });
  };

  const timeField = (label: string, value: string, set: (v: string) => void, placeholder: string, std: string) => {
    const missing = !value.trim() && !lockTimes;   // ไม่มีสแกน + ไม่ใช่ขาด/ราชการ → ไฮไลต์แดง
    return (
      <label className="text-xs text-slate-500">
        <span className="flex items-center justify-between">{label}
          <button type="button" disabled={lockTimes} onClick={() => set(std)} title={`ใส่เวลาปกติ ${std}`}
            className="text-[10px] font-medium text-blue-600 hover:underline disabled:text-slate-300">ปกติ</button>
        </span>
        <input value={value} onChange={(event) => set(event.target.value)} placeholder={placeholder} disabled={lockTimes}
          className={`mt-1 h-8 w-full rounded border px-2 text-sm disabled:bg-slate-50 disabled:text-slate-300 ${missing ? "border-red-300 bg-red-50 placeholder:text-red-400" : "border-slate-200"}`} />
      </label>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">ตรวจ/แก้รายการเวลา</div>
            <div className="text-xs text-slate-500">{formatDate(row.date)} · {row.employeeLabel !== "-" ? row.employeeLabel : (row.scannerName || row.scannerCode)}</div>
          </div>
          <button onClick={onClose} className="text-lg text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">กรอกเวลาให้ครบ (ปุ่ม “ปกติ” ท้ายช่อง = เติมเวลามาตรฐานไม่โดนหัก) แล้วกดบันทึก · ถ้าขาด/ราชการ ติ๊กช่องด้านล่าง</div>
          <div className="grid grid-cols-3 gap-2">
            {timeField("สแกนเข้า", morningIn, setMorningIn, "08:00", stdIn)}
            {timeField("กลับจากพัก", noonIn, setNoonIn, "13:00", stdNoon)}
            {timeField("สแกนออก", finalOut, setFinalOut, "17:00", stdOut)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={absent} onChange={(event) => { setAbsent(event.target.checked); if (event.target.checked) setOfficial(false); }} /> ขาดงาน (ไม่มาทำงาน)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={official} onChange={(event) => { setOfficial(event.target.checked); if (event.target.checked) setAbsent(false); }} /> ราชการ / ออกนอกสถานที่ (นับมาทำงาน ไม่หัก)
            </label>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            ออกก่อน (กำหนดเอง)
            <input value={earlyH} onChange={(event) => setEarlyH(event.target.value)} disabled={lockTimes} placeholder="0" className="h-8 w-12 rounded border border-slate-200 px-2 text-center text-sm disabled:bg-slate-50" /> ชม.
            <input value={earlyM} onChange={(event) => setEarlyM(event.target.value)} disabled={lockTimes} placeholder="0" className="h-8 w-12 rounded border border-slate-200 px-2 text-center text-sm disabled:bg-slate-50" /> นาที
            <span className="text-[10px] text-slate-400">(กรอก = ใช้แทนที่ระบบคิด)</span>
          </div>
          <label className="block text-xs text-slate-500">หมายเหตุ
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ลืมสแกนออก / รถติด" className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-sm" />
          </label>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">ผลเดิม:</span> <span className="text-slate-600">{resultSummary(result)}</span>
              <span className="text-slate-300">→</span>
              <span className="text-slate-400">ผลใหม่:</span> <span className="font-semibold text-slate-800">{resultSummary(newResult)}</span>
            </div>
            <div className="mt-1 text-slate-400">สแกนดิบ: <span className="font-mono text-slate-600">{row.rawScans.join(" ") || "-"}</span></div>
            {flags.length > 0 && <div className="mt-0.5 text-slate-400">ปัญหาที่เจอ: {flagText(flags)}</div>}
          </div>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3">
          <button onClick={() => { if (confirm("ข้ามรายการนี้ (ไม่คิดอะไร ไม่บันทึกเข้าเงินเดือน)?")) onApply("skip"); }}
            title="ไม่นับรายการนี้เลย" className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">ข้ามรายการนี้</button>
          <button onClick={() => { if (confirm("ตั้งเป็น “ปกติ ไม่หัก” (มาทำงาน ไม่คิดสาย/ออกก่อน)?")) onApply("normal"); }}
            className="h-9 rounded-lg border border-emerald-200 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50">ปกติ ไม่หัก</button>
          <button onClick={saveMain} className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
            {absent ? "บันทึกเป็นขาดงาน" : "บันทึกค่าที่ตรวจแล้ว"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

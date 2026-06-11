import { writeAudit } from "@/lib/audit";
import { absenceDeduction, lateDeduction, money, roundMoney, salaryDayDivisor } from "@/lib/payroll-calc";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPayrollContractor } from "@/lib/payroll-attendance-rules";

type AdminClient = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

const EDITABLE_PERIODS = new Set(["draft", "review"]);
const COMMITTABLE_ROW_STATUSES = new Set(["ready", "approved", "normal"]);
const VALID_DUPLICATE_MODES = new Set(["skip", "replace", "error"]);

type ImportPayload = {
  employee_id?: string;
  work_date?: string;
  status?: "draft" | "approved";
  note?: string;
  entry_type?: "absence" | "late" | "early_leave";
  absence_hours?: number;
  minutes?: number;
  late_minutes?: number;
};

export type AttendanceImportDraftRowInput = {
  row_key: string;
  employee_id?: string | null;
  work_date: string;
  scanner_code?: string | null;
  mapped_scanner_code?: string | null;
  employee_label?: string | null;
  raw_scans?: string[] | null;
  result_payload?: Row | null;
  manual_payloads?: ImportPayload[] | null;
  status: string;
  note?: string | null;
  source_lines?: string[] | null;
  sort_order?: number | null;
};

export type AttendanceImportDraftInput = {
  batch_id?: string | null;
  payroll_period_id: string;
  source_filename?: string | null;
  source_text?: string | null;
  duplicate_mode?: string | null;
  rows: AttendanceImportDraftRowInput[];
};

function isoDate(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateInRange(date: string, start: string, end: string): boolean {
  return !!date && date >= start && date <= end;
}

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

function isWorkableDate(date: string, holidays: Set<string>, contract: Row): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return scheduleWeekdays(contract.work_schedule_id).includes(d.getUTCDay()) && !holidays.has(date);
}

function hourlyRate(contract: Row, period: Row, setting: Row): number {
  const hoursPerDay = money(period.default_hours_per_day) || 8;
  const wageType = String(contract.wage_type ?? "monthly");
  if (wageType === "hourly") return money(contract.hourly_wage);
  if (wageType === "daily") return hoursPerDay ? money(contract.daily_wage) / hoursPerDay : 0;
  const isOffice = String(setting?.payroll_group_id ?? "").trim().toLowerCase() === "office";
  const divisor = salaryDayDivisor(isOffice, undefined, money(period.default_work_days));
  return divisor && hoursPerDay ? money(contract.base_salary) / divisor / hoursPerDay : 0;
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
}

function asPayloads(value: unknown): ImportPayload[] {
  return asRows(value).map((item) => ({
    employee_id: String(item.employee_id ?? ""),
    work_date: isoDate(item.work_date),
    status: item.status === "draft" ? "draft" as const : "approved" as const,
    note: String(item.note ?? ""),
    entry_type: ["absence", "late", "early_leave"].includes(String(item.entry_type)) ? String(item.entry_type) as ImportPayload["entry_type"] : undefined,
    absence_hours: money(item.absence_hours),
    minutes: money(item.minutes),
    late_minutes: money(item.late_minutes),
  })).filter((item) => item.employee_id && item.work_date && item.entry_type);
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function draftRowToInsert(batchId: string, periodId: string, row: AttendanceImportDraftRowInput, index: number) {
  return {
    batch_id: batchId,
    payroll_period_id: periodId,
    row_key: String(row.row_key || `${row.work_date}-${row.scanner_code ?? index}`),
    employee_id: row.employee_id || null,
    work_date: isoDate(row.work_date),
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
  };
}

export async function listAttendanceImportBatches(admin: AdminClient, periodId: string) {
  const { data, error } = await admin
    .from("attendance_import_batches")
    .select("*")
    .eq("payroll_period_id", periodId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAttendanceImportBatch(admin: AdminClient, batchId: string): Promise<Row & { rows: Row[] }> {
  const { data: batches, error: batchError } = await admin
    .from("attendance_import_batches")
    .select("*")
    .eq("id", batchId)
    .limit(1);
  if (batchError) throw new Error(batchError.message);
  const batch = batches?.[0] as Row | undefined;
  if (!batch) throw new Error("ไม่พบ draft import นี้");

  const { data: rows, error: rowsError } = await admin
    .from("attendance_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("sort_order", { ascending: true });
  if (rowsError) throw new Error(rowsError.message);
  return { ...batch, rows: (rows ?? []) as Row[] };
}

export async function saveAttendanceImportDraft(
  admin: AdminClient,
  input: AttendanceImportDraftInput,
  actor: { id?: string | null; name?: string | null } = {},
) {
  if (!input.payroll_period_id) throw new Error("ต้องระบุงวดเงินเดือน");
  if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error("ยังไม่มีรายการ import ให้บันทึก");
  const duplicateMode = VALID_DUPLICATE_MODES.has(String(input.duplicate_mode)) ? String(input.duplicate_mode) : "skip";

  let batchId = input.batch_id || "";
  if (batchId) {
    const current = await getAttendanceImportBatch(admin, batchId);
    if (String(current.status) === "committed") throw new Error("draft นี้บันทึกจริงแล้ว แก้ไม่ได้");
    const { error } = await admin
      .from("attendance_import_batches")
      .update({
        payroll_period_id: input.payroll_period_id,
        source_filename: input.source_filename || null,
        source_text: input.source_text || null,
        duplicate_mode: duplicateMode,
        status: "draft",
      })
      .eq("id", batchId);
    if (error) throw new Error(error.message);
    const deleted = await admin.from("attendance_import_rows").delete().eq("batch_id", batchId);
    if (deleted.error) throw new Error(deleted.error.message);
  } else {
    const { data, error } = await admin
      .from("attendance_import_batches")
      .insert({
        payroll_period_id: input.payroll_period_id,
        source_filename: input.source_filename || null,
        source_text: input.source_text || null,
        duplicate_mode: duplicateMode,
        status: "draft",
      })
      .select("id")
      .limit(1);
    if (error) throw new Error(error.message);
    batchId = String((data?.[0] as Row | undefined)?.id || "");
  }

  const rows = input.rows.map((row, index) => draftRowToInsert(batchId, input.payroll_period_id, row, index));
  const { error: rowError } = await admin.from("attendance_import_rows").insert(rows);
  if (rowError) throw new Error(rowError.message);

  await writeAudit(admin, {
    action: "attendance_import_save_draft",
    entityType: "attendance_import_batches",
    entityId: batchId,
    actorId: actor.id ?? null,
    actorName: actor.name ?? null,
    metadata: { payroll_period_id: input.payroll_period_id, row_count: rows.length, duplicate_mode: duplicateMode },
  });

  return getAttendanceImportBatch(admin, batchId);
}

export async function deleteAttendanceImportDraft(
  admin: AdminClient,
  batchId: string,
  actor: { id?: string | null; name?: string | null } = {},
) {
  const current = await getAttendanceImportBatch(admin, batchId);
  if (String(current.status) === "committed") throw new Error("draft นี้บันทึกจริงแล้ว ลบไม่ได้");
  const deletedRows = await admin.from("attendance_import_rows").delete().eq("batch_id", batchId);
  if (deletedRows.error) throw new Error(deletedRows.error.message);
  const deletedBatch = await admin.from("attendance_import_batches").delete().eq("id", batchId);
  if (deletedBatch.error) throw new Error(deletedBatch.error.message);
  await writeAudit(admin, {
    action: "attendance_import_delete_draft",
    entityType: "attendance_import_batches",
    entityId: batchId,
    actorId: actor.id ?? null,
    actorName: actor.name ?? null,
    metadata: { payroll_period_id: current.payroll_period_id },
  });
  return { id: batchId };
}

async function existingAttendanceRows(admin: AdminClient, periodId: string, employeeId: string, workDate: string) {
  const { data, error } = await admin
    .from("attendance_entries")
    .select("id")
    .eq("payroll_period_id", periodId)
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function insertAttendancePayload(admin: AdminClient, period: Row, holidays: Set<string>, payload: ImportPayload) {
  const periodId = String(period.id);
  const employeeId = String(payload.employee_id || "");
  const workDate = isoDate(payload.work_date);
  if (!employeeId || !workDate || !payload.entry_type) throw new Error("payload import ไม่ครบ");
  if (!dateInRange(workDate, String(period.start_date), String(period.end_date))) {
    throw new Error("วันที่ import อยู่นอกช่วงงวดเงินเดือน");
  }

  const { data: contractRows, error: contractError } = await admin
    .from("employee_contracts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("is_current", true)
    .eq("status", "active")
    .limit(1);
  if (contractError) throw new Error(contractError.message);
  const contract = contractRows?.[0] as Row | undefined;
  if (!contract) throw new Error("พนักงานนี้ไม่มีสัญญาที่ใช้งานอยู่");
  if (isPayrollContractor(contract)) throw new Error("พนักงานงานเหมาไม่ใช้การบันทึกเวลา ให้ลงยอดผ่านงานเหมาแทน");
  if (!isWorkableDate(workDate, holidays, contract)) {
    throw new Error("วันที่นี้ไม่ใช่วันทำงานตามสัญญา หรือเป็นวันหยุด");
  }

  const { data: settingRows, error: settingError } = await admin
    .from("employee_payroll_settings")
    .select("payroll_group_id")
    .eq("employee_id", employeeId)
    .limit(1);
  if (settingError) throw new Error(settingError.message);
  const setting = (settingRows?.[0] as Row | undefined) ?? {};
  const rate = hourlyRate(contract, period, setting);
  const note = String(payload.note || "Imported from attendance scanner");

  if (payload.entry_type === "absence") {
    const hours = roundMoney(money(payload.absence_hours) || (money(period.default_hours_per_day) || 8));
    const amount = absenceDeduction(hours, rate);
    const { data, error } = await admin.from("attendance_entries").insert({
      payroll_period_id: periodId,
      employee_id: employeeId,
      work_date: workDate,
      absence_hours: hours,
      absence_deduction: amount,
      late_minutes: 0,
      late_deduction: 0,
      regular_hours: 0,
      status: "approved",
      source_type: "attendance_import",
      note,
    }).select("id").limit(1);
    if (error) throw new Error(error.message);
    return { id: (data?.[0] as Row | undefined)?.id, amount, entry_type: "absence" };
  }

  const minutes = money(payload.entry_type === "late" ? payload.late_minutes || payload.minutes : payload.minutes);
  const amount = lateDeduction(minutes, rate);
  const { data, error } = await admin.from("attendance_entries").insert({
    payroll_period_id: periodId,
    employee_id: employeeId,
    work_date: workDate,
    late_minutes: minutes,
    late_deduction: amount,
    regular_hours: 0,
    absence_hours: 0,
    absence_deduction: 0,
    status: "approved",
    source_type: "attendance_import",
    note,
  }).select("id").limit(1);
  if (error) throw new Error(error.message);
  return { id: (data?.[0] as Row | undefined)?.id, amount, entry_type: payload.entry_type };
}

export async function commitAttendanceImportBatch(
  admin: AdminClient,
  batchId: string,
  options: { row_ids?: string[]; duplicate_mode?: string | null; actor?: { id?: string | null; name?: string | null } } = {},
) {
  const batch = await getAttendanceImportBatch(admin, batchId);
  const periodId = String(batch.payroll_period_id || "");
  const { data: periodRows, error: periodError } = await admin
    .from("payroll_periods")
    .select("id, period_name, status, start_date, end_date, default_hours_per_day, default_work_days, payroll_period_holidays(holiday_date)")
    .eq("id", periodId)
    .limit(1);
  if (periodError) throw new Error(periodError.message);
  const period = periodRows?.[0] as Row | undefined;
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");
  if (!EDITABLE_PERIODS.has(String(period.status))) throw new Error(`งวดสถานะ "${period.status}" แก้ไม่ได้`);

  const requestedIds = new Set((options.row_ids || []).map(String).filter(Boolean));
  const duplicateMode = VALID_DUPLICATE_MODES.has(String(options.duplicate_mode))
    ? String(options.duplicate_mode)
    : VALID_DUPLICATE_MODES.has(String(batch.duplicate_mode))
      ? String(batch.duplicate_mode)
      : "skip";
  const holidays = new Set(asRows(period.payroll_period_holidays).map((item) => String(item.holiday_date)).filter(Boolean));
  const rows = asRows(batch.rows)
    .filter((row) => requestedIds.size === 0 || requestedIds.has(String(row.id)))
    .slice(0, 500);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const rowId = String(row.id || "");
    try {
      const status = String(row.status || "");
      if (!COMMITTABLE_ROW_STATUSES.has(status)) {
        skipped += 1;
        continue;
      }
      const payloads = asPayloads(row.manual_payloads);
      if (payloads.length === 0) {
        skipped += 1;
        const updated = await admin.from("attendance_import_rows").update({ status: "committed" }).eq("id", rowId);
        if (updated.error) throw new Error(updated.error.message);
        continue;
      }

      const first = payloads[0];
      const existing = await existingAttendanceRows(admin, periodId, String(first.employee_id), String(first.work_date));
      if (existing.length > 0) {
        if (duplicateMode === "error") throw new Error("มีรายการพนักงาน+วันนี้อยู่แล้ว");
        if (duplicateMode === "skip") {
          skipped += 1;
          const updated = await admin.from("attendance_import_rows").update({ status: "skipped", note: "ข้ามเพราะมีรายการเดิมอยู่แล้ว" }).eq("id", rowId);
          if (updated.error) throw new Error(updated.error.message);
          continue;
        }
        const deleted = await admin
          .from("attendance_entries")
          .delete()
          .eq("payroll_period_id", periodId)
          .eq("employee_id", String(first.employee_id))
          .eq("work_date", String(first.work_date))
          .neq("status", "cancelled");
        if (deleted.error) throw new Error(deleted.error.message);
      }

      for (const payload of payloads) {
        await insertAttendancePayload(admin, period, holidays, payload);
        inserted += 1;
      }
      const updated = await admin.from("attendance_import_rows").update({ status: "committed" }).eq("id", rowId);
      if (updated.error) throw new Error(updated.error.message);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ";
      errors.push(message);
      if (rowId) {
        await admin.from("attendance_import_rows").update({ status: "blocked", note: message }).eq("id", rowId);
      }
    }
  }

  const { count, error: countError } = await admin
    .from("attendance_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .in("status", ["ready", "approved", "normal", "review", "unmapped", "blocked"]);
  if (countError) throw new Error(countError.message);
  const batchStatus = (count ?? 0) > 0 ? "draft" : "committed";
  const updatedBatch = await admin
    .from("attendance_import_batches")
    .update({ status: batchStatus, committed_at: batchStatus === "committed" ? new Date().toISOString() : null })
    .eq("id", batchId);
  if (updatedBatch.error) throw new Error(updatedBatch.error.message);

  await writeAudit(admin, {
    action: "attendance_import_commit",
    entityType: "attendance_import_batches",
    entityId: batchId,
    actorId: options.actor?.id ?? null,
    actorName: options.actor?.name ?? null,
    metadata: { payroll_period_id: periodId, inserted, skipped, failed, duplicate_mode: duplicateMode, selected_rows: requestedIds.size },
  });

  return { inserted, skipped, failed, errors: [...new Set(errors)].slice(0, 5), batch_status: batchStatus };
}
